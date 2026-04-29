const mammoth = require('mammoth');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { docxUrl, signerName, signedAt, signatureBase64 } = req.body;
    if (!docxUrl) return res.status(400).json({ error: 'docxUrl manquant' });

    // 1. Télécharger le .docx
    const docxResp = await fetch(docxUrl);
    if (!docxResp.ok) throw new Error(`Téléchargement échoué: HTTP ${docxResp.status}`);
    const docxBuffer = Buffer.from(await docxResp.arrayBuffer());

    // 2. Convertir .docx → HTML avec mammoth
    const { value: bodyHtml } = await mammoth.convertToHtml(
      { buffer: docxBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const b64 = (await image.read()).toString('base64');
          return { src: `data:${image.contentType};base64,${b64}` };
        }),
      }
    );

    // 3. Construire le HTML complet avec la signature intégrée
    const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Calibri, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
    }
    .page { padding: 20mm 18mm 20mm 25mm; }
    h1 { font-size: 14pt; margin: 0 0 10pt; }
    h2 { font-size: 12pt; margin: 8pt 0 6pt; }
    p  { margin: 0 0 6pt; }
    ul, ol { margin: 0 0 6pt 18pt; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
    td, th { border: 1px solid #ccc; padding: 5pt 7pt; font-size: 10pt; }
    th { background: #f5f5f5; font-weight: bold; }
    img { max-width: 100%; height: auto; }

    .sig-section {
      margin-top: 28pt;
      padding-top: 16pt;
      border-top: 1pt solid #bbb;
      display: flex;
      justify-content: space-between;
      gap: 20pt;
    }
    .sig-col { flex: 1; text-align: center; }
    .sig-col strong { display: block; margin-bottom: 6pt; font-size: 10pt; }
    .sig-img {
      max-width: 190pt;
      max-height: 72pt;
      object-fit: contain;
      display: block;
      margin: 8pt auto 4pt;
    }
    .sig-name { font-size: 9.5pt; }
    .sig-date { font-size: 8pt; color: #555; margin-top: 3pt; }
  </style>
</head>
<body>
  <div class="page">
    ${bodyHtml}

    <div class="sig-section">
      <div class="sig-col">
        <strong>Le donneur d'ordre</strong>
        <p class="sig-name">VB Coaching – Véronique BOULAIS</p>
      </div>
      <div class="sig-col">
        <strong>Le sous-traitant</strong>
        ${signatureBase64
          ? `<img class="sig-img" src="${signatureBase64}" alt="Signature formateur" />`
          : '<div style="height:72pt;border:1px solid #ccc;margin:8pt auto;width:190pt;"></div>'}
        <p class="sig-name">${signerName || 'Le Formateur'}</p>
        <p class="sig-date">Signé numériquement le ${signedAt || ''}</p>
      </div>
    </div>
  </div>
</body>
</html>`;

    // 4. Lancer Puppeteer + Chromium et générer le PDF
    const chromium = require('@sparticuz/chromium');
    const puppeteer = require('puppeteer-core');

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 25000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await browser.close();

    // 5. Renvoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="signed_document.pdf"');
    res.status(200).send(Buffer.from(pdfBuffer));

  } catch (err) {
    console.error('[convert-docx]', err);
    res.status(500).json({ error: err.message });
  }
};
