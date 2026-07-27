-- ============================================================================
-- Signature "Organisme" sur les documents (2026-07-27)
-- À exécuter dans Supabase SQL Editor.
--
-- Ajoute à la table documents les 3 colonnes miroir de ce qui existe déjà
-- pour client/formateur, afin qu'un admin de l'organisme puisse signer un
-- document "pour l'organisme" (n'importe quel admin de l'organisation,
-- premier arrivé signe) :
--   - signe_par_organisme      (booléen, défaut false)
--   - date_signature_organisme (date/heure de signature)
--   - signature_organisme      (image de signature, en base64, comme les 2 autres)
--
-- Idempotent : IF NOT EXISTS partout, aucun risque à relancer ce script.
-- ============================================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS signe_par_organisme BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS date_signature_organisme TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS signature_organisme TEXT;

-- Vérification (doit renvoyer les 3 nouvelles colonnes) :
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'documents' AND column_name LIKE '%organisme%';
