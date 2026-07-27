-- ============================================================================
-- MIGRATION : Durcissement RLS multi-tenant (isolation réelle au niveau base)
-- Généré le 2026-07-23 suite à l'audit sécurité SkorUp.
-- À exécuter dans Supabase > SQL Editor.
-- ============================================================================
--
-- CONTEXTE — pourquoi cette migration existe
-- -------------------------------------------
-- L'audit de sécurité a confirmé que plusieurs policies RLS existantes sont
-- volontairement permissives ("USING (true)" / "auth.role() = 'authenticated'"),
-- et que certaines tables sensibles (sessions, documents, clients, messages,
-- shared_processes, organisation_settings) n'ont probablement JAMAIS eu de RLS
-- activé du tout depuis leur création (elles ne figurent dans aucune migration
-- SQL du dépôt qui active RLS dessus). Résultat concret : tous les filtres
-- organisation_id ajoutés côté code (App.js) lors des deux précédents tours de
-- correctifs sont de bonnes pratiques applicatives, mais AUCUNE d'entre elles
-- n'était réellement imposée par la base de données elle-même. Un utilisateur
-- techniquement capable, avec une session valide (même juste "client"), pouvait
-- en théorie appeler l'API REST Supabase directement et lire/modifier/supprimer
-- les données de N'IMPORTE QUEL AUTRE organisme, ou même d'un autre client du
-- même organisme.
--
-- Cette migration ferme ce trou : chaque table sensible reçoit désormais des
-- policies RLS qui font respecter, AU NIVEAU DE LA BASE, exactement les mêmes
-- règles que celles déjà en place côté application :
--   - Isolation entre organismes (organisation_id) pour Admin/Formateur.
--   - Isolation entre clients d'un même organisme (un client ne voit QUE ses
--     propres séances/documents/messages, jamais ceux d'un autre client).
--
-- ⚠️ RISQUE ET PRÉCAUTIONS AVANT DE LANCER CE SCRIPT ⚠️
-- -------------------------------------------------------
-- Contrairement aux migrations précédentes (qui ajoutaient des colonnes, sans
-- risque), celle-ci change le comportement de sécurité de TOUTE l'application,
-- immédiatement et pour tous les utilisateurs connectés. Une erreur ici peut
-- soit laisser une faille ouverte, soit — plus probable en pratique — bloquer
-- un flux légitime (ex: un admin ne verrait plus ses propres clients).
--
-- 1. Lancez ce script en dehors des heures de forte utilisation si possible.
-- 2. Juste après l'avoir lancé, reconnectez-vous et testez dans l'ordre :
--    a) Connexion admin → tableau de bord, liste clients, liste formateurs.
--    b) Connexion formateur → ses clients, ses séances, ses documents.
--    c) Connexion client → ses séances, ses documents, signature d'un document,
--       messagerie (envoyer + recevoir un message).
--    d) Inviter un nouveau formateur / un nouveau client (flux d'invitation).
-- 3. Si un flux précis casse, ne relancez pas tout en arrière — dites-moi
--    exactement quelle action et quel message d'erreur Supabase renvoie
--    (visible dans la console navigateur, onglet Network, réponse de la requête
--    qui échoue) : je pourrai corriger UNIQUEMENT la policy concernée, sans
--    revenir sur tout le reste.
-- 4. Échappatoire d'urgence (à n'utiliser qu'en dernier recours si l'app est
--    totalement bloquée et qu'il faut la débloquer immédiatement) : voir la
--    section "URGENCE" tout en bas de ce fichier — désactive temporairement
--    RLS sur UNE table précise, PAS un retour en arrière global.
--
-- Ce script est idempotent (peut être relancé sans risque) : il supprime
-- dynamiquement TOUTES les anciennes policies de chaque table avant de créer
-- les nouvelles, quel que soit leur nom d'origine (y compris celles créées à
-- la main dans Supabase Studio, pas seulement celles des fichiers .sql connus).
--
-- NOTE DE VERSION (2e correction) : aucune migration .sql committée dans le
-- dépôt ne crée les tables clients/sessions/documents/messages — elles ont
-- toutes été créées à la main dans Supabase Studio, donc leur type SQL exact
-- (TEXT vs UUID) pour les colonnes d'identité (id, client_id, user_id,
-- sender_id, receiver_id, auth_uid, organisation_id) n'était pas garanti à
-- 100 %. Un premier essai en production a effectivement révélé un écart par
-- rapport à l'hypothèse initiale. TOUTES les comparaisons de ce script sont
-- donc désormais castées explicitement en ::text des deux côtés — cela
-- fonctionne quel que soit le type réel de chaque colonne, testé localement
-- avec plusieurs combinaisons TEXT/UUID différentes avant cette livraison.
-- ============================================================================


