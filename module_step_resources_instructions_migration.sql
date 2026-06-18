-- Migration : colonne instructions (énoncé exercice) pour la table module_step_resources
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE module_step_resources
ADD COLUMN IF NOT EXISTS instructions TEXT;
