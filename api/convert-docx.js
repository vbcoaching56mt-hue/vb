const mammoth = require('mammoth');
const PDFDocument = require('pdfkit');
const { parse } = require('node-html-parser');

const M_L = 72, M_R = 51, M_T = 57, M_B = 57;
const PW = 595; // A4 points
const PH = 842;
const CW = PW - M_L - M_R; // ~472

// Extrait les segments inline (bold/italic) d'un nœud
function getSegments(node, bold = false, italics = false) {
  if (node.nodeType === 3) {
    const t = node.rawText?.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    return t?.trim() ? [{ text: t, bold, italics }] : [];
  }
  const tag = (node.tagName || '').toLowerCase();
  if (tag === 'br') return [{ text: '\n', bold: false, italics: false }];
  const b = bold || tag === 'strong' || tag === 'b';
  const i = italics || tag === 'em' || tag === 'i';
  return node.childNodes.flatMap(c => getSegments(c, b, i));
}

function renderBlock(doc, node, fontSize, topMargin = 0) {
  const segs = getSegments(node).filter(s => s.text.trim());
  if (!segs.length) return;
  if (topMargin > 0) doc.moveDown(topMargin);
  try {
    segs.forEach(({ text, bold, italics }, i) => {
      const font = bold && italics ? 'Helvetica-BoldOblique'
                 : bold     ? 'Helvetica-Bold'
                 : italics  ? 'Helvetica-Oblique'
                 :             'Helvetica';
      doc.font(font).fontSize(fontSize).text(text, { continued: i < segs.length - 1 });
    });
  } catch (_) {
    doc.font('Helvetica').fontSize(fontSize).text(node.text?.trim() || '');
  }
  doc.font('Helvetica').fontSize(11).moveDown(0.25);
}

function renderTable(doc, tableNode) {
  const rows = tableNode.querySelectorAll('tr');
  if (!rows.length) return;
  const colCount = Math.max(...rows.map(tr => tr.querySelectorAll('td, th').length));
  if (!colCount) return;

  const ROW_H = 18;
  const colW = Math.floor(CW / colCount);
  doc.moveDown(0.4);
  let y = doc.y;

  rows.forEach(tr => {
    const cells = tr.querySelectorAll('td, th');
    const isHeader = !!tr.querySelector('th');
    if (y + ROW_H > PH - M_B) { doc.addPage(); y = M_T; }

    cells.forEach((cell, ci) => {
      const x = M_L + ci * colW;
      const w = ci === colCount - 1 ? CW - ci * colW : colW;
      if (isHeader) doc.save().rect(x, y, w, ROW_H).fill('#f0f0f0').restore();
      doc.save().rect(x, y, w, ROW_H).stroke('#cccccc').restore();
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
         .text(cell.text.trim(), x + 2, y + 4, { width: w - 4, lineBreak: false });
    });
    y += ROW_H;
  });

  doc.text('', M_L, y);
  doc.font('Helvetica').fontSize(11).moveDown(0.4);
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
    if (!docxResp.ok) throw new Error(`HTTP ${docxResp.status}`);
    const docxBuffer = Buffer.from(await docxResp.arrayBuffer());

    // 2. .docx → HTML (images en base64)
    const { value: bodyHtml } = await mammoth.convertToHtml(
      { buffer: docxBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const b64 = (await image.read()).toString('base64');
          return { src: `data:${image.contentType};base64,${b64}` };
        }),
      }
    );

    // 3. PDF avec PDFKit + polices Helvetica intégrées (aucun fichier externe)
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: M_T, bottom: M_B, left: M_L, right: M_R },
    });
    const buffers = [];
    doc.on('data', buf => buffers.push(buf));
    doc.font('Helvetica').fontSize(11);

    parse(bodyHtml).childNodes.forEach(node => {
      if (node.nodeType === 3) {
        const t = node.rawText?.trim();
        if (t) { doc.font('Helvetica').fontSize(11).text(t); doc.moveDown(0.2); }
        return;
      }
      const tag = (node.tagName || '').toLowerCase();
      switch (tag) {
        case 'h1': renderBlock(doc, node, 16, 0.4); break;
        case 'h2': renderBlock(doc, node, 13, 0.3); break;
        case 'h3': renderBlock(doc, node, 11, 0.2); break;
        case 'p':  renderBlock(doc, node, 11, 0);   break;
        case 'ul':
          node.querySelectorAll('li').forEach(li =>
            doc.font('Helvetica').fontSize(11).text(`• ${li.text.trim()}`, { indent: 12 })
          );
          doc.moveDown(0.3);
          break;
        case 'ol':
          node.querySelectorAll('li').forEach((li, idx) =>
            doc.font('Helvetica').fontSize(11).text(`${idx + 1}. ${li.text.trim()}`, { indent: 12 })
          );
          doc.moveDown(0.3);
          break;
        case 'table': renderTable(doc, node); break;
        case 'img': {
          const src = node.getAttribute('src');
          if (src?.startsWith('data:')) {
            try {
              doc.image(Buffer.from(src.split(',')[1], 'base64'), { fit: [CW, 400] });
              doc.moveDown(0.3);
            } catch (_) { /* image invalide, on passe */ }
          }
          break;
        }
      }
    });

    // 4. Bloc de signature
    if (doc.y + 120 > PH - M_B) doc.addPage();
    doc.moveDown(1.5);

    const lineY = doc.y;
    doc.moveTo(M_L, lineY).lineTo(PW - M_R, lineY).stroke('#bbbbbb');

    const col2X = M_L + CW / 2 + 10;
    const colW2 = CW / 2 - 10;
    const sigY = lineY + 10;

    // Colonne gauche — donneur d'ordre
    doc.font('Helvetica-Bold').fontSize(10).text("Le donneur d'ordre", M_L, sigY, { width: colW2 });
    doc.font('Helvetica').fontSize(10).text('VB Coaching – Véronique BOULAIS', M_L, sigY + 16, { width: colW2 });

    // Colonne droite — sous-traitant
    doc.font('Helvetica-Bold').fontSize(10).text('Le sous-traitant', col2X, sigY, { width: colW2 });

    let nameY = sigY + 16;
    if (signatureBase64) {
      try {
        doc.image(Buffer.from(signatureBase64.split(',')[1], 'base64'), col2X, sigY + 16, { fit: [140, 52] });
        nameY = sigY + 72;
      } catch (_) { /* signature corrompue, on passe */ }
    }

    doc.font('Helvetica').fontSize(9.5).text(signerName || 'Le Formateur', col2X, nameY, { width: colW2 });
    doc.font('Helvetica').fontSize(8).fillColor('#555555')
       .text(`Signé numériquement le ${signedAt || ''}`, col2X, nameY + 14, { width: colW2 });

    // 5. Renvoyer le PDF
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      doc.end();
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="signed_document.pdf"');
    res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error('[convert-docx]', err);
    res.status(500).json({ error: err.message });
  }
};
