-- Migration : ajout de la colonne document_choice pour l'Attestation d'autorisation de conservation
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS document_choice TEXT CHECK (document_choice IN ('autorise', 'refuse'));
