// api/_helpers.js
// ─────────────────────────────────────────────────────────────
// Shared helpers: CORS headers, JWT verification, response utils
// ─────────────────────────────────────────────────────────────

const supabase = require('./_supabase');

// ── CORS ─────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(200).end();
    return true;
  }
  return false;
}

// ── JWT verification ──────────────────────────────────────────
// Reads the Bearer token from Authorization header,
// verifies it with Supabase and returns the user object.
async function getUser(req) {
  const auth  = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ── Response helpers ──────────────────────────────────────────
function ok(res, data = {}) {
  return res.status(200).json({ success: true, ...data });
}

function err(res, status, message, details = null) {
  const body = { success: false, error: message };
  if (details) body.details = details;
  return res.status(status).json(body);
}

module.exports = { setCors, handleOptions, getUser, ok, err };
