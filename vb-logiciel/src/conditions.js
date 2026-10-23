// Conditions SkorUp (23/10/2026) : textes publiés sur le site, version en vigueur, textes à accepter.
// Quand un texte change de façon importante : publier le site, puis changer CONDITIONS_VERSION ici.
// Chaque utilisateur devra alors accepter la nouvelle version à sa connexion suivante.
export const CONDITIONS_VERSION = '2026-10-23';

export const SITE_SKORUP = 'https://www.skorup.fr';

export const PAGES_LEGALES = {
  mentions: { titre: 'Mentions légales', url: `${SITE_SKORUP}/mentions-legales/` },
  cgu: { titre: "Conditions générales d'utilisation", court: 'CGU', url: `${SITE_SKORUP}/cgu/` },
  cgv: { titre: 'Conditions générales de vente', court: 'CGV', url: `${SITE_SKORUP}/cgv/` },
  'accord-traitement-donnees': { titre: 'Accord de traitement des données', court: 'Traitement des données', url: `${SITE_SKORUP}/accord-traitement-donnees/` },
  confidentialite: { titre: 'Politique de confidentialité', court: 'Confidentialité', url: `${SITE_SKORUP}/confidentialite/` },
};

// Liens du bas de page (dans cet ordre).
export const LIENS_LEGAUX = ['mentions', 'cgu', 'cgv', 'confidentialite', 'accord-traitement-donnees'];

// Textes à accepter selon le profil. L'organisme (admin) achète le service : CGV + accord de traitement.
export const documentsAAccepter = (role) => (role === 'admin' ? ['cgv', 'cgu', 'accord-traitement-donnees'] : ['cgu']);