-- ============================================================================
-- 0. FONCTIONS UTILITAIRES (SECURITY DEFINER)
-- ============================================================================
-- Ces fonctions résolvent l'identité de l'appelant (organisation, rôle, id)
-- sans provoquer de récursion RLS : SECURITY DEFINER leur permet de lire
-- utilisateurs/clients en contournant RLS, ce qui est nécessaire puisque ce
-- sont justement CES tables que les policies de utilisateurs/clients doivent
-- pouvoir interroger pour se évaluer elles-mêmes.

-- Repli par email : certains comptes utilisateurs existants ont été créés
-- avant que la colonne auth_uid soit systématiquement renseignée (elle a été
-- ajoutée après coup — cf. formateur_auth_uuid_migration.sql). Sans ce repli,
-- ces comptes deviennent invisibles à leurs propres yeux dès que ces policies
-- s'appliquent, ce qui les bloque à la connexion. Le repli par email reprend
-- exactement la logique déjà utilisée dans signup_fix_migration.sql. Priorité
-- toujours donnée à auth_uid quand il est renseigné (comparaison directe,
-- non ambiguë) ; le repli par email ne s'applique que si auth_uid est NULL.
CREATE OR REPLACE FUNCTION app_current_org_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT organisation_id FROM utilisateurs WHERE auth_uid::text = auth.uid()::text
  UNION ALL
  SELECT organisation_id FROM utilisateurs WHERE auth_uid IS NULL AND email = auth.email()
  UNION ALL
  SELECT organisation_id FROM clients WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_current_role()
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT role FROM utilisateurs WHERE auth_uid::text = auth.uid()::text
  UNION ALL
  SELECT role FROM utilisateurs WHERE auth_uid IS NULL AND email = auth.email()
  UNION ALL
  SELECT 'client' FROM clients WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

-- Identité "texte" utilisée dans messages.sender_id / receiver_id, qui mélange
-- utilisateurs.id (entier) pour admin/formateur et clients.id (UUID) pour client.
CREATE OR REPLACE FUNCTION app_current_identity_id()
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT id::text FROM utilisateurs WHERE auth_uid::text = auth.uid()::text
  UNION ALL
  SELECT id::text FROM utilisateurs WHERE auth_uid IS NULL AND email = auth.email()
  UNION ALL
  SELECT id::text FROM clients WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION app_current_org_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION app_current_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION app_current_identity_id() TO authenticated, anon;

