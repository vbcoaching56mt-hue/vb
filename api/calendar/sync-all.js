// api/calendar/sync-all.js
// Synchronise en une fois TOUTES les séances déjà existantes de l'utilisateur connecté vers son
// Google Agenda. Nécessaire car sync-seance.js ne pousse que les créations/modifications qui
// arrivent APRÈS la connexion — sans cet endpoint, les séances déjà planifiées avant de connecter
// Google Agenda n'apparaîtraient jamais. Appelé automatiquement juste après une connexion réussie,
// et aussi disponible via un bouton "Resynchroniser" pour rattraper d'éventuels ratés.
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function parseMeta(m) {
  if (typeof m === 'string') { try { return JSON.parse(m); } catch { return {}; } }
  return m || {};
}

// Rafraîchit le token d'accès si besoin (marge de 60s) et persiste le nouveau token.
async function ensureFreshAccessToken(connection) {
  const expiry = new Date(connection.token_expiry).getTime();
  if (expiry - Date.now() > 60 * 1000) return connection.access_token;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error('Rafraîchissement du token Google impossible : ' + JSON.stringify(data));
  }
  const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await supabaseAdmin.from('calendar_connections').update({
    access_token: data.access_token,
    token_expiry: newExpiry,
    updated_at: new Date().toISOString(),
  }).eq('id', connection.id);
  return data.access_token;
}

function buildEventBody(seance) {
  const start = seance.date && seance.heure_debut ? `${seance.date}T${seance.heure_debut}:00` : null;
  const end = seance.date && seance.heure_fin ? `${seance.date}T${seance.heure_fin}:00` : null;
  const description = [seance.note_seance, seance.lien_visio].filter(Boolean).join('\n\n');

  const event = { summary: seance.nom || `Séance ${seance.numero_seance}` };
  if (description) event.description = description;
  if (seance.lien_visio) event.location = seance.lien_visio;

  if (start && end) {
    event.start = { dateTime: start, timeZone: 'Europe/Paris' };
    event.end = { dateTime: end, timeZone: 'Europe/Paris' };
  } else if (seance.date) {
    event.start = { date: seance.date };
    event.end = { date: seance.date };
  } else {
    return null; // pas de date : rien à synchroniser
  }
  return event;
}

async function upsertGoogleEvent(connection, ownerId, seance) {
  const accessToken = await ensureFreshAccessToken(connection);
  const eventBody = buildEventBody(seance);
  if (!eventBody) return false;

  const { data: existing } = await supabaseAdmin
    .from('calendar_synced_events')
    .select('id, google_event_id')
    .eq('client_id', seance.client_id)
    .eq('numero_seance', seance.numero_seance)
    .eq('owner_id', ownerId)
    .maybeSingle();

  const calendarApi = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  if (existing?.google_event_id) {
    const resp = await fetch(`${calendarApi}/${existing.google_event_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });
    if (resp.status === 404) {
      const createResp = await fetch(calendarApi, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      });
      const created = await createResp.json();
      if (createResp.ok) {
        await supabaseAdmin.from('calendar_synced_events')
          .update({ google_event_id: created.id, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        return true;
      }
      console.error('[calendar/sync-all] recréation évènement échouée', created);
      return false;
    }
    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      console.error('[calendar/sync-all] mise à jour évènement échouée', errBody);
    }
    return resp.ok;
  } else {
    const resp = await fetch(calendarApi, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });
    const created = await resp.json();
    if (resp.ok) {
      await supabaseAdmin.from('calendar_synced_events').insert({
        client_id: seance.client_id,
        numero_seance: seance.numero_seance,
        owner_id: ownerId,
        google_event_id: created.id,
      });
      return true;
    }
    console.error('[calendar/sync-all] création évènement échouée', created);
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Non authentifié' });

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Session invalide', detail: userErr?.message || userErr?.name || 'inconnu' });
    }
    const authUser = userData.user;

    // Résout l'identité applicative — même logique que api/calendar/google/start.js.
    let ownerId = null;
    let role = null;

    const byAuthUid = await supabaseAdmin
      .from('utilisateurs')
      .select('id, role')
      .eq('auth_uid', authUser.id)
      .maybeSingle();
    let utilisateur = byAuthUid.data;
    if (!utilisateur) {
      const byEmail = await supabaseAdmin
        .from('utilisateurs')
        .select('id, role')
        .is('auth_uid', null)
        .eq('email', authUser.email)
        .maybeSingle();
      utilisateur = byEmail.data;
    }

    if (utilisateur) {
      ownerId = String(utilisateur.id);
      role = utilisateur.role === 'admin' ? 'admin' : 'formateur';
    } else {
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();
      if (client) { ownerId = String(client.id); role = 'client'; }
    }

    if (!ownerId) return res.status(403).json({ error: 'Identité introuvable' });

    const { data: connection } = await supabaseAdmin
      .from('calendar_connections')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('provider', 'google')
      .maybeSingle();
    if (!connection) return res.status(400).json({ error: 'Google Agenda non connecté' });

    // Détermine les clients concernés selon le rôle : un client ne voit que ses propres séances,
    // un formateur/admin voit les séances de tous les clients qui lui sont assignés.
    let clientIds = [];
    if (role === 'client') {
      clientIds = [ownerId];
    } else {
      const { data: myClients } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('formateur_id', ownerId);
      clientIds = (myClients || []).map(c => String(c.id));
    }
    if (clientIds.length === 0) return res.status(200).json({ synced: 0, total: 0 });

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .in('client_id', clientIds)
      .not('date', 'is', null);
    if (rowsErr) throw rowsErr;

    // Regroupe par (client_id, numero_seance) : plusieurs lignes peuvent exister par séance
    // (perspective client / formateur), comme dans sync-seance.js.
    const groups = new Map();
    for (const r of (rows || [])) {
      const key = `${r.client_id}::${r.numero_seance}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    let synced = 0;
    const total = groups.size;
    for (const groupRows of groups.values()) {
      const first = groupRows[0];
      const withVisio = groupRows.find(r => parseMeta(r.metadata).lien_visio) || first;
      const withNote = groupRows.find(r => parseMeta(r.metadata).note_seance) || first;
      const seance = {
        client_id: first.client_id,
        numero_seance: first.numero_seance,
        date: first.date,
        heure_debut: first.heure_debut,
        heure_fin: first.heure_fin,
        nom: (first.nom || '').split(' - ')[0] || `Séance ${first.numero_seance}`,
        lien_visio: parseMeta(withVisio.metadata).lien_visio || null,
        note_seance: parseMeta(withNote.metadata).note_seance || null,
      };
      try {
        const ok = await upsertGoogleEvent(connection, ownerId, seance);
        if (ok) synced++;
      } catch (e) {
        console.error('[calendar/sync-all] échec synchro pour', seance.client_id, seance.numero_seance, e.message);
      }
    }

    return res.status(200).json({ synced, total });
  } catch (err) {
    console.error('[calendar/sync-all]', err);
    return res.status(500).json({ error: err.message });
  }
};
