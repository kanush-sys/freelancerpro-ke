# FreelancerPro KE 🇰🇪

> The only tool built for Kenyan freelancers — Rate Calculator, M-Pesa Invoice Generator, and KRA Tax Estimator with real M-Pesa STK Push payments.

---

## What's in this project

```
freelancerpro-ke/
├── public/
│   └── index.html          ← The entire frontend (single file)
├── api/
│   ├── _supabase.js        ← Shared Supabase client (internal)
│   ├── _helpers.js         ← CORS, JWT, response utils (internal)
│   ├── register.js         ← POST /api/register
│   ├── login.js            ← POST /api/login
│   ├── me.js               ← GET  /api/me
│   ├── stkpush.js          ← POST /api/stkpush   (sends STK prompt)
│   ├── stkquery.js         ← POST /api/stkquery  (polls payment status)
│   └── callback.js         ← POST /api/callback  (Safaricom webhook)
├── supabase-schema.sql     ← Run this in Supabase SQL Editor
├── vercel.json             ← Vercel deployment config
├── package.json            ← Node dependencies
├── .env.example            ← Copy to .env for local dev
├── .gitignore              ← Keeps secrets out of Git
└── README.md               ← This file
```

---

## Deployment — Step by Step

### STEP 1 — Create a Supabase project (free)

1. Go to **https://supabase.com** → New Project
2. Choose a name (e.g. `freelancerpro-ke`) and a strong database password
3. Select region: **Europe West** (closest to Kenya)
4. Wait ~2 minutes for it to provision

### STEP 2 — Run the database schema

1. In your Supabase project → **SQL Editor** → **New Query**
2. Open `supabase-schema.sql` from this project
3. Copy the entire contents and paste into the SQL Editor
4. Click **Run** — you should see "Success. No rows returned"
5. Go to **Table Editor** — you should see 5 tables: `profiles`, `payments`, `pending_premiums`, `saved_clients`, `invoices`

### STEP 3 — Get your Supabase keys

1. Supabase project → **Settings** → **API**
2. Copy:
   - **Project URL** → this is your `SUPABASE_URL`
   - **service_role** secret key → this is your `SUPABASE_SERVICE_KEY` ⚠️ Keep this secret

### STEP 4 — Create a Safaricom Daraja account

1. Go to **https://developer.safaricom.co.ke** → Register
2. Go to **My Apps** → **Add a New App**
3. Check **Lipa na M-Pesa Sandbox** and **Lipa na M-Pesa Online**
4. Copy your **Consumer Key** and **Consumer Secret**
5. Go to **APIs** → **Lipa Na M-Pesa** → **Lipa Na M-Pesa Online** to find your sandbox **Passkey**

> For production (real money): Apply for Go-Live in the Daraja portal. Safaricom reviews and approves within a few days. You'll get a real Shortcode (Till or Paybill number) and production Passkey.

### STEP 5 — Deploy to Vercel (free)

```bash
# Install Vercel CLI (one time)
npm install -g vercel

# Enter project folder
cd freelancerpro-ke

# Install dependencies
npm install

# Deploy (follow the prompts — choose "N" for existing project)
vercel

# Note the URL it gives you e.g. https://freelancerpro-ke.vercel.app
```

### STEP 6 — Set environment variables in Vercel

1. Go to **https://vercel.com** → Your Project → **Settings** → **Environment Variables**
2. Add each of these one by one:

| Variable | Value |
|---|---|
| `MPESA_CONSUMER_KEY` | From Safaricom Daraja portal |
| `MPESA_CONSUMER_SECRET` | From Safaricom Daraja portal |
| `MPESA_SHORTCODE` | `174379` (sandbox) or your real Till/Paybill |
| `MPESA_PASSKEY` | From Daraja portal |
| `MPESA_ENV` | `sandbox` (change to `production` when live) |
| `MPESA_CALLBACK_URL` | `https://your-app.vercel.app/api/callback` |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Your service_role key |

3. After adding all variables → **Redeploy**:
```bash
vercel --prod
```

### STEP 7 — Test the full flow (sandbox)

1. Open your deployed URL
2. Click **Login / Sign Up** → create an account
3. Click **⭐ Upgrade** → enter the Safaricom test number: `254708374149`
4. The STK Push goes to Safaricom sandbox (no real money)
5. In sandbox, payments auto-confirm — watch the UI update to Premium ✅

### STEP 8 — Go Live with real M-Pesa

1. In Safaricom Daraja portal → apply for **Go-Live**
2. Once approved, update your Vercel env vars:
   - `MPESA_ENV` → `production`
   - `MPESA_SHORTCODE` → your real Till or Paybill number
   - `MPESA_PASSKEY` → your production passkey
   - `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` → production keys
3. Redeploy: `vercel --prod`

---

## Local Development

```bash
# Copy env template
cp .env.example .env
# Fill in your values in .env

# Install deps
npm install

# Run locally (needs Vercel CLI)
vercel dev
# App runs at http://localhost:3000
```

---

## How payments work

```
User clicks "Pay Ksh 399"
        ↓
Frontend → POST /api/stkpush
        ↓
Backend gets OAuth token from Safaricom
        ↓
Backend sends STK Push to user's phone
        ↓
Backend saves pending payment in Supabase
        ↓
Frontend polls POST /api/stkquery every 3s
        ↓
User enters M-Pesa PIN on phone
        ↓
Safaricom POSTs result to /api/callback  ← server-side truth
        ↓
stkquery returns SUCCESS
        ↓
Supabase: profiles.premium = true (30 days)
        ↓
Frontend unlocks all premium features ✅
```

---

## Receiving money

Payments go to the M-Pesa **Till** or **Paybill** number you set as `MPESA_SHORTCODE` in production. To withdraw:
- **Till number**: withdraw via M-Pesa → Lipa na M-Pesa → Business to M-Pesa
- **Paybill**: manage via your bank's M-Pesa paybill settlement

---

## Questions?

If you get stuck at any step, the most common issues are:
- **502 from /api/stkpush** → wrong Consumer Key/Secret or wrong ENV value
- **500 from /api/me** → Supabase schema not run yet
- **Premium not unlocking** → CALLBACK_URL not set to your real Vercel URL
