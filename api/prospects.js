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
    return res.status(400).json({ error: 'Action invalide.' });
  } catch (err) {
    console.error('[prospects]', err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
};
