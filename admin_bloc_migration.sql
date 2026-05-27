-- Migration : colonne is_administrative pour le Bloc Administratif
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS is_administrative BOOLEAN DEFAULT false;
