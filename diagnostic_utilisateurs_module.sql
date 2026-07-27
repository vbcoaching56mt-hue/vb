-- Diagnostic en LECTURE SEULE : trouver quel(s) compte(s) utilisateur (formateur/admin)
-- sont encore rattachés à un module, ce qui empêche sa suppression (contrainte
-- utilisateurs_module_id_fkey). Certains de ces comptes peuvent être invisibles à
-- l'application elle-même si leur organisation_id est vide (NULL) — cette requête
-- (lancée ici avec les droits complets de l'éditeur SQL) les montre tous, sans exception.

SELECT u.id, u.nom, u.email, u.role, u.organisation_id, u.module_id, m.nom AS nom_module
FROM utilisateurs u
JOIN modules m ON m.id = u.module_id
ORDER BY u.module_id, u.id;
