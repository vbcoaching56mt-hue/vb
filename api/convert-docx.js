// api/convert-docx.js
//
// SÉCURITÉ (2026-10-12) : fonction DÉSACTIVÉE. Elle n'était plus appelée nulle part par
// l'application (la conversion passe par api/convert/docx-to-pdf.js, qui exige d'être connecté),
// mais restait accessible à tout Internet sans connexion : elle téléchargeait n'importe quelle
// adresse et pouvait ajouter un faux tampon « Signé numériquement » à n'importe quel document.
// Elle répond désormais toujours 410 (supprimée). Le fichier est conservé uniquement pour que le
// déploiement remplace l'ancienne version ; il pourra être supprimé du dépôt plus tard.

module.exports = async (req, res) => {
  return res.status(410).json({ error: 'Cette fonction n\'est plus disponible.' });
};
