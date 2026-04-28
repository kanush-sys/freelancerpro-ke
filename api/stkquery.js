// api/stkquery.js
// ─────────────────────────────────────────────────────────────
// FreelancerPro KE — STK Push Status Query (Vercel Serverless)
// ─────────────────────────────────────────────────────────────
// POST /api/stkquery
// Body: { checkoutRequestId, userId? }
//
// Frontend polls this every 3 seconds after STK Push is sent.
// If payment succeeded, marks the user as premium in Supabase.
// ─────────────────────────────────────────────────────────────

const axios    = require('axios');
const supabase = require('./_supabase');
const { setCors, handleOptions, getUser, ok, err } = require('./_helpers');

function getTimestamp() {
  const n = new Date(), p = v => String(v).padStart(2,'0');
  return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
}

function buildPassword(shortcode, passkey, timestamp) {
  return Buffer.from(shortcode + passkey + timestamp).toString('base64');
}

async function getOAuthToken(key, secret, baseUrl) {
  const creds = Buffer.from(`${key}:${secret}`).toString('base64');
  const { data } = await axios.get(
    `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${creds}` }, timeout: 10000 }
  );
  return data.access_token;
}

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return err(res, 405, 'Use POST.');

  const KEY       = process.env.MPESA_CONSUMER_KEY;
  const SECRET    = process.env.MPESA_CONSUMER_SECRET;
  const SHORTCODE = process.env.MPESA_SHORTCODE || '174379';
  const PASSKEY   = process.env.MPESA_PASSKEY   || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  const MPESA_ENV = process.env.MPESA_ENV       || 'sandbox';
  const BASE_URL  = MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const { checkoutRequestId } = req.body || {};
  if (!checkoutRequestId) return err(res, 400, 'checkoutRequestId is required.');

  const user = await getUser(req);

  try {
    const token     = await getOAuthToken(KEY, SECRET, BASE_URL);
    const timestamp = getTimestamp();
    const password  = buildPassword(SHORTCODE, PASSKEY, timestamp);

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );

    const data       = response.data;
    const resultCode = String(data.ResultCode);

    if (resultCode === '0') {
      // ── PAYMENT CONFIRMED ─────────────────────────────
      // Update payment record in Supabase
      await supabase
        .from('payments')
        .update({ status: 'success', confirmed_at: new Date().toISOString() })
        .eq('checkout_request_id', checkoutRequestId);

      // Mark user as premium (30 days from now)
      const userId = user?.id;
      if (userId) {
        const premiumExpires = new Date();
        premiumExpires.setDate(premiumExpires.getDate() + 30);

        await supabase
          .from('profiles')
          .update({
            premium:          true,
            premium_since:    new Date().toISOString(),
            premium_expires:  premiumExpires.toISOString(),
          })
          .eq('id', userId);

        console.log('Premium activated for user:', userId, 'expires:', premiumExpires);
      } else {
        // No user session — premium unlocked by phone number
        // Link payment to phone for later account claim
        await supabase
          .from('payments')
          .update({ premium_granted: true })
          .eq('checkout_request_id', checkoutRequestId);
      }

      return ok(res, {
        status:  'SUCCESS',
        message: 'Payment confirmed. Premium activated.',
      });

    } else if (resultCode === '1032') {
      // User cancelled
      await supabase
        .from('payments')
        .update({ status: 'cancelled' })
        .eq('checkout_request_id', checkoutRequestId);

      return ok(res, { status: 'FAILED', reason: 'You cancelled the M-Pesa payment. Please try again.' });

    } else if (resultCode === '1037') {
      // Timeout — user didn't enter PIN
      await supabase
        .from('payments')
        .update({ status: 'timeout' })
        .eq('checkout_request_id', checkoutRequestId);

      return ok(res, { status: 'FAILED', reason: 'M-Pesa prompt timed out. Please try again.' });

    } else {
      return ok(res, {
        status: 'FAILED',
        reason: data.ResultDesc || 'Payment failed. Please check your M-Pesa balance and try again.',
      });
    }

  } catch (e) {
    // Daraja returns HTTP 500 while transaction is still pending
    const errData = e?.response?.data;
    if (errData?.errorCode === '500.001.1001') {
      return ok(res, { status: 'PENDING' });
    }
    console.warn('STK Query error:', errData || e.message);
    // On network error, keep frontend polling
    return ok(res, { status: 'PENDING' });
  }
};
