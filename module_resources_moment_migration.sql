-- Migration : colonnes module_id et moment pour les ressources de début/fin de parcours
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE module_step_resources
ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES modules(id),
ADD COLUMN IF NOT EXISTS moment TEXT CHECK (moment IN ('debut', 'fin'));
