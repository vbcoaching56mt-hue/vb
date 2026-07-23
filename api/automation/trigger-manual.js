// api/automation/trigger-manual.js
//
// Remplace l'ancienne logique 100% côté navigateur de "Tester maintenant" (bouton dans
// AutomationSettingsView / triggerManual côté client) qui présentait deux failles critiques :
//   1. Les requêtes automation_settings/clients/sessions n'étaient filtrées par AUCUN organisation_id
//      → un admin d'un organisme pouvait déclencher l'envoi d'emails à des clients d'un AUTRE organisme.
//   2. La clé API Resend était lue depuis une variable REACT_APP_RESEND_API_KEY, donc compilée en clair
//      dans le bundle JS envoyé à chaque navigateur → n'importe quel utilisateur pouvait la récupérer.
//
// Cette fonction serverless s'exécute côté serveur (jamais exposée au navigateur), vérifie que
// l'appelant est bien authentifié ET admin d'un organisme (via son token Supabase), puis ne traite
// QUE les relances/clients/séances de CET organisme — jamais ceux d'un autre.
//
// Reprend la structure et les variables d'environnement déjà utilisées par api/automation/process.js
// (le cron quotidien existant) : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, FROM_EMAIL.
// Si ce cron fonctionne déjà en production, ces variables sont déjà configurées sur Vercel.

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'SkorUp <onboarding@resend.dev>';

function interpolate(str, vars) {
  return (str || '')
    .replace(/\{nom_client\}|\{client_name\}|\{\{nom_client\}\}|\{\{client_name\}\}/g, vars.clientName || '')
    .replace(/\{date_seance\}|\{session_date\}|\{\{date_seance\}\}|\{\{session_date\}\}/g, vars.sessionDate || '')
    .replace(/\{titre_seance\}|\{session_title\}|\{\{titre_seance\}\}|\{\{session_title\}\}/g, vars.sessionTitle || '');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. Authentifier l'appelant via son token Supabase (jamais faire confiance à un id envoyé par le client) ──
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return res.status(401).json({ error: 'Session invalide ou expirée.' });

    // ── 2. Vérifier que l'appelant est bien admin d'un organisme — organisation_id vient de SA ligne
    //         utilisateurs, jamais d'un paramètre envoyé par le navigateur ──
    const { data: callerRow, error: callerErr } = await supabaseAdmin
      .from('utilisateurs')
      .select('role, organisation_id')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (callerErr || !callerRow || callerRow.role !== 'admin' || !callerRow.organisation_id) {
      return res.status(403).json({ error: 'Réservé aux administrateurs d\'un organisme.' });
    }
    const organisationId = callerRow.organisation_id;

    // ── 3. Lire les relances actives DE CET ORGANISME UNIQUEMENT ──
    const { data: activeSettings, error: settErr } = await supabaseAdmin
      .from('automation_settings')
      .select('*')
      .eq('is_active', true)
      .eq('organisation_id', organisationId);
    if (settErr) throw settErr;
    if (!activeSettings?.length) {
      return res.status(200).json({ sent: 0, simulated: 0, message: 'Aucune relance active configurée.' });
    }

    // ── 4. Lire clients + séances, SCOPÉS au même organisme ──
    const [{ data: clients }, { data: sessions }] = await Promise.all([
      supabaseAdmin.from('clients').select('id, nom, prenom, email_contact, formateur_id').eq('organisation_id', organisationId),
      supabaseAdmin.from('sessions').select('id, date, client_id, type_activite, statut_client, numero_seance').eq('organisation_id', organisationId),
    ]);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // ── 5. Construire la liste des emails à envoyer (même logique que l'ancien code client) ──
    const emailQueue = [];
    for (const setting of activeSettings) {
      let targetSessions = [];

      if (setting.trigger_type === 'reminder_before_session') {
        const offset = Math.abs(setting.delay_days ?? 1);
        const d = new Date(today); d.setDate(d.getDate() + offset);
        const ds = d.toISOString().split('T')[0];
        targetSessions = (sessions || []).filter(s => s.date === ds);
      } else if (setting.trigger_type === 'no_signature') {
        const offset = Math.abs(setting.delay_days ?? 2);
        const d = new Date(today); d.setDate(d.getDate() - offset);
        const ds = d.toISOString().split('T')[0];
        targetSessions = (sessions || []).filter(s =>
          s.date === ds && s.statut_client !== 'Signé' && s.statut_client !== 'signé'
        );
      }

      for (const session of targetSessions) {
        const client = (clients || []).find(c => String(c.id) === String(session.client_id));
        if (!client?.email_contact) continue;

        const { data: existing } = await supabaseAdmin.from('automation_logs')
          .select('id').eq('automation_setting_id', setting.id).eq('client_id', client.id)
          .gte('sent_at', todayStr + 'T00:00:00Z').maybeSingle();
        if (existing) continue;

        const clientName = [client.prenom, client.nom].filter(Boolean).join(' ') || client.nom || '';
        const sessionDate = session.date
          ? new Date(session.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : '';
        const sessionTitle = session.type_activite || `Séance n°${session.numero_seance ?? ''}`;
        const vars = { clientName, sessionDate, sessionTitle };

        emailQueue.push({
          setting, client, clientName,
          subject: interpolate(setting.email_subject, vars),
          body: interpolate(setting.email_body, vars),
        });
      }
    }

    if (emailQueue.length === 0) {
      return res.status(200).json({ sent: 0, simulated: 0, message: "Aucun email à envoyer aujourd'hui (aucune séance correspondante)." });
    }

    // ── 6. Envoyer via Resend (clé jamais exposée au navigateur) ──
    const resendConfigured = !!process.env.RESEND_API_KEY;
    let sent = 0, simulated = 0;

    for (const item of emailQueue) {
      let ok = false;
      let errMsg = null;

      if (resendConfigured) {
        try {
          const { error: mailErr } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [item.client.email_contact],
            subject: item.subject,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
              <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                <p style="color:#111827;font-size:14px;line-height:1.7;">${(item.body || '').replace(/\n/g, '<br>')}</p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                <p style="color:#9ca3af;font-size:11px;">Email automatique SkorUp — ne pas répondre à ce message.</p>
              </div>
            </div>`,
          });
          ok = !mailErr;
          if (mailErr) errMsg = mailErr.message;
        } catch (e) {
          errMsg = e.message;
        }
        if (ok) sent++;
      } else {
        ok = true;
        simulated++;
        errMsg = 'Simulation — RESEND_API_KEY non configurée côté serveur (Vercel).';
      }

      await supabaseAdmin.from('automation_logs').insert([{
        automation_setting_id: item.setting.id,
        client_id: item.client.id,
        trigger_type: item.setting.trigger_type,
        sent_at: new Date().toISOString(),
        email_to: item.client.email_contact,
        email_subject: item.subject,
        status: ok ? (resendConfigured ? 'sent' : 'simulated') : 'error',
        error_message: errMsg || null,
      }]);
    }

    return res.status(200).json({ sent, simulated });
  } catch (err) {
    console.error('[automation/trigger-manual]', err);
    return res.status(500).json({ error: err.message });
  }
};
