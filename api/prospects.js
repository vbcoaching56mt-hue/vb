// api/prospects.js
//
// Questionnaires d'entretien préalable envoyés à des prospects sans compte SkorUp — demandé par
// l'utilisateur le 22/09/2026. Fusion de ce qui aurait été deux fichiers (envoyer.js +
// questionnaire.js) en UN SEUL, nécessaire pour rester sous la limite de 12 fonctions serverless
// du plan Vercel Hobby. Trois actions, routées par ?action= dans l'URL :
//
//   POST /api/prospects?action=envoyer   — authentifié (admin/formateur), crée l'envoi + email.
//   GET  /api/prospects?action=lire&t=…  — PUBLIC, lit le questionnaire par token.
//   POST /api/prospects?action=soumettre — PUBLIC, envoie les réponses du prospect (token dans le body).
//
// 26/10/2026 — même principe pour les FINANCEURS (OPCO, entreprise…) d'un dossier client :
//   POST /api/prospects?action=envoyer_financeur — authentifié (admin), questionnaire de l'organisme
//        « photographié » dans financeur_questionnaire_envois + email au contact du financeur.
//   POST /api/prospects?action=relancer_financeur — authentifié (admin), renvoie le même lien (1 fois / 24 h).
//   lire / soumettre : un lien de financeur est reconnu automatiquement (même page publique).
//
// 30/10/2026 — conventions signées par une ENTREPRISE via un lien, sans compte (voir plus bas,
//   « CONVENTIONS SIGNÉES PAR UNE ENTREPRISE ») : envoyer/relancer/annuler_signature, signer_organisme,
//   lire_signature, code_signature, signer_entreprise.
//
// Sécurité de l'accès public (lire/soumettre) : la table prospect_questionnaire_envois n'a AUCUNE
// policy RLS pour "anon" (voir prospect_questionnaires_migration.sql) — cette fonction utilise donc
// la clé service_role, et c'est ELLE, pas la base, qui garantit qu'un token ne révèle jamais que SA
// propre ligne : le token (256 bits aléatoires) doit correspondre exactement, seuls les champs
// nécessaires à l'affichage sont renvoyés, et la soumission est une mise à jour CONDITIONNELLE
// (WHERE token = … AND statut = 'envoye') qui ne touche aucune ligne si le lien est déjà rempli ou
// expiré — impossible d'écraser des réponses déjà envoyées, y compris en cas de double-clic.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resendApiKey = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SkorUp <noreply@skorup.fr>';
const FROM_EMAIL_ORG = FROM_EMAIL;

