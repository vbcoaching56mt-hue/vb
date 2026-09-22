// api/formateur/notify.js
//
// Fusion de api/formateur/notify-assignment.js et api/formateur/notify-new-document.js en UNE
// seule fonction serverless — nécessaire le 22/09/2026 pour repasser sous la limite de 12
// fonctions serverless du plan Vercel Hobby (l'ajout des fonctions du questionnaire prospect
// avait fait passer le total à 14). Les DEUX logiques ci-dessous sont reprises À L'IDENTIQUE,
// simplement routées par le champ "type" du corps de la requête au lieu d'être deux fichiers :
//   - type: 'assignation'      → ex-notify-assignment.js (réservé aux admins)
//   - type: 'nouveau_document' → ex-notify-new-document.js (admin, formateur OU client)
//
// Appelée depuis App.js : notifyFormateurAssignment (assignFormateur) et
// notifyFormateurNewDocument, toutes deux vers POST /api/formateur/notify.

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resendApiKey = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SkorUp <noreply@skorup.fr>';

function safeOriginOf(origin) {
  return (typeof origin === 'string' && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(origin))
    ? origin
    : 'https://app.skorup.fr';
}

async function envoyerEmailFormateur(formateur, subject, bodyHtml) {
  if (!formateur.email) return { sent: false, message: 'Ce formateur n\'a pas d\'adresse email enregistrée.' };
  if (!resendApiKey) return { sent: false, simulated: true, message: 'RESEND_API_KEY non configurée côté serveur (Vercel).' };

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [formateur.email], subject, html: bodyHtml }),
  });

  if (!resendResp.ok) {
    const errBody = await resendResp.json().catch(() => ({}));
    return { sent: false, error: errBody.message || `Resend erreur HTTP ${resendResp.status}` };
  }
  return { sent: true };
}

// ── type: 'assignation' — ex-notify-assignment.js, réservé aux admins ──────────────────────────
async function handleAssignation(req, res, authData) {
  let { data: callerRow, error: callerErr } = await supabaseAdmin
    .from('utilisateurs')
    .select('role, organisation_id')
    .eq('auth_uid', authData.user.id)
    .maybeSingle();

  if (!callerErr && !callerRow && authData.user.email) {
    const fallback = await supabaseAdmin
      .from('utilisateurs')
      .select('role, organisation_id')
      .is('auth_uid', null)
      .eq('email', authData.user.email)
      .maybeSingle();
    callerRow = fallback.data;
    callerErr = fallback.error;
  }

  if (callerErr || !callerRow || callerRow.role !== 'admin' || !callerRow.organisation_id) {
    return res.status(403).json({ error: 'Réservé aux administrateurs d\'un organisme.' });
  }
  const organisationId = callerRow.organisation_id;

  const { clientId, formateurId, origin } = req.body || {};
  if (!clientId || !formateurId) {
    return res.status(400).json({ error: 'clientId et formateurId sont requis.' });
  }
  const safeOrigin = safeOriginOf(origin);

  const [{ data: client, error: clientErr }, { data: formateur, error: formateurErr }] = await Promise.all([
    supabaseAdmin.from('clients').select('id, nom_complet, organisation_id').eq('id', clientId).eq('organisation_id', organisationId).maybeSingle(),
    supabaseAdmin.from('utilisateurs').select('id, nom, email, organisation_id').eq('id', formateurId).eq('organisation_id', organisationId).maybeSingle(),
  ]);
  if (clientErr) throw clientErr;
  if (formateurErr) throw formateurErr;
  if (!client) return res.status(404).json({ error: 'Client introuvable dans cet organisme.' });
  if (!formateur) return res.status(404).json({ error: 'Formateur introuvable dans cet organisme.' });

  const clientName = client.nom_complet || 'un nouveau client';
  const formateurFirstName = (formateur.nom || '').split(' ')[0] || '';
  const link = `${safeOrigin}/?view=formateur&client=${encodeURIComponent(clientId)}`;

  const subject = `Nouveau client assigné : ${clientName}`;
  const bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${formateurFirstName},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;"><strong>${clientName}</strong> vient de vous être assigné comme client sur SkorUp.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#7C3AED;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">Voir la fiche du client</a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Email automatique SkorUp — ne pas répondre à ce message.</p>
    </div>
  </div>`;

  const resultat = await envoyerEmailFormateur(formateur, subject, bodyHtml);
  return res.status(200).json(resultat);
}

// ── type: 'nouveau_document' — ex-notify-new-document.js, admin/formateur/client ───────────────
async function handleNouveauDocument(req, res, authData) {
  let organisationId = null;
  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from('utilisateurs')
    .select('role, organisation_id')
    .eq('auth_uid', authData.user.id)
    .maybeSingle();
  if (staffErr) throw staffErr;

  if (staffRow && ['admin', 'formateur'].includes(staffRow.role) && staffRow.organisation_id) {
    organisationId = staffRow.organisation_id;
  } else {
    if (authData.user.email) {
      const fallbackStaff = await supabaseAdmin
        .from('utilisateurs')
        .select('role, organisation_id')
        .is('auth_uid', null)
        .eq('email', authData.user.email)
        .maybeSingle();
      if (fallbackStaff.data && ['admin', 'formateur'].includes(fallbackStaff.data.role) && fallbackStaff.data.organisation_id) {
        organisationId = fallbackStaff.data.organisation_id;
      }
    }
    if (!organisationId && authData.user.email) {
      const clientRow = await supabaseAdmin
        .from('clients')
        .select('organisation_id')
        .ilike('email_contact', authData.user.email)
        .maybeSingle();
      if (clientRow.data?.organisation_id) organisationId = clientRow.data.organisation_id;
    }
  }

  if (!organisationId) {
    return res.status(403).json({ error: 'Compte non reconnu pour un organisme.' });
  }

  const { formateurId, documentName, origin } = req.body || {};
  if (!formateurId || !documentName) {
    return res.status(400).json({ error: 'formateurId et documentName sont requis.' });
  }
  const safeOrigin = safeOriginOf(origin);

  const { data: formateur, error: formateurErr } = await supabaseAdmin
    .from('utilisateurs')
    .select('id, nom, email, organisation_id')
    .eq('id', formateurId)
    .eq('organisation_id', organisationId)
    .maybeSingle();
  if (formateurErr) throw formateurErr;
  if (!formateur) return res.status(404).json({ error: 'Formateur introuvable dans cet organisme.' });

  const formateurFirstName = (formateur.nom || '').split(' ')[0] || '';
  const link = `${safeOrigin}/?view=formateur`;

  const subject = `Nouveau document à signer : ${documentName}`;
  const bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${formateurFirstName},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">Un nouveau document est en attente de votre signature sur SkorUp : <strong>${documentName}</strong>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#7C3AED;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">Voir mes documents</a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Email automatique SkorUp — ne pas répondre à ce message.</p>
    </div>
  </div>`;

  const resultat = await envoyerEmailFormateur(formateur, subject, bodyHtml);
  return res.status(200).json(resultat);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Authentifier l'appelant via son token Supabase (commun aux deux cas) ──
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return res.status(401).json({ error: 'Session invalide ou expirée.' });

    const { type } = req.body || {};
    if (type === 'assignation') return await handleAssignation(req, res, authData);
    if (type === 'nouveau_document') return await handleNouveauDocument(req, res, authData);
    return res.status(400).json({ error: 'type invalide (attendu : "assignation" ou "nouveau_document").' });
  } catch (err) {
    console.error('[formateur/notify]', err);
    return res.status(500).json({ error: err.message });
  }
};
