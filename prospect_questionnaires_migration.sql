-- Migration : Questionnaires d'entretien préalable envoyés à des prospects sans compte SkorUp
-- À exécuter dans Supabase > SQL Editor
--
-- Contexte : un formateur (ou un admin) doit pouvoir envoyer un questionnaire à une personne qui
-- n'a PAS encore de compte SkorUp (avant que sa formation/bilan ne soit validé). La personne reçoit
-- un lien par email, remplit le questionnaire sans se connecter, et les réponses reviennent dans
-- SkorUp.
--
-- Sécurité : contrairement aux autres tables de l'app, prospect_questionnaire_envois n'a AUCUNE
-- policy RLS pour le rôle "anon" (les prospects, non connectés, qui ouvrent le lien). L'accès
-- public (lecture du questionnaire par lien, envoi des réponses) passe exclusivement par deux
-- fonctions serveur (api/prospects/envoyer.js et api/prospects/questionnaire.js) qui utilisent la
-- clé service_role et vérifient le token elles-mêmes — exactement le même principe que
-- api/contact/route.js ou trigger-manual.js. Le token (32 octets aléatoires, donc impossible à
-- deviner) est la seule clé d'entrée ; la base de données, elle, refuse purement et simplement
-- toute requête anonyme sur cette table, quel que soit le filtre utilisé dans la requête.

-- 1. Modèles de questionnaires (créés par l'admin, choisis par le formateur au moment de l'envoi)
--    "questions" reprend exactement le même format que module_step_resources.metadata.questions
--    (voir QuestionnaireFillerModal dans App.js) : [{ id, text, type: 'text'|'single'|'multiple', options: [...] }]
CREATE TABLE IF NOT EXISTS prospect_questionnaire_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  titre           TEXT        NOT NULL,
  questions       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  actif           BOOLEAN     NOT NULL DEFAULT true,
  -- utilisateurs.id est un entier (pas un UUID) dans cette base — voir rls_hardening_migration.sql
  -- ("utilisateurs.id (entier) pour admin/formateur"). Pas de contrainte REFERENCES ici, comme
  -- ailleurs dans le projet (ex. google_calendar_migration.sql owner_id) : on garde juste l'id.
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Envois individuels (un par prospect contacté)
--    statut : 'envoye' tant que le prospect n'a pas répondu, 'rempli' une fois les réponses reçues.
--    expire_at : le lien cesse d'être valable 30 jours après l'envoi (évite qu'un lien oublié dans
--    une boîte mail traîne indéfiniment).
CREATE TABLE IF NOT EXISTS prospect_questionnaire_envois (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  template_id     UUID        NOT NULL REFERENCES prospect_questionnaire_templates(id) ON DELETE CASCADE,
  token           TEXT        NOT NULL UNIQUE,
  nom             TEXT        NOT NULL,
  prenom          TEXT        NOT NULL,
  email           TEXT        NOT NULL,
  statut          TEXT        NOT NULL DEFAULT 'envoye' CHECK (statut IN ('envoye', 'rempli')),
  reponses        JSONB,
  -- Même remarque que created_by ci-dessus : utilisateurs.id est un entier, sans contrainte
  -- REFERENCES (convention du projet pour cette table).
  envoye_par      INTEGER,
  envoye_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rempli_at       TIMESTAMPTZ,
  expire_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pq_templates_org ON prospect_questionnaire_templates(organisation_id);
CREATE INDEX IF NOT EXISTS idx_pq_envois_org ON prospect_questionnaire_envois(organisation_id);
CREATE INDEX IF NOT EXISTS idx_pq_envois_token ON prospect_questionnaire_envois(token);

-- 3. RLS — templates : lecture pour admin+formateur de l'organisme, écriture réservée à l'admin
--    (le formateur choisit un modèle existant pour envoyer, mais ne crée/modifie pas les modèles).
ALTER TABLE prospect_questionnaire_templates ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('prospect_questionnaire_templates');

CREATE POLICY "pqt_select_org" ON prospect_questionnaire_templates
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));

CREATE POLICY "pqt_write_admin_org" ON prospect_questionnaire_templates
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin')
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin');

-- 4. RLS — envois : lecture/écriture pour admin+formateur de l'organisme (écran "Prospects").
--    AUCUNE policy pour "anon" ici, volontairement : voir le commentaire de sécurité en haut de
--    ce fichier. Le prospect (non connecté) ne passe jamais par cette table directement.
ALTER TABLE prospect_questionnaire_envois ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('prospect_questionnaire_envois');

CREATE POLICY "pqe_select_org" ON prospect_questionnaire_envois
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));

CREATE POLICY "pqe_write_staff_org" ON prospect_questionnaire_envois
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));
