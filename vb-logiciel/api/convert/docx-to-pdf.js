// api/convert/docx-to-pdf.js
// Fonction Vercel : convertit un DOCX en PDF côté serveur, entièrement en interne (Chromium
// headless embarqué, voir api/_lib/docxToPdf.js et api/_lib/htmlToPdf.js) — aucune dépendance à
// une plateforme externe. Ce fichier était référencé par src/App.js (convertDocxBlobToPdf) mais
// n'existait pas encore dans le dépôt — chaque appel échouait donc silencieusement (404) et
// l'application se rabattait systématiquement sur la conversion 100% navigateur
// (convertDocxBlobToPdfLocal : docx-preview + html2canvas + jsPDF), plus lente et moins fidèle.
//
// Protégé : exige un token de session Supabase valide (envoyé par le front en
// "Authorization: Bearer <access_token>"), pour ne pas exposer un endpoint de conversion ouvert.

const { createClient } = require('@supabase/supabase-js');
const { convertDocxBufferToPdfBuffer } = require('../_lib/docxToPdf');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Variables Supabase non configurées (REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_SERVICE_ROLE_KEY).' });
  }

  // ── Vérification de session : n'accepte que les appels d'un utilisateur connecté à l'app ──
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Session invalide ou expirée — reconnectez-vous.' });
  }

  const { docxBase64 } = req.body || {};
  if (!docxBase64) {
    return res.status(400).json({ error: 'docxBase64 manquant dans la requête.' });
  }

  try {
    const docxBuffer = Buffer.from(docxBase64, 'base64');
    const pdfBuffer = await convertDocxBufferToPdfBuffer(docxBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('[api/convert/docx-to-pdf] Erreur:', err);
    return res.status(500).json({ error: err.message || 'Erreur de conversion.' });
  }
};
