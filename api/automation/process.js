const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || 'VB Coaching <noreply@vb-coaching.fr>';

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

async function alreadySent(settingId, referenceId, clientId) {
  const { data } = await supabase
    .from('automation_logs')
    .select('id')
    .eq('automation_setting_id', settingId)
    .eq('reference_id', String(referenceId))
    .eq('client_id', String(clientId))
    .maybeSingle();
  return !!data;
}

async function sentRecently(settingId, clientId, windowDays) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const { data } = await supabase
    .from('automation_logs')
    .select('id')
    .eq('automation_setting_id', settingId)
    .eq('client_id', String(clientId))
    .gte('sent_at', since.toISOString())
    .maybeSingle();
  return !!data;
}

async function logSent(settingId, clientId, clientEmail, referenceId, referenceType) {
  await supabase.from('automation_logs').insert({
    automation_setting_id: settingId,
    client_id: String(clientId),
    client_email: clientEmail,
    reference_id: String(referenceId),
    reference_type: referenceType,
  });
}

async function sendEmail(to, subject, bodyText) {
  const html = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#333">${html}</div>`,
  });
}

module.exports = async (req, res) => {
  // Vercel cron authentification via CRON_SECRET
  const auth = req.headers['authorization'];
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: settings, error: settingsErr } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('is_active', true);

    if (settingsErr) throw settingsErr;
    if (!settings?.length) return res.status(200).json({ sent: 0 });

    const now = new Date();
    let totalSent = 0;

    for (const setting of settings) {
      // ── Relance émargement non signé ─────────────────────────────────────
      if (setting.trigger_type === 'no_signature') {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - setting.delay_days);

        const { data: sessions } = await supabase
          .from('sessions')
          .select('id, client_id, date, ressource_titre, nom')
          .eq('signe_par_client', false)
          .not('date', 'is', null)
          .lt('date', cutoff.toISOString());

        for (const session of sessions || []) {
          if (!session.client_id) continue;

          // Vérification fraîche : le client a peut-être signé entre-temps
          const { data: fresh } = await supabase
            .from('sessions')
            .select('signe_par_client, signature_client')
            .eq('id', session.id)
            .single();
          if (fresh?.signe_par_client || fresh?.signature_client) continue;

          if (await alreadySent(setting.id, session.id, session.client_id)) continue;

          const { data: client } = await supabase
            .from('clients')
            .select('nom_complet, email_contact')
            .eq('id', session.client_id)
            .single();
          if (!client?.email_contact) continue;

          const vars = {
            client_name: client.nom_complet || '',
            session_title: session.ressource_titre || session.nom || 'votre séance',
            session_date: session.date
              ? new Date(session.date).toLocaleDateString('fr-FR')
              : '',
          };

          const { error: mailErr } = await sendEmail(
            client.email_contact,
            interpolate(setting.email_subject, vars),
            interpolate(setting.email_body, vars)
          );
          if (mailErr) { console.error('[automation] mail error:', mailErr); continue; }

          await logSent(setting.id, session.client_id, client.email_contact, session.id, 'session');
          totalSent++;
        }
      }

      // ── Rappel avant séance ───────────────────────────────────────────────
      if (setting.trigger_type === 'reminder_before_session') {
        const target = new Date(now);
        target.setDate(target.getDate() + setting.delay_days);
        const dateStr = target.toISOString().split('T')[0];

        const { data: sessions } = await supabase
          .from('sessions')
          .select('id, client_id, date, ressource_titre, nom')
          .gte('date', `${dateStr}T00:00:00`)
          .lte('date', `${dateStr}T23:59:59`);

        for (const session of sessions || []) {
          if (!session.client_id) continue;
          if (await alreadySent(setting.id, session.id, session.client_id)) continue;

          const { data: client } = await supabase
            .from('clients')
            .select('nom_complet, email_contact')
            .eq('id', session.client_id)
            .single();
          if (!client?.email_contact) continue;

          const vars = {
            client_name: client.nom_complet || '',
            session_title: session.ressource_titre || session.nom || 'votre séance',
            session_date: session.date
              ? new Date(session.date).toLocaleDateString('fr-FR')
              : '',
          };

          const { error: mailErr } = await sendEmail(
            client.email_contact,
            interpolate(setting.email_subject, vars),
            interpolate(setting.email_body, vars)
          );
          if (mailErr) { console.error('[automation] mail error:', mailErr); continue; }

          await logSent(setting.id, session.client_id, client.email_contact, session.id, 'session');
          totalSent++;
        }
      }

      // ── Type personnalisé : envoi périodique à tous les clients actifs ──
      if (!['no_signature', 'reminder_before_session', 'welcome'].includes(setting.trigger_type)) {
        const { data: allClients } = await supabase
          .from('clients')
          .select('id, nom_complet, email_contact')
          .not('email_contact', 'is', null);

        for (const client of allClients || []) {
          if (!client.email_contact) continue;
          if (await sentRecently(setting.id, client.id, setting.delay_days)) continue;

          const vars = { client_name: client.nom_complet || '' };

          const { error: mailErr } = await sendEmail(
            client.email_contact,
            interpolate(setting.email_subject, vars),
            interpolate(setting.email_body, vars)
          );
          if (mailErr) { console.error('[automation] mail error:', mailErr); continue; }

          await logSent(setting.id, client.id, client.email_contact, client.id, 'custom');
          totalSent++;
        }
      }

      // ── Email de bienvenue nouveau client ────────────────────────────────
      if (setting.trigger_type === 'welcome') {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - setting.delay_days);

        const { data: newClients } = await supabase
          .from('clients')
          .select('id, nom_complet, email_contact, created_at')
          .gte('created_at', cutoff.toISOString())
          .not('email_contact', 'is', null);

        for (const client of newClients || []) {
          if (!client.email_contact) continue;
          if (await alreadySent(setting.id, client.id, client.id)) continue;

          const vars = { client_name: client.nom_complet || '' };

          const { error: mailErr } = await sendEmail(
            client.email_contact,
            interpolate(setting.email_subject, vars),
            interpolate(setting.email_body, vars)
          );
          if (mailErr) { console.error('[automation] mail error:', mailErr); continue; }

          await logSent(setting.id, client.id, client.email_contact, client.id, 'client');
          totalSent++;
        }
      }
    }

    return res.status(200).json({ success: true, sent: totalSent });
  } catch (err) {
    console.error('[automation/process]', err);
    return res.status(500).json({ error: err.message });
  }
};
