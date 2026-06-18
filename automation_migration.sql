-- Migration : Système de relances automatiques
-- À exécuter dans Supabase > SQL Editor

-- Table des paramètres de relance configurés par l'Admin
CREATE TABLE IF NOT EXISTS automation_settings (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_type  TEXT        NOT NULL CHECK (trigger_type IN ('no_signature', 'welcome', 'reminder_before_session')),
  delay_days    INTEGER     NOT NULL DEFAULT 3,
  email_subject TEXT        NOT NULL DEFAULT '',
  email_body    TEXT        NOT NULL DEFAULT '',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Table des envois effectués (anti-doublon + historique)
CREATE TABLE IF NOT EXISTS automation_logs (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  automation_setting_id UUID        REFERENCES automation_settings(id) ON DELETE CASCADE,
  client_id             UUID,
  client_email          TEXT,
  reference_id          TEXT,
  reference_type        TEXT,
  sent_at               TIMESTAMPTZ DEFAULT NOW(),
  status                TEXT        DEFAULT 'sent'
);

-- Index pour vérification rapide des doublons
CREATE INDEX IF NOT EXISTS idx_automation_logs_dedup
  ON automation_logs(automation_setting_id, reference_id, client_id);

-- RLS : accès réservé au service role (appelé uniquement depuis les fonctions Vercel)
ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs     ENABLE ROW LEVEL SECURITY;

-- Les fonctions Vercel utilisent la service_role_key qui bypass le RLS.
-- On ouvre la lecture pour les utilisateurs authentifiés (pour l'UI Admin).
CREATE POLICY "authenticated_read_settings"
  ON automation_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_write_settings"
  ON automation_settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_logs"
  ON automation_logs FOR SELECT
  USING (auth.role() = 'authenticated');
