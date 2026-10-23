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

// SÉCURITÉ (2026-10-12) : les liens des emails pointent toujours vers l'application SkorUp (avant :
// n'importe quel site https envoyé par le navigateur était accepté → risque d'hameçonnage), et
// les textes insérés (noms, titres de documents) sont neutralisés.
const APP_URL = (process.env.APP_URL || 'https://app.skorup.fr').replace(/\/+$/, '');
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  'https://app.skorup.fr',
  ...String(process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean),
]);
function safeOriginOf(origin) {
  const o = typeof origin === 'string' ? origin.trim().replace(/\/+$/, '') : '';
  return ALLOWED_ORIGINS.has(o) ? o : APP_URL;
}
function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function plainText(v, max = 200) {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
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

  const clientName = plainText(client.nom_complet || 'un nouveau client');
  const formateurFirstName = escapeHtml((formateur.nom || '').split(' ')[0] || '');
  const link = `${safeOrigin}/?view=formateur&client=${encodeURIComponent(clientId)}`;

  const subject = `Nouveau client assigné : ${clientName}`;
  const bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${formateurFirstName},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;"><strong>${escapeHtml(clientName)}</strong> vient de vous être assigné comme client sur SkorUp.</p>
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

  const { formateurId, documentName, documentNames, origin } = req.body || {};
  // 2026-10-23 : plusieurs documents → un seul email.
  const listeNoms = Array.isArray(documentNames) ? documentNames.map(n => plainText(n)).filter(Boolean).slice(0, 30) : [];
  if (!formateurId || (!documentName && !listeNoms.length)) {
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

  const formateurFirstName = escapeHtml((formateur.nom || '').split(' ')[0] || '');
  const link = `${safeOrigin}/?view=formateur`;
  const docName = plainText(documentName || listeNoms.join(', '));
  const plusieurs = listeNoms.length > 1;

  const subject = plusieurs ? `${listeNoms.length} nouveaux documents à signer` : `Nouveau document à signer : ${listeNoms[0] || docName}`;
  const phraseDocuments = plusieurs
    ? `De nouveaux documents sont en attente de votre signature sur SkorUp :</p><ul style="color:#111827;font-size:14px;line-height:1.7;margin:0 0 12px 0;padding-left:20px;">${listeNoms.map(n => `<li><strong>${escapeHtml(n)}</strong></li>`).join('')}</ul><p style="color:#111827;font-size:14px;line-height:1.7;">`
    : `Un nouveau document est en attente de votre signature sur SkorUp : <strong>${escapeHtml(listeNoms[0] || docName)}</strong>.`;
  const bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${formateurFirstName},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">${phraseDocuments}</p>
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

// ── type: 'depot_client' (2026-10-13) — un client vient d'envoyer un document depuis son espace ─
// Prévient le formateur et/ou l'admin selon le destinataire choisi par le client. L'appelant doit
// être le client lui-même (son identifiant de connexion = clients.id = depots_clients.client_id).
async function handleDepotClient(req, res, authData) {
  const { depotId, origin } = req.body || {};
  if (!depotId) return res.status(400).json({ error: 'depotId est requis.' });
  const safeOrigin = safeOriginOf(origin);

  const { data: depot, error: depotErr } = await supabaseAdmin
    .from('depots_clients')
    .select('id, client_id, organisation_id, titre, categorie, message, destinataire')
    .eq('id', depotId)
    .maybeSingle();
  if (depotErr) throw depotErr;
  if (!depot || String(depot.client_id) !== String(authData.user.id)) {
    return res.status(403).json({ error: 'Document introuvable pour ce compte.' });
  }

  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, nom_complet, formateur_id, organisation_id')
    .eq('id', depot.client_id)
    .maybeSingle();
  if (clientErr) throw clientErr;
  if (!client) return res.status(404).json({ error: 'Client introuvable.' });

  const destinataires = [];
  if (depot.destinataire !== 'organisme' && client.formateur_id) {
    const { data: f } = await supabaseAdmin.from('utilisateurs').select('id, nom, email, role')
      .eq('id', client.formateur_id).eq('organisation_id', client.organisation_id).maybeSingle();
    if (f) destinataires.push(f);
  }
  if (depot.destinataire !== 'formateur') {
    const { data: admins } = await supabaseAdmin.from('utilisateurs').select('id, nom, email, role')
      .eq('organisation_id', client.organisation_id).eq('role', 'admin');
    (admins || []).forEach(a => { if (!destinataires.some(d => d.email && d.email === a.email)) destinataires.push(a); });
  }
  if (destinataires.length === 0) return res.status(200).json({ sent: false, message: 'Aucun destinataire.' });

  const clientName = plainText(client.nom_complet || 'Un client');
  const titre = plainText(depot.titre || 'Document');
  const message = plainText(depot.message || '', 500);
  const subject = `Nouveau document de ${clientName} : ${titre}`;
  const resultats = [];
  for (const dest of destinataires) {
    const firstName = escapeHtml((dest.nom || '').split(' ')[0] || '');
    const link = dest.role === 'admin'
      ? `${safeOrigin}/clients`
      : `${safeOrigin}/?view=formateur&client=${encodeURIComponent(client.id)}`;
    const bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${firstName},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;"><strong>${escapeHtml(clientName)}</strong> vient de vous envoyer un document sur SkorUp : <strong>${escapeHtml(titre)}</strong>${depot.categorie ? ` (${escapeHtml(plainText(depot.categorie))})` : ''}.</p>
      ${message ? `<p style="color:#374151;font-size:14px;line-height:1.7;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">« ${escapeHtml(message)} »</p>` : ''}
      <p style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#7C3AED;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">Voir le document</a>
      </p>
      <p style="color:#6b7280;font-size:12px;line-height:1.6;">Vous le trouverez dans la fiche du client, onglet « Reçus du client ».</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Email automatique SkorUp — ne pas répondre à ce message.</p>
    </div>
  </div>`;
    resultats.push(await envoyerEmailFormateur(dest, subject, bodyHtml));
  }
  return res.status(200).json({ sent: resultats.some(r => r.sent), resultats });
}

// ── type: 'compte_client' (2026-10-19) — « Créer le compte et envoyer le lien » ──────────────────
// Pour un client dont la fiche existe mais dont le compte de connexion n'a jamais été créé (ou a
// été supprimé). Le compte est recréé avec le MÊME identifiant que la fiche (sinon le client ne
// retrouverait ni ses séances ni ses documents), puis un lien « choisir mon mot de passe » lui est
// envoyé. Réservé à l'admin de l'organisme et au formateur du client.
async function appelantEquipe(authData) {
  let { data: row } = await supabaseAdmin.from('utilisateurs')
    .select('id, role, organisation_id').eq('auth_uid', authData.user.id).maybeSingle();
  if (!row && authData.user.email) {
    const fb = await supabaseAdmin.from('utilisateurs')
      .select('id, role, organisation_id').is('auth_uid', null).eq('email', authData.user.email).maybeSingle();
    row = fb.data;
  }
  return row && row.organisation_id && (row.role === 'admin' || row.role === 'formateur') ? row : null;
}

// Guide d'utilisation (même lien que le modèle d'email Supabase « Invite user »).
const GUIDE_URL = process.env.GUIDE_URL || 'https://egfpyfisgqpxcnmxmdxi.supabase.co/storage/v1/object/public/guides/guide-utilisation-skorup.pdf';

function emailAccesClient({ nomClient, nomOrganisme, lien, relance, connexion = false }) {
  const prenom = escapeHtml(String(nomClient || '').split(' ')[0] || '');
  const org = escapeHtml(nomOrganisme || 'votre organisme de formation');
  const intro = connexion
    ? `Voici un nouveau lien pour accéder à votre espace de formation chez <strong>${org}</strong>.`
    : relance
    ? `Votre espace de formation chez <strong>${org}</strong> vous attend, mais vous ne l'avez pas encore activé.`
    : `<strong>${org}</strong> vous a ouvert un espace personnel sur SkorUp pour suivre votre formation : séances, documents à signer, émargements.`;
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">${org}</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${prenom},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">${intro}</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et accéder à votre espace.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="background:#7C3AED;color:white;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:bold;display:inline-block;">Activer mon espace</a>
      </p>
      <p style="color:#6b7280;font-size:12px;line-height:1.6;">Ce lien est personnel et valable pour une durée limitée. S'il a expiré, demandez-en un nouveau à votre formateur ou utilisez « Mot de passe oublié » sur la page de connexion.</p>
      <p style="font-size:14px;color:#374151;line-height:1.6;">Besoin d'aide pour vos premiers pas sur SkorUp ?<br>
        <a href="${GUIDE_URL}" style="color:#7C3AED;font-weight:bold;">Télécharger le guide d'utilisation (PDF)</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Envoyé par ${org} via SkorUp.</p>
    </div>
  </div>`;
}

async function handleCompteClient(req, res, authData) {
  const appelant = await appelantEquipe(authData);
  if (!appelant) return res.status(403).json({ error: "Réservé à l'équipe de l'organisme." });

  const { clientId, origin } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId est requis.' });
  const safeOrigin = safeOriginOf(origin);

  const { data: client, error: clientErr } = await supabaseAdmin.from('clients')
    .select('id, nom_complet, email_contact, organisation_id, formateur_id, formateur_auth_uid')
    .eq('id', clientId).eq('organisation_id', appelant.organisation_id).maybeSingle();
  if (clientErr) throw clientErr;
  if (!client) return res.status(404).json({ error: 'Client introuvable dans votre organisme.' });
  if (appelant.role === 'formateur'
    && String(client.formateur_id) !== String(appelant.id)
    && String(client.formateur_auth_uid || '') !== String(authData.user.id)) {
    return res.status(403).json({ error: "Ce client n'est pas suivi par vous." });
  }

  const email = String(client.email_contact || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Ce client n'a pas d'adresse email valide dans sa fiche." });
  }

  const existant = await supabaseAdmin.auth.admin.getUserById(client.id);
  if (existant.data && existant.data.user) {
    return res.status(409).json({ error: 'Ce client a déjà un compte : utilisez « Renvoyer le lien ».' });
  }

  const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
    id: client.id,
    email,
    email_confirm: true,
    user_metadata: { role: 'client', nom: client.nom_complet || '' },
  });
  if (createErr) {
    if (/already|registered|exists|duplicate/i.test(createErr.message || '')) {
      return res.status(409).json({ error: "Impossible de créer un compte avec cette adresse email. Vérifiez l'email dans la fiche du client (ou utilisez-en un autre), puis réessayez." });
    }
    throw createErr;
  }
  // 2026-10-21 : l'accès est maintenant envoyé → le dossier n'est plus « accès non envoyé ».
  await supabaseAdmin.from('clients').update({ acces_differe: false }).eq('id', client.id).eq('acces_differe', true);

  const { data: lienData, error: lienErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery', email, options: { redirectTo: safeOrigin },
  });
  if (lienErr) throw lienErr;
  const lien = lienData && lienData.properties && lienData.properties.action_link;
  if (!lien) throw new Error('Lien de connexion non généré.');

  const { data: org } = await supabaseAdmin.from('organisations').select('nom').eq('id', client.organisation_id).maybeSingle();
  const resultat = await envoyerEmailFormateur(
    { email },
    `Votre espace de formation ${org && org.nom ? `chez ${plainText(org.nom, 60)} ` : ''}vous attend`,
    emailAccesClient({ nomClient: client.nom_complet, nomOrganisme: org && org.nom, lien, relance: false }),
  );
  return res.status(200).json({ created: true, ...resultat });
}

// ── type: 'renvoi_lien' (21/10/2026) — bouton « Renvoyer le lien » ─────────────────────────────
// Remplace l'email Supabase (fonction invite-user, action resend) : envoi direct par Resend, plus
// rapide, au nom de l'organisme, avec le guide. Mêmes contrôles que compte_client + limite d'envois
// mémorisée dans app_metadata du compte (non modifiable par l'utilisateur).
const LIEN_DELAI_MIN_MS = 2 * 60 * 1000;
const LIEN_MAX_PAR_24H = 5;

async function handleRenvoiLien(req, res, authData) {
  const appelant = await appelantEquipe(authData);
  if (!appelant) return res.status(403).json({ error: "Réservé à l'équipe de l'organisme." });

  const { clientId, origin } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId est requis.' });
  const safeOrigin = safeOriginOf(origin);

  const { data: client, error: clientErr } = await supabaseAdmin.from('clients')
    .select('id, nom_complet, email_contact, organisation_id, formateur_id, formateur_auth_uid')
    .eq('id', clientId).eq('organisation_id', appelant.organisation_id).maybeSingle();
  if (clientErr) throw clientErr;
  if (!client) return res.status(404).json({ error: 'Client introuvable dans votre organisme.' });
  if (appelant.role === 'formateur'
    && String(client.formateur_id) !== String(appelant.id)
    && String(client.formateur_auth_uid || '') !== String(authData.user.id)) {
    return res.status(403).json({ error: "Ce client n'est pas suivi par vous." });
  }

  const { data: compteData } = await supabaseAdmin.auth.admin.getUserById(client.id);
  const compte = compteData && compteData.user;
  if (!compte) {
    return res.status(409).json({ error: "Ce client n'a pas encore de compte : utilisez « Envoyer l'accès au client »." });
  }
  const email = String(compte.email || client.email_contact || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Ce client n'a pas d'adresse email valide." });
  }

  // Limite : 2 minutes entre deux liens, 5 liens par 24 h et par client.
  const meta = compte.app_metadata || {};
  const maintenant = Date.now();
  const envois = (Array.isArray(meta.skorup_liens) ? meta.skorup_liens : [])
    .map(Number).filter(t => Number.isFinite(t) && maintenant - t < 24 * 3600 * 1000);
  const dernier = envois.length ? Math.max(...envois) : 0;
  if (maintenant - dernier < LIEN_DELAI_MIN_MS) {
    const reste = Math.max(1, Math.ceil((LIEN_DELAI_MIN_MS - (maintenant - dernier)) / 60000));
    return res.status(429).json({ error: `Un lien vient d'être envoyé à ce client. Patientez ${reste} minute${reste > 1 ? 's' : ''} avant d'en renvoyer un (pensez à vérifier ses courriers indésirables).` });
  }
  if (envois.length >= LIEN_MAX_PAR_24H) {
    return res.status(429).json({ error: `${LIEN_MAX_PAR_24H} liens ont déjà été envoyés à ce client ces dernières 24 h. Réessayez demain, ou contactez-le directement.` });
  }

  // Lien : invitation si le compte n'a jamais été activé, sinon lien « choisir un mot de passe ».
  let lien = null;
  let methode = 'reset';
  if (!compte.email_confirmed_at && !compte.last_sign_in_at) {
    const inv = await supabaseAdmin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: safeOrigin } });
    const l = !inv.error && inv.data && inv.data.properties && inv.data.properties.action_link;
    if (l) { lien = l; methode = 'invite'; }
  }
  if (!lien) {
    const rec = await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: safeOrigin } });
    if (rec.error) throw rec.error;
    lien = rec.data && rec.data.properties && rec.data.properties.action_link;
  }
  if (!lien) throw new Error('Lien de connexion non généré.');

  // Mémorisé AVANT l'envoi : un double clic ne part pas deux fois.
  await supabaseAdmin.auth.admin.updateUserById(compte.id, { app_metadata: { ...meta, skorup_liens: [...envois, maintenant] } });

  const { data: org } = await supabaseAdmin.from('organisations').select('nom').eq('id', client.organisation_id).maybeSingle();
  const dejaActif = !!compte.last_sign_in_at;
  const resultat = await envoyerEmailFormateur(
    { email },
    dejaActif
      ? `Votre lien de connexion à votre espace de formation${org && org.nom ? ` (${plainText(org.nom, 60)})` : ''}`
      : `Votre espace de formation ${org && org.nom ? `chez ${plainText(org.nom, 60)} ` : ''}vous attend`,
    emailAccesClient({ nomClient: client.nom_complet, nomOrganisme: org && org.nom, lien, relance: false, connexion: dejaActif }),
  );
  return res.status(200).json({ ...resultat, method: methode, email });
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
    if (type === 'depot_client') return await handleDepotClient(req, res, authData);
    if (type === 'compte_client') return await handleCompteClient(req, res, authData);
    if (type === 'renvoi_lien') return await handleRenvoiLien(req, res, authData);
    return res.status(400).json({ error: 'type invalide (attendu : "assignation", "nouveau_document", "depot_client", "compte_client" ou "renvoi_lien").' });
  } catch (err) {
    console.error('[formateur/notify]', err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
};
