-- HOTFIX 2 : renforce les fonctions app_current_org_id()/app_current_role()/
-- app_current_identity_id() avec un repli par email quand auth_uid est NULL.
-- Ne touche à AUCUNE policy ni AUCUNE table — juste les 3 fonctions.
-- À lancer APRÈS le hotfix_backfill_auth_uid.sql (celui-ci est un filet de
-- sécurité en plus, pas un remplacement du backfill).

CREATE OR REPLACE FUNCTION app_current_org_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT organisation_id FROM utilisateurs WHERE auth_uid::text = auth.uid()::text
  UNION ALL
  SELECT organisation_id FROM utilisateurs WHERE auth_uid IS NULL AND email = auth.email()
  UNION ALL
  SELECT organisation_id FROM clients WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_current_role()
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT role FROM utilisateurs WHERE auth_uid::text = auth.uid()::text
  UNION ALL
  SELECT role FROM utilisateurs WHERE auth_uid IS NULL AND email = auth.email()
  UNION ALL
  SELECT 'client' FROM clients WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_current_identity_id()
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT id::text FROM utilisateurs WHERE auth_uid::text = auth.uid()::text
  UNION ALL
  SELECT id::text FROM utilisateurs WHERE auth_uid IS NULL AND email = auth.email()
  UNION ALL
  SELECT id::text FROM clients WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;
