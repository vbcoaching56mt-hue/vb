-- Migration : colonne auth_uid (UUID Supabase Auth) sur utilisateurs
-- + colonne formateur_auth_uid (UUID) sur clients pour les balises de documents
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Ajouter auth_uid sur utilisateurs (UUID du compte Supabase Auth)
ALTER TABLE utilisateurs
ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE;

-- 2. Ajouter formateur_auth_uid sur clients (UUID du formateur assigné)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS formateur_auth_uid UUID REFERENCES utilisateurs(auth_uid) ON DELETE SET NULL;

-- 3. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_utilisateurs_auth_uid ON utilisateurs(auth_uid);
CREATE INDEX IF NOT EXISTS idx_clients_formateur_auth_uid ON clients(formateur_auth_uid);

-- NOTE : Après avoir exécuté cette migration, les nouveaux formateurs invités
-- auront leur auth_uid automatiquement renseigné via le code de l'application.
-- Pour les formateurs existants, mettre à jour manuellement via :
-- UPDATE utilisateurs SET auth_uid = '<uuid-auth>' WHERE email = '<email>';
