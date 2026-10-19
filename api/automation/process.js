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

// ── Relance automatique « activez votre espace » (2026-10-19, offres Pro et Illimité) ────────────
// Un client invité qui ne s'est jamais connecté reçoit un nouveau lien au bout de 3 jours, puis de
// 7 jours (2 relances maximum). L'admin reçoit un récapitulatif. Les dates des relances sont notées
// dans la fiche client (clients.relance_compte_1_le / relance_compte_2_le, cf. comptes_clients.sql).
// Garde-fous : pas de relance pour une invitation de plus de 45 jours (anciens dossiers), et
// 60 emails maximum par jour (limite du plan gratuit Resend : 100/jour).
const JOUR_MS = 24 * 60 * 60 * 1000;
const MAX_RELANCES_COMPTE_PAR_JOUR = 60;

async function tousLesComptesAuth(supabase) {
  const comptes = new Map();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = (data && data.users) || [];
    users.forEach(u => comptes.set(String(u.id), u));
    if (users.length < 1000) break;
  }
  return comptes;
}

function emailRelanceCompte({ nomClient, nomOrganisme, lien, etape }) {
  const prenom = escapeHtml(String(nomClient || '').split(' ')[0] || '');
  const org = escapeHtml(nomOrganisme || 'votre organisme de formation');
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;"><strong style="font-size:18px;">${org}</strong></div>
    <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="color:#111827;font-size:14px;line-height:1.7;">Bonjour ${prenom},</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">${etape === 2 ? 'Petit rappel : v' : 'V'}otre espace de formation vous attend, mais vous ne l'avez pas encore activé. C'est là que vous retrouverez vos séances, vos documents à signer et vos émargements.</p>
      <p style="color:#111827;font-size:14px;line-height:1.7;">Il suffit de cliquer sur le bouton ci-dessous et de choisir votre mot de passe.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${lien}" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:13px 30px;border-radius:10px;">Activer mon espace</a>
      </div>
      <p style="color:#6b7280;font-size:12px;line-height:1.6;">Ce lien est personnel et valable pour une durée limitée. S'il a expiré, utilisez « Mot de passe oublié » sur la page de connexion.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
      <p style="color:#9ca3af;font-size:11px;">Envoyé par ${org} via SkorUp.</p>
    </div>
  </div>`;
}

async function envoyerViaResend(resendApiKey, message) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `Resend erreur HTTP ${r.status}`);
  }
}

async function relancerComptesClients(supabase, resendApiKey) {
  const bilan = { relances: 0, erreurs: 0 };
  if (!resendApiKey) return bilan;

  const { data: orgs, error: orgErr } = await supabase.from('organisations')
    .select('id, nom, subscription_status, subscribed_plan');
  if (orgErr) throw orgErr;
  const orgsPro = (orgs || []).filter(o => {
    const offre = String(o.subscribed_plan || '').split('_')[0];
    return (offre === 'pro' || offre === 'illimite') && !['trialing', 'canceled', 'past_due'].includes(o.subscription_status);
  });
  if (orgsPro.length === 0) return bilan;

  // 2026-10-19 : seulement les fiches récentes (une invitation de plus de 45 jours n'est jamais
  // relancée) — évite de parcourir tous les clients et tous les comptes de la plateforme.
  const depuis = new Date(Date.now() - 50 * JOUR_MS).toISOString();
  const { data: clients, error: cErr } = await supabase.from('clients')
    .select('id, nom_complet, email_contact, organisation_id, relance_compte_1_le, relance_compte_2_le, created_at')
    .in('organisation_id', orgsPro.map(o => o.id))
    .is('relance_compte_2_le', null)
    .gte('created_at', depuis);
  if (cErr) {
    // Colonnes absentes tant que comptes_clients.sql n'a pas été lancé : on ne fait rien.
    console.warn('[automation/process] relance des comptes ignorée :', cErr.message);
    return bilan;
  }
  if (!clients || clients.length === 0) return bilan;

  const maintenant = Date.now();
  const appUrl = (process.env.APP_URL || 'https://app.skorup.fr').replace(/\/+$/, '');
  const relancesParOrg = new Map();

  for (const c of clients) {
    if (bilan.relances >= MAX_RELANCES_COMPTE_PAR_JOUR) break;
    const { data: compte } = await supabase.auth.admin.getUserById(c.id);
    const u = compte && compte.user;
    if (!u || u.last_sign_in_at) continue;                       // pas de compte, ou déjà connecté
    // 2026-10-19 : l'adresse du COMPTE de connexion (celle de la fiche peut avoir été modifiée).
    const email = String(u.email || c.email_contact || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    const invite = new Date(u.invited_at || u.confirmation_sent_at || u.created_at).getTime();
    if (!invite) continue;
    const jours = (maintenant - invite) / JOUR_MS;
    if (jours > 45) continue;

    let etape = 0;
    if (!c.relance_compte_1_le && jours >= 3) etape = 1;
    else if (c.relance_compte_1_le && jours >= 7 && maintenant - new Date(c.relance_compte_1_le).getTime() >= 3 * JOUR_MS) etape = 2;
    if (!etape) continue;

    try {
      const { data: lienData, error: lienErr } = await supabase.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo: appUrl },
      });
      if (lienErr) throw lienErr;
      const lien = lienData && lienData.properties && lienData.properties.action_link;
      if (!lien) throw new Error('lien non généré');

      const org = orgsPro.find(o => String(o.id) === String(c.organisation_id)) || {};
      const organisme = await infosOrganisme(supabase, c.organisation_id);
      await envoyerViaResend(resendApiKey, {
        from: expediteurPour(organisme.nom),
        to: [email],
        subject: etape === 2 ? 'Rappel : votre espace de formation vous attend' : 'Votre espace de formation vous attend',
        ...(organisme.replyTo ? { reply_to: organisme.replyTo } : {}),
        html: emailRelanceCompte({ nomClient: c.nom_complet, nomOrganisme: organisme.nom || org.nom, lien, etape }),
      });

      await supabase.from('clients')
        .update(etape === 1 ? { relance_compte_1_le: new Date().toISOString() } : { relance_compte_2_le: new Date().toISOString() })
        .eq('id', c.id);
      bilan.relances++;
      const liste = relancesParOrg.get(String(c.organisation_id)) || [];
      liste.push({ nom: c.nom_complet || email, etape });
      relancesParOrg.set(String(c.organisation_id), liste);
    } catch (e) {
      bilan.erreurs++;
      console.warn('[automation/process] relance compte échouée :', e.message);
    }
  }

  // Récapitulatif pour les admins de chaque organisme concerné
  for (const [orgId, liste] of relancesParOrg) {
    try {
      const { data: admins } = await supabase.from('utilisateurs').select('email').eq('organisation_id', orgId).eq('role', 'admin');
      const destinataires = [...new Set((admins || []).map(a => String(a.email || '').trim()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
      if (destinataires.length === 0) continue;
      const lignes = liste.map(l => `<li>${escapeHtml(l.nom)}${l.etape === 2 ? ' — 2<sup>e</sup> et dernière relance' : ''}</li>`).join('');
      await envoyerViaResend(resendApiKey, {
        from: FROM_EMAIL_ORG,
        to: destinataires,
        subject: `${liste.length} client${liste.length > 1 ? 's' : ''} relancé${liste.length > 1 ? 's' : ''} pour activer son espace SkorUp`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <div style="background:#7C3AED;color:white;padding:16px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold;">SkorUp</div>
          <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            <p style="color:#111827;font-size:14px;line-height:1.7;">Ces clients n'avaient pas encore activé leur espace. SkorUp vient de leur renvoyer leur lien :</p>
            <ul style="color:#111827;font-size:14px;line-height:1.8;">${lignes}</ul>
            <p style="color:#6b7280;font-size:12px;line-height:1.6;">Après la 2<sup>e</sup> relance, plus aucun rappel n'est envoyé : pensez à les contacter directement. Le statut de chaque compte est visible dans la liste des clients.</p>
            <div style="text-align:center;margin:24px 0 8px;"><a href="${appUrl}/clients" style="display:inline-block;background:#7C3AED;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 26px;border-radius:10px;">Voir mes clients</a></div>
          </div>
        </div>`,
      });
    } catch (e) {
      console.warn('[automation/process] récapitulatif admin non envoyé :', e.message);
    }
  }
  return bilan;
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

  // AJOUT (2026-10-19) : relance des clients qui n'ont pas activé leur espace (offre Pro). Séparé
  // des relances de séances : une erreur ici ne bloque jamais les autres envois.
  let relancesComptes = { relances: 0, erreurs: 0 };
  try {
    relancesComptes = await relancerComptesClients(supabase, resendApiKey);
  } catch (e) {
    console.warn('[automation/process] relance des comptes :', e.message);
  }

  try {
    // ── 1. Récupérer les relances actives (TOUS organismes — c'est le cron global) ──
    const { data: settings, error: settingsErr } = await supabase
      .from('automation_settings')
      .select('*')
      .eq('is_active', true);

    if (settingsErr) throw new Error('Erreur lecture automation_settings : ' + settingsErr.message);
    if (!settings || settings.length === 0) {
      return res.json({ sent: 0, comptes: relancesComptes.relances, message: 'Aucune relance active configurée.' });
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
      comptes: relancesComptes.relances,
      processed: results.length,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[automation/process] Erreur:', err);
    return res.status(500).json({ error: 'Erreur interne.' });
  }
};