-- Petit utilitaire pour supprimer dynamiquement TOUTES les policies d'une
-- table, quel que soit leur nom (évite de devoir deviner les noms exacts
-- posés à la main dans Supabase Studio au fil du temps).
CREATE OR REPLACE FUNCTION _drop_all_policies(target_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target_table LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
  END LOOP;
END;
$$;


-- ============================================================================
-- 1. ORGANISATIONS
-- ============================================================================
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('organisations');

-- Lecture : uniquement sa propre organisation.
CREATE POLICY "org_select_own" ON organisations
  FOR SELECT TO authenticated
  USING (id::text = app_current_org_id()::text);

-- Création : nécessaire pour le flux de signup (un nouvel utilisateur crée
-- son organisme avant d'avoir la moindre ligne utilisateurs/clients).
CREATE POLICY "org_insert_authenticated" ON organisations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Mise à jour : uniquement l'admin de sa propre organisation.
CREATE POLICY "org_update_own_admin" ON organisations
  FOR UPDATE TO authenticated
  USING (id::text = app_current_org_id()::text AND app_current_role() = 'admin')
  WITH CHECK (id::text = app_current_org_id()::text AND app_current_role() = 'admin');

-- Pas de policy DELETE : la suppression d'un organisme ne doit jamais passer
-- par le client (elle nécessiterait une action manuelle/service role).


-- ============================================================================
-- 2. UTILISATEURS (admins + formateurs)
-- ============================================================================
ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('utilisateurs');

CREATE POLICY "utilisateurs_select_own_org" ON utilisateurs
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text);

-- Insertion : soit on crée SA PROPRE ligne (signup, auth_uid = soi-même),
-- soit un admin invite un nouveau membre dans SON PROPRE organisme
-- (cf. handleInviteUser dans App.js, qui insère la ligne utilisateurs du
-- formateur invité AVANT que celui-ci ne se soit jamais connecté).
CREATE POLICY "utilisateurs_insert_self_or_admin" ON utilisateurs
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_uid::text = auth.uid()::text
    OR (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin')
  );

CREATE POLICY "utilisateurs_update_self_or_admin" ON utilisateurs
  FOR UPDATE TO authenticated
  USING (auth_uid::text = auth.uid()::text OR (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin'))
  WITH CHECK (auth_uid::text = auth.uid()::text OR (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin'));

CREATE POLICY "utilisateurs_delete_admin_own_org" ON utilisateurs
  FOR DELETE TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin');


-- ============================================================================
-- 3. CLIENTS
-- ============================================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('clients');

-- Lecture : admin/formateur de l'organisme (tous les clients de l'organisme),
-- OU le client lui-même (sa propre ligne UNIQUEMENT — un client ne doit
-- jamais pouvoir lire la fiche d'un autre client du même organisme).
CREATE POLICY "clients_select_org_or_self" ON clients
  FOR SELECT TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR id::text = auth.uid()::text
  );

-- Création : admin/formateur créant un client dans LEUR PROPRE organisme
-- (cf. handleInviteUser).
CREATE POLICY "clients_insert_staff_own_org" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));

-- Mise à jour : admin/formateur de l'organisme, OU le client met à jour
-- ses propres informations (profil, etc.).
CREATE POLICY "clients_update_org_or_self" ON clients
  FOR UPDATE TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR id::text = auth.uid()::text
  )
  WITH CHECK (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR id::text = auth.uid()::text
  );

CREATE POLICY "clients_delete_admin_own_org" ON clients
  FOR DELETE TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin');


-- ============================================================================
-- 4. MODULES / MODULE_SESSION_TEMPLATES / MODULE_STEP_RESOURCES
-- ============================================================================
-- Lecture ouverte à tout membre de l'organisme (admin/formateur/client en ont
-- besoin pour afficher modules et ressources) ; écriture réservée admin/formateur.
-- On garde "organisation_id IS NULL" en lecture pour couvrir les lignes
-- historiques non taguées (même logique que les filtres .or(...) côté code).

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('modules');

CREATE POLICY "modules_select_org" ON modules
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL);

CREATE POLICY "modules_write_staff_org" ON modules
  FOR ALL TO authenticated
  USING ((organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL) AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK ((organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL) AND app_current_role() IN ('admin', 'formateur'));

ALTER TABLE module_session_templates ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('module_session_templates');

CREATE POLICY "mst_select_org" ON module_session_templates
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL);

CREATE POLICY "mst_write_staff_org" ON module_session_templates
  FOR ALL TO authenticated
  USING ((organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL) AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK ((organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL) AND app_current_role() IN ('admin', 'formateur'));

ALTER TABLE module_step_resources ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('module_step_resources');

CREATE POLICY "msr_select_org" ON module_step_resources
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL);

CREATE POLICY "msr_write_staff_org" ON module_step_resources
  FOR ALL TO authenticated
  USING ((organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL) AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK ((organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL) AND app_current_role() IN ('admin', 'formateur'));


-- ============================================================================
-- 5. SESSIONS (séances, émargements, exercices)
-- ============================================================================
-- Un client ne doit voir/modifier QUE ses propres séances (client_id), jamais
-- celles d'un autre client du même organisme.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('sessions');

CREATE POLICY "sessions_select_staff_org_or_own_client" ON sessions
  FOR SELECT TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR client_id::text = auth.uid()::text
  );

CREATE POLICY "sessions_insert_staff_org" ON sessions
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));

-- Update : staff de l'organisme, OU le client concerné (signature, réponse
-- à un exercice, statut_client, etc. sont mis à jour depuis le compte client).
CREATE POLICY "sessions_update_staff_org_or_own_client" ON sessions
  FOR UPDATE TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR client_id::text = auth.uid()::text
  )
  WITH CHECK (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR client_id::text = auth.uid()::text
  );