// UX (2026-10-12) : emails envoyés au nom de l'organisme de formation (« VB Coaching via SkorUp »),
// avec réponse possible vers l'administrateur de l'organisme (plus rassurant pour le client, et
// meilleure délivrabilité qu'un message anonyme « SkorUp »).
const ADRESSE_EXPEDITEUR = ((FROM_EMAIL_ORG.match(/<([^>]+)>/) || [])[1] || FROM_EMAIL_ORG).trim();
function expediteurPour(nomOrganisme) {
  const nom = String(nomOrganisme || '').replace(/[\r\n"<>\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return nom ? `"${nom} via SkorUp" <${ADRESSE_EXPEDITEUR}>` : FROM_EMAIL_ORG;
}
async function infosOrganisme(supabase, organisationId) {
  if (!organisationId) return { nom: '', replyTo: null };
  const [orgRes, adminRes] = await Promise.all([
    supabase.from('organisations').select('nom, subscription_status, subscribed_plan').eq('id', organisationId).maybeSingle(),
    supabase.from('utilisateurs').select('email').eq('organisation_id', organisationId).eq('role', 'admin').order('id', { ascending: true }).limit(1),
  ]);
  const email = adminRes && adminRes.data && adminRes.data[0] && adminRes.data[0].email;
  // Emails au nom de l'organisme = personnalisation de marque, réservée aux offres Pro et Illimité
  // (même règle que l'application : pendant l'essai gratuit, règles de l'offre Essentiel). Pour les
  // autres offres, l'email reste signé « SkorUp » ; seule la réponse vers l'organisme est conservée.
  const org = (orgRes && orgRes.data) || {};
  const offre = String(org.subscribed_plan || '').split('_')[0];
  const estPro = org.subscription_status !== 'trialing' && (offre === 'pro' || offre === 'illimite');
  return {
    nom: estPro ? (org.nom || '') : '',
    replyTo: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim()) ? String(email).trim() : null,
  };
}
function htmlEchappe(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

function echappe(v = '') {
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').slice(0, 4000);
}

// ── action=envoyer — authentifié (admin ou formateur) ───────────────────────────────────────────
async function handleEnvoyer(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return res.status(401).json({ error: 'Session invalide ou expirée.' });

  let { data: callerRow, error: callerErr } = await supabaseAdmin
    .from('utilisateurs')
    .select('id, role, organisation_id')
    .eq('auth_uid', authData.user.id)
    .maybeSingle();

  if (!callerErr && !callerRow && authData.user.email) {
    const fallback = await supabaseAdmin
      .from('utilisateurs')
      .select('id, role, organisation_id')
      .is('auth_uid', null)
      .eq('email', authData.user.email)
      .maybeSingle();
    callerRow = fallback.data;
    callerErr = fallback.error;
  }

  if (callerErr || !callerRow || !['admin', 'formateur'].includes(callerRow.role) || !callerRow.organisation_id) {
    return res.status(403).json({ error: 'Réservé aux administrateurs et formateurs d\'un organisme.' });
  }
  const organisationId = callerRow.organisation_id;

  const { templateId, nom, prenom, email, origin } = req.body || {};
  const nomTrim = plainText(nom, 100);
  const prenomTrim = plainText(prenom, 100);
  const emailTrim = (email || '').toString().trim().toLowerCase();

  if (!templateId) return res.status(400).json({ error: 'Choisissez un modèle de questionnaire.' });
  if (!nomTrim || !prenomTrim) return res.status(400).json({ error: 'Le nom et le prénom sont requis.' });
  if (!EMAIL_RE.test(emailTrim)) return res.status(400).json({ error: 'Adresse email invalide.' });

  const safeOrigin = safeOriginOf(origin);

  // SÉCURITÉ (2026-10-12) : limite anti-abus — 50 questionnaires envoyés par organisme sur 24 h
  // (empêche qu'un compte piraté serve à envoyer des emails en masse au nom de SkorUp).
  const depuis = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: envoisRecents, error: countErr } = await supabaseAdmin
    .from('prospect_questionnaire_envois')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .gte('created_at', depuis);
  if (!countErr && (envoisRecents || 0) >= 50) {
    return res.status(429).json({ error: 'Limite atteinte : 50 questionnaires envoyés en 24 h. Réessayez demain.' });
  }

  const { data: template, error: templateErr } = await supabaseAdmin
    .from('prospect_questionnaire_templates')
    .select('id, titre, actif, organisation_id')
    .eq('id', templateId)
    .eq('organisation_id', organisationId)
    .maybeSingle();
  if (templateErr) throw templateErr;
  if (!template) return res.status(404).json({ error: 'Modèle de questionnaire introuvable dans cet organisme.' });
  if (!template.actif) return res.status(400).json({ error: 'Ce modèle de questionnaire est désactivé.' });

  const questionnaireToken = crypto.randomBytes(32).toString('base64url');

  const { data: envoi, error: envoiErr } = await supabaseAdmin
    .from('prospect_questionnaire_envois')
    .insert([{
      organisation_id: organisationId,
      template_id: template.id,
      token: questionnaireToken,
      nom: nomTrim,
      prenom: prenomTrim,
      email: emailTrim,
      statut: 'envoye',
      envoye_par: callerRow.id,
    }])
    .select('id')
    .single();
  if (envoiErr) throw envoiErr;

  const lien = `${safeOrigin}/questionnaire?t=${questionnaireToken}`;
  const organisme = await infosOrganisme(supabaseAdmin, organisationId);
  const nomOrg = htmlEchappe(organisme.nom || 'SkorUp');
  const subject = `${prenomTrim}, un questionnaire vous attend avant votre entretien`;
  const bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">${nomOrg}</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${escapeHtml(prenomTrim)},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">Avant votre entretien, merci de prendre quelques minutes pour compléter ce court questionnaire : <strong>${echappe(template.titre)}</strong>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="background:#7C3AED;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">Répondre au questionnaire</a>
      </p>
      <p style="color:#6b7280;font-size:12px;">Ce lien est personnel, valable 30 jours, et ne nécessite pas de créer de compte.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Envoyé par ${nomOrg} via SkorUp.${organisme.replyTo ? ' Vous pouvez répondre directement à cet email.' : ''}</p>
    </div>
  </div>`;

  if (!resendApiKey) {
    return res.status(200).json({ sent: false, simulated: true, envoiId: envoi.id, message: 'RESEND_API_KEY non configurée côté serveur (Vercel).' });
  }

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: expediteurPour(organisme.nom), to: [emailTrim], subject, html: bodyHtml, ...(organisme.replyTo ? { reply_to: organisme.replyTo } : {}) }),
  });

  if (!resendResp.ok) {
    const errBody = await resendResp.json().catch(() => ({}));
    return res.status(200).json({ sent: false, envoiId: envoi.id, error: errBody.message || `Resend erreur HTTP ${resendResp.status}` });
  }

  return res.status(200).json({ sent: true, envoiId: envoi.id });
}

// ── FINANCEURS (26/10/2026) ─────────────────────────────────────────────────────────────────────
const TABLE_FINANCEUR = 'financeur_questionnaire_envois';
// Table absente (SQL « questionnaires_financeur » pas encore lancé) : on fait comme si le lien n'existait pas.
function tableAbsente(err) {
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /(does not exist|schema cache|could not find)/i.test(err.message || ''));
}
// Administrateur de l'organisme, sinon réponse d'erreur envoyée et null renvoyé.
async function adminAppelant(req, res) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Authentification requise.' }); return null; }
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) { res.status(401).json({ error: 'Session invalide ou expirée.' }); return null; }
  let { data: row, error } = await supabaseAdmin.from('utilisateurs').select('id, role, organisation_id').eq('auth_uid', authData.user.id).maybeSingle();
  if (!error && !row && authData.user.email) {
    const fb = await supabaseAdmin.from('utilisateurs').select('id, role, organisation_id').is('auth_uid', null).eq('email', authData.user.email).maybeSingle();
    row = fb.data; error = fb.error;
  }
  if (error || !row || row.role !== 'admin' || !row.organisation_id) {
    res.status(403).json({ error: 'Réservé aux administrateurs d\'un organisme.' }); return null;
  }
  return row;
}
// Questions affichables publiquement : jamais les bonnes réponses d'un quiz ; « obligatoire » coché
// par défaut comme dans l'éditeur des questionnaires de l'organisme.
function questionsPubliques(questions) {
  return (Array.isArray(questions) ? questions : []).slice(0, 100).map((q, i) => {
    const type = ['text', 'single', 'multiple'].includes(q && q.type) ? q.type : 'text';
    const sortie = { id: String((q && q.id) ?? `q${i + 1}`).slice(0, 80), text: plainText(q && q.text, 1000), type, obligatoire: !(q && q.obligatoire === false) };
    if (type !== 'text') sortie.options = (Array.isArray(q.options) ? q.options : []).map(o => plainText(o, 300)).filter(Boolean).slice(0, 50);
    return sortie;
  }).filter(q => q.text && (q.type === 'text' || q.options.length));
}
async function nomOrganisme(organisationId) {
  const { data } = await supabaseAdmin.from('organisations').select('nom').eq('id', organisationId).maybeSingle();
  return (data && data.nom) || '';
}
async function emailFinanceur({ envoi, client, organisationId, origin, rappel }) {
  const lien = `${safeOriginOf(origin)}/questionnaire?t=${envoi.token}`;
  const organisme = await infosOrganisme(supabaseAdmin, organisationId);
  const nomEntete = htmlEchappe(organisme.nom || 'SkorUp');
  const nomReel = htmlEchappe((await nomOrganisme(organisationId)) || 'Votre organisme de formation');
  const titre = plainText(envoi.titre, 150);
  const subject = `${rappel ? 'Rappel : ' : ''}Questionnaire « ${titre} »`;
  const bonjour = envoi.destinataire_nom ? `Bonjour ${escapeHtml(envoi.destinataire_nom)},` : 'Bonjour,';
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">${nomEntete}</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">${bonjour}</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">${rappel ? 'Petit rappel : ' : ''}dans le cadre du financement de la prestation suivie par <strong>${escapeHtml(plainText(client, 120))}</strong>, ${nomReel} vous remercie de prendre quelques minutes pour répondre au questionnaire <strong>${echappe(titre)}</strong>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="background:#7C3AED;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">Répondre au questionnaire</a>
      </p>
      <p style="color:#6b7280;font-size:12px;">Ce lien est personnel, valable 30 jours, et ne nécessite pas de créer de compte.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Envoyé par ${nomReel} via SkorUp.${organisme.replyTo ? ' Vous pouvez répondre directement à cet email.' : ''}</p>
    </div>
  </div>`;
  if (!resendApiKey) return { sent: false, simulated: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: expediteurPour(organisme.nom), to: [envoi.destinataire_email], subject, html, ...(organisme.replyTo ? { reply_to: organisme.replyTo } : {}) }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); return { sent: false, error: e.message || `Resend erreur HTTP ${r.status}` }; }
  return { sent: true };
}

