-- Migration SaaS : table organisations + organisation_id sur toutes les tables clés
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Table organisations
CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  plan TEXT DEFAULT 'starter',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Ajout de organisation_id sur les tables clés
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL;

-- 3. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_utilisateurs_org_id ON utilisateurs(organisation_id);
CREATE INDEX IF NOT EXISTS idx_clients_org_id ON clients(organisation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_org_id ON sessions(organisation_id);
CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(organisation_id);
CREATE INDEX IF NOT EXISTS idx_modules_org_id ON modules(organisation_id);
