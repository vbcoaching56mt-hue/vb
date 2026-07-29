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
//
// CORRECTIF (2026-07-28) :
//   - Le contrôle admin comparait utilisateurs.id (clé interne) à l'UID Supabase Auth au lieu de
//     utilisateurs.auth_uid → rejetait à tort de vrais administrateurs ("Réservé aux administrateurs
//     d'un organisme"). Corrigé pour comparer sur auth_uid, avec repli par email comme app_current_role().
//   - L'envoi passait par le SDK npm "resend", absent de package.json → risque de crash au déploiement
//     ("Cannot find module 'resend'"). Remplacé par un appel fetch direct à l'API Resend, comme process.js.
//   - Le calcul de date ("aujourd'hui" / "demain") utilisait new Date() en UTC (heure du serveur Vercel),
//     pas l'heure française des dates de séances saisies → aucune séance ne correspondait, selon l'heure
//     du test. Corrigé pour calculer la date du jour dans le fuseau Europe/Paris (même correctif que
//     process.js).

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resendApiKey = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'SkorUp <noreply@skorup.fr>';

// ── Utilitaires de dates fuseau France (identiques à api/automation/process.js) ────────────
function todayInParisStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}
function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

function interpolate(str, vars) {
  return (str || '')
    .replace(/\{nom_client\}|\{client_name\}|\{\{nom_client\}\}|\{\{client_name\}\}/g, vars.clientName || '')
    .replace(/\{date_seance\}|\{session_date\}|\{\{date_seance\}\}|\{\{session_date\}\}/g, vars.sessionDate || '')
    .replace(/\{titre_seance\}|\{session_title\}|\{\{titre_seance\}\}|\{\{session_title\}\}/g, vars.sessionTitle || '')
    .replace(/\{heure_seance\}|\{session_time\}|\{\{heure_seance\}\}|\{\{session_time\}\}/g, vars.sessionTime || '')
    .replace(/\{numero_seance\}|\{session_number\}|\{\{numero_seance\}\}|\{\{session_number\}\}/g, vars.sessionNumber || '')
    .replace(/\{numero_dossier\}|\{\{numero_dossier\}\}/g, vars.numeroDossier || '')
    .replace(/\{module_name\}|\{\{module_name\}\}/g, vars.moduleName || '');
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
    // IMPORTANT : utilisateurs.id est la clé interne de l'application, PAS l'UID Supabase Auth.
    // authData.user.id est l'UID Auth, qui doit être comparé à utilisateurs.auth_uid (jamais à
    // utilisateurs.id — c'est cette comparaison erronée qui faisait échouer ce contrôle pour de
    // vrais administrateurs). On reprend le même repli par email que app_current_role() /
    // app_current_org_id() (voir hotfix_backfill_auth_uid.sql / hotfix2_email_fallback_functions.sql)
    // pour les comptes plus anciens dont auth_uid ne serait pas encore renseigné.
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
      // MARQUEUR DE DEBUG TEMPORAIRE (2026-07-28) : à retirer une fois le problème identifié.
      // Inclut le détail exact de ce que le serveur a vu, pour ne plus avoir à deviner.
      return res.status(403).json({
        error: 'Réservé aux administrateurs d\'un organisme. [DEBUG-v3-auth_uid]',
        debug: {
          authUserId: authData.user.id || null,
          authUserEmail: authData.user.email || null,
          callerErrMessage: callerErr ? callerErr.message : null,
          callerRowFound: !!callerRow,
          callerRowRole: callerRow ? callerRow.role : null,
          callerRowOrgId: callerRow ? callerRow.organisation_id : null,
        },
      });
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
      supabaseAdmin.from('clients').select('id, nom_complet, email_contact, formateur_id, numero_dossier, module_name').eq('organisation_id', organisationId),
      supabaseAdmin.from('sessions').select('id, date, client_id, nom, type_activite, statut_client, numero_seance, heure_debut').eq('organisation_id', organisationId),
    ]);

    const todayStr = todayInParisStr();

    // ── 5. Construire la liste des emails à envoyer (même logique que l'ancien code client) ──
    const emailQueue = [];
    const debugSettingsInfo = []; // MARQUEUR DE DEBUG TEMPORAIRE (2026-07-28) — à retirer ensuite.
    const debugSessionInfo = []; // MARQUEUR DE DEBUG TEMPORAIRE (2026-07-29) — à retirer ensuite.
    for (const setting of activeSettings) {
      let targetSessions = [];
      let debugDs = null;

      if (setting.trigger_type === 'reminder_before_session') {
        const offset = Math.abs(setting.delay_days ?? 1);
        const ds = addDaysToDateStr(todayStr, offset);
        debugDs = ds;
        targetSessions = (sessions || []).filter(s => s.date === ds);
      } else if (setting.trigger_type === 'no_signature') {
        const offset = Math.abs(setting.delay_days ?? 2);
        const ds = addDaysToDateStr(todayStr, -offset);
        debugDs = ds;
        targetSessions = (sessions || []).filter(s =>
          s.date === ds && s.statut_client !== 'Signé' && s.statut_client !== 'signé'
        );
      }

      debugSettingsInfo.push({
        settingId: setting.id,
        triggerType: setting.trigger_type,
        delayDays: setting.delay_days,
        computedTargetDate: debugDs,
        matchedSessionsCount: targetSessions.length,
      });

      for (const session of targetSessions) {
        const client = (clients || []).find(c => String(c.id) === String(session.client_id));

        if (!client?.email_contact) {
          debugSessionInfo.push({
            sessionId: session.id, settingId: setting.id, clientId: session.client_id,
            clientFound: !!client, clientEmail: client ? (client.email_contact || null) : null,
            skippedReason: !client ? 'client_introuvable' : 'client_sans_email_contact',
          });
          continue;
        }

        const { data: existing, error: existingErr } = await supabaseAdmin.from('automation_logs')
          .select('id').eq('automation_setting_id', setting.id).eq('client_id', client.id)
          .gte('sent_at', todayStr + 'T00:00:00Z').maybeSingle();

        if (existing) {
          debugSessionInfo.push({
            sessionId: session.id, settingId: setting.id, clientId: session.client_id,
            clientFound: true, clientEmail: client.email_contact,
            skippedReason: 'deja_envoye_aujourdhui', existingLogId: existing.id,
          });
          continue;
        }

        debugSessionInfo.push({
          sessionId: session.id, settingId: setting.id, clientId: session.client_id,
          clientFound: true, clientEmail: client.email_contact,
          existingLogCheckError: existingErr ? existingErr.message : null,
          skippedReason: null, willBeQueued: true,
        });

        const clientName = client.nom_complet || '';
        const sessionDate = session.date
          ? new Date(session.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : '';
        // session.nom est le vrai titre lisible de la séance (ex : "Séance 2 - Émargement de
        // présence") — session.type_activite est une catégorie technique (ex : "signature"),
        // pas un titre, donc on ne l'utilise qu'en dernier repli. Vérifié en base le 2026-07-29.
        const sessionTitle = session.nom || session.type_activite || `Séance n°${session.numero_seance ?? ''}`;
        const sessionTime = session.heure_debut || '';
        const sessionNumber = session.numero_seance != null ? String(session.numero_seance) : '';
        const numeroDossier = client.numero_dossier || '';
        const moduleName = client.module_name || '';
        const vars = { clientName, sessionDate, sessionTitle, sessionTime, sessionNumber, numeroDossier, moduleName };

        emailQueue.push({
          setting, client, clientName, session,
          subject: interpolate(setting.email_subject, vars),
          body: interpolate(setting.email_body, vars),
        });
      }
    }

    if (emailQueue.length === 0) {
      // MARQUEUR DE DEBUG TEMPORAIRE (2026-07-28/29) : à retirer une fois le problème identifié.
      return res.status(200).json({
        sent: 0, simulated: 0,
        message: "Aucun email à envoyer aujourd'hui (aucune séance correspondante). [DEBUG-v5-sessions]",
        debug: {
          todayStr,
          organisationId,
          settingsInfo: debugSettingsInfo,
          sessionsFound: (sessions || []).map(s => ({ id: s.id, date: s.date, client_id: s.client_id })),
          sessionSkipDetails: debugSessionInfo,
        },
      });
    }

    // ── 6. Envoyer via Resend (clé jamais exposée au navigateur) — appel fetch direct, sans
    //         dépendre du SDK npm "resend" (absent de package.json) ──
    const resendConfigured = !!resendApiKey;
    let sent = 0, simulated = 0;
    const debugSendResults = []; // MARQUEUR DE DEBUG TEMPORAIRE (2026-07-29) — à retirer ensuite.

    for (const item of emailQueue) {
      let ok = false;
      let errMsg = null;

      if (resendConfigured) {
        try {
          const resendResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
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
            }),
          });

          if (resendResp.ok) {
            ok = true;
          } else {
            const errBody = await resendResp.json().catch(() => ({}));
            errMsg = errBody.message || `Resend erreur HTTP ${resendResp.status}`;
          }
        } catch (e) {
          errMsg = 'Erreur réseau Resend : ' + e.message;
        }
        if (ok) sent++;
      } else {
        ok = true;
        simulated++;
        errMsg = 'Simulation — RESEND_API_KEY non configurée côté serveur (Vercel).';
      }

      debugSendResults.push({
        clientEmail: item.client.email_contact,
        ok, errMsg, resendConfigured, fromEmail: FROM_EMAIL,
      });

      // NB : la table automation_logs n'a pas de colonnes email_subject/email_to/trigger_type/
      // error_message (vérifié 2026-07-29) — elle utilise client_email/reference_id/reference_type.
      const { error: logInsertErr } = await supabaseAdmin.from('automation_logs').insert([{
        automation_setting_id: item.setting.id,
        client_id: item.client.id,
        client_email: item.client.email_contact,
        reference_id: String(item.session.id),
        reference_type: 'session',
        sent_at: new Date().toISOString(),
        status: ok ? (resendConfigured ? 'sent' : 'simulated') : 'error',
        organisation_id: organisationId,
      }]);
      if (logInsertErr) debugSendResults[debugSendResults.length - 1].logInsertError = logInsertErr.message;
    }

    // MARQUEUR DE DEBUG TEMPORAIRE (2026-07-29) : à retirer une fois le problème identifié.
    return res.status(200).json({ sent, simulated, debug_v6_send: debugSendResults });
  } catch (err) {
    console.error('[automation/trigger-manual]', err);
    return res.status(500).json({ error: err.message });
  }
};