// ── action=envoyer_financeur — authentifié (admin) ─────────────────────────────────────────────
async function handleEnvoyerFinanceur(req, res) {
  const appelant = await adminAppelant(req, res);
  if (!appelant) return;
  const organisationId = appelant.organisation_id;
  const { financementId, questionnaireId, origin } = req.body || {};
  if (!financementId) return res.status(400).json({ error: 'Financeur manquant.' });
  if (!questionnaireId) return res.status(400).json({ error: 'Choisissez un questionnaire.' });

  // Même limite anti-abus que les prospects : 50 questionnaires par organisme sur 24 h (prospects + financeurs).
  const depuis = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [c1, c2] = await Promise.all([
    supabaseAdmin.from('prospect_questionnaire_envois').select('id', { count: 'exact', head: true }).eq('organisation_id', organisationId).gte('created_at', depuis),
    supabaseAdmin.from(TABLE_FINANCEUR).select('id', { count: 'exact', head: true }).eq('organisation_id', organisationId).gte('created_at', depuis),
  ]);
  if (c2.error && tableAbsente(c2.error)) return res.status(503).json({ error: 'Fonction pas encore activée : lancez le SQL « questionnaires_financeur » dans Supabase.' });
  if ((c1.count || 0) + (c2.count || 0) >= 50) return res.status(429).json({ error: 'Limite atteinte : 50 questionnaires envoyés en 24 h. Réessayez demain.' });

  const { data: fin, error: finErr } = await supabaseAdmin.from('financements')
    .select('id, client_id, organisation_id, type, financeur_nom, contact_nom, contact_email')
    .eq('id', financementId).eq('organisation_id', organisationId).maybeSingle();
  if (finErr && !tableAbsente(finErr)) throw finErr;
  if (!fin) return res.status(404).json({ error: 'Financeur introuvable dans cet organisme.' });
  const email = String(fin.contact_email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Ajoutez d\'abord l\'email du contact chez ce financeur.' });

  const { data: client } = await supabaseAdmin.from('clients').select('id, nom_complet, organisation_id')
    .eq('id', fin.client_id).eq('organisation_id', organisationId).maybeSingle();
  if (!client) return res.status(404).json({ error: 'Dossier client introuvable.' });

  const { data: qRow, error: qErr } = await supabaseAdmin.from('module_step_resources')
    .select('id, titre, metadata, type, organisation_id')
    .eq('id', questionnaireId).eq('organisation_id', organisationId).eq('type', 'questionnaire').maybeSingle();
  if (qErr) throw qErr;
  if (!qRow) return res.status(404).json({ error: 'Questionnaire introuvable dans cet organisme.' });
  let meta = qRow.metadata;
  if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (_) { meta = {}; } }
  const questions = questionsPubliques(meta && meta.questions);
  if (!questions.length) return res.status(400).json({ error: 'Ce questionnaire ne contient aucune question.' });

  const envoiData = {
    organisation_id: organisationId,
    client_id: client.id,
    financement_id: fin.id,
    questionnaire_id: String(qRow.id),
    titre: plainText(qRow.titre, 200) || 'Questionnaire',
    questions,
    token: crypto.randomBytes(32).toString('base64url'),
    destinataire_nom: plainText(fin.contact_nom, 150) || null,
    destinataire_email: email,
    financeur_nom: plainText(fin.financeur_nom, 150) || null,
    statut: 'envoye',
    envoye_par: appelant.id,
  };
  const { data: envoi, error: insErr } = await supabaseAdmin.from(TABLE_FINANCEUR).insert([envoiData]).select('id').single();
  if (insErr) throw insErr;

  const r = await emailFinanceur({ envoi: envoiData, client: client.nom_complet || '', organisationId, origin, rappel: false });
  if (!r.sent && !r.simulated) {
    // L'email n'est pas parti : on retire l'envoi pour ne pas afficher « Envoyé » à tort.
    await supabaseAdmin.from(TABLE_FINANCEUR).delete().eq('id', envoi.id);
    return res.status(502).json({ error: 'L\'email n\'a pas pu être envoyé : ' + (r.error || 'erreur inconnue') });
  }
  return res.status(200).json({ sent: r.sent, simulated: !!r.simulated, envoiId: envoi.id });
}

// ── action=relancer_financeur — authentifié (admin) ────────────────────────────────────────────
async function handleRelancerFinanceur(req, res) {
  const appelant = await adminAppelant(req, res);
  if (!appelant) return;
  const organisationId = appelant.organisation_id;
  const { envoiId, origin } = req.body || {};
  if (!envoiId) return res.status(400).json({ error: 'Envoi manquant.' });
  const { data: envoi, error } = await supabaseAdmin.from(TABLE_FINANCEUR)
    .select('id, client_id, token, titre, destinataire_nom, destinataire_email, statut, relance_at, nb_relances, created_at')
    .eq('id', envoiId).eq('organisation_id', organisationId).maybeSingle();
  if (error && !tableAbsente(error)) throw error;
  if (!envoi) return res.status(404).json({ error: 'Envoi introuvable.' });
  if (envoi.statut === 'rempli') return res.status(409).json({ error: 'Le financeur a déjà répondu.' });
  const dernier = new Date(envoi.relance_at || envoi.created_at || 0).getTime();
  if (Date.now() - dernier < 24 * 60 * 60 * 1000) return res.status(429).json({ error: 'Déjà envoyé dans les dernières 24 h : réessayez demain.' });
  const { data: client } = await supabaseAdmin.from('clients').select('nom_complet').eq('id', envoi.client_id).maybeSingle();
  const r = await emailFinanceur({ envoi, client: (client && client.nom_complet) || '', organisationId, origin, rappel: true });
  if (!r.sent && !r.simulated) return res.status(502).json({ error: 'L\'email n\'a pas pu être envoyé : ' + (r.error || 'erreur inconnue') });
  // Le lien reste le même ; il redevient valable 30 jours.
  await supabaseAdmin.from(TABLE_FINANCEUR)
    .update({ relance_at: new Date().toISOString(), nb_relances: (envoi.nb_relances || 0) + 1, expire_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() })
    .eq('id', envoi.id).eq('statut', 'envoye');
  return res.status(200).json({ sent: r.sent, simulated: !!r.simulated });
}

// ── action=lire — PUBLIC, GET ───────────────────────────────────────────────────────────────────
async function handleLire(req, res) {
  const t = (req.query?.t || '').toString().trim();
  if (!t) return res.status(400).json({ error: 'Lien invalide.' });

  const { data: envoi, error: envoiErr } = await supabaseAdmin
    .from('prospect_questionnaire_envois')
    .select('id, prenom, nom, statut, expire_at, template_id')
    .eq('token', t)
    .maybeSingle();
  if (envoiErr) throw envoiErr;
  if (!envoi) {
    // 26/10/2026 : lien envoyé à un financeur ?
    const { data: fq, error: fqErr } = await supabaseAdmin.from(TABLE_FINANCEUR)
      .select('id, destinataire_nom, statut, expire_at, titre, questions')
      .eq('token', t).maybeSingle();
    if (fqErr && !tableAbsente(fqErr)) throw fqErr;
    if (!fq) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
    if (fq.statut === 'rempli') return res.status(200).json({ etat: 'rempli' });
    if (fq.expire_at && new Date(fq.expire_at).getTime() < Date.now()) return res.status(200).json({ etat: 'expire' });
    return res.status(200).json({ etat: 'a_remplir', titre: fq.titre, questions: fq.questions || [], prenom: fq.destinataire_nom || '', nom: '' });
  }

  const expire = envoi.expire_at ? new Date(envoi.expire_at).getTime() < Date.now() : false;
  if (envoi.statut === 'rempli') return res.status(200).json({ etat: 'rempli' });
  if (expire) return res.status(200).json({ etat: 'expire' });

  const { data: template, error: templateErr } = await supabaseAdmin
    .from('prospect_questionnaire_templates')
    .select('titre, questions')
    .eq('id', envoi.template_id)
    .maybeSingle();
  if (templateErr) throw templateErr;
  if (!template) return res.status(404).json({ error: 'Lien invalide ou expiré.' });

  return res.status(200).json({
    etat: 'a_remplir',
    titre: template.titre,
    questions: template.questions || [],
    prenom: envoi.prenom,
    nom: envoi.nom,
  });
}

