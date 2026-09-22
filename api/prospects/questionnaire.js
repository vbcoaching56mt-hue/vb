// api/prospects/questionnaire.js
//
// Route PUBLIQUE (aucune authentification Supabase) : c'est elle que le prospect sans compte
// SkorUp appelle depuis le lien reçu par email, pour lire le questionnaire (GET) puis envoyer
// ses réponses (POST). Demandé par l'utilisateur le 22/09/2026.
//
// Sécurité : la table prospect_questionnaire_envois n'a AUCUNE policy RLS pour le rôle "anon"
// (voir prospect_questionnaires_migration.sql) — cette fonction utilise donc la clé service_role
// pour lire/écrire, exactement comme api/contact/route.js ou trigger-manual.js, et c'est ELLE,
// pas la base, qui garantit qu'un token ne révèle jamais que SA propre ligne :
//   - Le token doit correspondre EXACTEMENT à une ligne (256 bits aléatoires : impossible à
//     deviner ou à énumérer).
//   - Seuls les champs strictement nécessaires à l'affichage sont renvoyés (jamais l'email,
//     l'organisation_id, le nom du formateur, etc.).
//   - L'écriture des réponses (POST) est une mise à jour conditionnelle
//     (WHERE token = ... AND statut = 'envoye') : si la ligne a déjà été remplie ou n'existe
//     plus, la mise à jour ne touche aucune ligne et la fonction refuse — impossible d'écraser
//     des réponses déjà envoyées, y compris en cas de double-clic ou de rejeu du lien.
//   - Un lien expiré (30 jours, voir expire_at) est refusé de la même façon qu'un lien déjà
//     rempli, sans distinguer les deux cas dans la réponse (pour ne rien révéler d'utile à qui
//     rejouerait des tokens au hasard).

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = (req.method === 'GET' ? req.query?.t : (req.body?.t || req.query?.t) || '').toString().trim();
  if (!token) return res.status(400).json({ error: 'Lien invalide.' });

  try {
    if (req.method === 'GET') {
      const { data: envoi, error: envoiErr } = await supabaseAdmin
        .from('prospect_questionnaire_envois')
        .select('id, prenom, nom, statut, expire_at, template_id')
        .eq('token', token)
        .maybeSingle();
      if (envoiErr) throw envoiErr;
      if (!envoi) return res.status(404).json({ error: 'Lien invalide ou expiré.' });

      const expire = envoi.expire_at ? new Date(envoi.expire_at).getTime() < Date.now() : false;
      if (envoi.statut === 'rempli') return res.status(200).json({ etat: 'rempli' });
      if (expire) return res.status(200).json({ etat: 'expire' });

      const { data: template, error: templateErr } = await supabaseAdmin
        .from('prospect_questionnaire_templates')
        .select('titre, questions')
        .eq('id', envoi.template_id)
        .maybeSingle();
      if (templateErr) throw templateErr;
      if (!template) return res.status(404).json({ error: 'Lien invalide ou expiré.' });

      return res.status(200).json({
        etat: 'a_remplir',
        titre: template.titre,
        questions: template.questions || [],
        prenom: envoi.prenom,
        nom: envoi.nom,
      });
    }

    if (req.method === 'POST') {
      const reponses = req.body?.reponses;
      if (!reponses || typeof reponses !== 'object' || Array.isArray(reponses)) {
        return res.status(400).json({ error: 'Réponses manquantes.' });
      }

      // Mise à jour CONDITIONNELLE : ne touche la ligne que si elle est encore au statut
      // 'envoye' — empêche tout écrasement d'une réponse déjà soumise.
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('prospect_questionnaire_envois')
        .update({ statut: 'rempli', reponses, rempli_at: new Date().toISOString() })
        .eq('token', token)
        .eq('statut', 'envoye')
        .gt('expire_at', new Date().toISOString())
        .select('id')
        .maybeSingle();
      if (updateErr) throw updateErr;
      if (!updated) return res.status(409).json({ error: 'Ce lien n\'est plus valable (déjà rempli ou expiré).' });

      return res.status(200).json({ etat: 'rempli' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[prospects/questionnaire]', err);
    return res.status(500).json({ error: err.message });
  }
};
