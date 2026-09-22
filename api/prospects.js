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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const nomTrim = (nom || '').toString().trim();
  const prenomTrim = (prenom || '').toString().trim();
  const emailTrim = (email || '').toString().trim().toLowerCase();

  if (!templateId) return res.status(400).json({ error: 'Choisissez un modèle de questionnaire.' });
  if (!nomTrim || !prenomTrim) return res.status(400).json({ error: 'Le nom et le prénom sont requis.' });
  if (!EMAIL_RE.test(emailTrim)) return res.status(400).json({ error: 'Adresse email invalide.' });

  const safeOrigin = (typeof origin === 'string' && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(origin))
    ? origin
    : 'https://app.skorup.fr';

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
  const subject = `${prenomTrim}, un questionnaire vous attend avant votre entretien`;
  const bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${prenomTrim},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">Avant votre entretien, merci de prendre quelques minutes pour compléter ce court questionnaire : <strong>${echappe(template.titre)}</strong>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="background:#7C3AED;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">Répondre au questionnaire</a>
      </p>
      <p style="color:#6b7280;font-size:12px;">Ce lien est personnel, valable 30 jours, et ne nécessite pas de créer de compte.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Email automatique SkorUp — ne pas répondre à ce message.</p>
    </div>
  </div>`;

  if (!resendApiKey) {
    return res.status(200).json({ sent: false, simulated: true, envoiId: envoi.id, message: 'RESEND_API_KEY non configurée côté serveur (Vercel).' });
  }

  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [emailTrim], subject, html: bodyHtml }),
  });

  if (!resendResp.ok) {
    const errBody = await resendResp.json().catch(() => ({}));
    return res.status(200).json({ sent: false, envoiId: envoi.id, error: errBody.message || `Resend erreur HTTP ${resendResp.status}` });
  }

  return res.status(200).json({ sent: true, envoiId: envoi.id });
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
  if (!envoi) return res.status(404).json({ error: 'Lien invalide ou expiré.' });

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
  if (!updated) return res.status(409).json({ error: 'Ce lien n\'est plus valable (déjà rempli ou expiré).' });

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
    return res.status(400).json({ error: 'Action invalide.' });
  } catch (err) {
    console.error('[prospects]', err);
    return res.status(500).json({ error: err.message });
  }
};
