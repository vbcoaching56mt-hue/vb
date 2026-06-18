-- Migration : colonnes de consentement interactif pour la table documents
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS is_interactive_consent BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS document_choice TEXT CHECK (document_choice IN ('autorise', 'refuse'));
