// api/formateur/notify-assignment.js
//
// Envoie un email au formateur dès qu'un admin lui assigne (ou réassigne) un client, pour qu'il
// ne le découvre pas par hasard en allant vérifier sa liste de clients. Demandé par l'utilisateur
// le 11/09/2026.
//
// Reprend exactement le même schéma de sécurité que api/automation/trigger-manual.js :
//   - Fonction serverless (jamais exposée au navigateur) : la clé RESEND_API_KEY et la clé
//     SUPABASE_SERVICE_ROLE_KEY restent côté serveur uniquement.
//   - L'appelant est authentifié via son token Supabase (jamais un id envoyé tel quel par le
//     navigateur), puis vérifié comme étant bien admin ET de l'organisme concerné, avant de
//     traiter quoi que ce soit — même correctif auth_uid (avec repli par email) que trigger-manual.js.
//   - Le client ET le formateur ciblés sont tous les deux revérifiés comme appartenant à CET
//     organisme (jamais de confiance aveugle dans les id envoyés par le navigateur).
//
// Appelée depuis assignFormateur() (App.js) juste après la mise à jour réussie de clients.formateur_id.
// Échec d'envoi = juste loggé côté client (toast discret), l'assignation elle-même n'est jamais
// remise en cause par un souci d'email.

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

    // ── 2. Vérifier que l'appelant est bien admin d'un organisme (même logique que
    //         trigger-manual.js : comparaison sur auth_uid, repli par email pour les anciens comptes) ──
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

    // ── 3. Lire clientId / formateurId envoyés, et l'origine (pour construire le lien) ──
    const { clientId, formateurId, origin } = req.body || {};
    if (!clientId || !formateurId) {
      return res.status(400).json({ error: 'clientId et formateurId sont requis.' });
    }
    const safeOrigin = (typeof origin === 'string' && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(origin))
      ? origin
      : 'https://app.skorup.fr';

    // ── 4. Revérifier client ET formateur comme appartenant à CET organisme ──
    const [{ data: client, error: clientErr }, { data: formateur, error: formateurErr }] = await Promise.all([
      supabaseAdmin.from('clients').select('id, nom_complet, organisation_id').eq('id', clientId).eq('organisation_id', organisationId).maybeSingle(),
      supabaseAdmin.from('utilisateurs').select('id, nom, email, organisation_id').eq('id', formateurId).eq('organisation_id', organisationId).maybeSingle(),
    ]);
    if (clientErr) throw clientErr;
    if (formateurErr) throw formateurErr;
    if (!client) return res.status(404).json({ error: 'Client introuvable dans cet organisme.' });
    if (!formateur) return res.status(404).json({ error: 'Formateur introuvable dans cet organisme.' });
    if (!formateur.email) return res.status(200).json({ sent: false, message: 'Ce formateur n\'a pas d\'adresse email enregistrée.' });

    const clientName = client.nom_complet || 'un nouveau client';
    const formateurFirstName = (formateur.nom || '').split(' ')[0] || '';
    // ?view=formateur : sans effet pour un vrai compte formateur (le rôle vient de la base, pas de
    // l'URL — voir handleLogin), mais indispensable si le "formateur" assigné est en réalité l'admin
    // lui-même agissant comme coach (cas assignableFormateurs) pour ouvrir son espace formateur.
    // ?client=<id> : lu par handleLogin, ouvre directement la fiche de ce client (voir App.js).
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

    // ── 5. Envoyer via Resend (appel fetch direct, même approche que trigger-manual.js) ──
    if (!resendApiKey) {
      return res.status(200).json({ sent: false, simulated: true, message: 'RESEND_API_KEY non configurée côté serveur (Vercel).' });
    }

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [formateur.email], subject, html: bodyHtml }),
    });

    if (!resendResp.ok) {
      const errBody = await resendResp.json().catch(() => ({}));
      return res.status(200).json({ sent: false, error: errBody.message || `Resend erreur HTTP ${resendResp.status}` });
    }

    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('[formateur/notify-assignment]', err);
    return res.status(500).json({ error: err.message });
  }
};
