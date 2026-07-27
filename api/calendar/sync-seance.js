// api/calendar/sync-seance.js
// Appelé (best-effort, non bloquant) par le front à chaque fois qu'une séance est créée ou
// modifiée (date, heure, lien visio, note...). Pousse un évènement dans le Google Agenda du
// client ET/OU de son formateur, pour peu que l'un et/ou l'autre ait connecté son compte.
// Ne fait rien silencieusement si personne n'est connecté (ce n'est pas une erreur).
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

function parseMeta(m) {
  if (typeof m === 'string') {
    try { return JSON.parse(m); } catch { return {}; }
  }
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

  const event = {
    summary: seance.nom || `Séance ${seance.numero_seance}`,
  };
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
  if (!eventBody) return;

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
      // L'évènement a été supprimé côté Google entre-temps : on le recrée.
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
      } else {
        console.error('[calendar/sync-seance] recréation évènement échouée', created);
      }
    } else if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      console.error('[calendar/sync-seance] mise à jour évènement échouée', errBody);
    }
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
    } else {
      console.error('[calendar/sync-seance] création évènement échouée', created);
    }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { clientId, numeroSeance } = req.body || {};
    if (!clientId || numeroSeance === undefined || numeroSeance === null) {
      return res.status(400).json({ error: 'clientId et numeroSeance requis' });
    }

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('client_id', clientId)
      .eq('numero_seance', numeroSeance);
    if (rowsErr) throw rowsErr;
    if (!rows || rows.length === 0) return res.status(200).json({ synced: 0 });

    const first = rows[0];
    const withVisio = rows.find(r => parseMeta(r.metadata).lien_visio) || first;
    const withNote = rows.find(r => parseMeta(r.metadata).note_seance) || first;

    const seance = {
      client_id: clientId,
      numero_seance: numeroSeance,
      date: first.date,
      heure_debut: first.heure_debut,
      heure_fin: first.heure_fin,
      nom: (first.nom || '').split(' - ')[0] || `Séance ${numeroSeance}`,
      lien_visio: parseMeta(withVisio.metadata).lien_visio || null,
      note_seance: parseMeta(withNote.metadata).note_seance || null,
    };

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id, formateur_id')
      .eq('id', clientId)
      .maybeSingle();

    const ownerIds = [String(clientId)];
    if (client?.formateur_id) ownerIds.push(String(client.formateur_id));

    const { data: connections } = await supabaseAdmin
      .from('calendar_connections')
      .select('*')
      .eq('provider', 'google')
      .in('owner_id', ownerIds);

    let synced = 0;
    for (const conn of (connections || [])) {
      try {
        await upsertGoogleEvent(conn, conn.owner_id, seance);
        synced++;
      } catch (e) {
        console.error('[calendar/sync-seance] échec synchro pour owner', conn.owner_id, e.message);
      }
    }

    return res.status(200).json({ synced });
  } catch (err) {
    console.error('[calendar/sync-seance]', err);
    return res.status(500).json({ error: err.message });
  }
};
