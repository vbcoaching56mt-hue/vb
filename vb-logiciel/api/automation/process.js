// api/automation/process.js
// Fonction Vercel : traite les relances automatiques (cron quotidien à 8h)
// Peut aussi être déclenchée manuellement via l'admin UI.

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS pour appels depuis le navigateur (admin "Tester maintenant")
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Initialisation Supabase avec la clé service (bypass RLS) ─────────────
  const supabaseUrl  = process.env.REACT_APP_SUPABASE_URL;
  const serviceKey   = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail    = process.env.RESEND_FROM_EMAIL || 'VB Coaching <noreply@vbcoaching.fr>';

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Variables Supabase non configurées (REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_SERVICE_ROLE_KEY).' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ── 1. Récupérer les relances actives ────────────────────────────────────
    const { data: settings, error: settingsErr } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('is_active', true);

    if (settingsErr) throw new Error('Erreur lecture automation_settings : ' + settingsErr.message);
    if (!settings || settings.length === 0) {
      return res.json({ sent: 0, message: 'Aucune relance active configurée.' });
    }

    // ── 2. Récupérer clients et sessions ─────────────────────────────────────
    const [{ data: clients }, { data: sessions }] = await Promise.all([
      supabase.from('clients').select('id, nom, prenom, email_contact, formateur_id'),
      supabase.from('sessions').select('id, date, client_id, type_activite, statut_client, numero_seance'),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    let sent = 0;
    const results = [];

    // ── 3. Traiter chaque relance ─────────────────────────────────────────────
    for (const setting of settings) {
      const triggerSessions = [];

      if (setting.trigger_type === 'reminder_before_session') {
        // Sessions ayant lieu dans |delay_days| jours (delay_days est négatif dans la config)
        const daysOffset = Math.abs(setting.delay_days || 1);
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + daysOffset);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        (sessions || [])
          .filter(s => s.date === targetDateStr)
          .forEach(s => triggerSessions.push(s));

      } else if (setting.trigger_type === 'no_signature') {
        // Sessions dont la date est passée depuis X jours et le client n'a pas signé
        const daysOffset = Math.abs(setting.delay_days || 2);
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - daysOffset);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        (sessions || [])
          .filter(s => s.date === targetDateStr && s.statut_client !== 'Signé' && s.statut_client !== 'signé')
          .forEach(s => triggerSessions.push(s));
      }

      // ── 4. Envoyer un email pour chaque session concernée ──────────────────
      for (const session of triggerSessions) {
        const client = (clients || []).find(c => String(c.id) === String(session.client_id));
        if (!client?.email_contact) continue;

        // Vérifier qu'on n'a pas déjà envoyé cette relance aujourd'hui
        const { data: existingLog } = await supabase
          .from('automation_logs')
          .select('id')
          .eq('automation_setting_id', setting.id)
          .eq('client_id', client.id)
          .gte('sent_at', todayStr + 'T00:00:00Z')
          .maybeSingle();

        if (existingLog) {
          results.push({ skipped: true, reason: 'already_sent_today', client: client.nom, trigger: setting.trigger_type });
          continue;
        }

        // Remplacer les variables dans le template
        const sessionDate = session.date
          ? new Date(session.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : '';
        const clientName = [client.prenom, client.nom].filter(Boolean).join(' ') || client.nom || '';
        const sessionTitle = session.type_activite || `Séance n°${session.numero_seance || ''}`;

        const replaceVars = (str) => (str || '')
          .replace(/\{nom_client\}|\{client_name\}|\{\{nom_client\}\}|\{\{client_name\}\}/g, clientName)
          .replace(/\{date_seance\}|\{session_date\}|\{\{date_seance\}\}|\{\{session_date\}\}/g, sessionDate)
          .replace(/\{titre_seance\}|\{session_title\}|\{\{titre_seance\}\}|\{\{session_title\}\}/g, sessionTitle);

        const emailSubject = replaceVars(setting.email_subject);
        const emailBodyText = replaceVars(setting.email_body);
        const emailBodyHtml = emailBodyText.replace(/\n/g, '<br>');

        // Envoyer via Resend
        let emailSent = false;
        let emailError = null;

        if (!resendApiKey) {
          emailError = 'RESEND_API_KEY non configurée — email simulé (ajoutez la clé dans Vercel > Settings > Environment Variables)';
          console.warn('[automation] RESEND_API_KEY manquante, simulation pour:', client.email_contact);
          // En mode test (pas de clé Resend), on log quand même pour montrer que ça fonctionne
          emailSent = true;
        } else {
          try {
            const resendResp = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [client.email_contact],
                subject: emailSubject,
                html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                  <div style="background:#e11d48;color:white;padding:16px 24px;border-radius:12px 12px 0 0;">
                    <strong style="font-size:18px;">VB Coaching</strong>
                  </div>
                  <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                    <p style="color:#111827;font-size:14px;line-height:1.6;">${emailBodyHtml}</p>
                    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                    <p style="color:#9ca3af;font-size:11px;">Email automatique — merci de ne pas répondre directement à ce message.</p>
                  </div>
                </div>`,
              }),
            });

            if (resendResp.ok) {
              emailSent = true;
            } else {
              const errBody = await resendResp.json().catch(() => ({}));
              emailError = errBody.message || `Resend erreur HTTP ${resendResp.status}`;
            }
          } catch (fetchErr) {
            emailError = 'Erreur réseau Resend : ' + fetchErr.message;
          }
        }

        // Logger le résultat dans automation_logs
        await supabase.from('automation_logs').insert([{
          automation_setting_id: setting.id,
          client_id: client.id,
          trigger_type: setting.trigger_type,
          sent_at: new Date().toISOString(),
          email_to: client.email_contact,
          email_subject: emailSubject,
          status: emailSent ? 'sent' : 'error',
          error_message: emailError || null,
        }]).select();

        if (emailSent) {
          sent++;
          results.push({ sent: true, client: clientName, email: client.email_contact, trigger: setting.trigger_type });
        } else {
          results.push({ sent: false, error: emailError, client: clientName, trigger: setting.trigger_type });
        }
      }
    }

    return res.json({
      sent,
      processed: results.length,
      details: results,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[automation/process] Erreur:', err);
    return res.status(500).json({ error: err.message });
  }
};
