-- Migration Multi-Tenant : paramètres organisme + isolation job_sheets
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Champs organisme sur la table organisations
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS nda TEXT;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS site_web TEXT;

-- 2. Isolation Multi-Tenant : organisation_id sur job_sheets
ALTER TABLE job_sheets ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_job_sheets_org_id ON job_sheets(organisation_id);

-- 3. Bucket storage pour les logos (à créer manuellement dans Supabase > Storage)
-- Nom du bucket : "logos"
-- Accès : public
-- Politique : permettre l'upload aux utilisateurs authentifiés
