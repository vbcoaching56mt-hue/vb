-- Mises à jour pour la nouvelle modale Fiche Métier Expert
ALTER TABLE public.job_sheets ADD COLUMN IF NOT EXISTS career_evolution TEXT;
ALTER TABLE public.job_sheets ADD COLUMN IF NOT EXISTS working_conditions TEXT;
ALTER TABLE public.job_sheets ADD COLUMN IF NOT EXISTS qualities TEXT;