CREATE POLICY "sessions_delete_staff_org" ON sessions
  FOR DELETE TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));


-- ============================================================================
-- 6. DOCUMENTS
-- ============================================================================
-- Même logique que sessions : un client ne voit/modifie que SES documents
-- (user_id), jamais ceux d'un autre client.
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('documents');

CREATE POLICY "documents_select_staff_org_or_own_client" ON documents
  FOR SELECT TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR user_id::text = auth.uid()::text
  );

CREATE POLICY "documents_insert_staff_org_or_own_client" ON documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR user_id::text = auth.uid()::text
  );

-- Update : staff de l'organisme, OU le client propriétaire (signature d'un
-- document, choix de consentement, etc.).
CREATE POLICY "documents_update_staff_org_or_own_client" ON documents
  FOR UPDATE TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR user_id::text = auth.uid()::text
  )
  WITH CHECK (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR user_id::text = auth.uid()::text
  );

CREATE POLICY "documents_delete_staff_org" ON documents
  FOR DELETE TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));


-- ============================================================================
-- 7. CLIENT_DOCUMENTS (documents sur-mesure par client)
-- ============================================================================
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('client_documents');

CREATE POLICY "client_documents_select_staff_org_or_own_client" ON client_documents
  FOR SELECT TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR client_id::text = auth.uid()::text
  );

CREATE POLICY "client_documents_write_staff_org" ON client_documents
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));


-- ============================================================================
-- 8. CLIENT_SKILLS (scores ancres de carrière) — pas de colonne organisation_id
-- propre : on passe par une jointure vers clients.
-- ============================================================================
ALTER TABLE client_skills ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('client_skills');

CREATE POLICY "client_skills_select_staff_org_or_own_client" ON client_skills
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id::text = client_skills.client_id::text
        AND (
          (c.organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
          OR c.id::text = auth.uid()::text
        )
    )
  );

CREATE POLICY "client_skills_write_staff_org" ON client_skills
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id::text = client_skills.client_id::text
        AND c.organisation_id::text = app_current_org_id()::text
        AND app_current_role() IN ('admin', 'formateur')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id::text = client_skills.client_id::text
        AND c.organisation_id::text = app_current_org_id()::text
        AND app_current_role() IN ('admin', 'formateur')
    )
  );


-- ============================================================================
-- 9. CLIENT_JOB_SHEETS (assignation de fiches métiers à un client)
-- Note : job_sheets lui-même reste un catalogue de référence partagé entre
-- tous les organismes (contenu générique, pas de données client) — il n'est
-- PAS modifié par cette migration, seule la table de LIAISON par client l'est.
-- ============================================================================
ALTER TABLE client_job_sheets ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('client_job_sheets');

CREATE POLICY "client_job_sheets_select_staff_org_or_own_client" ON client_job_sheets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id::text = client_job_sheets.client_id::text
        AND (
          (c.organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
          OR c.id::text = auth.uid()::text
        )
    )
  );

CREATE POLICY "client_job_sheets_write_staff_org" ON client_job_sheets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id::text = client_job_sheets.client_id::text
        AND c.organisation_id::text = app_current_org_id()::text
        AND app_current_role() IN ('admin', 'formateur')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id::text = client_job_sheets.client_id::text
        AND c.organisation_id::text = app_current_org_id()::text
        AND app_current_role() IN ('admin', 'formateur')
    )
  );


-- ============================================================================
-- 10. SHARED_PROCESSES
-- ============================================================================
ALTER TABLE shared_processes ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('shared_processes');

CREATE POLICY "shared_processes_select_org" ON shared_processes
  FOR SELECT TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL)
    AND (
      app_current_role() IN ('admin', 'formateur')
      OR (app_current_role() = 'client' AND visible_client = true)
    )
  );

CREATE POLICY "shared_processes_write_admin_org" ON shared_processes
  FOR ALL TO authenticated
  USING ((organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL) AND app_current_role() = 'admin')
  WITH CHECK ((organisation_id::text = app_current_org_id()::text OR organisation_id IS NULL) AND app_current_role() = 'admin');


-- ============================================================================
-- 11. ORGANISATION_SETTINGS (branding : couleur, logo, etc.)
-- ============================================================================
ALTER TABLE organisation_settings ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('organisation_settings');

CREATE POLICY "org_settings_select_own_org" ON organisation_settings
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text);

