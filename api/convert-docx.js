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

    // 2. Convertir .docx → HTML avec mammoth (images en base64)
    const { value: bodyHtml } = await mammoth.convertToHtml(
      { buffer: docxBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const b64 = (await image.read()).toString('base64');
          return { src: `data:${image.contentType};base64,${b64}` };
        }),
      }
    );

    // 3. Convertir HTML → nodes pdfmake
    const { JSDOM } = require('jsdom');
    const htmlToPdfMake = require('html-to-pdfmake');
    const { window } = new JSDOM('');
    const pdfContent = htmlToPdfMake(bodyHtml, { window });

    // 4. Bloc de signature
    const sigBlock = {
      margin: [0, 28, 0, 0],
      table: {
        widths: ['*', '*'],
        body: [[
          {
            border: [false, true, false, false],
            stack: [
              { text: "Le donneur d'ordre", bold: true, fontSize: 10, margin: [0, 8, 0, 6] },
              { text: 'VB Coaching – Véronique BOULAIS', fontSize: 10 },
            ],
          },
          {
            border: [false, true, false, false],
            stack: [
              { text: 'Le sous-traitant', bold: true, fontSize: 10, margin: [0, 8, 0, 6] },
              ...(signatureBase64
                ? [{ image: signatureBase64, width: 140, height: 52, alignment: 'center', margin: [0, 4, 0, 4] }]
                : [{ canvas: [{ type: 'rect', x: 0, y: 0, w: 140, h: 52, lineWidth: 1, lineColor: '#cccccc' }] }]),
              { text: signerName || 'Le Formateur', fontSize: 9.5, alignment: 'center' },
              { text: `Signé numériquement le ${signedAt || ''}`, fontSize: 8, color: '#555555', alignment: 'center', margin: [0, 3, 0, 0] },
            ],
          },
        ]],
      },
    };

    // 5. Générer le PDF avec pdfmake (pur Node.js, sans navigateur)
    const pdfMake = require('pdfmake/build/pdfmake');
    pdfMake.vfs = require('pdfmake/build/vfs_fonts').vfs;

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [72, 57, 51, 57],
      content: [
        ...(Array.isArray(pdfContent) ? pdfContent : [pdfContent]),
        sigBlock,
      ],
      defaultStyle: { fontSize: 11, lineHeight: 1.5 },
    };

    const pdfDoc = pdfMake.createPdfKitDocument(docDefinition);
    const chunks = [];
    pdfDoc.on('data', chunk => chunks.push(chunk));
    const pdfBuffer = await new Promise((resolve, reject) => {
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });

    // 6. Renvoyer le PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="signed_document.pdf"');
    res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error('[convert-docx]', err);
    res.status(500).json({ error: err.message });
  }
};
