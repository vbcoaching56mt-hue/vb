// Protection contre les pages modifiées par le navigateur (09/11/2026).
// La traduction automatique (Chrome, Edge, Safari) et certaines extensions remplacent les textes
// de la page par les leurs, sans prévenir React. Quand React veut ensuite enlever ou déplacer un
// de ces textes, le navigateur répond « removeChild / insertBefore : le nœud n'est pas un enfant »
// et l'écran « Un problème est survenu » s'affichait (formatrices touchées entre le 29/10 et le 08/11).
// Ici, au lieu de planter, on ignore simplement l'opération impossible : la page continue de marcher.
// Le cas est noté une seule fois par chargement dans le journal des erreurs.
import { signalerErreur } from './erreurs';

let dejaNote = false;
const noter = (operation) => {
  if (dejaNote) return;
  dejaNote = true;
  try {
    const traduite = /translated-/.test(document.documentElement.className || '') ? ' (traduction automatique active)' : '';
    signalerErreur(new Error(`Page modifiée par le navigateur : ${operation} évité${traduite}`), { origine: 'protectionPage' });
  } catch (_) { /* jamais bloquant */ }
};

if (typeof Node === 'function' && Node.prototype && !Node.prototype.__skorupProtege) {
  Node.prototype.__skorupProtege = true;
  const retirerOrigine = Node.prototype.removeChild;
  Node.prototype.removeChild = function (enfant) {
    if (enfant && enfant.parentNode !== this) {
      noter('removeChild');
      return enfant;
    }
    return retirerOrigine.apply(this, arguments);
  };
  const insererOrigine = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (nouveau, reference) {
    if (reference && reference.parentNode !== this) {
      noter('insertBefore');
      // On ajoute quand même le nouvel élément, à la fin : rien ne disparaît de l'écran.
      return Node.prototype.appendChild.call(this, nouveau);
    }
    return insererOrigine.apply(this, arguments);
  };
}
