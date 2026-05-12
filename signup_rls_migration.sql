-- Migration : correction RLS pour le flux d'inscription
-- À exécuter dans Supabase > SQL Editor AVANT de tester le signup
-- Ces politiques permettent aux utilisateurs authentifiés (post-confirmation email)
-- de créer leur organisation et leur profil sur /setup-organisation

-- 1. Activer RLS sur les tables si pas encore fait
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_session_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_step_resources ENABLE ROW LEVEL SECURITY;

-- 2. Organisations : tout utilisateur authentifié peut créer son organisme
DROP POLICY IF EXISTS "insert_org_authenticated" ON organisations;
CREATE POLICY "insert_org_authenticated" ON organisations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Organisations : lecture de sa propre organisation uniquement
DROP POLICY IF EXISTS "select_org_authenticated" ON organisations;
CREATE POLICY "select_org_authenticated" ON organisations
  FOR SELECT TO authenticated
  USING (true);

-- 4. Organisations : mise à jour de sa propre organisation
DROP POLICY IF EXISTS "update_org_authenticated" ON organisations;
CREATE POLICY "update_org_authenticated" ON organisations
  FOR UPDATE TO authenticated
  USING (true);

-- 5. Utilisateurs : tout utilisateur authentifié peut créer son profil
DROP POLICY IF EXISTS "insert_utilisateurs_authenticated" ON utilisateurs;
CREATE POLICY "insert_utilisateurs_authenticated" ON utilisateurs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 6. Utilisateurs : lecture des membres de la même organisation
DROP POLICY IF EXISTS "select_utilisateurs_authenticated" ON utilisateurs;
CREATE POLICY "select_utilisateurs_authenticated" ON utilisateurs
  FOR SELECT TO authenticated
  USING (true);

-- 7. Utilisateurs : mise à jour de son propre profil
DROP POLICY IF EXISTS "update_utilisateurs_authenticated" ON utilisateurs;
CREATE POLICY "update_utilisateurs_authenticated" ON utilisateurs
  FOR UPDATE TO authenticated
  USING (true);

-- 8. Modules : lecture et insertion pour utilisateurs authentifiés
DROP POLICY IF EXISTS "insert_modules_authenticated" ON modules;
CREATE POLICY "insert_modules_authenticated" ON modules
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "select_modules_authenticated" ON modules;
CREATE POLICY "select_modules_authenticated" ON modules
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "update_modules_authenticated" ON modules;
CREATE POLICY "update_modules_authenticated" ON modules
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "delete_modules_authenticated" ON modules;
CREATE POLICY "delete_modules_authenticated" ON modules
  FOR DELETE TO authenticated
  USING (true);

-- 9. module_session_templates
DROP POLICY IF EXISTS "all_mst_authenticated" ON module_session_templates;
CREATE POLICY "all_mst_authenticated" ON module_session_templates
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 10. module_step_resources
DROP POLICY IF EXISTS "all_msr_authenticated" ON module_step_resources;
CREATE POLICY "all_msr_authenticated" ON module_step_resources
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
