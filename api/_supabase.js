// api/_supabase.js
// ─────────────────────────────────────────────────────────────
// Shared Supabase client — imported by all API routes.
// Uses the SERVICE ROLE key (server-side only, never exposed
// to the browser). Set these in your Vercel environment vars:
//
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  eyJh... (service_role key)
// ─────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  }
);

module.exports = supabase;
