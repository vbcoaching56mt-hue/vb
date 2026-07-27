-- ============================================================================
-- Intégration Google Agenda (2026-07-27)
-- À exécuter dans Supabase SQL Editor.
-- Crée les deux tables nécessaires à la connexion OAuth (calendar_connections)
-- et au suivi des évènements déjà créés dans Google Agenda (calendar_synced_events),
-- avec RLS activée sur les deux.
--
-- Ce script est autonome : il (re)crée aussi les deux fonctions utilitaires
-- _drop_all_policies() et app_current_identity_id() avec CREATE OR REPLACE,
-- donc il fonctionne que la migration de sécurité du 2026-07-23 ait été
-- appliquée ou non (si elle l'a déjà été, ceci les remplace à l'identique,
-- aucun risque).
-- ============================================================================

CREATE OR REPLACE FUNCTION _drop_all_policies(target_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target_table LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, target_table);
  END LOOP;
END;
$$;

-- Identité "texte" partagée : mélange utilisateurs.id (entier, admin/formateur) et
-- clients.id (UUID, client) selon qui est connecté — cast en texte pour comparer les deux.
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

GRANT EXECUTE ON FUNCTION app_current_identity_id() TO authenticated, anon;

CREATE TABLE IF NOT EXISTS calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,                 -- utilisateurs.id (entier, formateur/admin) ou clients.id (UUID), stocké en texte
  role TEXT NOT NULL CHECK (role IN ('client', 'formateur', 'admin')),
  provider TEXT NOT NULL DEFAULT 'google',
  connected_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (owner_id, provider)
);

CREATE TABLE IF NOT EXISTS calendar_synced_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  numero_seance INTEGER NOT NULL,
  owner_id TEXT NOT NULL,                 -- à qui appartient cet évènement Google Agenda (client_id ou formateur id, en texte)
  google_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (client_id, numero_seance, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_owner ON calendar_connections(owner_id);
CREATE INDEX IF NOT EXISTS idx_calendar_synced_events_owner ON calendar_synced_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_calendar_synced_events_client_seance ON calendar_synced_events(client_id, numero_seance);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Réutilise app_current_identity_id(), déjà créée par la migration RLS du 2026-07-23
-- (mélange utilisateurs.id entier et clients.id UUID selon le rôle, castés en texte).

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('calendar_connections');

-- Chacun peut voir sa propre connexion (pour afficher "Connecté : email@..." dans Mon Profil)
-- et la supprimer soi-même (bouton "Déconnecter"). Aucune policy INSERT/UPDATE pour
-- "authenticated" : seule la fonction serverless (clé service_role, qui contourne RLS)
-- peut écrire les tokens — un utilisateur connecté ne peut donc jamais falsifier ses
-- propres tokens depuis le client.
CREATE POLICY "calendar_connections_select_own" ON calendar_connections
  FOR SELECT TO authenticated
  USING (owner_id = app_current_identity_id());

CREATE POLICY "calendar_connections_delete_own" ON calendar_connections
  FOR DELETE TO authenticated
  USING (owner_id = app_current_identity_id());

ALTER TABLE calendar_synced_events ENABLE ROW LEVEL SECURITY;
SELECT _drop_all_policies('calendar_synced_events');

-- Lecture seule pour son propre suivi d'évènements (pas d'usage direct côté front pour
-- l'instant, mais garde la table cohérente avec le reste du modèle de sécurité).
CREATE POLICY "calendar_synced_events_select_own" ON calendar_synced_events
  FOR SELECT TO authenticated
  USING (owner_id = app_current_identity_id());