// ── action=soumettre — PUBLIC, POST ─────────────────────────────────────────────────────────────
async function handleSoumettre(req, res) {
  const t = (req.body?.t || req.query?.t || '').toString().trim();
  if (!t) return res.status(400).json({ error: 'Lien invalide.' });

  const reponses = req.body?.reponses;
  if (!reponses || typeof reponses !== 'object' || Array.isArray(reponses)) {
    return res.status(400).json({ error: 'Réponses manquantes.' });
  }
  // SÉCURITÉ (2026-10-12) : taille maximale des réponses (page publique, sans compte).
  if (JSON.stringify(reponses).length > 100000) {
    return res.status(413).json({ error: 'Réponses trop longues.' });
  }

  // Mise à jour CONDITIONNELLE : ne touche la ligne que si elle est encore au statut 'envoye' et
  // pas expirée — empêche tout écrasement d'une réponse déjà soumise.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('prospect_questionnaire_envois')
    .update({ statut: 'rempli', reponses, rempli_at: new Date().toISOString() })
    .eq('token', t)
    .eq('statut', 'envoye')
    .gt('expire_at', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (updateErr) throw updateErr;
  if (!updated) {
    // 26/10/2026 : lien envoyé à un financeur ? Même mise à jour conditionnelle (une seule réponse).
    const { data: fqMaj, error: fqErr } = await supabaseAdmin.from(TABLE_FINANCEUR)
      .update({ statut: 'rempli', reponses, rempli_at: new Date().toISOString() })
      .eq('token', t)
      .eq('statut', 'envoye')
      .gt('expire_at', new Date().toISOString())
      .select('id')
      .maybeSingle();
    if (fqErr && !tableAbsente(fqErr)) throw fqErr;
    if (!fqMaj) return res.status(409).json({ error: 'Ce lien n\'est plus valable (déjà rempli ou expiré).' });
  }

  return res.status(200).json({ etat: 'rempli' });
}

// ── CONVENTIONS SIGNÉES PAR UNE ENTREPRISE, SANS COMPTE (30/10/2026) ──────────────────────────────
// Table « conventions_entreprise » (SQL « signature_entreprise ») : lecture par l'administrateur, écriture
// UNIQUEMENT ici (clé service_role). L'entreprise reçoit un lien personnel (/signer?t=…, 256 bits) ;
// le PDF d'origine n'est jamais modifié : le PDF signé = PDF d'origine + une page « Signatures et
// certificat » (signatures, empreinte SHA-256 du PDF d'origine, historique daté avec adresse IP).
//   POST ?action=envoyer_signature   — admin : crée la demande + email au signataire de l'entreprise.
//   POST ?action=relancer_signature  — admin : même lien, 1 fois / 24 h.
//   POST ?action=annuler_signature   — admin : le lien ne fonctionne plus.
//   POST ?action=signer_organisme    — admin : contresignature, PDF final envoyé à l'entreprise.
//   GET  ?action=lire_signature&t=…  — PUBLIC : ce qu'il faut pour afficher la page de signature.
//   POST ?action=code_signature      — PUBLIC : envoie un code à 6 chiffres à l'email du signataire.
//   POST ?action=signer_entreprise   — PUBLIC : signature de l'entreprise (mise à jour conditionnelle).
// Offre Essentiel : 3 conventions par mois ; code de vérification réservé aux offres Pro et Illimité.
const TABLE_CONV = 'conventions_entreprise';
const BUCKET_CONV = 'documents';
const RE_CHEMIN_CONV = /^convention_entreprise_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;
const RE_PNG = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;
const LIMITE_ESSENTIEL_CONV = 3;
const MSG_SANS_TABLE_CONV = 'Fonction pas encore activée : lancez le SQL « signature_entreprise » dans Supabase.';

// Même règle que getPlanTier de l'application (essai gratuit / impayé = Essentiel).
function offreOrganisme(org) {
  if (!org) return 'essentiel';
  if (org.subscription_status === 'trialing') return 'essentiel';
  if (org.subscription_status && org.subscription_status !== 'active') return 'essentiel';
  const k = String(org.subscribed_plan || '').split('_')[0];
  return k === 'pro' || k === 'illimite' ? k : 'essentiel';
}
function ipDe(req) {
  return String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 60) || null;
}
function evenementConv(req, quoi, extra) {
  return { quand: new Date().toISOString(), quoi, ip: req ? ipDe(req) : null, navigateur: req ? (plainText(req.headers && req.headers['user-agent'], 300) || null) : null, ...(extra || {}) };
}
const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const hashCodeConv = (code, token) => sha256Hex(Buffer.from(`${code}|${token}`));
const emailMasque = (e) => { const [u, d] = String(e || '').split('@'); return d ? `${u.slice(0, 1)}${'•'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}` : ''; };
function imagePng(dataUrl) {
  const m = RE_PNG.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 200 || buf.length > 400 * 1024) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  return buf;
}
const urlPubliqueConv = (chemin) => (chemin ? supabaseAdmin.storage.from(BUCKET_CONV).getPublicUrl(chemin).data.publicUrl : null);
async function lirePdfConv(chemin) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_CONV).download(chemin);
  if (error || !data) throw new Error('PDF introuvable dans le stockage');
  return Buffer.from(await data.arrayBuffer());
}
async function deposerPdfConv(chemin, octets) {
  const { error } = await supabaseAdmin.storage.from(BUCKET_CONV).upload(chemin, Buffer.from(octets), { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error('Enregistrement du PDF signé impossible : ' + (error.message || error));
}
function dateHeureParis(iso) {
  if (!iso) return '';
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return `${p.day}/${p.month}/${p.year} à ${p.hour}:${p.minute}`;
  } catch (_) { return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; }
}
const LIBELLES_EVENEMENTS = {
  envoye: (e) => `Lien de signature envoyé à ${e.email || 'l\'entreprise'}`,
  ouvert: () => 'Document ouvert par le signataire',
  code_envoye: (e) => `Code de vérification envoyé à ${e.email || 'l\'entreprise'}`,
  code_valide: () => 'Code de vérification validé',
  signe_entreprise: (e) => `Signé par ${e.nom || 'l\'entreprise'}`,
  signe_organisme: (e) => `Signé par ${e.nom || 'l\'organisme'} pour l'organisme`,
  relance: () => 'Rappel envoyé',
  annule: () => 'Demande annulée par l\'organisme',
  termine: () => 'PDF final envoyé aux signataires',
};

// PDF signé = PDF d'origine (inchangé) + page « Signatures et certificat ».
async function construirePdfConvention(originalBytes, conv, nomOrg) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const pdf = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const nbPagesOrigine = pdf.getPageCount();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  // Police standard des PDF : caractères inconnus remplacés (sinon pdf-lib refuse le texte).
  const sur = (t, f = font) => Array.from(String(t ?? '').replace(/[  \t\r]/g, ' ').replace(/\n/g, ' ')).map(ch => {
    try { f.encodeText(ch); return ch; } catch (_) { return '?'; }
  }).join('');
  const W = 595.28, H = 841.89, M = 50;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const noir = rgb(0.09, 0.06, 0.17), gris = rgb(0.36, 0.33, 0.47), violet = rgb(0.43, 0.16, 0.85);
  const ecrire = (texte, { taille = 10, f = font, couleur = noir, x = M, largeur = W - 2 * M, interligne = 1.35 } = {}) => {
    const mots = sur(texte, f).split(' ');
    let ligne = '';
    const lignes = [];
    mots.forEach(m => {
      const essai = ligne ? `${ligne} ${m}` : m;
      if (f.widthOfTextAtSize(essai, taille) > largeur && ligne) { lignes.push(ligne); ligne = m; } else ligne = essai;
    });
    if (ligne) lignes.push(ligne);
    lignes.forEach(l => {
      if (y < M + 20) { page = pdf.addPage([W, H]); y = H - M; }
      page.drawText(l, { x, y, size: taille, font: f, color: couleur });
      y -= taille * interligne;
    });
  };
  ecrire('Signatures et certificat', { taille: 20, f: gras });
  y -= 4;
  ecrire(`Page ajoutée automatiquement par SkorUp pour ${nomOrg || 'l\'organisme de formation'}. Le document signé comprend les ${nbPagesOrigine} page(s) précédente(s), inchangées.`, { taille: 9.5, couleur: gris });
  y -= 10;
  ecrire('Document', { taille: 12, f: gras });
  ecrire(conv.titre || 'Convention', { taille: 10.5 });
  ecrire('Empreinte SHA-256 du document avant signature :', { taille: 9, couleur: gris });
  ecrire(String(conv.pdf_sha256 || '').slice(0, 32), { taille: 8.5, f: mono });
  ecrire(String(conv.pdf_sha256 || '').slice(32), { taille: 8.5, f: mono });
  y -= 12;

  // Deux cadres côte à côte : entreprise (gauche), organisme (droite).
  const largeurCadre = (W - 2 * M - 20) / 2, hauteurCadre = 220;
  if (y - hauteurCadre < M + 120) { page = pdf.addPage([W, H]); y = H - M; }
  const haut = y;
  const cadre = async (x, titre, lignesInfo, signatureDataUrl, quand) => {
    page.drawRectangle({ x, y: haut - hauteurCadre, width: largeurCadre, height: hauteurCadre, borderColor: rgb(0.85, 0.83, 0.92), borderWidth: 1 });
    let yy = haut - 18;
    page.drawText(sur(titre, gras), { x: x + 12, y: yy, size: 11, font: gras, color: violet });
    yy -= 16;
    lignesInfo.filter(Boolean).forEach(l => {
      let t = sur(l);
      while (t && font.widthOfTextAtSize(t, 9.5) > largeurCadre - 24) t = t.slice(0, -1);
      page.drawText(t, { x: x + 12, y: yy, size: 9.5, font, color: noir });
      yy -= 13;
    });
    const png = imagePng(signatureDataUrl);
    if (png) {
      const img = await pdf.embedPng(png);
      const boiteL = largeurCadre - 24, boiteH = 70;
      const k = Math.min(boiteL / img.width, boiteH / img.height, 1);
      page.drawImage(img, { x: x + 12, y: haut - hauteurCadre + 30, width: img.width * k, height: img.height * k });
      page.drawText(sur(`Signé le ${dateHeureParis(quand)} (heure de Paris)`), { x: x + 12, y: haut - hauteurCadre + 12, size: 8.5, font, color: gris });
    } else {
      page.drawText(sur('En attente de signature'), { x: x + 12, y: haut - hauteurCadre + 40, size: 10, font, color: gris });
    }
  };
  const ch = conv.champs_entreprise || {};
  await cadre(M, 'Pour l\'entreprise', [
    conv.signataire_nom, conv.signataire_fonction, conv.entreprise_nom,
    ch.siret ? `SIRET : ${ch.siret}` : null, ch.adresse || conv.entreprise_adresse || null,
    'Mention : lu et approuvé',
  ], conv.signature_entreprise, conv.signe_entreprise_at);
  await cadre(M + largeurCadre + 20, 'Pour l\'organisme de formation', [
    conv.organisme_signataire || null, nomOrg || null,
  ], conv.signature_organisme, conv.signe_organisme_at);
  y = haut - hauteurCadre - 24;

  ecrire('Historique', { taille: 12, f: gras });
  (Array.isArray(conv.historique) ? conv.historique : []).forEach(e => {
    const lib = (LIBELLES_EVENEMENTS[e.quoi] || (() => e.quoi))(e);
    ecrire(`${dateHeureParis(e.quand)} — ${lib}${e.ip ? ` (adresse IP ${e.ip})` : ''}`, { taille: 9 });
  });
  y -= 10;
  ecrire('Signature électronique simple (règlement européen eIDAS n° 910/2014 et article 1367 du Code civil). Le signataire de l\'entreprise a reçu un lien personnel à son adresse email' + (conv.code_requis ? ', puis un code de vérification à cette même adresse' : '') + '. Le navigateur, l\'adresse IP et l\'heure de chaque étape sont conservés avec le document.', { taille: 8.5, couleur: gris });
  return Buffer.from(await pdf.save());
}

