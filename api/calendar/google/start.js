// api/calendar/google/start.js
// Démarre la connexion Google Agenda pour l'utilisateur actuellement connecté (client OU formateur).
// Le front-end appelle cet endpoint avec le token Supabase de l'utilisateur (Authorization: Bearer ...),
// on vérifie ce token, on retrouve son identité (utilisateurs OU clients), puis on renvoie l'URL
// d'autorisation Google vers laquelle rediriger le navigateur.
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI; // ex: https://app.skorup.fr/api/calendar/google/callback
const STATE_SECRET = process.env.CALENDAR_STATE_SECRET;

function signState(payload) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!GOOGLE_CLIENT_ID || !REDIRECT_URI || !STATE_SECRET) {
      return res.status(500).json({ error: "Configuration Google Agenda manquante côté serveur (variables d'environnement)." });
    }

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Non authentifié' });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error('[calendar/google/start] getUser a échoué', userErr);
      // Détail exposé temporairement (rien de sensible : juste le message d'erreur Supabase Auth)
      // pour diagnostiquer sans avoir besoin d'aller lire les logs Vercel.
      return res.status(401).json({ error: 'Session invalide', detail: userErr?.message || userErr?.name || 'inconnu' });
    }
    const authUser = userData.user;

    // Résout l'identité applicative (utilisateur formateur/admin OU client) à partir du compte
    // Supabase Auth vérifié — jamais fait confiance à une valeur envoyée par le client.
    let ownerId = null;
    let role = null;
    let orgId = null;

    const byAuthUid = await supabaseAdmin
      .from('utilisateurs')
      .select('id, role, organisation_id')
      .eq('auth_uid', authUser.id)
      .maybeSingle();

    let utilisateur = byAuthUid.data;
    if (!utilisateur) {
      const byEmail = await supabaseAdmin
        .from('utilisateurs')
        .select('id, role, organisation_id')
        .is('auth_uid', null)
        .eq('email', authUser.email)
        .maybeSingle();
      utilisateur = byEmail.data;
    }

    if (utilisateur) {
      ownerId = String(utilisateur.id);
      role = utilisateur.role === 'admin' ? 'admin' : 'formateur';
      orgId = utilisateur.organisation_id;
    } else {
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('id, organisation_id')
        .eq('id', authUser.id)
        .maybeSingle();
      if (client) {
        ownerId = String(client.id);
        role = 'client';
        orgId = client.organisation_id;
      }
    }

    if (!ownerId) return res.status(403).json({ error: 'Identité introuvable' });

    const state = signState({ ownerId, role, orgId, ts: Date.now() });
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: 'https://www.googleapis.com/auth/calendar.events openid email',
      state,
    });

    return res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (err) {
    console.error('[calendar/google/start]', err);
    return res.status(500).json({ error: err.message });
  }
};
