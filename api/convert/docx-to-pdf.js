// api/convert/docx-to-pdf.js
//
// Remplace l'appel direct, côté navigateur, à CloudConvert / ConvertAPI dans
// convertDocxBlobToPdf() (src/App.js) — ce code lisait REACT_APP_CLOUDCONVERT_API_KEY /
// REACT_APP_CONVERT_API_SECRET, deux variables préfixées REACT_APP_ qui sont donc compilées
// EN CLAIR dans le bundle JS envoyé à chaque visiteur du site (n'importe qui peut les extraire
// via les DevTools et les utiliser pour consommer le quota payant CloudConvert/ConvertAPI de
// l'organisme, voire au nom d'un autre service).
//
// Cette fonction serverless fait exactement la même conversion DOCX → PDF, mais côté serveur :
// les clés (SANS préfixe REACT_APP_, donc jamais envoyées au navigateur) restent sur Vercel,
// et l'appelant doit présenter un token Supabase valide (n'importe quel utilisateur authentifié
// de l'application — il n'y a pas de données spécifiques à un organisme ici, seulement un
// utilitaire de conversion qu'il faut protéger contre un usage par des tiers non-authentifiés).
//
// Variables d'environnement à ajouter sur Vercel (Project Settings > Environment Variables) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (déjà configurées pour api/automation/*)
//   CLOUDCONVERT_API_KEY                       (renommer/dupliquer REACT_APP_CLOUDCONVERT_API_KEY
//                                                SANS le préfixe REACT_APP_)
//   CONVERT_API_SECRET                         (idem pour REACT_APP_CONVERT_API_SECRET, si utilisé)
//
// Une fois cette fonction déployée et les variables REACT_APP_CLOUDCONVERT_API_KEY /
// REACT_APP_CONVERT_API_SECRET supprimées de Vercel (et les clés elles-mêmes régénérées côté
// CloudConvert/ConvertAPI, car l'ancienne valeur a déjà pu être vue par des visiteurs du site),
// la clé ne sera plus jamais présente dans le bundle JS.

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── 1. Authentifier l'appelant (n'importe quel utilisateur connecté de l'app) ──
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Authentification requise.' });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return res.status(401).json({ error: 'Session invalide ou expirée.' });

    // ── 2. Récupérer le DOCX (base64) envoyé par le client ──
    const base64Data = req.body?.docxBase64;
    if (!base64Data) return res.status(400).json({ error: 'docxBase64 manquant dans le corps de la requête.' });

    const ccKey = process.env.CLOUDCONVERT_API_KEY;
    const convertApiSecret = process.env.CONVERT_API_SECRET || process.env.CONVERTAPI_SECRET;

    // ── CloudConvert (principal) ──────────────────────────────────────────────
    if (ccKey) {
      const jobRes = await fetch('https://api.cloudconvert.com/v2/jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ccKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tasks: {
            'import-file': {
              operation: 'import/base64',
              file: base64Data,
              filename: 'document.docx',
            },
            'convert-file': {
              operation: 'convert',
              input: 'import-file',
              input_format: 'docx',
              output_format: 'pdf',
              engine: 'libreoffice',
            },
            'export-file': {
              operation: 'export/url',
              input: 'convert-file',
            },
          },
        }),
      });

      if (!jobRes.ok) {
        const errText = await jobRes.text().catch(() => '');
        throw new Error(`CloudConvert job création: ${jobRes.status} — ${errText}`);
      }

      const job = await jobRes.json();
      const jobId = job.data.id;

      // Polling toutes les 2s, max 90s
      let pdfBuffer = null;
      for (let i = 0; i < 45; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const statusRes = await fetch(`https://api.cloudconvert.com/v2/jobs/${jobId}`, {
          headers: { 'Authorization': `Bearer ${ccKey}` },
        });
        if (!statusRes.ok) throw new Error(`CloudConvert status: ${statusRes.status}`);
        const status = await statusRes.json();

        if (status.data.status === 'error') {
          const failedTask = status.data.tasks?.find(t => t.status === 'error');
          throw new Error(`CloudConvert échec: ${failedTask?.message || 'erreur inconnue'}`);
        }

        const exportTask = status.data.tasks?.find(t => t.name === 'export-file');
        if (exportTask?.status === 'finished' && exportTask.result?.files?.[0]?.url) {
          const pdfRes = await fetch(exportTask.result.files[0].url);
          if (!pdfRes.ok) throw new Error(`CloudConvert téléchargement PDF: ${pdfRes.status}`);
          pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
          break;
        }
      }
      if (!pdfBuffer) throw new Error('CloudConvert: timeout après 90 secondes');

      res.setHeader('Content-Type', 'application/pdf');
      return res.status(200).send(pdfBuffer);
    }

    // ── ConvertAPI legacy ─────────────────────────────────────────────────────
    if (convertApiSecret) {
      const docxBuffer = Buffer.from(base64Data, 'base64');
      const formData = new FormData();
      formData.append('File', new Blob([docxBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }), 'document.docx');

      const response = await fetch(`https://v2.convertapi.com/convert/docx/to/pdf?Secret=${convertApiSecret}`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error(`ConvertAPI error: ${response.status} ${response.statusText}`);
      const result = await response.json();
      if (!result.Files?.length) throw new Error('ConvertAPI: aucun fichier retourné dans la réponse.');
      const pdfBuffer = Buffer.from(result.Files[0].FileData, 'base64');

      res.setHeader('Content-Type', 'application/pdf');
      return res.status(200).send(pdfBuffer);
    }

    return res.status(500).json({ error: "Aucune clé API de conversion configurée côté serveur (CLOUDCONVERT_API_KEY)." });
  } catch (err) {
    console.error('[convert/docx-to-pdf]', err);
    return res.status(500).json({ error: err.message });
  }
};
