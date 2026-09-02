// api/_lib/docxToPdf.js
// Conversion DOCX → PDF sans aucune dépendance externe (remplace l'ancienne intégration
// CloudConvert, explicitement écartée : l'organisme ne veut dépendre d'aucune plateforme tierce
// pour ses documents). Pipeline 100% auto-hébergé, exécuté entièrement dans la fonction
// serverless Vercel :
//   1. mammoth (bibliothèque JS pure) convertit le .docx fusionné en HTML sémantique
//      (titres, gras/italique, listes, tableaux, images embarquées en base64).
//   2. Chromium headless (api/_lib/htmlToPdf.js) imprime ce HTML en PDF.
//
// Limite honnête à connaître : mammoth ne vise pas un rendu pixel-perfect façon Word/LibreOffice
// (mise en page très complexe, en-têtes/pieds de page, sauts de section avancés peuvent différer
// légèrement) — mais le texte, la fusion des balises, les tableaux et la mise en forme de base
// sont fidèles, ce qui convient aux documents administratifs (contrats, attestations...).

const mammoth = require('mammoth');
const { renderHtmlToPdfBuffer } = require('./htmlToPdf');

const PAGE_STYLE = `
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
  h1, h2, h3 { color: #111; margin-top: 1.2em; margin-bottom: 0.4em; }
  p { margin: 0 0 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  td, th { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
  img { max-width: 100%; }
  strong, b { font-weight: 700; }
`;

/**
 * Convertit un buffer .docx en buffer .pdf, sans appel à un service externe.
 * @param {Buffer} docxBuffer
 * @returns {Promise<Buffer>}
 */
async function convertDocxBufferToPdfBuffer(docxBuffer) {
  const { value: bodyHtml, messages } = await mammoth.convertToHtml({ buffer: docxBuffer });
  const warnings = (messages || []).filter(m => m.type === 'warning');
  if (warnings.length) {
    console.warn(`[docxToPdf] ${warnings.length} avertissement(s) mammoth (mise en page potentiellement simplifiée):`,
      warnings.slice(0, 5).map(w => w.message));
  }
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PAGE_STYLE}</style></head><body>${bodyHtml}</body></html>`;
  return renderHtmlToPdfBuffer(fullHtml);
}

module.exports = { convertDocxBufferToPdfBuffer };