async function envoyerEmailConv({ a, sujet, html, nomOrgMarque, replyTo, pieceJointe }) {
  if (!resendApiKey) return { sent: false, simulated: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: expediteurPour(nomOrgMarque), to: [a], subject: sujet, html,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(pieceJointe ? { attachments: [{ filename: pieceJointe.nom, content: Buffer.from(pieceJointe.octets).toString('base64') }] } : {}),
    }),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); return { sent: false, error: e.message || `Resend erreur HTTP ${r.status}` }; }
  return { sent: true };
}
function gabaritEmailConv(nomEntete, corps, bouton) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">${nomEntete}</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      ${corps}
      ${bouton ? `<p style="text-align:center;margin:28px 0;"><a href="${bouton.lien}" style="background:#7C3AED;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">${bouton.texte}</a></p>` : ''}
    </div>
  </div>`;
}
const pEmail = (t) => `<p style="color:#111827;font-size:14px;line-height:1.7;">${t}</p>`;
const pPetit = (t) => `<p style="color:#6b7280;font-size:12px;line-height:1.6;">${t}</p>`;

async function emailInvitationSignature(conv, { origin, rappel }) {
  const organisme = await infosOrganisme(supabaseAdmin, conv.organisation_id);
  const nomReel = (await nomOrganisme(conv.organisation_id)) || 'Votre organisme de formation';
  const lien = `${safeOriginOf(origin)}/signer?t=${conv.token}`;
  const corps = [
    pEmail(`Bonjour ${escapeHtml(conv.signataire_nom)},`),
    pEmail(`${rappel ? 'Petit rappel : ' : ''}<strong>${escapeHtml(nomReel)}</strong> vous invite à lire et signer en ligne le document <strong>${echappe(plainText(conv.titre, 200))}</strong>${conv.entreprise_nom ? ` pour ${escapeHtml(conv.entreprise_nom)}` : ''}.`),
    conv.message ? pEmail(`<em>« ${escapeHtml(plainText(conv.message, 1000))} »</em>`) : '',
    pPetit(`Ce lien est personnel et valable 30 jours. Aucun compte n'est nécessaire${conv.code_requis ? ' ; un code de vérification vous sera envoyé à cette adresse au moment de signer' : ''}.`),
    pPetit(`Envoyé par ${escapeHtml(nomReel)} via SkorUp.${organisme.replyTo ? ' Vous pouvez répondre directement à cet email.' : ''}`),
  ].join('');
  return envoyerEmailConv({
    a: conv.signataire_email,
    sujet: `${rappel ? 'Rappel : ' : ''}Document à signer : ${plainText(conv.titre, 150)}`,
    html: gabaritEmailConv(htmlEchappe(organisme.nom || 'SkorUp'), corps, { lien, texte: 'Lire et signer le document' }),
    nomOrgMarque: organisme.nom, replyTo: organisme.replyTo,
  });
}
async function emailsApresSignature(conv, pdfFinal, { termine }) {
  const organisme = await infosOrganisme(supabaseAdmin, conv.organisation_id);
  const nomReel = (await nomOrganisme(conv.organisation_id)) || 'l\'organisme de formation';
  const entete = htmlEchappe(organisme.nom || 'SkorUp');
  const nomFichier = `${plainText(conv.titre, 80).replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '_') || 'convention'}_signee.pdf`;
  const envois = [];
  if (termine) {
    envois.push(envoyerEmailConv({
      a: conv.signataire_email,
      sujet: `Document signé : ${plainText(conv.titre, 150)}`,
      html: gabaritEmailConv(entete, pEmail(`Bonjour ${escapeHtml(conv.signataire_nom)},`) + pEmail(`Le document <strong>${echappe(plainText(conv.titre, 200))}</strong> est maintenant signé par vous et par ${escapeHtml(nomReel)}. Vous le trouverez en pièce jointe (avec sa page de certificat).`) + pPetit('Conservez cet email : il contient votre exemplaire signé.')),
      nomOrgMarque: organisme.nom, replyTo: organisme.replyTo,
      pieceJointe: { nom: nomFichier, octets: pdfFinal },
    }));
  }
  if (organisme.replyTo) {
    envois.push(envoyerEmailConv({
      a: organisme.replyTo,
      sujet: termine ? `Convention signée : ${plainText(conv.titre, 150)}` : `À contresigner : ${plainText(conv.titre, 150)}`,
      html: gabaritEmailConv('SkorUp', pEmail(termine
        ? `<strong>${escapeHtml(conv.signataire_nom)}</strong>${conv.entreprise_nom ? ` (${escapeHtml(conv.entreprise_nom)})` : ''} a signé « ${echappe(plainText(conv.titre, 200))} ». Le document est complet : il est en pièce jointe et rangé dans SkorUp.`
        : `<strong>${escapeHtml(conv.signataire_nom)}</strong>${conv.entreprise_nom ? ` (${escapeHtml(conv.entreprise_nom)})` : ''} a signé « ${echappe(plainText(conv.titre, 200))} ». Il reste à le signer pour l'organisme : ouvrez SkorUp, le document est dans ${conv.groupe_id ? 'l\'onglet « Convention » du groupe' : 'la fiche du client, onglet Finances'}.`),
        { lien: `${APP_URL}/${conv.groupe_id ? 'groupes' : 'clients'}`, texte: 'Ouvrir SkorUp' }),
      nomOrgMarque: '', replyTo: null,
      ...(termine ? { pieceJointe: { nom: nomFichier, octets: pdfFinal } } : {}),
    }));
  }
  await Promise.all(envois.map(p => p.catch(() => null)));
}
async function conventionDeLOrganisme(id, organisationId, res) {
  if (!id) { res.status(400).json({ error: 'Convention manquante.' }); return null; }
  const { data, error } = await supabaseAdmin.from(TABLE_CONV).select('*').eq('id', id).eq('organisation_id', organisationId).maybeSingle();
  if (error && tableAbsente(error)) { res.status(503).json({ error: MSG_SANS_TABLE_CONV }); return null; }
  if (error) throw error;
  if (!data) { res.status(404).json({ error: 'Convention introuvable.' }); return null; }
  return data;
}

