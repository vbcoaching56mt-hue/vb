-- ============================================================================
-- Migration (2026-10-02) : documents internes du dossier client invisibles du client
-- À exécuter dans Supabase > SQL Editor (une seule fois).
--
-- Contexte : l'onglet "Administratif" d'une fiche client (côté formateur ET côté
-- organisme) sert à échanger des documents internes entre l'organisme et le formateur
-- (factures, justificatifs...). Ces documents sont enregistrés dans `documents` avec
-- user_id = le client, un type "dossier" (Administratif, Contrat, Mission, Pièce
-- justificative, Autre) et visible_client = false.
-- L'interface ne les montrait jamais au client, MAIS la policy RLS
-- "documents_select_staff_org_or_own_client" autorisait le client à lire toutes les
-- lignes où user_id = lui-même : les noms et liens de ces documents arrivaient donc
-- dans son navigateur (visibles avec les outils de développement), et il pouvait
-- même les modifier (policy UPDATE identique).
--
-- Correctif : policies RESTRICTIVES (elles s'ajoutent en "ET" à toutes les policies
-- existantes, quel que soit leur nom) qui empêchent un client de lire ou modifier un
-- document interne. Admins et formateurs ne sont pas concernés ; les fonctions
-- serveur (service_role) non plus. Les documents destinés au client
-- (visible_client = true) restent accessibles normalement.
-- ============================================================================

DROP POLICY IF EXISTS "documents_internes_jamais_client_select" ON documents;
CREATE POLICY "documents_internes_jamais_client_select" ON documents
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    coalesce((SELECT app_current_role()), '') IN ('admin', 'formateur')
    OR NOT (
      coalesce(visible_client, false) = false
      AND type_document IN ('Administratif', 'Contrat', 'Mission', 'Pièce justificative', 'Autre')
    )
  );

DROP POLICY IF EXISTS "documents_internes_jamais_client_update" ON documents;
CREATE POLICY "documents_internes_jamais_client_update" ON documents
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    coalesce((SELECT app_current_role()), '') IN ('admin', 'formateur')
    OR NOT (
      coalesce(visible_client, false) = false
      AND type_document IN ('Administratif', 'Contrat', 'Mission', 'Pièce justificative', 'Autre')
    )
  )
  WITH CHECK (
    coalesce((SELECT app_current_role()), '') IN ('admin', 'formateur')
    OR NOT (
      coalesce(visible_client, false) = false
      AND type_document IN ('Administratif', 'Contrat', 'Mission', 'Pièce justificative', 'Autre')
    )
  );

-- Vérification : doit lister les 2 policies ci-dessus (permissive = RESTRICTIVE)
SELECT policyname, permissive, cmd
FROM pg_policies
WHERE tablename = 'documents'
ORDER BY permissive DESC, policyname;