CREATE POLICY "org_settings_write_admin_own_org" ON organisation_settings
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin')
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin');


-- ============================================================================
-- 12. AUTOMATION_SETTINGS / AUTOMATION_LOGS
-- ============================================================================
-- Réservé à l'admin de l'organisme (les envois réels passent déjà par les
-- fonctions serverless avec la clé service role, qui bypass RLS de toute façon ;
-- ceci protège les lectures/écritures directes faites depuis le navigateur,
-- ex: AutomationSettingsView qui lit/écrit automation_settings directement).
ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('automation_settings');

CREATE POLICY "automation_settings_admin_own_org" ON automation_settings
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin')
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin');

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('automation_logs');

-- automation_logs n'a pas de colonne organisation_id propre : jointure via
-- automation_settings (même logique que fetchLogs côté code, déjà corrigé).
CREATE POLICY "automation_logs_admin_own_org" ON automation_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM automation_settings s
      WHERE s.id::text = automation_logs.automation_setting_id::text
        AND s.organisation_id::text = app_current_org_id()::text
        AND app_current_role() = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM automation_settings s
      WHERE s.id::text = automation_logs.automation_setting_id::text
        AND s.organisation_id::text = app_current_org_id()::text
        AND app_current_role() = 'admin'
    )
  );


-- ============================================================================
-- 13. MESSAGES (messagerie interne)
-- ============================================================================
-- sender_id/receiver_id contiennent soit utilisateurs.id (entier), soit
-- clients.id (UUID) selon le rôle de l'expéditeur/destinataire — d'où la
-- fonction dédiée app_current_identity_id() plutôt que organisation_id/role.
-- Comme utilisateurs.id (entier) et clients.id (UUID) ne peuvent jamais se
-- chevaucher, la comparaison directe sur l'identité suffit (pas besoin d'un
-- filtre organisation_id supplémentaire).
--
-- IMPORTANT : le type SQL réel de sender_id/receiver_id (TEXT ou UUID selon
-- la table) n'était pas connu avec certitude au moment d'écrire cette
-- migration (aucune migration .sql committée ne crée la table messages —
-- elle a été créée directement dans Supabase Studio). On caste donc
-- explicitement les deux côtés en ::text pour que la policy fonctionne
-- quel que soit le type réel de la colonne, sans dépendre de cette hypothèse.
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('messages');

CREATE POLICY "messages_select_own_conversations" ON messages
  FOR SELECT TO authenticated
  USING (sender_id::text = app_current_identity_id() OR receiver_id::text = app_current_identity_id());

CREATE POLICY "messages_insert_as_self" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id::text = app_current_identity_id());

-- Update : seul le destinataire peut modifier un message (marquage "lu").
CREATE POLICY "messages_update_as_receiver" ON messages
  FOR UPDATE TO authenticated
  USING (receiver_id::text = app_current_identity_id())
  WITH CHECK (receiver_id::text = app_current_identity_id());

CREATE POLICY "messages_delete_own_conversations" ON messages
  FOR DELETE TO authenticated
  USING (sender_id::text = app_current_identity_id() OR receiver_id::text = app_current_identity_id());


-- ============================================================================
-- FIN — nettoyage de la fonction utilitaire de suppression de policies
-- (les fonctions app_current_*() restent : elles sont utilisées en permanence
-- par les policies ci-dessus).
-- ============================================================================
DROP FUNCTION IF EXISTS _drop_all_policies(TEXT);


-- ============================================================================
-- URGENCE — échappatoire temporaire (À N'UTILISER QU'EN DERNIER RECOURS)
-- ============================================================================
-- Si une table précise bloque complètement un flux critique de production et
-- qu'il faut débloquer IMMÉDIATEMENT en attendant un correctif ciblé, on peut
-- désactiver RLS sur CETTE SEULE TABLE (jamais toutes en même temps) :
--
--   ALTER TABLE nom_de_la_table DISABLE ROW LEVEL SECURITY;
--
-- ⚠️ Cela rouvre entièrement cette table à tous les utilisateurs authentifiés
-- (perte totale de l'isolation multi-tenant sur cette table précise) — à ne
-- garder que le temps de corriger la policy fautive, puis réactiver avec :
--
--   ALTER TABLE nom_de_la_table ENABLE ROW LEVEL SECURITY;
-- ============================================================================
