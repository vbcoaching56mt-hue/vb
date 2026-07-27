-- Diagnostic en LECTURE SEULE (aucune modification) pour comprendre pourquoi
-- la suppression de modules affiche "succès" mais ne les fait pas disparaître.
-- Copiez-collez chaque bloc et regardez le résultat (ou envoyez-moi une capture).

-- 1. Votre compte admin : quel organisation_id lui est associé ?
SELECT id, nom, email, role, organisation_id, auth_uid
FROM utilisateurs
WHERE role = 'admin'
ORDER BY id;

-- 2. Chaque module existant : à quel organisation_id est-il rattaché ?
SELECT id, nom, organisation_id
FROM modules
ORDER BY id;

-- 3. Les policies RLS actuellement actives sur la table modules
--    (pour vérifier qu'il n'y a pas d'ancienne policy en double qui bloquerait)
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'modules';
