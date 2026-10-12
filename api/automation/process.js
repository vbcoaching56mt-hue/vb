// api/automation/process.js
// Fonction Vercel : traite les relances automatiques (cron quotidien à 8h)
// Peut aussi être déclenchée manuellement via l'admin UI.
//
// CORRECTIF (2026-07-28/29) : ce fichier remplace une ancienne version qui utilisait un
// schéma de base de données obsolète (colonnes clients.nom_complet, sessions.signe_par_client,
// sessions.ressource_titre/nom) qui ne correspond plus au schéma actuel des tables clients/
// sessions (clients.nom/prenom n'existent PAS non plus — la vraie colonne est clients.nom_complet ;
// vérifié directement en base le 2026-07-29). La table automation_logs, elle, utilise réellement
// client_email/reference_id/reference_type/organisation_id (PAS email_to/email_subject/trigger_type/
// error_message comme on le pensait initialement — vérifié en base le 2026-07-29 aussi).
//
// Corrigé aussi pour calculer "aujourd'hui" dans le fuseau Europe/Paris plutôt qu'en UTC (heure
// du serveur Vercel) — un décalage d'un jour pouvait faire qu'aucune séance ne corresponde,
// silencieusement, selon l'heure exacte du cron.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// SÉCURITÉ (2026-10-12) : seuls les déclenchements planifiés de Vercel sont acceptés. Vercel
// envoie automatiquement l'en-tête "Authorization: Bearer <CRON_SECRET>" dès que la variable
// d'environnement CRON_SECRET existe dans le projet. Sans cette clé, plus personne ne peut lancer
// cette fonction depuis Internet (avant : n'importe qui pouvait déclencher l'envoi des relances).
// Le bouton "Tester maintenant" de l'admin utilise api/automation/trigger-manual.js (inchangé).
function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(String(req.headers['authorization'] || ''));
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const FROM_EMAIL_ORG = process.env.FROM_EMAIL || 'SkorUp <noreply@skorup.fr>';

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
    supabase.from('organisations').select('nom').eq('id', organisationId).maybeSingle(),
    supabase.from('utilisateurs').select('email').eq('organisation_id', organisationId).eq('role', 'admin').order('id', { ascending: true }).limit(1),
  ]);
  const email = adminRes && adminRes.data && adminRes.data[0] && adminRes.data[0].email;
  return {
    nom: (orgRes && orgRes.data && orgRes.data.nom) || '',
    replyTo: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim()) ? String(email).trim() : null,
  };
}
function htmlEchappe(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Utilitaires de dates fuseau France ──────────────────────────────────────
function todayInParisStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}
function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Non autorisé.' });

  // ── Garde-fou horaire France pour les invocations Cron ───────────────────
  // Vercel Cron s'exécute toujours en UTC. Deux cron sont programmés dans vercel.json
  // (un pour l'heure d'été, un pour l'heure d'hiver) afin de viser 8h à Paris toute
  // l'année ; chaque invocation Cron transmet l'en-tête x-vercel-cron-schedule — on ne
  // traite réellement les relances que si l'heure de Paris actuelle est bien 8h.
  // Les appels manuels depuis "Tester maintenant" (admin) n'ont pas cet en-tête et
  // s'exécutent donc toujours immédiatement, sans être bloqués par ce garde-fou.
  const cronSchedule = req.headers['x-vercel-cron-schedule'];
  if (cronSchedule) {
    const parisHour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false })
        .formatToParts(new Date())
        .find(p => p.type === 'hour').value
    );
    if (parisHour !== 8) {
      return res.json({ skipped: true, reason: 'not_target_hour_paris' });
    }
  }

  // ── Initialisation Supabase avec la clé service (bypass RLS) ─────────────
  const supabaseUrl  = process.env.SUPABASE_URL;
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail    = process.env.FROM_EMAIL || 'SkorUp <noreply@skorup.fr>';

  if (!supabaseUrl || !serviceKey) {
    console.error('[automation/process] Variables Supabase non configurées (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
    return res.status(500).json({ error: 'Configuration serveur incomplète.' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ── 1. Récupérer les relances actives (TOUS organismes — c'est le cron global) ──
    const { data: settings, error: settingsErr } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('is_active', true);

    if (settingsErr) throw new Error('Erreur lecture automation_settings : ' + settingsErr.message);
    if (!settings || settings.length === 0) {
      return res.json({ sent: 0, message: 'Aucune relance active configurée.' });
    }

    // ── 2. Récupérer clients, sessions et modules ─────────────────────────────
    // NB (2026-07-29) : clients.module_name est une colonne texte legacy, jamais renseignée nulle
    // part dans l'app (ni à la création du client, ni à l'assignation d'un module) — elle contient
    // une valeur figée/obsolète pour certains clients plutôt que le vrai nom du module actuellement
    // assigné. Le vrai nom vient de la table modules (modules.nom), retrouvé via clients.module_id.
    const [{ data: clients }, { data: sessions }, { data: modulesList }] = await Promise.all([
      supabase.from('clients').select('id, nom_complet, email_contact, formateur_id, organisation_id, numero_dossier, module_name, module_id'),
      supabase.from('sessions').select('id, date, client_id, nom, type_activite, statut_client, numero_seance, organisation_id, heure_debut, module_id'),
      supabase.from('modules').select('id, nom'),
    ]);

    const todayStr = todayInParisStr();

    let sent = 0;
    const results = [];
    const cacheOrganismes = {};
    const organismeDe = async (orgId) => {
      if (!cacheOrganismes[orgId]) cacheOrganismes[orgId] = await infosOrganisme(supabase, orgId);
      return cacheOrganismes[orgId];
    };

    // ── 3. Traiter chaque relance ─────────────────────────────────────────────
    for (const setting of settings) {
      const triggerSessions = [];

      if (setting.trigger_type === 'reminder_before_session') {
        // Sessions ayant lieu dans |delay_days| jours
        const daysOffset = Math.abs(setting.delay_days || 1);
        const targetDateStr = addDaysToDateStr(todayStr, daysOffset);

        (sessions || [])
          .filter(s => s.date === targetDateStr && s.organisation_id === setting.organisation_id)
          .forEach(s => triggerSessions.push(s));

      } else if (setting.trigger_type === 'no_signature') {
        // Sessions dont la date est passée depuis X jours et le client n'a pas signé
        const daysOffset = Math.abs(setting.delay_days || 2);
        const targetDateStr = addDaysToDateStr(todayStr, -daysOffset);

        (sessions || [])
          .filter(s => s.date === targetDateStr && s.organisation_id === setting.organisation_id
            && s.statut_client !== 'Signé' && s.statut_client !== 'signé')
          .forEach(s => triggerSessions.push(s));

      } else if (setting.timing_direction) {
        // Type personnalisé (ajouté 2026-07-29) : cible un module (ou tous), une séance précise
        // (ou toutes celles du module), un moment avant/après la séance, et éventuellement une
        // condition "seulement si pas encore signée" — configuré depuis l'interface admin.
        // Avant ce correctif, un type personnalisé était enregistré en base mais n'envoyait
        // jamais aucun email : aucune branche ne le traitait ici.
        const daysOffset = Math.abs(setting.delay_days || 1);
        const targetDateStr = setting.timing_direction === 'after'
          ? addDaysToDateStr(todayStr, -daysOffset)
          : addDaysToDateStr(todayStr, daysOffset);

        (sessions || [])
          .filter(s => s.date === targetDateStr && s.organisation_id === setting.organisation_id)
          .filter(s => !setting.target_module_id || String(s.module_id) === String(setting.target_module_id))
          .filter(s => setting.target_numero_seance == null || String(s.numero_seance) === String(setting.target_numero_seance))
          .filter(s => !setting.require_unsigned || (s.statut_client !== 'Signé' && s.statut_client !== 'signé'))
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
          results.push({ skipped: true, reason: 'already_sent_today', trigger: setting.trigger_type });
          continue;
        }

        // Remplacer les variables dans le template
        const sessionDate = session.date
          ? new Date(session.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : '';
        const clientName = client.nom_complet || '';
        // session.nom est le vrai titre lisible de la séance — session.type_activite est une
        // catégorie technique (ex : "signature"), pas un titre. Vérifié en base le 2026-07-29.
        const sessionTitle = session.nom || session.type_activite || `Séance n°${session.numero_seance || ''}`;
        const sessionTime = session.heure_debut || '';
        const sessionNumber = session.numero_seance != null ? String(session.numero_seance) : '';
        const numeroDossier = client.numero_dossier || '';
        // Priorité au vrai nom du module (table modules, via client.module_id) — client.module_name
        // n'est utilisé qu'en dernier repli pour d'anciens clients sans module_id renseigné.
        const moduleName = (modulesList || []).find(m => String(m.id) === String(client.module_id))?.nom
          || client.module_name || '';

        // SÉCURITÉ (2026-10-12) : dans le corps HTML, les valeurs (nom du client, titre…) sont
        // neutralisées — un nom contenant du code ne peut plus modifier le contenu de l'email.
        // L'objet de l'email est du texte simple : pas de neutralisation nécessaire.
        const replaceVars = (str, esc = false) => {
          const v = (x) => (esc ? escapeHtml(x) : x);
          return (str || '')
            .replace(/\{nom_client\}|\{client_name\}|\{\{nom_client\}\}|\{\{client_name\}\}/g, () => v(clientName))
            .replace(/\{date_seance\}|\{session_date\}|\{\{date_seance\}\}|\{\{session_date\}\}/g, () => v(sessionDate))
            .replace(/\{titre_seance\}|\{session_title\}|\{\{titre_seance\}\}|\{\{session_title\}\}/g, () => v(sessionTitle))
            .replace(/\{heure_seance\}|\{session_time\}|\{\{heure_seance\}\}|\{\{session_time\}\}/g, () => v(sessionTime))
            .replace(/\{numero_seance\}|\{session_number\}|\{\{numero_seance\}\}|\{\{session_number\}\}/g, () => v(sessionNumber))
            .replace(/\{numero_dossier\}|\{\{numero_dossier\}\}/g, () => v(numeroDossier))
            .replace(/\{module_name\}|\{\{module_name\}\}/g, () => v(moduleName));
        };

        const organisme = await organismeDe(setting.organisation_id);
        const nomOrg = htmlEchappe(organisme.nom || 'SkorUp');
        const emailSubject = replaceVars(setting.email_subject);
        const emailBodyText = replaceVars(setting.email_body, true);
        const emailBodyHtml = emailBodyText.replace(/\n/g, '<br>');

        // Envoyer via Resend
        let emailSent = false;
        let emailError = null;

        if (!resendApiKey) {
          emailError = 'RESEND_API_KEY non configurée — email simulé (ajoutez la clé dans Vercel > Settings > Environment Variables)';
          console.warn('[automation] RESEND_API_KEY manquante, simulation pour:', client.email_contact);
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
                from: expediteurPour(organisme.nom),
                to: [client.email_contact],
                subject: emailSubject,
                ...(organisme.replyTo ? { reply_to: organisme.replyTo } : {}),
                html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                  <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;">
                    <strong style="font-size:18px;">${nomOrg}</strong>
                  </div>
                  <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                    <p style="color:#111827;font-size:14px;line-height:1.6;">${emailBodyHtml}</p>
                    <div style="text-align:center;margin:28px 0 8px;">
                      <a href="https://app.skorup.fr" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:13px 30px;border-radius:10px;">Se connecter à SkorUp</a>
                    </div>
                    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
                    <p style="color:#9ca3af;font-size:11px;">Envoyé par ${nomOrg} via SkorUp.${organisme.replyTo ? ' Vous pouvez répondre directement à cet email.' : ''}</p>
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

        // Logger le résultat dans automation_logs (colonnes réelles vérifiées 2026-07-29 :
        // pas de email_to/email_subject/trigger_type/error_message — voir en-tête du fichier)
        await supabase.from('automation_logs').insert([{
          automation_setting_id: setting.id,
          client_id: client.id,
          client_email: client.email_contact,
          reference_id: String(session.id),
          reference_type: 'session',
          sent_at: new Date().toISOString(),
          status: emailSent ? 'sent' : 'error',
          organisation_id: setting.organisation_id,
        }]).select();
        if (emailError) console.warn('[automation/process] envoi echoue pour', client.email_contact, ':', emailError);

        if (emailSent) {
          sent++;
          results.push({ sent: true, trigger: setting.trigger_type });
        } else {
          results.push({ sent: false, trigger: setting.trigger_type });
        }
      }
    }

    // SÉCURITÉ (2026-10-12) : la réponse ne contient plus que des compteurs (avant : noms et
    // emails des clients de tous les organismes).
    return res.json({
      sent,
      processed: results.length,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[automation/process] Erreur:', err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
};
