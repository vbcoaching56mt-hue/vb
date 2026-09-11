// api/client/notify-new-document.js
//
// Envoie un email au client dès qu'un document lui est envoyé via le bouton "Envoyer" (ou un envoi
// automatique) sur SkorUp, pour qu'il soit prévenu sans avoir à se reconnecter par hasard. Demandé
// par l'utilisateur le 11/09/2026 — même schéma de sécurité que
// api/formateur/notify-assignment.js (lui-même calqué sur api/automation/trigger-manual.js) :
//   - Fonction serverless : RESEND_API_KEY et SUPABASE_SERVICE_ROLE_KEY restent côté serveur.
//   - L'appelant est authentifié via son token Supabase, vérifié comme étant bien admin OU
//     formateur d'un organisme (jamais un id envoyé tel quel par le navigateur qui ferait foi).
//   - Le client ciblé est revérifié comme appartenant à CET organisme ; si l'appelant est un
//     formateur (pas admin), on vérifie en plus que ce client lui est bien assigné.
//
// Appelée depuis handleGenerateDocx() (App.js) juste après un insert réussi dans `documents` avec
// visible_client = true — couvre le bouton "Envoyer" ET les envois automatiques (isAutoGenerate).
// Échec d'envoi = juste loggé côté client (toast discret), l'envoi du document lui-même n'est
// jamais remis en cause par un souci d'email.

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resendApiKey = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SkorUp <noreply@skorup.fr>';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. Authentifier l'appelant via son token Supabase ──
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return res.status(401).json({ error: 'Session invalide ou expirée.' });

    // ── 2. Vérifier que l'appelant est bien admin OU formateur d'un organisme (même logique que
    //         trigger-manual.js / notify-assignment.js : comparaison sur auth_uid, repli par email) ──
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

    // ── 3. Lire clientId / documentName / origin envoyés ──
    const { clientId, documentName, origin } = req.body || {};
    if (!clientId || !documentName) {
      return res.status(400).json({ error: 'clientId et documentName sont requis.' });
    }
    const safeOrigin = (typeof origin === 'string' && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(origin))
      ? origin
      : 'https://app.skorup.fr';

    // ── 4. Revérifier le client comme appartenant à CET organisme — et, si l'appelant est un
    //         formateur (pas admin), qu'il lui est bien assigné (jamais de confiance aveugle dans
    //         le clientId envoyé par le navigateur) ──
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, nom_complet, email_contact, organisation_id, formateur_id')
      .eq('id', clientId)
      .eq('organisation_id', organisationId)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) return res.status(404).json({ error: 'Client introuvable dans cet organisme.' });
    if (callerRow.role === 'formateur' && String(client.formateur_id) !== String(callerRow.id)) {
      return res.status(403).json({ error: 'Ce client n\'est pas assigné à ce formateur.' });
    }
    if (!client.email_contact) return res.status(200).json({ sent: false, message: 'Ce client n\'a pas d\'adresse email enregistrée.' });

    const clientFirstName = (client.nom_complet || '').split(' ')[0] || '';
    // ?tab=mes_documents : lu par handleLogin (App.js), ouvre directement l'onglet "Mes Documents"
    // du client après connexion, plutôt que sa page d'accueil habituelle.
    const link = `${safeOrigin}/?tab=mes_documents`;

    const subject = `Nouveau document disponible : ${documentName}`;
    const bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${clientFirstName},</p>
        <p style="color:#111827;font-size:14px;line-height:1.7;">Un nouveau document est disponible sur votre espace SkorUp : <strong>${documentName}</strong>.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${link}" style="background:#7C3AED;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">Voir mes documents</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="color:#9ca3af;font-size:11px;">Email automatique SkorUp — ne pas répondre à ce message.</p>
      </div>
    </div>`;

    // ── 5. Envoyer via Resend (appel fetch direct, même approche que les autres fonctions) ──
    if (!resendApiKey) {
      return res.status(200).json({ sent: false, simulated: true, message: 'RESEND_API_KEY non configurée côté serveur (Vercel).' });
    }

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [client.email_contact], subject, html: bodyHtml }),
    });

    if (!resendResp.ok) {
      const errBody = await resendResp.json().catch(() => ({}));
      return res.status(200).json({ sent: false, error: errBody.message || `Resend erreur HTTP ${resendResp.status}` });
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('[client/notify-new-document]', err);
    return res.status(500).json({ error: err.message });
  }
};
