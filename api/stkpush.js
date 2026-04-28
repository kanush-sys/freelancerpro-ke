// api/stkpush.js
// ─────────────────────────────────────────────────────────────
// FreelancerPro KE — M-Pesa STK Push (Vercel Serverless)
// ─────────────────────────────────────────────────────────────
const axios    = require('axios');
const supabase = require('./_supabase');
const { setCors, handleOptions, getUser, ok, err } = require('./_helpers');

function getTimestamp() {
  const n = new Date(), p = v => String(v).padStart(2,'0');
  return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
}

function formatPhone(phone) {
  const c = phone.replace(/\D/g,'');
  if (c.startsWith('254') && c.length === 12) return c;
  if (c.startsWith('0')   && c.length === 10) return '254' + c.slice(1);
  if (c.length === 9)                          return '254' + c;
  throw new Error(`Invalid M-Pesa number: ${phone}. Use format 07XXXXXXXX.`);
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

  const KEY          = process.env.MPESA_CONSUMER_KEY;
  const SECRET       = process.env.MPESA_CONSUMER_SECRET;
  const SHORTCODE    = process.env.MPESA_SHORTCODE     || '174379';
  const PASSKEY      = process.env.MPESA_PASSKEY       || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  const CALLBACK_URL = process.env.MPESA_CALLBACK_URL  || 'https://yourapp.vercel.app/api/callback';
  const MPESA_ENV    = process.env.MPESA_ENV           || 'sandbox';
  const BASE_URL     = MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  if (!KEY || !SECRET) {
    return err(res, 500, 'Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET in Vercel environment variables.');
  }

  if (CALLBACK_URL.includes('yourapp.vercel.app')) {
    console.warn('WARNING: MPESA_CALLBACK_URL is still set to the placeholder. Set it to your real Vercel URL.');
  }

  const {
    phone,
    amount           = 399,
    accountReference = 'FreelancerPro',
    description      = 'FreelancerPro KE Premium — Ksh 399/month',
  } = req.body || {};

  if (!phone) return err(res, 400, 'phone is required in request body.');

  const user = await getUser(req);

  let formattedPhone;
  try {
    formattedPhone = formatPhone(phone);
  } catch (e) {
    return err(res, 400, e.message);
  }

  // Step 1: OAuth token
  let token;
  try {
    token = await getOAuthToken(KEY, SECRET, BASE_URL);
  } catch (e) {
    console.error('OAuth error:', e?.response?.data || e.message);
    return err(res, 502, 'Failed to connect to M-Pesa. Check your consumer key/secret.', e?.response?.data);
  }

  // Step 2: STK Push
  const timestamp = getTimestamp();
  const password  = buildPassword(SHORTCODE, PASSKEY, timestamp);

  let stkResponse;
  try {
    stkResponse = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerPayBillOnline',
        Amount:            Number(amount),
        PartyA:            formattedPhone,
        PartyB:            SHORTCODE,
        PhoneNumber:       formattedPhone,
        CallBackURL:       CALLBACK_URL,
        AccountReference:  accountReference,
        TransactionDesc:   description,
      },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
  } catch (e) {
    console.error('STK Push error:', e?.response?.data || e.message);
    return err(res, 502, 'STK Push failed. Please try again.', e?.response?.data);
  }

  const { CheckoutRequestID, MerchantRequestID, ResponseDescription } = stkResponse.data;

  // Step 3: Save pending payment record to Supabase
  await supabase.from('payments').insert({
    checkout_request_id: CheckoutRequestID,
    merchant_request_id: MerchantRequestID,
    phone:               formattedPhone,
    amount:              Number(amount),
    status:              'pending',
    user_id:             user?.id || null,
    created_at:          new Date().toISOString(),
  });

  console.log('STK Push sent:', { CheckoutRequestID, phone: formattedPhone, user: user?.email });

  return ok(res, {
    CheckoutRequestID,
    MerchantRequestID,
    ResponseDescription,
    message: 'STK Push sent. User should enter their M-Pesa PIN.',
  });
};
