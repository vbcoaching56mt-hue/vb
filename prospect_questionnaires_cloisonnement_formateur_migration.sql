-- Migration : cloisonnement des questionnaires prospect par formateur
-- À exécuter dans Supabase > SQL Editor
--
-- Contexte (signalé le 22/09/2026) : jusqu'ici, tout formateur de l'organisme pouvait voir TOUS
-- les envois de questionnaires prospect (liste "Prospects" ET statistiques par modèle), y compris
-- ceux envoyés par ses collègues formateurs ou par l'admin — la policy RLS "pqe_select_org" ne
-- filtrait que par organisation_id, pas par expéditeur. Cette migration restreint un formateur à
-- ne voir que SES PROPRES envois (envoye_par = lui-même), tandis que l'admin conserve une
-- visibilité complète sur tout l'organisme, comme demandé.
--
-- On réutilise app_current_identity_id(), déjà créée dans rls_hardening_migration.sql, qui
-- retourne l'identifiant (utilisateurs.id, en texte) de l'utilisateur admin/formateur
-- actuellement connecté — pas besoin de créer une nouvelle fonction.
--
-- Important : aucun changement de code applicatif n'est nécessaire et aucun redéploiement
-- Vercel n'est requis. L'écran "Prospects" (liste des envois ET statistiques, qui se base sur
-- la même liste) interroge directement cette table via Supabase avec la session de l'utilisateur
-- connecté : dès que cette policy est en place, la base ne renvoie plus que les lignes
-- autorisées, donc la liste ET les statistiques deviennent automatiquement limitées aux envois
-- du formateur connecté — il suffit d'exécuter ce script.

SELECT _drop_all_policies('prospect_questionnaire_envois');

-- 1. Lecture (SELECT) : admin → tout l'organisme ; formateur → uniquement ses propres envois.
CREATE POLICY "pqe_select_org" ON prospect_questionnaire_envois
  FOR SELECT TO authenticated
  USING (
    organisation_id::text = app_current_org_id()::text
    AND (
      app_current_role() = 'admin'
      OR (app_current_role() = 'formateur' AND envoye_par::text = app_current_identity_id())
    )
  );

-- 2. Écriture (INSERT/UPDATE/DELETE) : même logique, par sécurité supplémentaire — en pratique,
--    les envois sont créés par la fonction serveur api/prospects.js (clé service_role, qui n'est
--    jamais soumise à ces policies), donc ce changement ne modifie aucun comportement actuel de
--    l'application ; il ferme simplement une porte qui n'était pas censée être ouverte.
CREATE POLICY "pqe_write_staff_org" ON prospect_questionnaire_envois
  FOR ALL TO authenticated
  USING (
    organisation_id::text = app_current_org_id()::text
    AND (
      app_current_role() = 'admin'
      OR (app_current_role() = 'formateur' AND envoye_par::text = app_current_identity_id())
    )
  )
  WITH CHECK (
    organisation_id::text = app_current_org_id()::text
    AND (
      app_current_role() = 'admin'
      OR (app_current_role() = 'formateur' AND envoye_par::text = app_current_identity_id())
    )
  );
