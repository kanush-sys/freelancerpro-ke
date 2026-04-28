// api/register.js
// POST /api/register  — { name, email, password }
// Creates a Supabase Auth user (auto-confirmed), inserts profile,
// returns access_token so user is immediately logged in.

const supabase                            = require('./_supabase');
const { setCors, handleOptions, ok, err } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return err(res, 405, 'Use POST.');

  const { email, password, name } = req.body || {};

  if (!email || !password || !name)
    return err(res, 400, 'email, password and name are all required.');
  if (password.length < 8)
    return err(res, 400, 'Password must be at least 8 characters.');

  // ── Step 1: Create auth user via admin API (auto-confirms email)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email:            email.toLowerCase().trim(),
    password,
    email_confirm:    true,
    user_metadata:    { name: name.trim() },
  });

  if (authError) {
    const msg = authError.message || '';
    if (msg.includes('already registered') || msg.includes('already exists') || authError.status === 422)
      return err(res, 409, 'An account with this email already exists. Please log in.');
    return err(res, 400, msg || 'Registration failed.');
  }

  const userId = authData.user.id;

  // ── Step 2: Upsert profile row (safe even if it already exists)
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id:         userId,
        email:      email.toLowerCase().trim(),
        name:       name.trim(),
        premium:    false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (profileError) {
    console.error('Profile upsert error (non-fatal):', profileError.message);
  }

  // ── Step 3: Sign in immediately to return a live session token
  const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase().trim(),
    password,
  });

  if (sessionError) {
    // Account was created — just ask them to log in
    return ok(res, {
      message:       'Account created! Please log in.',
      requiresLogin: true,
    });
  }

  return ok(res, {
    message:      'Account created successfully.',
    access_token: sessionData.session.access_token,
    user: {
      id:      userId,
      email:   email.toLowerCase().trim(),
      name:    name.trim(),
      premium: false,
    },
  });
};
