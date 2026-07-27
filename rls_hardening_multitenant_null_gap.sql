-- ============================================================================
-- Fermeture définitive de la faille multi-tenant "organisation_id IS NULL"
-- au niveau base de données (RLS) — 2026-07-27
-- À exécuter dans Supabase SQL Editor, APRÈS avoir lancé backfill_orphan_organisation_id.sql
-- (sinon les modules/documents/processus historiques de VB Coaching deviendraient
-- invisibles pour tout le monde, le temps de relancer le backfill).
--
-- CONTEXTE : le correctif précédent a durci le code de l'application (front-end),
-- qui ne demande plus jamais "mon organisme OU organisme vide". Mais la vraie
-- barrière de sécurité n'est pas le code de l'app — c'est la Row Level Security (RLS)
-- de la base de données : même si un attaquant contournait complètement l'interface
-- et interrogeait directement l'API avec son propre jeton de connexion valide, RLS
-- doit à elle seule garantir qu'il ne peut jamais lire/modifier les données d'un
-- AUTRE organisme. Or les policies RLS de 4 tables (modules, module_session_templates,
-- module_step_resources, shared_processes) contenaient exactement la même tolérance
-- "OR organisation_id IS NULL", pour la même raison historique. Ce script la retire.
--
-- Ce script corrige aussi un oubli distinct : la table job_sheets (fiches métiers
-- personnalisées créées par un organisme) n'avait AUCUNE Row Level Security activée
-- du tout — une note dans la migration précédente supposait à tort qu'il s'agissait
-- d'un catalogue générique partagé sans donnée propre à un organisme, alors que le
-- code crée bien une ligne par organisme (organisation_id toujours renseigné à la
-- création). Ce script active RLS dessus avec le même cloisonnement strict.
-- ============================================================================

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

-- ============================================================================
-- 1. MODULES / MODULE_SESSION_TEMPLATES / MODULE_STEP_RESOURCES
-- Retire la tolérance "OR organisation_id IS NULL" : après le backfill, plus
-- aucune ligne légitime n'a organisation_id NULL, donc cette tolérance n'existe
-- plus que comme trou de sécurité potentiel pour de futures lignes mal taguées.
-- ============================================================================
SELECT _drop_all_policies('modules');

CREATE POLICY "modules_select_org" ON modules
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text);

CREATE POLICY "modules_write_staff_org" ON modules
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));

SELECT _drop_all_policies('module_session_templates');

CREATE POLICY "mst_select_org" ON module_session_templates
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text);

CREATE POLICY "mst_write_staff_org" ON module_session_templates
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));

SELECT _drop_all_policies('module_step_resources');

CREATE POLICY "msr_select_org" ON module_step_resources
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text);

CREATE POLICY "msr_write_staff_org" ON module_step_resources
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));

-- ============================================================================
-- 2. SHARED_PROCESSES — même correctif.
-- ============================================================================
SELECT _drop_all_policies('shared_processes');

CREATE POLICY "shared_processes_select_org" ON shared_processes
  FOR SELECT TO authenticated
  USING (organisation_id::text = app_current_org_id()::text);

CREATE POLICY "shared_processes_write_admin_org" ON shared_processes
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin')
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() = 'admin');

-- ============================================================================
-- 3. JOB_SHEETS — activation de RLS (absente jusqu'ici). Un admin/formateur ne
-- voit/modifie que les fiches créées par son propre organisme ; un client ne
-- voit que les fiches qui lui ont été explicitement assignées (via client_job_sheets),
-- même si cette fiche appartient à un autre organisme que le sien (cas très rare
-- en pratique, mais géré proprement).
-- ============================================================================
ALTER TABLE job_sheets ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('job_sheets');

CREATE POLICY "job_sheets_select_staff_org_or_assigned_client" ON job_sheets
  FOR SELECT TO authenticated
  USING (
    (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
    OR EXISTS (
      SELECT 1 FROM client_job_sheets cjs
      WHERE cjs.job_sheet_id = job_sheets.id
        AND cjs.client_id::text = auth.uid()::text
    )
  );

CREATE POLICY "job_sheets_write_staff_org" ON job_sheets
  FOR ALL TO authenticated
  USING (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'))
  WITH CHECK (organisation_id::text = app_current_org_id()::text AND app_current_role() IN ('admin', 'formateur'));

-- ============================================================================
-- VÉRIFICATION — reconnectez-vous et testez dans l'ordre :
--   1. Espace admin VB Coaching : les modules/documents/processus/fiches métiers
--      historiques doivent toujours être visibles (grâce au backfill préalable).
--   2. Second organisme (le nouveau que vous avez créé) : le module
--      "Bilan de Compétences 24h" de VB Coaching ne doit PLUS apparaître.
--   3. Un client : ses fiches métiers assignées doivent toujours s'afficher.
-- Si un flux casse, ne relancez rien à l'aveugle — dites-le-moi d'abord.
-- ============================================================================
