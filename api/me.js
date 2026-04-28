// api/me.js
// GET /api/me  — Authorization: Bearer <token>
// Called on every page load to restore session server-side.
// Returns live premium status from DB — cannot be faked via localStorage.

const supabase                                     = require('./_supabase');
const { setCors, handleOptions, getUser, ok, err } = require('./_helpers');

module.exports = async (req, res) => {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return err(res, 405, 'Use GET.');

  const user = await getUser(req);
  if (!user) return err(res, 401, 'Not authenticated. Please log in.');

  // Fetch profile
  let { data: profile, error } = await supabase
    .from('profiles')
    .select('name, premium, premium_since, premium_expires')
    .eq('id', user.id)
    .single();

  // If profile row is missing (edge case), create it on the fly
  if (error || !profile) {
    const authName = user.user_metadata?.name || 'Freelancer';
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({
        id:         user.id,
        email:      user.email.toLowerCase().trim(),
        name:       authName,
        premium:    false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('name, premium, premium_since, premium_expires')
      .single();
    profile = newProfile || { name: authName, premium: false, premium_since: null, premium_expires: null };
  }

  // Check premium expiry
  let premiumActive = profile.premium || false;
  if (premiumActive && profile.premium_expires) {
    if (new Date(profile.premium_expires) < new Date()) {
      premiumActive = false;
      await supabase
        .from('profiles')
        .update({ premium: false, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
  }

  return ok(res, {
    user: {
      id:              user.id,
      email:           user.email,
      name:            profile.name,
      premium:         premiumActive,
      premium_since:   premiumActive ? profile.premium_since   : null,
      premium_expires: premiumActive ? profile.premium_expires : null,
    },
  });
};
