-- Migration : table client_documents (documents sur-mesure par client)
-- À exécuter dans l'éditeur SQL de Supabase

-- 1. Créer la table si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS client_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  template_titre TEXT NOT NULL,
  template_url TEXT,
  destination TEXT DEFAULT 'client',
  ordre INT DEFAULT 0,
  organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ajouter la colonne organisation_id si la table existait déjà sans elle
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL;

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_client_documents_client_id ON client_documents(client_id);

-- 4. RLS
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;

-- Supprimer les policies si elles existent déjà (re-run safe)
DROP POLICY IF EXISTS "client_documents_select" ON client_documents;
DROP POLICY IF EXISTS "client_documents_insert" ON client_documents;
DROP POLICY IF EXISTS "client_documents_update" ON client_documents;
DROP POLICY IF EXISTS "client_documents_delete" ON client_documents;

-- Lecture : client voit ses propres entrées ; admins/formateurs voient celles de leur org
CREATE POLICY "client_documents_select" ON client_documents
  FOR SELECT USING (
    client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND u.organisation_id = client_documents.organisation_id
    )
  );

-- Insertion : admins et formateurs uniquement
CREATE POLICY "client_documents_insert" ON client_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Mise à jour : admins et formateurs uniquement
CREATE POLICY "client_documents_update" ON client_documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- Suppression : admins et formateurs uniquement
CREATE POLICY "client_documents_delete" ON client_documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM utilisateurs u
      WHERE u.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
