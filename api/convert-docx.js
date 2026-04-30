const PizZip = require('pizzip');

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildSignatureXml(signerName, signedAt) {
  const name = escapeXml(signerName);
  const date = escapeXml(signedAt);
  return (
    '<w:p>' +
      '<w:pPr>' +
        '<w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="BBBBBB"/></w:pBdr>' +
        '<w:spacing w:before="480" w:after="120"/>' +
      '</w:pPr>' +
    '</w:p>' +
    '<w:tbl>' +
      '<w:tblPr>' +
        '<w:tblW w:w="0" w:type="auto"/>' +
        '<w:tblBorders>' +
          '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
          '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
        '</w:tblBorders>' +
      '</w:tblPr>' +
      '<w:tblGrid>' +
        '<w:gridCol w:w="4750"/>' +
        '<w:gridCol w:w="4750"/>' +
      '</w:tblGrid>' +
      '<w:tr>' +
        '<w:tc>' +
          '<w:tcPr><w:tcW w:w="4750" w:type="dxa"/></w:tcPr>' +
          '<w:p><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr>' +
            '<w:t>Le donneur d’ordre</w:t></w:r></w:p>' +
          '<w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr>' +
            '<w:t>VB Coaching – Véronique BOULAIS</w:t></w:r></w:p>' +
        '</w:tc>' +
        '<w:tc>' +
          '<w:tcPr><w:tcW w:w="4750" w:type="dxa"/></w:tcPr>' +
          '<w:p><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr>' +
            '<w:t>Le sous-traitant</w:t></w:r></w:p>' +
          `<w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${name}</w:t></w:r></w:p>` +
          `<w:p><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="555555"/></w:rPr>` +
            `<w:t>Signé numériquement le ${date}</w:t></w:r></w:p>` +
        '</w:tc>' +
      '</w:tr>' +
    '</w:tbl>'
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { docxUrl, signerName, signedAt } = req.body;
    if (!docxUrl) return res.status(400).json({ error: 'docxUrl manquant' });

    // 1. Télécharger le .docx original
    const docxResp = await fetch(docxUrl);
    if (!docxResp.ok) throw new Error(`HTTP ${docxResp.status} lors du téléchargement`);
    const docxBuffer = Buffer.from(await docxResp.arrayBuffer());

    // 2. Ouvrir avec PizZip (format ZIP du DOCX)
    const zip = new PizZip(docxBuffer);

    // 3. Lire word/document.xml
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) throw new Error('word/document.xml introuvable dans le DOCX');
    const docXml = docXmlFile.asText();

    // 4. Construire le bloc de signature en XML Word natif
    const sigXml = buildSignatureXml(
      signerName || 'Le Formateur',
      signedAt || new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    );

    // 5. Insérer avant <w:sectPr> (mise en page de section) ou avant </w:body>
    //    <w:sectPr> doit rester le DERNIER enfant de <w:body>
    let modifiedXml;
    const sectPrIdx = docXml.lastIndexOf('<w:sectPr');
    if (sectPrIdx !== -1) {
      modifiedXml = docXml.slice(0, sectPrIdx) + sigXml + docXml.slice(sectPrIdx);
    } else {
      modifiedXml = docXml.replace('</w:body>', sigXml + '</w:body>');
    }

    // 6. Réécrire document.xml dans le ZIP et générer le DOCX signé
    zip.file('word/document.xml', modifiedXml);
    const signedDocxBuffer = zip.generate({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'inline; filename="signed_document.docx"');
    res.status(200).send(signedDocxBuffer);

  } catch (err) {
    console.error('[convert-docx]', err);
    res.status(500).json({ error: err.message });
  }
};
