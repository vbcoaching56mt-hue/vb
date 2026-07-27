-- HOTFIX URGENT : remplit auth_uid pour les comptes utilisateurs existants qui
-- ont été créés avant que cette colonne soit systématiquement renseignée.
-- Sans auth_uid, les nouvelles policies RLS ne peuvent pas identifier ces
-- comptes, ce qui les bloque à la connexion (redirection vers "Finaliser
-- votre espace" comme si c'était un tout nouveau compte).
--
-- Sans risque : ne touche QUE les lignes où auth_uid est actuellement NULL,
-- et les relie à leur compte Supabase Auth via l'email (qui est unique).

UPDATE utilisateurs
SET auth_uid = u.id
FROM auth.users u
WHERE utilisateurs.email = u.email
  AND utilisateurs.auth_uid IS NULL;

-- Vérification : cette requête doit maintenant renvoyer 0 ligne si tout est
-- corrigé (sinon elle liste les comptes encore orphelins, à examiner un par un) :
SELECT id, nom, email, role, auth_uid
FROM utilisateurs
WHERE auth_uid IS NULL;