// ── action=envoyer_signature — admin ──────────────────────────────────────────────────────────
async function handleEnvoyerSignature(req, res) {
  const appelant = await adminAppelant(req, res);
  if (!appelant) return;
  const orgId = appelant.organisation_id;
  const b = req.body || {};
  const titre = plainText(b.titre, 200);
  const signataireNom = plainText(b.signataireNom, 150);
  const email = String(b.signataireEmail || '').trim().toLowerCase();
  const pdfPath = String(b.pdfPath || '');
  if (!titre) return res.status(400).json({ error: 'Donnez un titre au document.' });
  if (!signataireNom) return res.status(400).json({ error: 'Indiquez le nom du signataire de l\'entreprise.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Adresse email du signataire invalide.' });
  if (!RE_CHEMIN_CONV.test(pdfPath)) return res.status(400).json({ error: 'Document PDF manquant.' });
  if (!b.groupeId && !b.clientId) return res.status(400).json({ error: 'Groupe ou dossier manquant.' });
  const ordre = b.ordre === 'organisme_dabord' ? 'organisme_dabord' : 'entreprise_dabord';

  // Rattachement : le groupe ou le dossier doit appartenir à l'organisme.
  let groupeId = null, clientId = null;
  if (b.groupeId) {
    const { data: g } = await supabaseAdmin.from('groupes').select('id').eq('id', b.groupeId).eq('organisation_id', orgId).maybeSingle();
    if (!g) return res.status(404).json({ error: 'Groupe introuvable dans cet organisme.' });
    groupeId = g.id;
  } else {
    const { data: c } = await supabaseAdmin.from('clients').select('id').eq('id', b.clientId).eq('organisation_id', orgId).maybeSingle();
    if (!c) return res.status(404).json({ error: 'Dossier introuvable dans cet organisme.' });
    clientId = c.id;
  }

  // Offre : Essentiel = 3 par mois, sans code ; anti-abus 50 / 24 h pour tous.
  const { data: org } = await supabaseAdmin.from('organisations').select('subscription_status, subscribed_plan').eq('id', orgId).maybeSingle();
  const offre = offreOrganisme(org);
  const maintenant = new Date();
  const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)).toISOString();
  const depuis24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [cMois, c24] = await Promise.all([
    supabaseAdmin.from(TABLE_CONV).select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).gte('created_at', debutMois),
    supabaseAdmin.from(TABLE_CONV).select('id', { count: 'exact', head: true }).eq('organisation_id', orgId).gte('created_at', depuis24h),
  ]);
  if ((cMois.error && tableAbsente(cMois.error)) || (c24.error && tableAbsente(c24.error))) return res.status(503).json({ error: MSG_SANS_TABLE_CONV });
  if (offre === 'essentiel' && (cMois.count || 0) >= LIMITE_ESSENTIEL_CONV) {
    return res.status(403).json({ error: `L'offre Essentiel permet ${LIMITE_ESSENTIEL_CONV} signatures par lien par mois. Passez à l'offre Pro pour en envoyer autant que nécessaire.`, limite: true });
  }
  if ((c24.count || 0) >= 50) return res.status(429).json({ error: 'Limite atteinte : 50 demandes de signature en 24 h. Réessayez demain.' });
  const codeRequis = offre !== 'essentiel' && b.codeRequis !== false;

  // Contresignature d'abord (optionnelle).
  let signatureOrganisme = null;
  const organismeSignataire = plainText(b.organismeSignataire, 150) || null;
  if (ordre === 'organisme_dabord') {
    if (!imagePng(b.signatureOrganisme)) return res.status(400).json({ error: 'Signez d\'abord pour l\'organisme (ou choisissez « l\'entreprise d\'abord »).' });
    if (!organismeSignataire) return res.status(400).json({ error: 'Indiquez le nom de la personne qui signe pour l\'organisme.' });
    signatureOrganisme = String(b.signatureOrganisme);
  }

  // Le PDF : déposé par l'application juste avant ; on le lit pour en calculer l'empreinte.
  let octets;
  try { octets = await lirePdfConv(pdfPath); } catch (_) { return res.status(400).json({ error: 'Le PDF n\'a pas été trouvé : recommencez l\'envoi.' }); }
  if (octets.length > 15 * 1024 * 1024) return res.status(413).json({ error: 'PDF trop lourd (15 Mo maximum).' });
  if (octets.slice(0, 4).toString('latin1') !== '%PDF') return res.status(400).json({ error: 'Ce fichier n\'est pas un PDF.' });
  try { const { PDFDocument } = require('pdf-lib'); await PDFDocument.load(octets, { ignoreEncryption: true }); }
  catch (_) { return res.status(400).json({ error: 'Ce PDF ne peut pas être lu (protégé ou abîmé).' }); }

  const token = crypto.randomBytes(32).toString('base64url');
  const historique = [evenementConv(req, 'envoye', { email })];
  const ligne = {
    organisation_id: orgId, groupe_id: groupeId, client_id: clientId,
    titre, entreprise_nom: plainText(b.entrepriseNom, 200) || null, entreprise_adresse: plainText(b.entrepriseAdresse, 300) || null,
    signataire_nom: signataireNom, signataire_fonction: plainText(b.signataireFonction, 150) || null, signataire_email: email,
    ordre, code_requis: codeRequis, message: plainText(b.message, 1000) || null,
    pdf_path: pdfPath, pdf_sha256: sha256Hex(octets), statut: 'envoye', token, historique, envoye_par: appelant.id,
  };
  if (signatureOrganisme) {
    ligne.signature_organisme = signatureOrganisme;
    ligne.organisme_signataire = organismeSignataire;
    ligne.signe_organisme_at = new Date().toISOString();
    historique.unshift(evenementConv(req, 'signe_organisme', { nom: organismeSignataire }));
  }
  const { data: cree, error: insErr } = await supabaseAdmin.from(TABLE_CONV).insert([ligne]).select('id').single();
  if (insErr && tableAbsente(insErr)) return res.status(503).json({ error: MSG_SANS_TABLE_CONV });
  if (insErr && (insErr.code === '23505' || /duplicate|unique/i.test(insErr.message || ''))) return res.status(409).json({ error: 'Ce PDF a déjà été envoyé : recommencez l\'envoi.' });
  if (insErr) throw insErr;

  const r = await emailInvitationSignature({ ...ligne, id: cree.id }, { origin: b.origin, rappel: false });
  if (!r.sent && !r.simulated) {
    await supabaseAdmin.from(TABLE_CONV).delete().eq('id', cree.id);
    return res.status(502).json({ error: 'L\'email n\'a pas pu être envoyé : ' + (r.error || 'erreur inconnue') });
  }
  return res.status(200).json({ sent: r.sent, simulated: !!r.simulated, id: cree.id, codeRequis, offre });
}

