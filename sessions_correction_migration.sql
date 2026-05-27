-- Migration : colonnes de correction pour la table sessions
-- À exécuter dans l'éditeur SQL de Supabase

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS correction_statut TEXT CHECK (correction_statut IN ('Validé', 'À corriger')),
ADD COLUMN IF NOT EXISTS correction_commentaire TEXT;
