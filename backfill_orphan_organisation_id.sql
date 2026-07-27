-- ============================================================================
-- Rattachement des lignes historiques "orphelines" (organisation_id NULL) à leur
-- organisme d'origine (2026-07-27)
-- À exécuter dans Supabase SQL Editor, EN 2 TEMPS (voir ci-dessous).
--
-- CONTEXTE : plusieurs tables ont été rendues multi-tenant (colonne organisation_id
-- ajoutée) après coup. Les lignes créées AVANT cet ajout sont restées avec
-- organisation_id = NULL. Le code de l'application tolérait jusqu'ici ces lignes NULL
-- pour ne pas casser l'accès du tout premier organisme à ses propres données
-- historiques — mais cela signifiait aussi que TOUT nouvel organisme créé voyait ces
-- mêmes lignes (modules, documents, processus partagés... appartenant en réalité au
-- tout premier organisme, VB Coaching). C'est exactement le problème remonté : le
-- module "Bilan de Compétences 24h" de VB Coaching apparaissant dans un second
-- organisme fraîchement créé.
--
-- CORRECTIF EN 2 PARTIES :
--   1. Ce script SQL : rattache toutes les lignes NULL à l'organisme d'origine.
--   2. Le code de l'application (déjà livré séparément) : chaque requête qui tolérait
--      "organisation_id = mon_organisme OU organisation_id IS NULL" a été durcie en
--      "organisation_id = mon_organisme" strictement. Lancez ce script AVANT de
--      déployer le nouveau code (ou juste après, mais sans tarder), sinon le
--      durcissement ferait perdre l'accès de VB Coaching à ses propres données.
-- ============================================================================

-- ── ÉTAPE 1 : identifier l'organisme d'origine ─────────────────────────────────
-- Exécutez uniquement cette requête d'abord, et repérez la ligne "VB Coaching"
-- (ou le nom de votre organisme d'origine) : notez sa colonne "id" (un UUID).
SELECT id, nom FROM organisations ORDER BY nom;

-- ── ÉTAPE 2 : backfill ─────────────────────────────────────────────────────────
-- Remplacez 'COLLEZ_ICI_L_ID_DE_VB_COACHING' ci-dessous par l'UUID noté à l'étape 1,
-- PARTOUT où il apparaît (9 lignes), puis exécutez ce bloc.

DO $$
DECLARE
  origin_org_id UUID := 'COLLEZ_ICI_L_ID_DE_VB_COACHING';
BEGIN
  UPDATE modules SET organisation_id = origin_org_id WHERE organisation_id IS NULL;
  UPDATE module_session_templates SET organisation_id = origin_org_id WHERE organisation_id IS NULL;
  UPDATE module_step_resources SET organisation_id = origin_org_id WHERE organisation_id IS NULL;
  UPDATE documents SET organisation_id = origin_org_id WHERE organisation_id IS NULL;
  UPDATE sessions SET organisation_id = origin_org_id WHERE organisation_id IS NULL;
  UPDATE utilisateurs SET organisation_id = origin_org_id WHERE organisation_id IS NULL;
  UPDATE clients SET organisation_id = origin_org_id WHERE organisation_id IS NULL;
  UPDATE shared_processes SET organisation_id = origin_org_id WHERE organisation_id IS NULL;
  UPDATE job_sheets SET organisation_id = origin_org_id WHERE organisation_id IS NULL;

  RAISE NOTICE 'Backfill terminé — organisme d''origine utilisé : %', origin_org_id;
END $$;

-- ── ÉTAPE 3 : vérification (doit renvoyer 0 partout) ───────────────────────────
SELECT 'modules' AS table_name, count(*) FROM modules WHERE organisation_id IS NULL
UNION ALL
SELECT 'module_session_templates', count(*) FROM module_session_templates WHERE organisation_id IS NULL
UNION ALL
SELECT 'module_step_resources', count(*) FROM module_step_resources WHERE organisation_id IS NULL
UNION ALL
SELECT 'documents', count(*) FROM documents WHERE organisation_id IS NULL
UNION ALL
SELECT 'sessions', count(*) FROM sessions WHERE organisation_id IS NULL
UNION ALL
SELECT 'utilisateurs', count(*) FROM utilisateurs WHERE organisation_id IS NULL
UNION ALL
SELECT 'clients', count(*) FROM clients WHERE organisation_id IS NULL
UNION ALL
SELECT 'shared_processes', count(*) FROM shared_processes WHERE organisation_id IS NULL
UNION ALL
SELECT 'job_sheets', count(*) FROM job_sheets WHERE organisation_id IS NULL;
