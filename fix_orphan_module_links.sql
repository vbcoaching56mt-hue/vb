-- 1. LECTURE SEULE d'abord : regarde qui est encore rattaché à quel module.
--    Lancée depuis le SQL Editor de Supabase, cette requête voit TOUT (y compris les
--    comptes historiques sans organisation_id, invisibles à l'application elle-même).
SELECT u.id, u.nom, u.email, u.role, u.organisation_id, u.module_id, m.nom AS nom_module
FROM utilisateurs u
JOIN modules m ON m.id = u.module_id
ORDER BY u.module_id, u.id;

SELECT c.id, c.nom_complet, c.organisation_id, c.module_id, m.nom AS nom_module
FROM clients c
JOIN modules m ON m.id = c.module_id
ORDER BY c.module_id, c.id;

-- 2. Une fois que vous avez repéré la ou les lignes à corriger dans les résultats
--    ci-dessus (typiquement un compte avec organisation_id vide), décommentez et
--    adaptez UNE des lignes suivantes avec l'id exact du compte concerné, puis
--    lancez-la séparément. Ça détache le compte du module SANS rien supprimer
--    d'autre (juste module_id repasse à NULL, "Aucun module assigné").

-- UPDATE utilisateurs SET module_id = NULL WHERE id = REMPLACER_PAR_ID;
-- UPDATE clients SET module_id = NULL WHERE id = 'REMPLACER_PAR_ID';

-- Vous pouvez ensuite retourner dans l'application et supprimer le module normalement.
