-- ============================================================================
-- Migration (2026-10-02) : envoyer un questionnaire / quiz directement à un client
-- À exécuter dans Supabase > SQL Editor (une seule fois).
--
-- Jusqu'ici, un questionnaire ou un quiz n'arrivait chez un client que s'il faisait
-- partie de son module (ou d'un groupe de documents). Cette table permet à l'organisme
-- de l'envoyer à la main depuis la fiche client, onglet "Questionnaires".
-- Les réponses restent enregistrées dans questionnaire_responses, comme avant : elles
-- apparaissent donc aussi dans les statistiques de l'onglet "Questionnaires & Quiz".
-- ============================================================================

-- 1. Table (le type de questionnaire_id est repris automatiquement de module_step_resources.id)
DO $$
DECLARE
  v_id_type text;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO v_id_type
  FROM pg_attribute
  WHERE attrelid = 'public.module_step_resources'::regclass AND attname = 'id';

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS public.questionnaire_assignments (
      id               bigserial PRIMARY KEY,
      client_id        uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
      questionnaire_id %s NOT NULL REFERENCES public.module_step_resources(id) ON DELETE CASCADE,
      organisation_id  uuid,
      assigned_at      timestamptz NOT NULL DEFAULT now(),
      UNIQUE (client_id, questionnaire_id)
    )$f$, v_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_questionnaire_assignments_client ON public.questionnaire_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_assignments_org ON public.questionnaire_assignments(organisation_id);

GRANT SELECT, INSERT, DELETE ON public.questionnaire_assignments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.questionnaire_assignments_id_seq TO authenticated;

-- 2. Sécurité (RLS)
ALTER TABLE public.questionnaire_assignments ENABLE ROW LEVEL SECURITY;

-- Lecture : l'organisme (admin / formateur) pour ses clients, ou le client pour lui-même
DROP POLICY IF EXISTS "qa_select_staff_or_self" ON public.questionnaire_assignments;
CREATE POLICY "qa_select_staff_or_self" ON public.questionnaire_assignments
  FOR SELECT TO authenticated
  USING (
    (organisation_id::text = (SELECT app_current_org_id())::text AND (SELECT app_current_role()) IN ('admin', 'formateur'))
    OR client_id::text = auth.uid()::text
  );

-- Envoi : uniquement l'organisme, et uniquement à un client de CET organisme
DROP POLICY IF EXISTS "qa_insert_staff_own_org" ON public.questionnaire_assignments;
CREATE POLICY "qa_insert_staff_own_org" ON public.questionnaire_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT app_current_role()) IN ('admin', 'formateur')
    AND organisation_id::text = (SELECT app_current_org_id())::text
    AND EXISTS (SELECT 1 FROM public.clients c
                WHERE c.id = client_id AND c.organisation_id::text = (SELECT app_current_org_id())::text)
  );

-- Retrait : uniquement l'organisme
DROP POLICY IF EXISTS "qa_delete_staff_own_org" ON public.questionnaire_assignments;
CREATE POLICY "qa_delete_staff_own_org" ON public.questionnaire_assignments
  FOR DELETE TO authenticated
  USING (
    (SELECT app_current_role()) IN ('admin', 'formateur')
    AND organisation_id::text = (SELECT app_current_org_id())::text
  );

-- Vérification : doit renvoyer 1 ligne "questionnaire_assignments"
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'questionnaire_assignments';
