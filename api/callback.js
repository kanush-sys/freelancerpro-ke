// api/callback.js
// ─────────────────────────────────────────────────────────────
// FreelancerPro KE — M-Pesa Callback Receiver
// ─────────────────────────────────────────────────────────────
// Safaricom POSTs transaction results here automatically after
// the user enters their PIN. This is the server-side source of
// truth for payment confirmation.
//
// IMPORTANT: Always return HTTP 200 to Safaricom or they retry.
// ─────────────────────────────────────────────────────────────

const supabase = require('./_supabase');
const { setCors } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const stkCallback = req.body?.Body?.stkCallback;

    if (!stkCallback) {
      console.log('Non-STK callback received:', JSON.stringify(req.body));
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    if (String(ResultCode) === '0') {
      // ── PAYMENT SUCCESS ───────────────────────────────
      const items   = CallbackMetadata?.Item || [];
      const get     = name => items.find(i => i.Name === name)?.Value;
      const amount  = get('Amount');
      const code    = get('MpesaReceiptNumber');
      const phone   = String(get('PhoneNumber') || '');

      console.log('✅ M-Pesa Callback SUCCESS:', { CheckoutRequestID, code, amount, phone });

      // 1. Update the payments table
      await supabase
        .from('payments')
        .update({
          status:            'success',
          mpesa_code:        code,
          confirmed_at:      new Date().toISOString(),
          callback_payload:  req.body,
        })
        .eq('checkout_request_id', CheckoutRequestID);

      // 2. Find which user this payment belongs to, and grant premium
      const { data: payment } = await supabase
        .from('payments')
        .select('user_id')
        .eq('checkout_request_id', CheckoutRequestID)
        .single();

      const userId = payment?.user_id;

      if (userId) {
        const premiumExpires = new Date();
        premiumExpires.setDate(premiumExpires.getDate() + 30);

        await supabase
          .from('profiles')
          .update({
            premium:         true,
            premium_since:   new Date().toISOString(),
            premium_expires: premiumExpires.toISOString(),
          })
          .eq('id', userId);

        console.log('✅ Premium granted to user:', userId);
      } else {
        // Payment not linked to a user account yet (they paid without logging in)
        // Store the phone so they can claim premium when they register/login
        await supabase
          .from('pending_premiums')
          .upsert({
            phone:      phone,
            mpesa_code: code,
            amount:     amount,
            paid_at:    new Date().toISOString(),
          });
        console.log('✅ Premium pending claim for phone:', phone);
      }

    } else {
      // ── PAYMENT FAILED ────────────────────────────────
      console.log('❌ M-Pesa Callback FAILED:', { CheckoutRequestID, ResultCode, ResultDesc });

      await supabase
        .from('payments')
        .update({
          status:           'failed',
          failure_reason:   ResultDesc,
          callback_payload: req.body,
        })
        .eq('checkout_request_id', CheckoutRequestID);
    }

    // Always return 200 to Safaricom
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Callback received.' });

  } catch (e) {
    console.error('Callback error:', e.message);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};
