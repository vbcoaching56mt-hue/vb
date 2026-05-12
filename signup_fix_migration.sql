-- Fix signup : supprime les triggers sur auth.users qui causent "Database error saving new user"
-- À exécuter dans Supabase > SQL Editor

-- 1. Supprimer tout trigger qui tente d'auto-créer un profil dans utilisateurs
--    Ces triggers échouent car organisation_id n'est pas encore connu au moment de l'auth.signUp
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_profile_for_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_signup() CASCADE;

-- 2. Politique RLS : autoriser le service role à insérer dans organisations et utilisateurs
--    (supabaseAdmin utilise le service role key → bypass RLS automatique, mais au cas où)
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;

-- 3. Politique : les utilisateurs authentifiés peuvent lire leur propre organisation
DROP POLICY IF EXISTS "select_own_org" ON organisations;
CREATE POLICY "select_own_org" ON organisations
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT organisation_id FROM utilisateurs WHERE email = auth.email())
  );

-- 4. Politique : les utilisateurs authentifiés peuvent lire les utilisateurs de leur organisation
DROP POLICY IF EXISTS "select_own_utilisateurs" ON utilisateurs;
CREATE POLICY "select_own_utilisateurs" ON utilisateurs
  FOR SELECT TO authenticated
  USING (
    organisation_id IN (SELECT organisation_id FROM utilisateurs WHERE email = auth.email())
  );

-- 5. Politique : autoriser l'insertion dans utilisateurs pour le service role (signup)
--    Le service role bypass déjà RLS, mais ceci sécurise aussi les futurs usages
DROP POLICY IF EXISTS "insert_utilisateurs_service" ON utilisateurs;
CREATE POLICY "insert_utilisateurs_service" ON utilisateurs
  FOR INSERT TO service_role
  WITH CHECK (true);
