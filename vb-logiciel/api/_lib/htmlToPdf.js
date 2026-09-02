// api/_lib/htmlToPdf.js
// Rendu HTML → PDF 100% auto-hébergé (aucune plateforme externe) : Chromium headless embarqué
// dans la fonction serverless Vercel via @sparticuz/chromium (binaire compressé conçu pour
// AWS Lambda / Vercel, extrait au démarrage) piloté par puppeteer-core. Tout tourne à l'intérieur
// du déploiement Vercel de l'organisme — aucun appel réseau vers un service tiers, aucun compte
// ni clé API à gérer.
//
// Fichier volontairement dans _lib/ (non exposé comme route HTTP), partagé par
// api/_lib/docxToPdf.js (conversion DOCX→PDF, utilisée à la fois par la conversion manuelle et
// par l'automatisation des envois programmés).

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

async function launchBrowser() {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });
}

/**
 * Convertit du HTML en PDF (A4, marges standard, arrière-plans conservés).
 * @param {string} html - document HTML complet (avec <html>/<head>/<body>)
 * @returns {Promise<Buffer>} octets du PDF
 */
async function renderHtmlToPdfBuffer(html) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = { renderHtmlToPdfBuffer, launchBrowser };