// ── action=relancer_signature / annuler_signature — admin ──────────────────────────────────────
async function handleRelancerSignature(req, res) {
  const appelant = await adminAppelant(req, res);
  if (!appelant) return;
  const conv = await conventionDeLOrganisme((req.body || {}).conventionId, appelant.organisation_id, res);
  if (!conv) return;
  if (conv.statut !== 'envoye') return res.status(409).json({ error: 'L\'entreprise a déjà signé (ou la demande est annulée).' });
  const dernier = new Date(conv.relance_at || conv.created_at || 0).getTime();
  if (Date.now() - dernier < 24 * 60 * 60 * 1000) return res.status(429).json({ error: 'Déjà envoyé dans les dernières 24 h : réessayez demain.' });
  const r = await emailInvitationSignature(conv, { origin: (req.body || {}).origin, rappel: true });
  if (!r.sent && !r.simulated) return res.status(502).json({ error: 'L\'email n\'a pas pu être envoyé : ' + (r.error || 'erreur inconnue') });
  await supabaseAdmin.from(TABLE_CONV).update({
    relance_at: new Date().toISOString(), nb_relances: (conv.nb_relances || 0) + 1,
    expire_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    historique: [...(conv.historique || []), evenementConv(req, 'relance')],
  }).eq('id', conv.id).eq('statut', 'envoye');
  return res.status(200).json({ sent: r.sent, simulated: !!r.simulated });
}
async function handleAnnulerSignature(req, res) {
  const appelant = await adminAppelant(req, res);
  if (!appelant) return;
  const conv = await conventionDeLOrganisme((req.body || {}).conventionId, appelant.organisation_id, res);
  if (!conv) return;
  if (conv.statut === 'termine') return res.status(409).json({ error: 'Ce document est signé par tout le monde : il ne peut plus être annulé.' });
  if (conv.statut === 'annule') return res.status(200).json({ ok: true });
  const { data: maj } = await supabaseAdmin.from(TABLE_CONV)
    .update({ statut: 'annule', code_hash: null, historique: [...(conv.historique || []), evenementConv(req, 'annule')] })
    .eq('id', conv.id).eq('statut', conv.statut).select('id').maybeSingle();
  if (!maj) return res.status(409).json({ error: 'Le document vient de changer : rechargez la page.' });
  return res.status(200).json({ ok: true });
}

// ── action=signer_organisme — admin : contresignature après l'entreprise ───────────────────────
async function handleSignerOrganisme(req, res) {
  const appelant = await adminAppelant(req, res);
  if (!appelant) return;
  const b = req.body || {};
  const conv = await conventionDeLOrganisme(b.conventionId, appelant.organisation_id, res);
  if (!conv) return;
  if (conv.statut !== 'signe_entreprise') return res.status(409).json({ error: conv.statut === 'termine' ? 'Déjà signé.' : 'L\'entreprise n\'a pas encore signé.' });
  if (!imagePng(b.signature)) return res.status(400).json({ error: 'Signature manquante.' });
  const nom = plainText(b.nom, 150);
  if (!nom) return res.status(400).json({ error: 'Indiquez le nom de la personne qui signe pour l\'organisme.' });
  const maintenant = new Date().toISOString();
  const suite = {
    ...conv, signature_organisme: String(b.signature), organisme_signataire: nom, signe_organisme_at: maintenant,
    historique: [...(conv.historique || []), evenementConv(req, 'signe_organisme', { nom }), evenementConv(null, 'termine')],
  };
  const nomOrg = await nomOrganisme(conv.organisation_id);
  const pdf = await construirePdfConvention(await lirePdfConv(conv.pdf_path), suite, nomOrg);
  const chemin = `convention_signee_${conv.id}_${Date.now()}.pdf`;
  await deposerPdfConv(chemin, pdf);
  const { data: maj, error } = await supabaseAdmin.from(TABLE_CONV).update({
    statut: 'termine', signature_organisme: suite.signature_organisme, organisme_signataire: nom, signe_organisme_at: maintenant,
    historique: suite.historique, pdf_signe_path: chemin,
  }).eq('id', conv.id).eq('statut', 'signe_entreprise').select('id').maybeSingle();
  if (error) throw error;
  if (!maj) return res.status(409).json({ error: 'Le document vient de changer : rechargez la page.' });
  await emailsApresSignature(suite, pdf, { termine: true });
  return res.status(200).json({ ok: true, pdfUrl: urlPubliqueConv(chemin) });
}

// ── action=lire_signature — PUBLIC ─────────────────────────────────────────────────────────────
async function conventionParJeton(t) {
  if (!t || t.length < 20 || t.length > 100) return { conv: null };
  const { data, error } = await supabaseAdmin.from(TABLE_CONV).select('*').eq('token', t).maybeSingle();
  if (error && tableAbsente(error)) return { conv: null };
  if (error) throw error;
  return { conv: data };
}
async function handleLireSignature(req, res) {
  const t = String((req.query && req.query.t) || '').trim();
  const { conv } = await conventionParJeton(t);
  if (!conv) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
  const organisme = (await nomOrganisme(conv.organisation_id)) || 'Organisme de formation';
  const base = { titre: conv.titre, organisme, entrepriseNom: conv.entreprise_nom || '' };
  if (conv.statut === 'annule') return res.status(200).json({ etat: 'annule', ...base });
  if (conv.statut === 'termine') return res.status(200).json({ etat: 'termine', ...base, pdfUrl: urlPubliqueConv(conv.pdf_signe_path) });
  if (conv.statut === 'signe_entreprise') return res.status(200).json({ etat: 'signe', ...base });
  if (conv.expire_at && new Date(conv.expire_at).getTime() < Date.now()) return res.status(200).json({ etat: 'expire', ...base });
  if (!conv.ouvert_at) {
    await supabaseAdmin.from(TABLE_CONV).update({ ouvert_at: new Date().toISOString(), historique: [...(conv.historique || []), evenementConv(req, 'ouvert')] })
      .eq('id', conv.id).is('ouvert_at', null);
  }
  return res.status(200).json({
    etat: 'a_signer', ...base,
    entrepriseAdresse: conv.entreprise_adresse || '',
    signataireNom: conv.signataire_nom, signataireFonction: conv.signataire_fonction || '',
    email: emailMasque(conv.signataire_email), codeRequis: !!conv.code_requis,
    organismeASigne: !!conv.signe_organisme_at, message: conv.message || '',
    pdfUrl: urlPubliqueConv(conv.pdf_path),
  });
}

