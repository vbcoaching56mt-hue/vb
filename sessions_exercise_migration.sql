-- Migration : colonnes instructions (énoncé exercice) et position (ordre drag & drop)
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS instructions TEXT,
ADD COLUMN IF NOT EXISTS position INTEGER;
