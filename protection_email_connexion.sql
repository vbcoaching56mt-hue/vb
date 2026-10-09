-- ============================================================================
-- Migration (2026-10-09) : l'adresse email de connexion ne peut plus être effacée
-- À exécuter dans Supabase > SQL Editor (une seule fois).
--
-- Incident : le profil administrateur de VB Coaching (id 22) a perdu son adresse email
-- (champ vidé en enregistrant la page Paramètres). À la connexion, SkorUp cherchait le
-- profil par email : ne le trouvant plus, il affichait « Finaliser votre espace ».
--
-- 1. Remet l'adresse du compte VB Coaching (uniquement si elle est vide).
-- 2. Verrou en base : une adresse email déjà renseignée ne peut plus être remplacée par
--    du vide — ni pour l'équipe (utilisateurs.email), ni pour les clients
--    (clients.email_contact). Toute tentative garde simplement l'ancienne adresse.
--    (Changer une adresse pour une AUTRE adresse reste possible.)
-- ============================================================================

-- 1. Réparation du compte VB Coaching
UPDATE utilisateurs
SET email = 'vbcoaching56@gmail.com'
WHERE id = 22
  AND role = 'admin'
  AND coalesce(trim(email), '') = ''
  AND auth_uid::text = (SELECT id::text FROM auth.users WHERE email = 'vbcoaching56@gmail.com');

-- 2a. Verrou sur les comptes de l'équipe (admin / formateurs)
CREATE OR REPLACE FUNCTION public.garder_email_utilisateur()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(trim(NEW.email), '') = '' AND coalesce(trim(OLD.email), '') <> '' THEN
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_garder_email_utilisateur ON utilisateurs;
CREATE TRIGGER trg_garder_email_utilisateur
  BEFORE UPDATE OF email ON utilisateurs
  FOR EACH ROW EXECUTE FUNCTION public.garder_email_utilisateur();

-- 2b. Verrou sur les clients (leur connexion dépend aussi de leur adresse)
CREATE OR REPLACE FUNCTION public.garder_email_client()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(trim(NEW.email_contact), '') = '' AND coalesce(trim(OLD.email_contact), '') <> '' THEN
    NEW.email_contact := OLD.email_contact;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_garder_email_client ON clients;
CREATE TRIGGER trg_garder_email_client
  BEFORE UPDATE OF email_contact ON clients
  FOR EACH ROW EXECUTE FUNCTION public.garder_email_client();

-- Vérification : doit afficher « 22 | Véronique Boulais | vbcoaching56@gmail.com | admin »
SELECT id, nom, email, role FROM utilisateurs WHERE id = 22;
