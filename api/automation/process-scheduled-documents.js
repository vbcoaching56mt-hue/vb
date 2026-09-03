// api/automation/process-scheduled-documents.js
// Fonction Vercel (cron quotidien, même déclenchement que api/automation/process.js) :
// génère et envoie automatiquement les documents "Ajouts personnalisés" programmés depuis la
// fiche client (voir handleAddAssignedDoc / bouton "📅 Programmer" dans l'onglet "Documents liés").
//
// Reproduit côté serveur (sans navigateur) la même logique que handleGenerateDocx côté client,
// pour la branche "client" uniquement (ces documents programmés sont toujours rattachés à un
// client, jamais à un formateur) : fusion docxtemplater (documents classiques) ou incrustation
// pdf-lib des balises positionnées (documents "visuels", voir VisualTemplateEditor).
//
// Conversion DOCX -> PDF : via CloudConvert (même prestataire, même clé que la conversion
// navigateur historique et que api/convert/docx-to-pdf.js — voir ce fichier pour le détail des
// variables d'environnement). Un modèle "visuel" est presque toujours déjà un PDF (les balises
// sont positionnées dessus dans VisualTemplateEditor) : dans ce cas, aucune conversion n'est
// nécessaire et cette fonction ne fait aucun appel réseau externe pour ce document.
// Si la conversion échoue malgré tout (docx corrompu, clé API absente, etc.), le document est
// stocké tel quel en .docx plutôt que de faire échouer tout l'envoi — le résultat de chaque
// tentative est tracé sur la ligne client_documents (sent_at / send_error), visible dans l'UI
// via le badge "Programmé" / "Envoyé auto." / erreur.
//
// 2026-09-03 : réécrit à l'emplacement réellement déployé par Vercel (api/automation/, à la
// racine du repo — voir vercel.json "outputDirectory"/"buildCommand" : le dossier vb-logiciel/api
// n'a jamais fait partie du projet Vercel réel, ce fichier n'y avait donc jamais été exécuté).
// Changements par rapport à la version d'origine (jamais déployée, dans vb-logiciel/api/) :
//   - Variables Supabase SANS préfixe REACT_APP_ (convention des autres fonctions api/automation/*
//     déjà déployées et fonctionnelles), avec repli sur les variantes préfixées si jamais absentes.
//   - Conversion PDF via CloudConvert (déjà utilisée par api/convert/docx-to-pdf.js) au lieu de
//     Chromium headless embarqué (mammoth + @sparticuz/chromium + puppeteer-core) : ces paquets
//     n'ont jamais fait partie des dépendances du projet Vercel réel (voir package.json à la
//     racine) et ajoutent un poids/une fragilité inutiles alors qu'une solution externe, déjà en
//     place et documentée, existe.
//   - MAX_PER_RUN et le timeout d'attente CloudConvert réduits pour rester confortablement sous
//     la limite d'exécution Vercel (voir "functions"."maxDuration" dans vercel.json).

const { createClient } = require('@supabase/supabase-js');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// Le cron tourne 2x/jour (garde-fou horaire Paris ci-dessous) donc, même un jour où beaucoup de
// documents tombent à échéance le même jour, le reliquat est repris automatiquement au passage
// suivant — au pire quelques heures de retard, jamais un envoi perdu.
const MAX_PER_RUN = 5;

function todayInParisStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Même garde-fou horaire France que api/automation/process.js : un seul des deux cron
  // (été/hiver) programmés dans vercel.json doit réellement traiter les envois, l'autre ne fait
  // rien. Un appel manuel (sans cet en-tête) s'exécute toujours immédiatement.
  const cronSchedule = req.headers['x-vercel-cron-schedule'];
  if (cronSchedule) {
    const parisHour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false })
        .formatToParts(new Date())
        .find(p => p.type === 'hour').value
    );
    if (parisHour !== 8) {
      return res.json({ skipped: true, reason: 'not_target_hour_paris', parisHour, schedule: cronSchedule });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Variables Supabase non configurées (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const todayStr = todayInParisStr();

    const { data: dueRows, error: dueErr } = await supabase
      .from('client_documents')
      .select('*')
      .eq('send_mode', 'scheduled')
      .is('sent_at', null)
      .lte('scheduled_date', todayStr)
      .order('scheduled_date', { ascending: true });

    if (dueErr) throw new Error('Erreur lecture client_documents : ' + dueErr.message);
    if (!dueRows || dueRows.length === 0) {
      return res.json({ processed: 0, message: 'Aucun document programmé à envoyer aujourd\'hui.' });
    }

    const rowsToProcess = dueRows.slice(0, MAX_PER_RUN);
    const remaining = dueRows.length - rowsToProcess.length;

    const results = [];
    for (const row of rowsToProcess) {
      try {
        await generateAndSendOne(supabase, row);
        await supabase.from('client_documents').update({ sent_at: new Date().toISOString(), send_error: null }).eq('id', row.id);
        results.push({ ok: true, id: row.id, template: row.template_titre, client_id: row.client_id });
      } catch (e) {
        console.error(`[process-scheduled-documents] Échec pour client_documents#${row.id} (${row.template_titre}):`, e);
        await supabase.from('client_documents').update({ send_error: String(e.message || e).slice(0, 500) }).eq('id', row.id);
        results.push({ ok: false, id: row.id, template: row.template_titre, client_id: row.client_id, error: e.message });
      }
    }

    return res.json({
      processed: results.length,
      sent: results.filter(r => r.ok).length,
      remaining_for_next_run: remaining,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[process-scheduled-documents] Erreur:', err);
    return res.status(500).json({ error: err.message });
  }
};

async function generateAndSendOne(supabase, row) {
  // 1. Client
  const { data: client, error: clientErr } = await supabase.from('clients').select('*').eq('id', row.client_id).single();
  if (clientErr || !client) throw new Error('Client introuvable.');

  // 2. Modèle (même table que fetchDocuments côté front : module_step_resources, type='document')
  const { data: msr, error: msrErr } = await supabase
    .from('module_step_resources')
    .select('*')
    .eq('type', 'document')
    .eq('titre', row.template_titre)
    .eq('organisation_id', row.organisation_id)
    .maybeSingle();
  if (msrErr) throw new Error('Erreur lecture modèle : ' + msrErr.message);

  // Repli : certains documents de la bibliothèque (page "Gestion des documents") peuvent, dans
  // des cas historiques, n'exister que dans la table "documents" (jamais synchronisés vers
  // module_step_resources) — on les accepte aussi, en reconstruisant un "modèle" minimal à partir
  // de cette ligne, plutôt que d'échouer l'envoi programmé.
  let effectiveMsr = msr;
  if (!effectiveMsr || !effectiveMsr.file_url) {
    const { data: docRow } = await supabase
      .from('documents')
      .select('*')
      .is('user_id', null)
      .eq('nom', row.template_titre)
      .eq('organisation_id', row.organisation_id)
      .maybeSingle();
    if (docRow && docRow.url) {
      let parsedMeta = {};
      try { parsedMeta = typeof docRow.metadata === 'string' ? JSON.parse(docRow.metadata) : (docRow.metadata || {}); } catch { parsedMeta = {}; }
      effectiveMsr = { id: null, file_url: docRow.url, metadata: parsedMeta };
    }
  }
  if (!effectiveMsr || !effectiveMsr.file_url) throw new Error(`Modèle "${row.template_titre}" introuvable ou sans fichier associé.`);
  const meta = (typeof effectiveMsr.metadata === 'string' && effectiveMsr.metadata.startsWith('{')) ? JSON.parse(effectiveMsr.metadata) : (effectiveMsr.metadata || {});
  const isVisualTemplate = meta?.has_visual_fields === true;

  // 3. Formateur / coach
  let theCoach = { nom: 'Non assigné' };
  if (client.formateur_id) {
    const { data: coachData } = await supabase.from('utilisateurs').select('*').eq('id', client.formateur_id).single();
    if (coachData) theCoach = coachData;
  }

  // 4. Module
  let moduleRow = null;
  if (client.module_id) {
    const { data: modData } = await supabase.from('modules').select('*').eq('id', client.module_id).maybeSingle();
    moduleRow = modData || null;
  }

  // 5. Dates de séances
  const { data: sessionDates } = await supabase
    .from('sessions')
    .select('date')
    .eq('client_id', client.id)
    .not('date', 'is', null)
    .order('date', { ascending: true });
  let dateDebut = '[Date non définie]';
  let dateFin = '[Date non définie]';
  if (sessionDates && sessionDates.length > 0) {
    dateDebut = new Date(sessionDates[0].date).toLocaleDateString('fr-FR');
    dateFin = new Date(sessionDates[sessionDates.length - 1].date).toLocaleDateString('fr-FR');
  }

  // 6. Paramètres organisme
  const { data: orgSettings } = await supabase
    .from('organisations')
    .select('id, nom, siret, adresse, code_postal, ville, nda, site_web')
    .eq('id', row.organisation_id)
    .maybeSingle();

  const targetName = client.nom_complet || `${client.nom || ''} ${client.prenom || ''}`.trim() || 'Client';

  const dataToMerge = {
    nom: theCoach.nom || 'Coach',
    nom_formateur: theCoach.nom || 'Coach',
    formateur_nom_complet: theCoach.nom || '',
    raison_sociale: theCoach.nom || 'Coach',
    adresse_formateur: theCoach.adresse_formateur || theCoach.adresse_pro || theCoach.adresse_client || theCoach.adresse || '',
    formateur_nda: theCoach.formateur_nda || theCoach.nda || '',
    formateur_siret: theCoach.formateur_siret || theCoach.siret || '',
    email_formateur: theCoach.email || '',
    tel_formateur: theCoach.telephone || '',
    compagnie_assurance: theCoach.compagnie_assurance || '',
    numero_assurance_rcp: theCoach.numero_assurance_rcp || '',
    nomcomplet_client: targetName,
    client_phone: client.telephone || client.client_phone || '',
    client_email: client.email_contact || client.client_email || client.email || '',
    prix_prestation: client.montant_prestation || moduleRow?.prix_prestation || '',
    rue_client: client.rue || '',
    code_postal_client: client.code_postal || '',
    ville_client: client.ville || '',
    adresse_session: client.adresse_postale || client.adresse_session || client.adresse_client || '',
    modalite_formation: client.modalite_formation || 'Mixte',
    date_debut: dateDebut,
    date_fin: dateFin,
    date_signature: new Date().toLocaleDateString('fr-FR'),
    date_du_jour: new Date().toLocaleDateString('fr-FR'),
    formation_nom: moduleRow?.nom || 'Formation',
    org_nom: orgSettings?.nom || '',
    org_siret: orgSettings?.siret || '',
    org_nda: orgSettings?.nda || '',
    org_adresse: orgSettings?.adresse || '',
    org_code_postal: orgSettings?.code_postal || '',
    org_ville: orgSettings?.ville || '',
    org_site_web: orgSettings?.site_web || '',
  };

  const safeName = String(targetName).replace(/\s+/g, '_');
  let finalBuffer, finalExt, finalMime;
  let templateIdForInsert = null;

  if (isVisualTemplate && effectiveMsr.id) {
    // ── Branche visuelle : balises positionnées (VisualTemplateEditor) ──
    const { data: templateFieldsData, error: tfErr } = await supabase
      .from('template_fields')
      .select('*')
      .eq('template_id', effectiveMsr.id)
      .order('page', { ascending: true });
    if (tfErr) throw new Error('Erreur chargement balises : ' + tfErr.message);

    const templateResp = await fetch(effectiveMsr.file_url);
    if (!templateResp.ok) throw new Error('Impossible de récupérer le modèle.');
    const templateArrayBuffer = await templateResp.arrayBuffer();
    const templateIsPdf = /\.pdf$/i.test((effectiveMsr.file_url || '').split('?')[0]);

    // Cas normal : le modèle visuel est déjà un PDF (balises positionnées dessus) → aucune
    // conversion n'est nécessaire, aucun appel externe. Cas rare : un modèle visuel basé sur un
    // .docx → converti via CloudConvert, comme la branche classique ci-dessous.
    let basePdfBytes;
    if (templateIsPdf) {
      basePdfBytes = Buffer.from(templateArrayBuffer);
    } else {
      basePdfBytes = await convertDocxBufferToPdfViaCloudConvert(Buffer.from(templateArrayBuffer));
    }

    // Seuls les champs "données" (ni signature, ni case à cocher, ni texte libre — ces champs-là
    // ne sont remplis qu'au moment où quelqu'un signe réellement, pas à la génération auto).
    const dataOnlyFields = (templateFieldsData || []).filter(f => {
      const isInteractive = f.field_type === 'signature' || f.field_type === 'checkbox' || f.field_type === 'text_input'
        || (f.tag || '').startsWith('signature_') || (f.tag || '').startsWith('checkbox_') || (f.tag || '').startsWith('texte_');
      return !isInteractive;
    });

    finalBuffer = await overlayDataFieldsOnPdf(basePdfBytes, dataOnlyFields, dataToMerge);
    finalExt = 'pdf';
    finalMime = 'application/pdf';
    templateIdForInsert = effectiveMsr.id;
  } else {
    // ── Branche classique : fusion docxtemplater puis conversion PDF via CloudConvert ──
    const templateResp = await fetch(effectiveMsr.file_url);
    if (!templateResp.ok) throw new Error('Impossible de récupérer le modèle.');
    const templateArrayBuffer = await templateResp.arrayBuffer();

    const zip = new PizZip(Buffer.from(templateArrayBuffer));
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(dataToMerge);
    const docxBuffer = doc.getZip().generate({ type: 'nodebuffer' });

    try {
      finalBuffer = await convertDocxBufferToPdfViaCloudConvert(docxBuffer);
      finalExt = 'pdf';
      finalMime = 'application/pdf';
    } catch (convErr) {
      // Pas de repli navigateur possible côté serveur (docx-preview/html2canvas nécessitent un DOM) —
      // on stocke le DOCX brut plutôt que de faire échouer tout l'envoi programmé.
      console.warn('[process-scheduled-documents] Conversion PDF indisponible, document stocké en .docx :', convErr.message);
      finalBuffer = docxBuffer;
      finalExt = 'docx';
      finalMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
  }

  const finalFileName = `${String(row.template_titre).replace(/[^a-z0-9]/gi, '_')}_${safeName}_${Date.now()}.${finalExt}`;
  const { error: uploadError } = await supabase.storage.from('documents').upload(finalFileName, finalBuffer, { contentType: finalMime });
  if (uploadError) throw new Error('Upload échoué : ' + uploadError.message);
  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(finalFileName);

  const docToInsert = {
    nom: `${row.template_titre} - ${targetName}`,
    type_document: 'Administratif',
    url: publicUrl,
    signe_par_client: false,
    signe_par_formateur: false,
    visible_admin: true,
    user_id: client.id,
    visible_client: true,
    visible_formateur: true,
    organisation_id: client.organisation_id || row.organisation_id,
  };
  if (client.formateur_id) docToInsert.assigned_formateur_id = client.formateur_id;
  if (templateIdForInsert) docToInsert.template_id = templateIdForInsert;

  const { error: insertErr } = await supabase.from('documents').insert([docToInsert]);
  if (insertErr) throw new Error('Insertion document échouée : ' + insertErr.message);
}

// Port Node minimal de overlayFieldsOnPdf (src/App.js) — uniquement le chemin "balise de donnée"
// (les balises signature/case à cocher/texte libre sont exclues en amont via dataOnlyFields, donc
// jamais transmises ici : elles ne concernent que la signature manuelle, hors périmètre de cette
// génération automatique).
async function overlayDataFieldsOnPdf(pdfBytes, fields, dataValues) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const pageIndex = (field.page || 1) - 1;
    if (pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const { width: pageW, height: pageH } = page.getSize();
    const cx = (field.x_percent / 100) * pageW;
    const cy = pageH - (field.y_percent / 100) * pageH;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

    const value = String(dataValues[field.tag] || '');
    if (!value) continue;
    try {
      page.drawText(value, {
        x: Math.max(0, cx),
        y: Math.max(0, cy),
        size: field.font_size || 11,
        font,
        color: rgb(0, 0, 0),
        maxWidth: pageW * 0.85,
      });
    } catch (e) {
      console.warn(`[overlayDataFieldsOnPdf] Balise ${field.tag} ignorée :`, e.message);
    }
  }

  return Buffer.from(await pdfDoc.save());
}

// Conversion DOCX -> PDF via CloudConvert, appelée directement depuis le serveur (pas de Bearer
// utilisateur ici : c'est un job cron, pas une requête navigateur — voir api/convert/docx-to-pdf.js
// pour l'équivalent authentifié utilisé côté client). Repli sur les noms de variables préfixés
// REACT_APP_ si les variantes sans préfixe ne sont pas (encore) configurées sur Vercel.
// Timeout réduit (60s max, contre 90s dans l'ancienne version) pour laisser une marge confortable
// sous la limite d'exécution de la fonction (voir "functions" dans vercel.json).
async function convertDocxBufferToPdfViaCloudConvert(docxBuffer) {
  const ccKey = process.env.CLOUDCONVERT_API_KEY || process.env.REACT_APP_CLOUDCONVERT_API_KEY;
  const convertApiSecret = process.env.CONVERT_API_SECRET || process.env.CONVERTAPI_SECRET || process.env.REACT_APP_CONVERT_API_SECRET;

  if (!ccKey && !convertApiSecret) {
    throw new Error("Aucune clé API de conversion configurée côté serveur (CLOUDCONVERT_API_KEY).");
  }

  const base64Data = docxBuffer.toString('base64');

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

    // Polling toutes les 2s, max 60s.
    for (let i = 0; i < 30; i++) {
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
        return Buffer.from(await pdfRes.arrayBuffer());
      }
    }
    throw new Error('CloudConvert: timeout après 60 secondes');
  }

  // ── ConvertAPI legacy (repli si CLOUDCONVERT_API_KEY absente) ──
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
  return Buffer.from(result.Files[0].FileData, 'base64');
}