// ── action=code_signature — PUBLIC ─────────────────────────────────────────────────────────────
async function handleCodeSignature(req, res) {
  const t = String((req.body && req.body.t) || '').trim();
  const { conv } = await conventionParJeton(t);
  if (!conv || conv.statut !== 'envoye' || (conv.expire_at && new Date(conv.expire_at).getTime() < Date.now())) return res.status(404).json({ error: 'Ce lien n\'est plus valable.' });
  if (!conv.code_requis) return res.status(400).json({ error: 'Aucun code n\'est demandé pour ce document.' });
  if (conv.code_envoye_at && Date.now() - new Date(conv.code_envoye_at).getTime() < 60 * 1000) return res.status(429).json({ error: 'Un code vient d\'être envoyé : patientez une minute avant d\'en demander un autre.' });
  if ((conv.nb_codes || 0) >= 8) return res.status(429).json({ error: 'Trop de codes demandés : contactez l\'organisme de formation.' });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const organisme = await infosOrganisme(supabaseAdmin, conv.organisation_id);
  const r = await envoyerEmailConv({
    a: conv.signataire_email,
    sujet: `Votre code de signature : ${code}`,
    html: gabaritEmailConv(htmlEchappe(organisme.nom || 'SkorUp'), pEmail(`Bonjour ${escapeHtml(conv.signataire_nom)},`) + pEmail(`Voici votre code pour signer « ${echappe(plainText(conv.titre, 200))} » :`) + `<p style="font-size:28px;letter-spacing:6px;font-weight:bold;text-align:center;color:#111827;">${code}</p>` + pPetit('Ce code est valable 15 minutes. Si vous n\'avez rien demandé, ignorez cet email.')),
    nomOrgMarque: organisme.nom, replyTo: organisme.replyTo,
  });
  if (!r.sent && !r.simulated) return res.status(502).json({ error: 'L\'email n\'a pas pu être envoyé : réessayez dans un instant.' });
  await supabaseAdmin.from(TABLE_CONV).update({
    code_hash: hashCodeConv(code, conv.token), code_expire_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    code_essais: 0, code_envoye_at: new Date().toISOString(), nb_codes: (conv.nb_codes || 0) + 1,
    historique: [...(conv.historique || []), evenementConv(req, 'code_envoye', { email: conv.signataire_email })],
  }).eq('id', conv.id).eq('statut', 'envoye');
  return res.status(200).json({ sent: true, email: emailMasque(conv.signataire_email), ...(r.simulated ? { simulated: true } : {}) });
}

// ── action=signer_entreprise — PUBLIC ──────────────────────────────────────────────────────────
async function handleSignerEntreprise(req, res) {
  const b = req.body || {};
  const t = String(b.t || '').trim();
  if (b.accepte !== true) return res.status(400).json({ error: 'Cochez « J\'ai lu le document et je l\'accepte ».' });
  if (!imagePng(b.signature)) return res.status(400).json({ error: 'Signature manquante ou illisible : signez dans le cadre.' });
  const { conv } = await conventionParJeton(t);
  if (!conv) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
  if (conv.statut !== 'envoye') return res.status(409).json({ error: 'Ce document a déjà été signé (ou la demande a été annulée).' });
  if (conv.expire_at && new Date(conv.expire_at).getTime() < Date.now()) return res.status(409).json({ error: 'Ce lien a expiré : demandez un nouvel envoi à l\'organisme de formation.' });

  const historique = [...(conv.historique || [])];
  if (conv.code_requis) {
    const code = String(b.code || '').replace(/\D/g, '');
    if (!conv.code_hash || !conv.code_expire_at) return res.status(400).json({ error: 'Demandez d\'abord le code de vérification.' });
    if (new Date(conv.code_expire_at).getTime() < Date.now()) return res.status(400).json({ error: 'Ce code a expiré : demandez-en un nouveau.' });
    if ((conv.code_essais || 0) >= 5) return res.status(429).json({ error: 'Trop d\'essais : demandez un nouveau code.' });
    const attendu = Buffer.from(conv.code_hash, 'hex');
    const recu = Buffer.from(hashCodeConv(code, conv.token), 'hex');
    if (code.length !== 6 || attendu.length !== recu.length || !crypto.timingSafeEqual(attendu, recu)) {
      const essais = (conv.code_essais || 0) + 1;
      const restants = Math.max(0, 5 - essais);
      await supabaseAdmin.from(TABLE_CONV).update({ code_essais: essais }).eq('id', conv.id).eq('statut', 'envoye');
      return res.status(400).json({ error: restants ? `Code incorrect. Il vous reste ${restants} essai${restants > 1 ? 's' : ''}.` : 'Code incorrect. Demandez un nouveau code.' });
    }
    historique.push(evenementConv(req, 'code_valide'));
  }

  const maintenant = new Date().toISOString();
  const champs = { siret: plainText(b.champs && b.champs.siret, 30).replace(/[^\d ]/g, '').trim() || null, adresse: plainText(b.champs && b.champs.adresse, 300) || null };
  historique.push(evenementConv(req, 'signe_entreprise', { nom: conv.signataire_nom }));
  const termine = !!conv.signe_organisme_at;
  if (termine) historique.push(evenementConv(null, 'termine'));
  const suite = { ...conv, signature_entreprise: String(b.signature), signe_entreprise_at: maintenant, champs_entreprise: champs, historique };
  const nomOrg = await nomOrganisme(conv.organisation_id);
  const pdf = await construirePdfConvention(await lirePdfConv(conv.pdf_path), suite, nomOrg);
  const chemin = `convention_signee_${conv.id}_${Date.now()}.pdf`;
  await deposerPdfConv(chemin, pdf);
  const { data: maj, error } = await supabaseAdmin.from(TABLE_CONV).update({
    statut: termine ? 'termine' : 'signe_entreprise', signature_entreprise: suite.signature_entreprise, signe_entreprise_at: maintenant,
    champs_entreprise: champs, historique, pdf_signe_path: chemin, code_hash: null,
  }).eq('id', conv.id).eq('statut', 'envoye').select('id').maybeSingle();
  if (error) throw error;
  if (!maj) return res.status(409).json({ error: 'Ce document a déjà été signé.' });
  await emailsApresSignature(suite, pdf, { termine });
  return res.status(200).json({ etat: termine ? 'termine' : 'signe', pdfUrl: urlPubliqueConv(chemin) });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query?.action || '').toString();

  try {
    if (req.method === 'POST' && action === 'envoyer') return await handleEnvoyer(req, res);
    if (req.method === 'GET' && action === 'lire') return await handleLire(req, res);
    if (req.method === 'POST' && action === 'soumettre') return await handleSoumettre(req, res);
    if (req.method === 'POST' && action === 'envoyer_financeur') return await handleEnvoyerFinanceur(req, res);
    if (req.method === 'POST' && action === 'relancer_financeur') return await handleRelancerFinanceur(req, res);
    // 30/10/2026 : conventions signées par une entreprise, sans compte.
    if (req.method === 'POST' && action === 'envoyer_signature') return await handleEnvoyerSignature(req, res);
    if (req.method === 'POST' && action === 'relancer_signature') return await handleRelancerSignature(req, res);
    if (req.method === 'POST' && action === 'annuler_signature') return await handleAnnulerSignature(req, res);
    if (req.method === 'POST' && action === 'signer_organisme') return await handleSignerOrganisme(req, res);
    if (req.method === 'GET' && action === 'lire_signature') return await handleLireSignature(req, res);
    if (req.method === 'POST' && action === 'code_signature') return await handleCodeSignature(req, res);
    if (req.method === 'POST' && action === 'signer_entreprise') return await handleSignerEntreprise(req, res);
    return res.status(400).json({ error: 'Action invalide.' });
  } catch (err) {
    console.error('[prospects]', err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
};
