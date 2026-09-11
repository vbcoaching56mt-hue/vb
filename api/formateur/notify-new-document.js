// api/formateur/notify-new-document.js
//
// Envoie un email au FORMATEUR dès qu'un document nécessitant sa signature devient disponible pour
// lui — que ce soit à l'envoi initial (document simultané, ou séquentiel où il est premier dans
// l'ordre de signature) ou plus tard, quand une signature précédente (client ou organisme) vient de
// débloquer son tour dans un document séquentiel. Demandé par l'utilisateur le 11/09/2026 : "si le
// document est d'abord envoyé au formateur pour signature, le formateur reçoit un mail".
//
// Même schéma de sécurité que les autres fonctions de notification, AVEC UNE DIFFÉRENCE
// IMPORTANTE : contrairement à api/client/notify-new-document.js (toujours déclenchée par un admin
// ou un formateur via le bouton "Envoyer"), celle-ci peut être déclenchée par la signature d'un
// CLIENT (cas d'un document séquentiel où le client signe en premier, puis le formateur contresigne
// — voir handleSignDocument dans App.js) — l'appelant authentifié peut donc être admin, formateur
// OU client. On accepte les trois, en vérifiant seulement que l'appelant ET le formateur ciblé
// appartiennent bien au même organisme (jamais de confiance aveugle dans les id envoyés par le
// navigateur) : un souci d'envoi ne remet jamais en cause la signature elle-même, déjà enregistrée
// en base à ce stade.

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

    // ── 2. Vérifier que l'appelant est bien admin, formateur OU CLIENT d'un organisme — voir note
    //         en tête de fichier sur pourquoi 'client' est accepté ici (contrairement aux autres
    //         fonctions de notification). Un compte client est dans la table `clients`, pas
    //         `utilisateurs` (contrairement à admin/formateur) : on cherche dans les deux.
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
      // Repli 1 : compte staff plus ancien sans auth_uid renseigné (même repli par email que les
      // autres fonctions de notification).
      let clientOrStaff = null;
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
      // Repli 2 : appelant CLIENT. La table `clients` n'a pas de colonne auth_uid (contrairement à
      // `utilisateurs`) — les comptes clients sont résolus par email (voir initSession / handleLogin
      // dans App.js, qui font exactement la même requête `ilike('email_contact', ...)`).
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

    // ── 3. Lire formateurId / documentName / origin envoyés ──
    const { formateurId, documentName, origin } = req.body || {};
    if (!formateurId || !documentName) {
      return res.status(400).json({ error: 'formateurId et documentName sont requis.' });
    }
    const safeOrigin = (typeof origin === 'string' && /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(origin))
      ? origin
      : 'https://app.skorup.fr';

    // ── 4. Revérifier le formateur comme appartenant à CET organisme ──
    const { data: formateur, error: formateurErr } = await supabaseAdmin
      .from('utilisateurs')
      .select('id, nom, email, organisation_id')
      .eq('id', formateurId)
      .eq('organisation_id', organisationId)
      .maybeSingle();
    if (formateurErr) throw formateurErr;
    if (!formateur) return res.status(404).json({ error: 'Formateur introuvable dans cet organisme.' });
    if (!formateur.email) return res.status(200).json({ sent: false, message: 'Ce formateur n\'a pas d\'adresse email enregistrée.' });

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

    // ── 5. Envoyer via Resend (appel fetch direct, même approche que les autres fonctions) ──
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
    console.error('[formateur/notify-new-document]', err);
    return res.status(500).json({ error: err.message });
  }
};
