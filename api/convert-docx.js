const mammoth = require('mammoth');
const PdfPrinter = require('pdfmake');
const vfsFonts = require('pdfmake/build/vfs_fonts');
const { parse } = require('node-html-parser');

const fonts = {
  Roboto: {
    normal:      Buffer.from(vfsFonts.vfs['Roboto-Regular.ttf'],      'base64'),
    bold:        Buffer.from(vfsFonts.vfs['Roboto-Medium.ttf'],       'base64'),
    italics:     Buffer.from(vfsFonts.vfs['Roboto-Italic.ttf'],       'base64'),
    bolditalics: Buffer.from(vfsFonts.vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
};
const printer = new PdfPrinter(fonts);

// Convertit les noeuds inline (bold, italic, etc.) en tableaux pdfmake
function getInlineNodes(node) {
  if (node.nodeType === 3) {
    const t = node.rawText;
    return t ? [t] : [];
  }
  const tag = (node.tagName || '').toLowerCase();
  const children = node.childNodes.flatMap(getInlineNodes);
  if (!children.length) return [];
  const combined = children.length === 1 ? children[0] : children;

  switch (tag) {
    case 'strong': case 'b': return [{ text: combined, bold: true }];
    case 'em':     case 'i': return [{ text: combined, italics: true }];
    case 'u':                return [{ text: combined, decoration: 'underline' }];
    case 'br':               return ['\n'];
    default:                 return children;
  }
}

// Convertit le HTML mammoth en tableau de nodes pdfmake
function parseHtmlToPdfMake(html) {
  const root = parse(html);
  const content = [];

  function processNode(node) {
    if (node.nodeType === 3) {
      const t = node.rawText?.trim();
      if (t) content.push({ text: t });
      return;
    }
    const tag = (node.tagName || '').toLowerCase();

    switch (tag) {
      case 'h1':
        content.push({ text: node.text.trim(), fontSize: 16, bold: true, margin: [0, 10, 0, 6] });
        break;
      case 'h2':
        content.push({ text: node.text.trim(), fontSize: 13, bold: true, margin: [0, 8, 0, 4] });
        break;
      case 'h3':
        content.push({ text: node.text.trim(), fontSize: 11, bold: true, margin: [0, 6, 0, 3] });
        break;
      case 'p': {
        const inline = node.childNodes.flatMap(getInlineNodes);
        if (inline.length) content.push({ text: inline, margin: [0, 0, 0, 5] });
        break;
      }
      case 'ul': {
        const items = node.querySelectorAll('li').map(li => li.text.trim()).filter(Boolean);
        if (items.length) content.push({ ul: items, margin: [0, 0, 0, 5] });
        break;
      }
      case 'ol': {
        const items = node.querySelectorAll('li').map(li => li.text.trim()).filter(Boolean);
        if (items.length) content.push({ ol: items, margin: [0, 0, 0, 5] });
        break;
      }
      case 'table': {
        const rows = node.querySelectorAll('tr')
          .map(tr => tr.querySelectorAll('td, th').map(td => ({
            text: td.text.trim(),
            bold: td.tagName?.toLowerCase() === 'th',
            fillColor: td.tagName?.toLowerCase() === 'th' ? '#f0f0f0' : null,
            fontSize: 9,
            margin: [3, 3, 3, 3],
          })))
          .filter(r => r.length > 0);
        if (rows.length > 0) {
          const colCount = Math.max(...rows.map(r => r.length));
          content.push({
            table: { body: rows, widths: Array(colCount).fill('*') },
            layout: 'lightHorizontalLines',
            margin: [0, 5, 0, 8],
          });
        }
        break;
      }
      case 'img': {
        const src = node.getAttribute('src');
        if (src?.startsWith('data:')) {
          content.push({ image: src, maxWidth: 450, margin: [0, 5, 0, 5] });
        }
        break;
      }
      default:
        node.childNodes.forEach(processNode);
        break;
    }
  }

  root.childNodes.forEach(processNode);
  return content;
}

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
    const pdfContent = parseHtmlToPdfMake(bodyHtml);

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

    // 5. Générer le PDF avec pdfmake/PdfPrinter (Node.js natif)
    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [72, 57, 51, 57],
      content: [...pdfContent, sigBlock],
      defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.5 },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
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
