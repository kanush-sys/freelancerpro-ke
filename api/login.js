// api/login.js
// POST /api/login  — { email, password }
// Authenticates via Supabase Auth, fetches/creates profile,
// checks premium expiry, returns access_token + user object.

const supabase                            = require('./_supabase');
const { setCors, handleOptions, ok, err } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return err(res, 405, 'Use POST.');

  const { email, password } = req.body || {};
  if (!email || !password)
    return err(res, 400, 'email and password are required.');

  // ── Step 1: Authenticate
  const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    return err(res, 401, 'Incorrect email or password. Please try again.');
  }

  const userId   = sessionData.user.id;
  const authName = sessionData.user.user_metadata?.name || 'Freelancer';

  // ── Step 2: Fetch profile — create one if it doesn't exist yet
  let { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name, premium, premium_since, premium_expires')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    // Profile missing — create it now (handles edge cases from failed registration)
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({
        id:         userId,
        email:      sessionData.user.email.toLowerCase().trim(),
        name:       authName,
        premium:    false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('name, premium, premium_since, premium_expires')
      .single();
    profile = newProfile || { name: authName, premium: false, premium_since: null, premium_expires: null };
  }

  // ── Step 3: Check if premium has expired
  let premiumActive = profile.premium || false;
  if (premiumActive && profile.premium_expires) {
    if (new Date(profile.premium_expires) < new Date()) {
      premiumActive = false;
      await supabase
        .from('profiles')
        .update({ premium: false, updated_at: new Date().toISOString() })
        .eq('id', userId);
    }
  }

  // ── Step 4: Check pending_premiums table (paid before having an account)
  if (!premiumActive) {
    const formattedPhone = sessionData.user.phone || null;
    if (formattedPhone) {
      const { data: pending } = await supabase
        .from('pending_premiums')
        .select('*')
        .eq('phone', formattedPhone)
        .eq('claimed', false)
        .single();

      if (pending) {
        // Grant premium and mark as claimed
        const premiumExpires = new Date();
        premiumExpires.setDate(premiumExpires.getDate() + 30);
        await supabase.from('profiles').update({
          premium:         true,
          premium_since:   new Date().toISOString(),
          premium_expires: premiumExpires.toISOString(),
        }).eq('id', userId);
        await supabase.from('pending_premiums').update({
          claimed: true, claimed_by: userId, claimed_at: new Date().toISOString(),
        }).eq('id', pending.id);
        premiumActive = true;
      }
    }
  }

  return ok(res, {
    access_token: sessionData.session.access_token,
    user: {
      id:              userId,
      email:           sessionData.user.email,
      name:            profile.name || authName,
      premium:         premiumActive,
      premium_since:   premiumActive ? profile.premium_since   : null,
      premium_expires: premiumActive ? profile.premium_expires : null,
    },
  });
};
