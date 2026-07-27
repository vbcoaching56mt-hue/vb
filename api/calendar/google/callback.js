// api/calendar/google/callback.js
// Google redirige ici après le consentement de l'utilisateur (?code=...&state=...).
// On échange le code contre des tokens, on les enregistre (service_role, jamais exposé au front),
// puis on renvoie le navigateur vers /profil?calendar=connected (ou =error).
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const STATE_SECRET = process.env.CALENDAR_STATE_SECRET;
const APP_URL = process.env.APP_URL || 'https://app.skorup.fr';

function verifyState(state) {
  try {
    const [b64, sig] = String(state).split('.');
    if (!b64 || !sig) return null;
    const expected = crypto.createHmac('sha256', STATE_SECRET).update(b64).digest('base64url');
    if (expected !== sig) return null;
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (!payload.ts || Date.now() - payload.ts > 10 * 60 * 1000) return null; // state valide 10 min max
    return payload;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const { code, state, error: googleError } = req.query;

  if (googleError) {
    return res.redirect(302, `${APP_URL}/profil?calendar=error`);
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !REDIRECT_URI || !STATE_SECRET) {
    console.error('[calendar/google/callback] configuration manquante');
    return res.redirect(302, `${APP_URL}/profil?calendar=error`);
  }

  const payload = verifyState(state);
  if (!payload || !code) {
    return res.redirect(302, `${APP_URL}/profil?calendar=error`);
  }

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access_token) {
      console.error('[calendar/google/callback] échange de code échoué', tokenData);
      return res.redirect(302, `${APP_URL}/profil?calendar=error`);
    }

    // Email Google (affichage uniquement) — best effort.
    let connectedEmail = null;
    try {
      const uiResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (uiResp.ok) {
        const ui = await uiResp.json();
        connectedEmail = ui.email || null;
      }
    } catch {
      // pas bloquant
    }

    const tokenExpiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    // Google ne renvoie un refresh_token qu'à la première autorisation (ou avec prompt=consent, ce
    // qu'on force toujours) — mais par sécurité, si absent lors d'une reconnexion, on garde l'ancien.
    const { data: existing } = await supabaseAdmin
      .from('calendar_connections')
      .select('refresh_token')
      .eq('owner_id', payload.ownerId)
      .eq('provider', 'google')
      .maybeSingle();

    const refreshToken = tokenData.refresh_token || existing?.refresh_token;
    if (!refreshToken) {
      console.error('[calendar/google/callback] aucun refresh_token disponible');
      return res.redirect(302, `${APP_URL}/profil?calendar=error`);
    }

    const { error: upsertErr } = await supabaseAdmin.from('calendar_connections').upsert({
      owner_id: payload.ownerId,
      role: payload.role,
      organisation_id: payload.orgId || null,
      provider: 'google',
      connected_email: connectedEmail,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      token_expiry: tokenExpiry,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id,provider' });

    if (upsertErr) {
      console.error('[calendar/google/callback] upsert échoué', upsertErr);
      return res.redirect(302, `${APP_URL}/profil?calendar=error`);
    }

    return res.redirect(302, `${APP_URL}/profil?calendar=connected`);
  } catch (err) {
    console.error('[calendar/google/callback]', err);
    return res.redirect(302, `${APP_URL}/profil?calendar=error`);
  }
};
