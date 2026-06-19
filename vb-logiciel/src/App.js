import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Users, FileText, Settings, LogOut, LayoutDashboard, ChevronDown, ChevronUp,
  Save, Trash2, Download, ChevronLeft, ChevronRight, Layout, FileCheck,
  Eye, EyeOff, Pencil, Check, X, AlertCircle, Clock, Archive, CheckCircle, PenTool, History, Briefcase, TrendingUp, MapPin, Search, Upload, Bell, Mail, ToggleLeft, ToggleRight
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { Buffer } from 'buffer';
import process from 'process';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin } from './supabaseClientConfig';
import SetupOrganisationPage from './pages/SetupOrganisation';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip
} from 'recharts';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';



if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.process = process;
}

// --- Icônes Simplifiées (Lucide déjà importé) ---
const DownloadIcon = () => <FileText className="w-4 h-4 mr-2" />;

// --- Résolution d'URL de fichier Supabase ---
// Convertit un chemin relatif (ex: "modeling-imports/xxx.pdf") en URL publique complète
// Buckets autorisés : 'documents', 'ressources-pedagogiques', 'signed_documents'
const resolveFileUrl = (rawUrl) => {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('http')) return rawUrl;

  // Nettoyage : si le chemin commence par un nom de bucket connu + slash, on le retire
  // car supabase.storage.from(bucket) le rajoute déjà.
  let cleanPath = rawUrl;
  const knownBuckets = ['documents', 'ressources-pedagogiques', 'signed_documents', 'module_resources', 'client_files'];
  for (const b of knownBuckets) {
    if (cleanPath.startsWith(`${b}/`)) {
      cleanPath = cleanPath.substring(b.length + 1);
      break;
    }
  }

  // LOGIQUE DE BUCKET :
  const isRessource = cleanPath.startsWith('ressources/') || cleanPath.startsWith('modeling-imports/');
  const isSigned = cleanPath.startsWith('signed_');
  const bucket = isSigned ? 'signed_documents' : (isRessource ? 'ressources-pedagogiques' : 'documents');

  const { data } = supabase.storage.from(bucket).getPublicUrl(cleanPath);

  if (!data?.publicUrl) {
    console.error("Erreur de lien storage:", cleanPath, "dans le bucket:", bucket);
  }

  return data?.publicUrl || null;
};

const ANCHOR_KEYS = [
  { key: 'score_technique', label: 'Expertise Technique', description: "Le contenu du travail est votre motivation. Vous cherchez à être expert et reconnu par vos pairs." },
  { key: 'score_management', label: 'Compétence Managériale', description: "Vous avez un désir intense de diriger, de contrôler et de prendre des décisions stratégiques." },
  { key: 'score_autonomie', label: 'Autonomie / Indépendance', description: "Vous cherchez avant tout à être libre dans vos décisions et refusez les réglementations restrictives." },
  { key: 'score_securite', label: 'Sécurité / Stabilité', description: "Vous valorisez la stabilité de l'emploi et la pérennité de l'entreprise avant tout." },
  { key: 'score_entrepreneur', label: 'Créativité / Entrepreneuriat', description: "Vous avez un besoin impérieux de créer de nouvelles activités et de vaincre les obstacles par votre ténacité." },
  { key: 'score_service', label: 'Dévouement / Service', description: "Votre carrière est une cause. Vous voulez réaliser quelque chose qui a de la valeur, comme aider les autres." },
  { key: 'score_defi', label: 'Défi Pur', description: "Vous définissez votre vie par la compétition. Seuls les problèmes insolubles vous attirent." },
  { key: 'score_lifestyle', label: 'Style de vie', description: "L'équilibre entre vie privée et vie professionnelle est votre priorité absolue." },
];


// ==========================================
// MODALS
// ==========================================
const SignatureModal = ({ isOpen, onClose, onSave }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0f172a';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (e.touches && e.touches.length > 0) {
      const rect = canvas.getBoundingClientRect();
      return {
        offsetX: e.touches[0].clientX - rect.left,
        offsetY: e.touches[0].clientY - rect.top
      };
    }
    return { offsetX: e.nativeEvent.offsetX, offsetY: e.nativeEvent.offsetY };
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d');
    const { offsetX, offsetY } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current.getContext('2d');
    const { offsetX, offsetY } = getCoordinates(e);
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 w-full max-w-lg border border-gray-100">
        <h3 className="text-xl font-extrabold text-gray-900 mb-2">Émargement Électronique</h3>
        <p className="text-sm text-gray-500 mb-6">Veuillez signer lisiblement dans le cadre ci-dessous pour valider votre présence ou votre accord.</p>
        <div className="border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden bg-gray-50 touch-none mb-6 relative">
          <canvas
            ref={canvasRef}
            width={450}
            height={200}
            className="w-full h-[200px] cursor-crosshair"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseOut={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          <div className="absolute bottom-3 right-3 opacity-30 pointer-events-none text-xs font-bold uppercase tracking-widest text-gray-500">Zone de signature</div>
        </div>
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <button onClick={clearCanvas} className="px-5 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors w-full sm:w-auto">Effacer</button>
          <div className="flex gap-3 w-full sm:w-auto flex-col sm:flex-row">
            <button onClick={onClose} className="px-5 py-3 text-gray-700 font-bold hover:bg-gray-100 rounded-xl transition-colors w-full sm:w-auto">Annuler</button>
            <button onClick={handleSave} className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors shadow-lg w-full sm:w-auto">Valider</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AddressInput = ({ value, onChange }) => {
  const parseAddress = (addr) => {
    if (!addr) return { rue: '', codePostal: '', ville: '' };
    const m = addr.match(/^(.*?),?\s*(\d{5})\s+(.+)$/);
    if (m) return { rue: m[1].trim().replace(/,$/, ''), codePostal: m[2], ville: m[3].trim() };
    return { rue: addr, codePostal: '', ville: '' };
  };
  const [parts, setParts] = React.useState(() => parseAddress(value));
  const updatePart = (field, val) => {
    const np = { ...parts, [field]: val };
    setParts(np);
    const combined = [np.rue, np.codePostal && np.ville ? `${np.codePostal} ${np.ville}` : (np.codePostal || np.ville)].filter(Boolean).join(', ');
    onChange(combined);
  };
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">N° et Rue</label>
        <input
          className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 transition-all text-sm"
          value={parts.rue}
          onChange={e => updatePart('rue', e.target.value)}
          placeholder="Ex: 12 Rue de la Paix"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Code Postal</label>
          <input
            className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 transition-all text-sm"
            value={parts.codePostal}
            onChange={e => updatePart('codePostal', e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="75000"
            maxLength={5}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Ville</label>
          <input
            className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 transition-all text-sm"
            value={parts.ville}
            onChange={e => updatePart('ville', e.target.value)}
            placeholder="Paris"
          />
        </div>
      </div>
    </div>
  );
};

const EmargementModal = ({ isOpen, onClose, onSave, sessionTitle, signerRole = 'formateur' }) => {
  const fCanvasRef = useRef(null);
  const cCanvasRef = useRef(null);
  const [fDrawing, setFDrawing] = useState(false);
  const [cDrawing, setCDrawing] = useState(false);
  const isClient = signerRole === 'client';

  useEffect(() => {
    if (!isOpen) return;
    const setup = (canvas) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0f172a';
    };
    if (!isClient) setup(fCanvasRef.current);
    setup(cCanvasRef.current);
  }, [isOpen, isClient]);

  const getCoords = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    if (e.touches?.length > 0) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
  };

  const fStart = (e) => { if (e.touches) e.preventDefault(); setFDrawing(true); const ctx = fCanvasRef.current.getContext('2d'); const { x, y } = getCoords(e, fCanvasRef.current); ctx.beginPath(); ctx.moveTo(x, y); };
  const fMove  = (e) => { if (!fDrawing) return; if (e.touches) e.preventDefault(); const ctx = fCanvasRef.current.getContext('2d'); const { x, y } = getCoords(e, fCanvasRef.current); ctx.lineTo(x, y); ctx.stroke(); };
  const fStop  = () => setFDrawing(false);

  const cStart = (e) => { if (e.touches) e.preventDefault(); setCDrawing(true); const ctx = cCanvasRef.current.getContext('2d'); const { x, y } = getCoords(e, cCanvasRef.current); ctx.beginPath(); ctx.moveTo(x, y); };
  const cMove  = (e) => { if (!cDrawing) return; if (e.touches) e.preventDefault(); const ctx = cCanvasRef.current.getContext('2d'); const { x, y } = getCoords(e, cCanvasRef.current); ctx.lineTo(x, y); ctx.stroke(); };
  const cStop  = () => setCDrawing(false);

  const clearCanvas = (ref) => { const c = ref.current; if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); };

  const isEmpty = (canvas) => {
    if (!canvas) return true;
    return !Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data).some(v => v !== 0);
  };

  const handleSave = () => {
    if (isClient) {
      if (isEmpty(cCanvasRef.current)) { toast.error('Votre signature est requise.'); return; }
      onSave(null, cCanvasRef.current.toDataURL('image/png'));
    } else {
      if (isEmpty(fCanvasRef.current)) { toast.error('La signature du formateur est requise.'); return; }
      const fSig = fCanvasRef.current.toDataURL('image/png');
      const cSig = !isEmpty(cCanvasRef.current) ? cCanvasRef.current.toDataURL('image/png') : null;
      onSave(fSig, cSig);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className={`bg-white rounded-3xl shadow-2xl p-6 md:p-8 w-full border border-gray-100 ${isClient ? 'max-w-lg' : 'max-w-2xl'}`}>
        <h3 className="text-xl font-extrabold text-gray-900 mb-1">Émargement de présence</h3>
        {sessionTitle && <p className="text-sm text-indigo-600 font-bold mb-3">{sessionTitle}</p>}
        <p className="text-sm text-gray-500 mb-6">{isClient ? 'Signez ci-dessous pour valider votre présence.' : 'Signez dans les cadres ci-dessous pour valider la présence.'}</p>
        <div className={`grid gap-6 mb-6 ${isClient ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {!isClient && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-black uppercase tracking-wider text-gray-600">Formateur <span className="text-rose-500">*</span></span>
                <button onClick={() => clearCanvas(fCanvasRef)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Effacer</button>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden bg-gray-50 touch-none relative">
                <canvas ref={fCanvasRef} width={280} height={150} className="w-full h-[150px] cursor-crosshair"
                  onMouseDown={fStart} onMouseMove={fMove} onMouseUp={fStop} onMouseOut={fStop}
                  onTouchStart={fStart} onTouchMove={fMove} onTouchEnd={fStop} />
                <div className="absolute bottom-2 right-2 opacity-20 pointer-events-none text-xs font-bold uppercase tracking-widest text-gray-500">Signer ici</div>
              </div>
            </div>
          )}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-gray-600">Bénéficiaire {isClient && <span className="text-rose-500">*</span>}</span>
              <button onClick={() => clearCanvas(cCanvasRef)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Effacer</button>
            </div>
            <div className="border-2 border-dashed border-gray-300 rounded-2xl overflow-hidden bg-gray-50 touch-none relative">
              <canvas ref={cCanvasRef} width={280} height={150} className="w-full h-[150px] cursor-crosshair"
                onMouseDown={cStart} onMouseMove={cMove} onMouseUp={cStop} onMouseOut={cStop}
                onTouchStart={cStart} onTouchMove={cMove} onTouchEnd={cStop} />
              <div className="absolute bottom-2 right-2 opacity-20 pointer-events-none text-xs font-bold uppercase tracking-widest text-gray-500">Signer ici</div>
            </div>
          </div>
        </div>
        <div className="flex justify-between gap-3">
          <button onClick={onClose} className="px-5 py-3 text-gray-700 font-bold hover:bg-gray-100 rounded-xl transition-colors">Annuler</button>
          <button onClick={handleSave} className="px-6 py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors shadow-lg">Valider l'émargement</button>
        </div>
      </div>
    </div>
  );
};

// Modale PDF polyvalente:
// - mode "view" => lecture simple (iframe)
// - mode "sign" => lecture obligatoire + canvas de signature en bas
/**
 * Convertit un Blob DOCX en Blob PDF via ConvertAPI (rendu pixel-perfect).
 * Lance une erreur si la clé est manquante ou si l'API échoue — pas de fallback HTML.
 */
const convertDocxBlobToPdf = async (docxBlob) => {
  const secret = process.env.REACT_APP_CONVERT_API_SECRET || process.env.REACT_APP_CONVERTAPI_SECRET;
  if (!secret) throw new Error('Clé ConvertAPI manquante (REACT_APP_CONVERT_API_SECRET). Conversion impossible.');

  const formData = new FormData();
  formData.append('File', new File([docxBlob], 'document.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));

  const response = await fetch(`https://v2.convertapi.com/convert/docx/to/pdf?Secret=${secret}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('ConvertAPI : clé API invalide ou crédits épuisés. Vérifiez votre compte sur convertapi.com et la variable REACT_APP_CONVERT_API_SECRET dans Vercel.');
    throw new Error(`ConvertAPI error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.Files?.length) throw new Error('ConvertAPI: aucun fichier retourné dans la réponse.');

  const byteCharacters = atob(result.Files[0].FileData);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
  return new Blob([byteArray], { type: 'application/pdf' });
};

const DocumentViewerModal = ({ isOpen, onClose, document, url, title, mode = 'view', onSave, isInteractiveConsent = false, supabase: passedSupabase }) => {
  // On utilise le supabase passé en prop s'il existe, sinon le global
  const activeSupabase = passedSupabase || supabase;
  const [hasRead, setHasRead] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const scrollRef = useRef(null);
  const signatureSectionRef = useRef(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  const sigCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef(null);
  const [hasSig, setHasSig] = useState(false);
  const [documentChoice, setDocumentChoice] = useState(null); // 'autorise' | 'refuse' | null

  // resolveFileUrl est appliqué ici pour couvrir toutes les sources (relative path ou URL complète)
  const pdfUrl = resolveFileUrl(url || document?.url);
  const pdfTitle = title || document?.nom || 'Document';
  const isValidUrl = !!pdfUrl; // resolveFileUrl garantit une URL https si non null

  // Nouvelle approche : signed URL → iframe directe (pas de fetch, pas de CORS)
  // createSignedUrl génère un lien temporaire que l'iframe peut charger sans restriction
  useEffect(() => {
    let cancelled = false;

    // Extrait bucket + path depuis une URL Supabase publique ou un chemin relatif
    const extractBucketPath = (fullUrl) => {
      if (!fullUrl) return null;
      console.log('[DocumentViewerModal] Extraction depuis:', fullUrl);
      
      // Cas 1: URL complète Supabase (public ou sign|authenticated)
      const match = fullUrl.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
      if (match) {
        let bucket = match[1];
        let rawPath = match[2];
        let path = decodeURIComponent(rawPath);
        
        // Nettoyage : si le path commence par le nom du bucket (redondance parfois constatée)
        if (path.startsWith(`${bucket}/`)) {
          path = path.substring(bucket.length + 1);
        }
        
        return { bucket, path };
      }
      
      // Cas 2: Chemin relatif ou simple nom de fichier
      let path = fullUrl;
      let bucket = 'documents'; // Default

      if (path.startsWith('ressources/') || path.startsWith('ressources-pedagogiques/')) {
        bucket = 'ressources-pedagogiques';
        path = path.replace('ressources/', '').replace('ressources-pedagogiques/', '');
      } else if (path.startsWith('modeling-imports/')) {
        bucket = 'ressources-pedagogiques';
      } else if (path.startsWith('documents/')) {
        bucket = 'documents';
        path = path.replace('documents/', '');
      }

      return { bucket, path };
    };

    const loadSignedUrl = async () => {
      if (!isOpen || !isValidUrl) return;
      setLoadingPdf(true);
      setPdfError(null);
      setBlobUrl(null);

      const initialExtracted = extractBucketPath(pdfUrl);
      if (!initialExtracted) {
        setPdfError('Chemin de fichier invalide');
        setLoadingPdf(false);
        return;
      }

      const { bucket: initialBucket, path: initialPath } = initialExtracted;
      const bucketsToTry = [initialBucket, 'documents', 'ressources-pedagogiques', 'signed_documents', 'module_resources', 'client_files'].filter((v, i, a) => a.indexOf(v) === i);
      const uniqueBuckets = [...new Set(bucketsToTry.filter(Boolean))];

      try {
        let finalSignedUrl = null;
        let lastError = null;
        let finalPath = initialPath;

        for (const bucket of uniqueBuckets) {
          console.log(`[DocumentViewerModal] Tentative dans le bucket: ${bucket} | Path: ${initialPath}`);
          let { data, error } = await activeSupabase.storage.from(bucket).createSignedUrl(initialPath, 3600);

          // Fallback 1: Si non trouvé, on tente le nom de fichier seul
          if (error?.message?.includes('not found') && initialPath.includes('/')) {
            const alternativePath = initialPath.split('/').pop();
            console.warn(`[DocumentViewerModal] Objet non trouvé à "${initialPath}" dans "${bucket}". Tentative à la racine: "${alternativePath}"...`);
            const fallbackResult = await activeSupabase.storage.from(bucket).createSignedUrl(alternativePath, 3600);
            data = fallbackResult.data;
            error = fallbackResult.error;
            if (!error && data?.signedUrl) {
              finalPath = alternativePath;
            }
          }

          if (!error && data?.signedUrl) {
            finalSignedUrl = data.signedUrl;
            console.log(`%c[DocumentViewerModal] ✅ Succès trouvé dans le bucket "${bucket}" !`, 'color: #10b981; font-weight: bold;');
            break;
          } else {
            lastError = error?.message || 'Inconnu';
          }
        }

        if (cancelled) return;

        if (!finalSignedUrl) {
          // Fallback final : utiliser directement la pdfUrl publique si disponible
          if (pdfUrl && pdfUrl.startsWith('http')) {
            console.warn('[DocumentViewerModal] Signed URL introuvable — fallback sur URL publique directe.');
            const fallbackPath = pdfUrl.split('?')[0].toLowerCase();
            const isFallbackWord = fallbackPath.endsWith('.docx') || fallbackPath.endsWith('.doc');
            if (isFallbackWord) {
              setBlobUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pdfUrl)}`);
            } else {
              setBlobUrl(pdfUrl);
            }
            setLoadingPdf(false);
            return;
          }
          setDebugInfo({ bucket: initialBucket, path: initialPath, error: lastError || 'Fichier introuvable dans tous les buckets testés.' });
          throw new Error(lastError || 'Fichier introuvable');
        }

        const isWord = finalPath.toLowerCase().endsWith('.docx') || finalPath.toLowerCase().endsWith('.doc');
        if (isWord) {
          // Microsoft Office Online Viewer — gratuit, sans clé API, rendu fidèle DOCX
          // On utilise la pdfUrl (URL publique) plutôt que la signed URL pour la stabilité
          const docViewerSrc = pdfUrl && pdfUrl.startsWith('http')
            ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pdfUrl)}`
            : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(finalSignedUrl)}`;
          if (!cancelled) setBlobUrl(docViewerSrc);
        } else {
          setBlobUrl(finalSignedUrl);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[DocumentViewerModal] Erreur critique:', err.message);
          setPdfError(err.message);
        }
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    };

    if (isOpen) {
      loadSignedUrl();
    } else {
      setHasRead(false);
      setAgreed(false);
      setBlobUrl(null);
      setPdfError(null);
      setDocumentChoice(null);
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pdfUrl]);

  useEffect(() => {
    if (!isOpen || mode !== 'sign' || hasRead) return;
    const el = signatureSectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setHasRead(true); },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen, mode, hasRead, blobUrl]);

  const handleScroll = (e) => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setHasRead(true);
  };


  if (!isOpen) return null;

  const renderPdfZone = () => {
    if (loadingPdf) return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
        <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-sm font-medium">Chargement du document en cours…</p>
      </div>
    );
    if (blobUrl) {
      // Les URLs du viewer Office Online ne doivent pas recevoir le suffixe PDF
      const isOfficeViewer = blobUrl.startsWith('https://view.officeapps.live.com');
      return (
        <iframe
          src={isOfficeViewer ? blobUrl : blobUrl + '#toolbar=0&navpanes=0'}
          title={pdfTitle}
          className="w-full h-full border-0"
          allowFullScreen
        />
      );
    }
    // Erreur ou pas d'URL
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 p-8">
        <div className="text-5xl">📄</div>
        <div className="text-center">
          <p className="font-semibold text-gray-600">
            {pdfError 
              ? (pdfError.includes('Object not found') ? 'Fichier source introuvable dans le stockage' : 'Impossible de charger le document') 
              : 'Aucun fichier joint à cette session.'}
          </p>
          {debugInfo && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg text-[10px] font-mono text-left overflow-auto max-w-xs mx-auto border border-gray-200">
              <p className="text-gray-500 uppercase font-bold mb-1 border-b border-gray-200 pb-1">Diagnostic Technique</p>
              <p><span className="text-rose-600">Bucket:</span> {debugInfo.bucket}</p>
              <p className="break-all"><span className="text-rose-600">Path:</span> {debugInfo.path}</p>
              <p className="text-rose-500 mt-1 italic">{debugInfo.error}</p>
            </div>
          )}
        </div>
        {pdfError && <p className="text-xs text-red-400 font-mono bg-red-50 px-3 py-2 rounded-lg">{pdfError}</p>}
        {isValidUrl && (
          <button
            onClick={() => window.open(blobUrl || pdfUrl, '_blank')}
            className="flex items-center gap-2 bg-rose-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-rose-700 transition-colors shadow-lg"
          >
            <Download size={16} /> Télécharger pour lire le document
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-900/80 z-[100] flex items-center justify-center p-2 md:p-6 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col relative" style={{ maxHeight: '95vh' }}>
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white z-10 shrink-0 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600 font-bold text-sm">
              {pdfUrl && (pdfUrl.toLowerCase().includes('.docx') || pdfUrl.toLowerCase().includes('.doc')) ? 'DOC' : 'PDF'}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900">{pdfTitle}</h3>
              {mode === 'sign' && (
                <p className="text-[11px] font-bold" style={{ color: hasRead ? '#16a34a' : '#f97316' }}>
                  {hasRead ? '✅ Document parcouru — vous pouvez maintenant signer.' : '⬇️ Parcourez le document puis faites défiler pour déverrouiller la signature.'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isValidUrl && (
              <button
                onClick={() => window.open(pdfUrl, '_blank')}
                className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title="Ouvrir dans un nouvel onglet"
              >
                <Download size={14} /> Ouvrir ↗
              </button>
            )}
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors">✕</button>
          </div>
        </div>

        {/* Scrollable content zone */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto bg-gray-50 p-3 md:p-4 flex flex-col gap-6"
          onScroll={mode === 'sign' ? handleScroll : undefined}
          style={{ minHeight: 0 }}
        >
          {/* PDF Zone */}
          <div className="w-full rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white" style={{ height: mode === 'sign' ? '60vh' : '72vh', minHeight: 380 }}>
            {renderPdfZone()}
          </div>

          {/* Section signature (mode sign uniquement) */}
          {mode === 'sign' && (
            <div ref={signatureSectionRef} className={`bg-white rounded-2xl border-2 transition-all ${hasRead ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-50 pointer-events-none'}`}>
              <div className="p-5 border-b border-gray-100">
                <h4 className="font-extrabold text-gray-900 mb-1">Signature électronique</h4>
                <p className="text-sm text-gray-500">Dessinez votre signature dans le cadre ci-dessous, puis cliquez sur "Signer ce document".</p>
              </div>
              <div className="p-5">
                {isInteractiveConsent && (
                  <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm font-bold text-amber-800 mb-3">Avant de signer, indiquez votre choix :</p>
                    <label className="flex items-center gap-3 cursor-pointer mb-2 select-none">
                      <input
                        type="radio"
                        name="documentChoice"
                        value="autorise"
                        checked={documentChoice === 'autorise'}
                        onChange={() => setDocumentChoice('autorise')}
                        className="w-4 h-4 accent-green-600 shrink-0"
                      />
                      <span className="text-sm text-gray-700 font-medium">J'autorise la conservation de mes documents personnels</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="documentChoice"
                        value="refuse"
                        checked={documentChoice === 'refuse'}
                        onChange={() => setDocumentChoice('refuse')}
                        className="w-4 h-4 accent-red-600 shrink-0"
                      />
                      <span className="text-sm text-gray-700 font-medium">Je n'autorise pas la conservation de mes documents personnels</span>
                    </label>
                    {!documentChoice && (
                      <p className="text-xs text-amber-700 mt-2 italic">Ce choix est obligatoire pour débloquer la signature.</p>
                    )}
                  </div>
                )}
                <label className="flex items-start gap-3 cursor-pointer mb-4 select-none">
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-rose-500 shrink-0" />
                  <span className="text-sm text-gray-600">Je certifie avoir <strong>lu et compris</strong> l'intégralité de ce document et j'accepte de le valider par ma signature électronique.</span>
                </label>
                {/* Canvas de signature manuscrite */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Votre signature</span>
                    <button
                      type="button"
                      onClick={() => {
                        const canvas = sigCanvasRef.current;
                        if (canvas) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); setHasSig(false); }
                      }}
                      className="text-xs text-gray-400 hover:text-rose-500 transition-colors"
                    >Effacer</button>
                  </div>
                  <canvas
                    ref={sigCanvasRef}
                    width={580}
                    height={140}
                    className="w-full border-2 border-dashed border-gray-300 rounded-xl bg-white cursor-crosshair"
                    style={{ touchAction: 'none' }}
                    onMouseDown={e => {
                      const c = sigCanvasRef.current;
                      const r = c.getBoundingClientRect();
                      isDrawingRef.current = true;
                      lastPosRef.current = { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
                    }}
                    onMouseMove={e => {
                      if (!isDrawingRef.current) return;
                      const c = sigCanvasRef.current;
                      const r = c.getBoundingClientRect();
                      const x = (e.clientX - r.left) * c.width / r.width;
                      const y = (e.clientY - r.top) * c.height / r.height;
                      const ctx = c.getContext('2d');
                      ctx.beginPath(); ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y); ctx.lineTo(x, y);
                      ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
                      lastPosRef.current = { x, y };
                      if (!hasSig) setHasSig(true);
                    }}
                    onMouseUp={() => { isDrawingRef.current = false; }}
                    onMouseLeave={() => { isDrawingRef.current = false; }}
                    onTouchStart={e => {
                      e.preventDefault();
                      const c = sigCanvasRef.current;
                      const r = c.getBoundingClientRect();
                      const t = e.touches[0];
                      isDrawingRef.current = true;
                      lastPosRef.current = { x: (t.clientX - r.left) * c.width / r.width, y: (t.clientY - r.top) * c.height / r.height };
                    }}
                    onTouchMove={e => {
                      e.preventDefault();
                      if (!isDrawingRef.current) return;
                      const c = sigCanvasRef.current;
                      const r = c.getBoundingClientRect();
                      const t = e.touches[0];
                      const x = (t.clientX - r.left) * c.width / r.width;
                      const y = (t.clientY - r.top) * c.height / r.height;
                      const ctx = c.getContext('2d');
                      ctx.beginPath(); ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y); ctx.lineTo(x, y);
                      ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
                      lastPosRef.current = { x, y };
                      if (!hasSig) setHasSig(true);
                    }}
                    onTouchEnd={() => { isDrawingRef.current = false; }}
                  />
                  {!hasSig && <p className="text-xs text-gray-400 mt-1 text-center italic">Tracez votre signature ci-dessus</p>}
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={onClose} className="px-5 py-2.5 text-gray-700 font-bold hover:bg-gray-100 rounded-xl transition-colors text-sm">Annuler</button>
                  <button
                    onClick={() => {
                      if (!onSave) return;
                      const canvas = sigCanvasRef.current;
                      let sigDataUrl = null;
                      if (canvas && hasSig) {
                        const tmp = window.document.createElement('canvas');
                        tmp.width = canvas.width; tmp.height = canvas.height;
                        const ctx = tmp.getContext('2d');
                        ctx.drawImage(canvas, 0, 0);
                        const imgData = ctx.getImageData(0, 0, tmp.width, tmp.height);
                        const d = imgData.data;
                        for (let i = 0; i < d.length; i += 4) {
                          if (d[i] > 220 && d[i+1] > 220 && d[i+2] > 220) d[i+3] = 0;
                        }
                        ctx.putImageData(imgData, 0, 0);
                        sigDataUrl = tmp.toDataURL('image/png');
                      }
                      onSave(sigDataUrl, isInteractiveConsent ? documentChoice : null);
                    }}
                    disabled={!agreed || (isInteractiveConsent && !documentChoice)}
                    className={`px-6 py-2.5 font-bold rounded-xl transition-all text-sm shadow-lg ${(agreed && (!isInteractiveConsent || documentChoice)) ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}
                  >
                    Signer ce document
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer view mode */}
        {mode === 'view' && (
          <div className="p-4 border-t border-gray-100 shrink-0 flex justify-between items-center rounded-b-2xl bg-white">
            <span className="text-xs text-gray-400 italic">{isValidUrl ? pdfUrl.substring(0, 60) + '…' : 'Aucun fichier disponible'}</span>
            <button onClick={onClose} className="px-5 py-2 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors text-sm">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
};




const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, itemName, title = "Confirmation de suppression" }) => {

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/70 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 w-full max-w-md border border-gray-100 animate-slide-up">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6">
          <Trash2 size={32} />
        </div>
        <h3 className="text-xl font-black text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-500 mb-8">
          Confirmez-vous la suppression définitive de <span className="font-bold text-gray-900">{itemName}</span> ? 
          Toutes les données associées seront supprimées et cette action est irréversible.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-5 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Annuler</button>
          <button onClick={onConfirm} className="flex-1 px-5 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-100">Confirmer</button>
        </div>
      </div>
    </div>
  );
};

// ─── Modale Paramètres d'un Document/Session ───────────────────────────────
const DocumentSettingsModal = ({ isOpen, session, onClose, onSave }) => {
  const [nom, setNom] = React.useState('');
  const [reqClient, setReqClient] = React.useState(true);
  const [reqFormateur, setReqFormateur] = React.useState(true);

  React.useEffect(() => {
    if (isOpen && session) {
      const meta = session.metadata || {};
      setNom(session.ressource_titre || session.titre || session.nom || '');
      setReqClient(meta.requiresClientSignature !== false);
      setReqFormateur(meta.requiresTrainerSignature === true);
    }
  }, [isOpen, session]);

  if (!isOpen || !session) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/70 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-7">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
            <Settings size={20} />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900 text-base">Paramètres du document</h3>
            <p className="text-xs text-gray-400">Configurer ce document dans le planning</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Renommer */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Titre du document</label>
            <input
              type="text"
              value={nom}
              onChange={e => setNom(e.target.value)}
              className="w-full p-3 rounded-xl border border-gray-200 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex : Engagement du bénéficiaire"
            />
          </div>

          {/* Qui doit signer */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Qui doit signer ?</label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 cursor-pointer hover:border-indigo-200 transition-all">
                <input
                  type="checkbox"
                  checked={reqClient}
                  onChange={e => setReqClient(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
                <div>
                  <p className="font-bold text-gray-800 text-sm">Signature du Bénéficiaire (Client)</p>
                  <p className="text-[10px] text-gray-400">Le client devra signer ce document</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 cursor-pointer hover:border-rose-200 transition-all">
                <input
                  type="checkbox"
                  checked={reqFormateur}
                  onChange={e => setReqFormateur(e.target.checked)}
                  className="w-4 h-4 accent-rose-600 rounded"
                />
                <div>
                  <p className="font-bold text-gray-800 text-sm">Signature du Coach (Formateur)</p>
                  <p className="text-[10px] text-gray-400">Le formateur devra contresigner</p>
                </div>
              </label>
            </div>
          </div>

          {/* Preview du statut */}
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-[11px] text-blue-700 font-medium">
            <span className="font-black uppercase tracking-wider">Aperçu : </span>
            {reqClient && reqFormateur && 'Signature client + coach requises'}
            {reqClient && !reqFormateur && 'Signature client uniquement — Coach N/A'}
            {!reqClient && reqFormateur && 'Signature coach uniquement — Client N/A'}
            {!reqClient && !reqFormateur && 'Aucune signature requise — Document informatif'}
          </div>
        </div>

        <div className="flex gap-3 mt-7">
          <button onClick={onClose} className="flex-1 px-5 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">
            Annuler
          </button>
          <button
            onClick={() => onSave({ nom, requiresClientSignature: reqClient, requiresTrainerSignature: reqFormateur })}
            className="flex-1 px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

const ExerciceModal = ({ isOpen, onClose, session, onSubmit }) => {
  const [dragOver, setDragOver] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) { setSelectedFile(null); setDragOver(false); setIsSubmitting(false); }
  }, [isOpen]);

  if (!isOpen || !session) return null;

  const exerciceName = session.ressource_titre || session.nom || 'Exercice';
  const fileUrl = session.file_url || session.ressource_url;
  const hasSubmitted = !!session.reponse_url;

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setIsSubmitting(true);
    await onSubmit(session.id, selectedFile);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in">
      <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl border border-gray-100 overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">
        <div className="bg-emerald-600 p-8 text-white relative shrink-0">
          <p className="text-emerald-200 text-[10px] font-black uppercase tracking-widest mb-2">⚙️ Votre Exercice</p>
          <h2 className="text-2xl font-black leading-tight">{exerciceName}</h2>
          {session.instructions && (
            <p className="text-emerald-100 text-sm mt-3 leading-relaxed opacity-90">{session.instructions}</p>
          )}
          <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all">✕</button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto">
          {hasSubmitted && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <span className="text-2xl">📬</span>
              <div>
                <p className="font-black text-amber-800 text-sm">Terminé — En attente de correction</p>
                <p className="text-amber-600 text-xs mt-0.5">Votre formateur va corriger votre rendu prochainement.</p>
              </div>
            </div>
          )}

          {fileUrl && (
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">1. Récupérer l'énoncé</p>
              <button
                onClick={() => window.open(fileUrl, '_blank')}
                className="w-full flex items-center justify-center gap-3 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl text-emerald-700 font-bold hover:bg-emerald-100 transition-all"
              >
                <Download size={18} /> Télécharger le modèle d'exercice
              </button>
            </div>
          )}

          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{fileUrl ? '2.' : '1.'} Déposer votre rendu</p>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${dragOver ? 'border-emerald-500 bg-emerald-50 scale-[1.01]' : selectedFile ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 bg-gray-50 hover:border-emerald-300 hover:bg-emerald-50/30'}`}
            >
              <input
                type="file"
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                onChange={e => { const f = e.target.files[0]; if (f) setSelectedFile(f); }}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
              />
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                  <span className="text-3xl">📎</span>
                  <p className="font-bold text-emerald-700 text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} Mo</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                  <span className="text-3xl">📁</span>
                  <p className="font-bold text-gray-600 text-sm">Déposez votre exercice complété ici</p>
                  <p className="text-xs text-gray-400">ou cliquez pour parcourir vos fichiers</p>
                  <p className="text-[10px] text-gray-300 mt-1">PDF, Word, Excel, Images</p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!selectedFile || isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Envoi en cours...' : hasSubmitted ? 'Envoyer une nouvelle version' : 'Envoyer au formateur'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CorrectionModal = ({ isOpen, onClose, session, onSave }) => {
  const [statut, setStatut] = React.useState('');
  const [commentaire, setCommentaire] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && session) {
      setStatut(session.correction_statut || '');
      setCommentaire(session.correction_commentaire || '');
    }
  }, [isOpen, session]);

  if (!isOpen || !session) return null;

  const handleSave = async () => {
    if (!statut) return;
    setSaving(true);
    try {
      await onSave(session.id, statut, commentaire);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de l\'enregistrement : ' + (e.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-indigo-600 px-6 py-5">
          <h2 className="text-lg font-black text-white">Correction de l'exercice</h2>
          <p className="text-indigo-200 text-sm mt-0.5 truncate">{session.ressource_titre || session.nom}</p>
        </div>
        <div className="p-6 space-y-5">
          {session.reponse_url && (
            <a
              href={session.reponse_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition-colors"
            >
              <FileCheck size={18} />
              Ouvrir le rendu du client
              <span className="ml-auto text-emerald-400">↗</span>
            </a>
          )}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Statut de correction</p>
            <div className="flex gap-3">
              <button
                onClick={() => setStatut('Validé')}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm border-2 transition-all ${statut === 'Validé' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}
              >
                ✅ Validé
              </button>
              <button
                onClick={() => setStatut('À corriger')}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm border-2 transition-all ${statut === 'À corriger' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300'}`}
              >
                📝 À corriger
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Commentaire (optionnel)</p>
            <textarea
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              rows={4}
              placeholder="Votre retour pour le client..."
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl font-bold text-sm bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!statut || saving}
              className="flex-1 py-3 rounded-2xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StepResourceModal = ({ isOpen, onClose, onSave, pedagogicalResources, documentTemplates, supabase, momentLabel }) => {
  const [type, setType] = useState('signature');
  const [title, setTitle] = useState('');
  const [metadata, setMetadata] = useState({
    requiresClientSignature: true,
    requiresTrainerSignature: false,
    documentType: 'signature'
  });
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [destination, setDestination] = useState('client');

  // Reset local state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setType('signature');
      setTitle('');
      setMetadata({
        requiresClientSignature: true,
        requiresTrainerSignature: false,
        documentType: 'signature'
      });
      setSelectedResourceId('');
      setIsUploading(false);
      setInstructions('');
      setDestination('client');
    }
  }, [isOpen]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      let publicUrl;
      if (uploadError) {
        const { error: fallbackError } = await supabase.storage
          .from('ressources-pedagogiques')
          .upload(filePath, file, { cacheControl: '3600', upsert: true });
        if (fallbackError) throw fallbackError;
        ({ data: { publicUrl } } = supabase.storage.from('ressources-pedagogiques').getPublicUrl(filePath));
      } else {
        ({ data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath));
      }

      setSelectedResourceId(publicUrl);
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
    } catch (err) {
      console.error('Error uploading file in modal:', err);
      alert('Erreur lors de l\'import du fichier : ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
        <div className="bg-indigo-600 p-8 text-white relative">
          <h2 className="text-2xl font-black">Ajouter un élément</h2>
          <p className="text-indigo-100 text-sm mt-1 opacity-80">
            {momentLabel ? `Zone : ${momentLabel}` : 'Configurez les détails de l\'activité.'}
          </p>
          <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all">✕</button>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            {['signature', 'document', 'exercice'].map(t => (
              <button
                key={t}
                onClick={() => {
                  setType(t);
                  // Update default title and metadata based on type
                  if (t === 'signature') {
                    setTitle('Émargement de présence');
                    setMetadata({ requiresClientSignature: true, requiresTrainerSignature: false, documentType: 'signature' });
                  } else if (t === 'exercice') {
                    setTitle('');
                    setMetadata({ documentType: 'info' }); // Exercises are info/work by default
                  } else {
                    setTitle('');
                    setMetadata({ requiresClientSignature: true, requiresTrainerSignature: false, documentType: 'info' });
                  }
                }}
                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2 ${type === t ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-indigo-200'}`}
              >
                <span className="text-2xl">{t === 'signature' ? '✍️' : t === 'document' ? '📄' : '⚙️'}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{t}</span>
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2 tracking-widest">Libellé de l'activité</label>
            <input
              type="text"
              placeholder={type === 'signature' ? 'Émargement de présence' : type === 'exercice' ? 'Nom de l\'exercice' : 'Titre du document'}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-all"
            />
          </div>

          {type === 'exercice' && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Énoncé / Consignes de l'exercice</label>
              <textarea
                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-indigo-500 font-medium text-gray-800 text-sm transition-all resize-none"
                placeholder="Décrivez ici les consignes pour votre client..."
                rows={4}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
              />
            </div>
          )}

          {type !== 'signature' && (
            <div className="space-y-4 animate-slide-up">
              <div className="space-y-3">
                {/* Modélothèque dropdown */}
                {documentTemplates && Object.keys(documentTemplates).length > 0 && (
                  <select
                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    value={selectedResourceId}
                    onChange={e => {
                      const url = e.target.value;
                      setSelectedResourceId(url);
                      if (url) {
                        const entry = Object.entries(documentTemplates).find(([, tpl]) => tpl.url === url);
                        if (entry && !title) setTitle(entry[0]);
                      }
                    }}
                  >
                    <option value="">Sélectionner dans la modélothèque...</option>
                    {Object.entries(documentTemplates).map(([nom, tpl]) => (
                      <option key={nom} value={tpl.url || ''}>{nom}</option>
                    ))}
                  </select>
                )}

                <div className="flex items-center gap-4">
                  <div className="h-px bg-gray-100 flex-1"></div>
                  <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">OU</span>
                  <div className="h-px bg-gray-100 flex-1"></div>
                </div>

                <label className={`w-full flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 font-bold text-xs cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {isUploading ? 'Importation en cours...' : '📁 Importer un fichier (PDF, Word, Excel)'}
                  <input
                    type="file"
                    className="hidden"
                    disabled={isUploading}
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </label>
                {selectedResourceId && !isUploading && (
                  <p className="text-[10px] text-green-600 font-bold flex items-center gap-1">✓ Fichier sélectionné</p>
                )}
              </div>

              {type === 'document' && (
                <div className="bg-indigo-50/50 p-4 rounded-2xl space-y-3">
                  {/* Destinataire */}
                  <div>
                    <label className="block text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-2">Destinataire</label>
                    <div className="flex gap-4">
                      {[['client', 'Client'], ['formateur', 'Formateur'], ['both', 'Les deux']].map(([val, lbl]) => (
                        <label key={val} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" checked={destination === val} onChange={() => setDestination(val)} className="rounded-full text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-sm font-bold text-gray-700">{lbl}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Signature requise */}
                  <div className="pt-3 border-t border-indigo-100">
                    <label className="block text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-2">Signature</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={metadata.requiresClientSignature} onChange={e => setMetadata({ ...metadata, requiresClientSignature: e.target.checked, documentType: e.target.checked ? 'signature' : metadata.requiresTrainerSignature ? 'signature' : 'info' })} className="rounded text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-[10px] font-bold text-indigo-900 uppercase">Client</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={metadata.requiresTrainerSignature} onChange={e => setMetadata({ ...metadata, requiresTrainerSignature: e.target.checked, documentType: e.target.checked ? 'signature' : metadata.requiresClientSignature ? 'signature' : 'info' })} className="rounded text-indigo-600 focus:ring-indigo-500" />
                        <span className="text-[10px] font-bold text-indigo-900 uppercase">Formateur</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 pb-2">
            <button
              onClick={() => {
                onSave({ type, title, metadata: { ...metadata, destination }, resourceId: selectedResourceId, fileUrl: selectedResourceId.includes('/') ? selectedResourceId : null, destination, instructions: type === 'exercice' ? instructions : null });
                onClose();
              }}
              disabled={!title.trim() || isUploading || (type !== 'signature' && !selectedResourceId)}
              className="w-full bg-indigo-600 hover:bg-black text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-100 transition-all disabled:opacity-50"
            >
              {isUploading ? 'Veuillez patienter...' : 'Enregistrer l\'activité'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Composant Modal pour l'ajout d'éléments personnalisés par le Formateur ---
const SessionItemModal = ({ isOpen, onClose, onSave, pedagogicalResources, supabase, clientSessions = [], preSelectedSessionId = null, preSelectedLabel = null }) => {
  const [choice, setChoice] = useState('existing'); // 'existing' or 'new'
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [type, setType] = useState('signature');
  const [title, setTitle] = useState('');
  const [isToSign, setIsToSign] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [instructions, setInstructions] = useState('');

  // States for 'new' choice
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setChoice('existing');
      setType('signature');
      setTitle('');
      setIsToSign(false);
      setSelectedResourceId('');
      setIsUploading(false);
      setSelectedSessionId(preSelectedSessionId || '');
      setNewDate('');
      setNewStart('');
      setNewEnd('');
      setInstructions('');
    }
  }, [isOpen, preSelectedSessionId]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `custom-session-items/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

      setSelectedResourceId(publicUrl);
    } catch (err) {
      toast.error('Erreur lors de l\'import du fichier.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const groupedSessions = clientSessions.reduce((acc, s) => {
    if (!acc[s.numero_seance]) acc[s.numero_seance] = s;
    return acc;
  }, {});
  const uniqueSessionOptions = Object.values(groupedSessions).sort((a, b) => a.numero_seance - b.numero_seance);

  return (
    <div className="fixed inset-0 bg-gray-950/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 animate-slide-up">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg"><Plus size={20} /></div>
            <h3 className="text-xl font-black text-gray-900 leading-none">Nouvel Élément</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400">✕</button>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* Contexte séance : badge si pré-sélectionné, sinon toggle + sélecteur */}
          {preSelectedSessionId ? (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3">
              <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shrink-0">
                <Layout size={14} />
              </div>
              <div>
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Ajout dans</p>
                <p className="text-sm font-black text-indigo-900">{preSelectedLabel || 'Séance sélectionnée'}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex p-1 bg-gray-100 rounded-2xl gap-1">
                <button
                  onClick={() => setChoice('existing')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${choice === 'existing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Séance Existante
                </button>
                <button
                  onClick={() => setChoice('new')}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${choice === 'new' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Nouvelle Séance
                </button>
              </div>

              {choice === 'existing' ? (
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Choisir la séance</label>
                  <select
                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none focus:border-indigo-500"
                    value={selectedSessionId}
                    onChange={e => setSelectedSessionId(e.target.value)}
                  >
                    <option value="">-- Sélectionner --</option>
                    {uniqueSessionOptions.map(s => (
                      <option key={s.id} value={s.id}>SÉANCE {s.numero_seance} {s.nom ? `(${s.nom.split(' - ')[0]})` : ''}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Date de la séance</label>
                      <input
                        type="date"
                        className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800"
                        value={newDate}
                        onChange={e => setNewDate(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Début</label>
                        <input
                          type="time"
                          className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800"
                          value={newStart}
                          onChange={e => setNewStart(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Fin</label>
                        <input
                          type="time"
                          className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800"
                          value={newEnd}
                          onChange={e => setNewEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Titre */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Titre de l'élément</label>
            <input
              autoFocus
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-indigo-500 font-bold text-gray-800 transition-all"
              placeholder="Ex: Compte-rendu mi-parcours"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Type d'activité */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Type d'activité</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'signature', label: 'Émargement', icon: '✍️' },
                { id: 'document', label: 'Document', icon: '📄' },
                { id: 'exercice', label: 'Exercice', icon: '⚙️' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${type === t.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-50 bg-gray-50 text-gray-400 hover:border-gray-200'}`}
                >
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-[9px] font-black uppercase text-center">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Énoncé / Consignes — uniquement pour les exercices */}
          {type === 'exercice' && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Énoncé / Consignes de l'exercice</label>
              <textarea
                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-indigo-500 font-medium text-gray-800 text-sm transition-all resize-none"
                placeholder="Décrivez ici les consignes pour votre client..."
                rows={4}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
              />
            </div>
          )}

          {/* Fichier / Ressource */}
          {(type === 'document' || type === 'exercice') && (
            <div className="space-y-4">
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">Fichier / Ressource</label>
              <div className="flex flex-col gap-3">
                <input
                  type="file"
                  accept={(type === 'signature' || isToSign) ? ".pdf" : undefined}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      if ((type === 'signature' || isToSign) && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                        toast.error('Erreur : Seuls les fichiers PDF sont autorisés pour les documents nécessitant une signature.');
                        e.target.value = '';
                        return;
                      }
                      setTitle(file.name.replace(/\.[^/.]+$/, ""));
                      handleFileUpload(file);
                    }
                  }}
                  className="w-full text-xs p-3 bg-gray-50 border border-dashed border-gray-300 rounded-2xl"
                />
                <div className="text-center font-bold text-gray-300 text-[10px]">OU SÉLECTIONNER DANS LA BIBLIOTHÈQUE</div>
                <select
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-bold"
                  value={selectedResourceId}
                  onChange={e => setSelectedResourceId(e.target.value)}
                >
                  <option value="">-- Choisir une ressource existante --</option>
                  {pedagogicalResources.map(res => (
                    <option key={res.name} value={res.url}>{res.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {type === 'document' && (
            <div className="flex items-center gap-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
              <input
                type="checkbox"
                id="isToSignCustom"
                checked={isToSign}
                onChange={e => setIsToSign(e.target.checked)}
                className="w-5 h-5 rounded-lg border-indigo-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="isToSignCustom" className="text-xs font-bold text-indigo-900 cursor-pointer">
                Nécessite une signature du client / coach
              </label>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 flex gap-3">
          <button onClick={onClose} className="flex-1 py-4 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors">Annuler</button>
          <button
            disabled={
              !title ||
              isUploading ||
              ((type === 'document' || type === 'exercice') && !selectedResourceId) ||
              (!preSelectedSessionId && choice === 'existing' && !selectedSessionId)
            }
            onClick={() => {
              const effectiveSessionId = preSelectedSessionId || selectedSessionId;
              const sessionData = (preSelectedSessionId || choice === 'existing')
                ? clientSessions.find(s => s.id === effectiveSessionId)
                : { date: newDate, heure_debut: newStart, heure_fin: newEnd, isNewSession: true };

              onSave({
                title,
                type,
                resourceId: selectedResourceId,
                isToSign: type === 'signature' ? true : isToSign,
                sessionChoice: preSelectedSessionId ? 'existing' : choice,
                sessionData,
                instructions: type === 'exercice' ? instructions : null
              });
              onClose();
            }}
            className="flex-[2] py-4 bg-indigo-600 text-white font-black text-sm rounded-2xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95 transition-all"
          >
            {isUploading ? 'Chargement...' : 'Ajouter l\'élément'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// COMPOSANTS DE VUES EXTRAITS DE APP
// ==========================================

const initDefaultTemplatesForOrg = async (supabase, orgId) => {
  const { data: module } = await supabase.from('modules')
    .insert([{ nom: 'Bilan de Compétences 24h', seances_prevues: 8, organisation_id: orgId }])
    .select().single();
  if (!module) return;
  const templates = [
    'Séance 1 — Accueil & Cadrage', 'Séance 2 — Parcours Professionnel',
    'Séance 3 — Compétences & Ressources', 'Séance 4 — Analyse des Motivations',
    'Séance 5 — Exploration des Métiers', 'Séance 6 — Projet Professionnel',
    "Séance 7 — Plan d'Action", 'Séance 8 — Synthèse & Restitution'
  ];
  for (let i = 0; i < templates.length; i++) {
    const { data: tpl } = await supabase.from('module_session_templates')
      .insert([{ module_id: module.id, titre: templates[i], ordre: i + 1 }])
      .select().single();
    if (tpl) {
      await supabase.from('module_step_resources').insert([{
        template_id: tpl.id, titre: 'Émargement de présence', type: 'signature', ordre: 1,
        metadata: { requiresClientSignature: true, requiresTrainerSignature: false }
      }]);
    }
  }
};

const SignupView = ({ supabase, onComplete }) => {
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setIsLoading(true);
    try {
      // 1. Créer le compte Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
      if (authError) throw authError;

      // 2. Créer l'organisation
      const { data: org, error: orgError } = await supabase.from('organisations')
        .insert([{ nom: orgName.trim() }]).select().single();
      if (orgError) throw orgError;

      // 3. Créer l'entrée admin dans utilisateurs
      const { error: userError } = await supabase.from('utilisateurs').insert([{
        nom: adminName.trim(),
        email: email.trim(),
        role: 'admin',
        organisation_id: org.id
      }]);
      if (userError) throw userError;

      // 4. Injecter les templates par défaut
      await initDefaultTemplatesForOrg(supabase, org.id);

      // 5. Si la session est directement disponible, connecter
      if (authData.session) {
        onComplete();
      } else {
        setNeedsConfirmation(true);
      }
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    }
    setIsLoading(false);
  };

  if (needsConfirmation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100">
          <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6">VB</div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3">Confirmez votre email</h1>
          <p className="text-gray-500 mb-6">Un lien de confirmation a été envoyé à <strong>{email}</strong>. Cliquez dessus pour activer votre compte.</p>
          <button onClick={() => { window.history.replaceState(null, '', '/'); window.location.reload(); }} className="text-sm font-bold text-rose-500 hover:text-rose-600">Retour à la connexion</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md border border-gray-100 animate-fade-in">
        <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6 shadow-lg shadow-rose-500/30">VB</div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1 text-center">Créer votre espace</h1>
        <p className="text-gray-500 mb-8 text-center text-sm">Votre organisme de formation en quelques secondes.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Nom de l'organisme</label>
            <input type="text" required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="ex : Mon Organisme Formation" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Votre nom complet</label>
            <input type="text" required value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="ex : Marie Dupont" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Adresse email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="votre@email.com" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Mot de passe</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Confirmer le mot de passe</label>
            <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Répéter le mot de passe" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
          </div>

          {error && <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{error}</p>}

          <button type="submit" disabled={isLoading} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
            {isLoading ? 'Création en cours...' : 'Créer mon espace'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Déjà inscrit ?{' '}
          <button onClick={() => { window.history.replaceState(null, '', '/'); window.location.reload(); }} className="font-bold text-rose-500 hover:text-rose-600">Se connecter</button>
        </p>
      </div>
    </div>
  );
};

const LoginView = ({ handleLogin, supabase, successMessage, onNeedsSetup }) => {
  const [email, setEmail] = useState(() => {
    // Tenter de pré-remplir l'email depuis l'URL (#email=... ou ?email=...)
    const params = new URLSearchParams(window.location.hash.substring(1) || window.location.search);
    return params.get('email') || '';
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    // 1. Authentification via Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });

    if (authError) {
      console.error('Erreur connexion:', authError);
      if (authError.message.includes('Invalid login credentials')) {
        setErrorMsg('Email ou mot de passe incorrect.');
      } else if (authError.message.includes('Email not confirmed')) {
        setErrorMsg('Votre email n\'a pas encore été confirmé.');
      } else {
        setErrorMsg(authError.message);
      }
      setIsLoading(false);
      return;
    }

    // 2. Chercher le rôle dans la base de données
    const userEmail = authData.user?.email;
    if (userEmail) {
      // D'abord chercher dans utilisateurs (formateurs/admin)
      const { data: userData, error: dbError } = await supabase
        .from('utilisateurs')
        .select('role, id, organisation_id')
        .eq('email', userEmail)
        .single();

      if (userData && userData.role) {
        handleLogin(userData.role, userData.id, userData.organisation_id);
        setIsLoading(false);
        return;
      }

      // Si pas trouvé, chercher dans la table 'clients' (insensible à la casse)
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .ilike('email_contact', userEmail)
        .single();

      if (clientData) {
        handleLogin('client', clientData.id);
        setIsLoading(false);
        return;
      } else {
        const metaRole = authData.user?.user_metadata?.role;
        if (metaRole === 'client') {
          // La requête clients a été bloquée par RLS mais l'utilisateur est un client :
          // son clients.id est identique à son UUID Auth
          handleLogin('client', authData.user.id);
          setIsLoading(false);
          return;
        } else if (metaRole === 'formateur') {
          setErrorMsg('Profil introuvable. Contactez votre administrateur.');
          setIsLoading(false);
          return;
        } else {
          // Admin sans organisation → setup
          console.error('Utilisateur non trouvé dans les DBs:', dbError || clientError);
          onNeedsSetup();
          setIsLoading(false);
          return;
        }
      }
    }

    setIsLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

    if (error) {
      setErrorMsg(error.message);
    } else {
      setResetSent(true);
    }
    setIsLoading(false);
  };

  if (showForgotPassword) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100 animate-fade-in">
          <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6 shadow-lg shadow-rose-500/30">VB</div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Mot de passe oublié</h1>
          <p className="text-gray-500 mb-8">Saisissez votre email pour réinitialiser l'accès.</p>

          {resetSent ? (
            <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm font-medium mb-6">
              Un email contenant le lien de réinitialisation vous a été envoyé.
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5 text-left">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Adresse email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                />
              </div>

              {errorMsg && (
                <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? 'Envoi en cours...' : 'Envoyer le lien'}
              </button>
            </form>
          )}

          <button
            type="button"
            onClick={() => { setShowForgotPassword(false); setResetSent(false); setErrorMsg(''); }}
            className="mt-6 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100 animate-fade-in">
        <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6 shadow-lg shadow-rose-500/30">VB</div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Connexion à VB ERP</h1>
        <p className="text-gray-500 mb-8">Connectez-vous avec vos identifiants.</p>

        {successMessage && (
          <div className="mb-6 p-4 rounded-xl text-sm font-medium bg-green-50 text-green-700">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 text-left">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Adresse email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com"
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-bold text-gray-400 uppercase">Mot de passe</label>
              <button
                type="button"
                onClick={() => { setShowForgotPassword(true); setErrorMsg(''); }}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors"
              >
                Oublié ?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Pas encore de compte ?{' '}
          <a href="/signup" className="font-bold text-rose-500 hover:text-rose-600">Créer votre espace</a>
        </p>
      </div>
    </div>
  );
};

// --- dnd-kit: zone de dépôt séance (carte) ---
const SessDropZone = ({ zoneId, isAdmin, hasActive, children }) => {
  const { isOver, setNodeRef } = useDroppable({ id: String(zoneId) });
  const highlighted = isOver && hasActive;
  return (
    <div
      ref={setNodeRef}
      className={`border rounded-3xl bg-gray-50/50 overflow-hidden shadow-sm transition-all ${
        highlighted
          ? (isAdmin ? 'border-amber-400 bg-amber-50/50 shadow-amber-100' : 'border-indigo-400 bg-indigo-50/50 shadow-indigo-100')
          : 'border-gray-100'
      }`}
    >
      {children(highlighted)}
    </div>
  );
};

// --- dnd-kit: élément déplaçable séance (carte) ---
const SessDragItem = ({ itemId, activeId, children }) => {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: String(itemId) });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`bg-white p-4 rounded-2xl border flex items-center justify-between group transition-all shadow-sm cursor-grab active:cursor-grabbing ${String(activeId) === String(itemId) ? 'opacity-40 border-indigo-200' : 'border-gray-100 hover:border-indigo-200'}`}
    >
      {children}
    </div>
  );
};

// --- dnd-kit: ligne de dépôt (tableau formateur) ---
const FDropGroupRow = ({ groupNum, hasActive, children }) => {
  const { isOver, setNodeRef } = useDroppable({ id: `fg-${groupNum}` });
  const highlighted = isOver && hasActive;
  return (
    <tr ref={setNodeRef} className={`transition-all ${highlighted ? 'bg-indigo-100 outline outline-2 outline-indigo-400' : 'bg-indigo-50/30'}`}>
      {children(highlighted)}
    </tr>
  );
};

// --- dnd-kit: ligne déplaçable (tableau formateur) ---
const FDragItemRow = ({ sessionId, activeId, children }) => {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `fi-${sessionId}` });
  return (
    <tr
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`transition-colors border-l border-gray-100 cursor-grab active:cursor-grabbing ${activeId === `fi-${sessionId}` ? 'opacity-40 bg-indigo-50' : 'hover:bg-gray-50/30'}`}
    >
      {children}
    </tr>
  );
};

const ClientDetailView = ({
  client, formateurs, assignFormateur, handleModuleChange, modules,
  supabase, fetchUtilisateurs, onBack, sessions, fetchSessions, documents, fetchDocuments,
  handleGenerateDocx, documentTemplates, pedagogicalResources,
  handleDownloadResource, handleUploadExerciseResponse, generateSessions,
  handleDeleteClient, setIsSessionItemModalOpen, setTargetSessionForAddition,
  setViewingSession, handleDownloadPDF, updateSessionDate, updateSessionTime,
  onTimeChange, onSaveTimes, editedTimes, lastModifiedSessionId,
  setDocSettingsTarget, setIsDocSettingsOpen, setViewingDocId,
  handleMoveSessionItem, handleSaveCorrection, handleAddAdminBloc
}) => {
  const [activeTab, setActiveTab] = React.useState('infos');
  const [correctionModalSession, setCorrectionModalSession] = React.useState(null);
  const [activeId, setActiveId] = React.useState(null);
  const [isSavingInfo, setIsSavingInfo] = React.useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = React.useState(false);
  const [assignedDocs, setAssignedDocs] = React.useState([]);
  const [moduleDocResources, setModuleDocResources] = React.useState([]);
  const [isLoadingAssigned, setIsLoadingAssigned] = React.useState(false);
  const [showAddDocModal, setShowAddDocModal] = React.useState(false);
  const [clientInfo, setClientInfo] = React.useState({
    nomcomplet_client: client.nomcomplet_client || '',
    client_email: client.client_email || '',
    client_phone: client.client_phone || '',
    adresse_client: client.adresse_client || client.adresse_session || '',
    numero_dossier: client.numero_dossier || '',
    modalite_formation: client.modalite_formation || 'Mixte',
    montant_prestation: client.montant_prestation || ''
  });

  React.useEffect(() => {
    const fetchDetailedClient = async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('id', client.id).single();
      if (data && !error) {
        setClientInfo({
          nomcomplet_client: data.nom_complet || '',
          client_email: data.email_contact || '',
          client_phone: data.telephone || '',
          adresse_client: data.adresse_postale || '',
          numero_dossier: data.numero_dossier || '',
          modalite_formation: data.modalite_formation || 'Mixte',
          montant_prestation: data.montant_prestation || ''
        });
      }
    };
    fetchDetailedClient();
  }, [client.id, supabase]);

  React.useEffect(() => {
    const fetchAssignedDocs = async () => {
      setIsLoadingAssigned(true);
      const [{ data: clientDocs }, { data: moduleResources }] = await Promise.all([
        supabase.from('client_documents').select('*').eq('client_id', client.id).order('ordre', { ascending: true }),
        client.module_id
          ? supabase.from('module_step_resources').select('*').eq('module_id', client.module_id).eq('type', 'document')
          : Promise.resolve({ data: [] })
      ]);
      setAssignedDocs(clientDocs || []);
      setModuleDocResources(moduleResources || []);
      setIsLoadingAssigned(false);
    };
    fetchAssignedDocs();
  }, [client.id, client.module_id, supabase]);

  const handleRemoveAssignedDoc = async (docId) => {
    await supabase.from('client_documents').delete().eq('id', docId);
    setAssignedDocs(prev => prev.filter(d => d.id !== docId));
  };

  const handleAddAssignedDoc = async (titre, url) => {
    const { data, error } = await supabase
      .from('client_documents')
      .insert([{
        client_id: client.id,
        template_titre: titre,
        template_url: url,
        destination: 'client',
        ordre: assignedDocs.length,
        organisation_id: client.organisation_id
      }])
      .select()
      .single();
    if (!error && data) setAssignedDocs(prev => [...prev, data]);
    setShowAddDocModal(false);
  };

  const clientSessions = sessions ? sessions.filter(s => s.client_id === client.id).sort((a, b) => a.numero_seance - b.numero_seance) : [];
  const clientDocs = documents ? documents.filter(d => d.user_id === client.id) : [];

  const handleResendInvite = async () => {
    const email = client.email || client.email_contact || clientInfo.client_email;
    if (!email) return toast.error("Aucun email trouvé pour ce client.");
    const serviceKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return toast.error("Clé de service non configurée.");
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(process.env.REACT_APP_SUPABASE_URL, serviceKey);

    // Essai 1 : invitation classique (compte pas encore créé → email "Définir mon mot de passe")
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (!inviteError) {
      toast.success(`Email d'invitation envoyé à ${email}.`);
      return;
    }

    // Essai 2 : compte existant → envoyer un email "Réinitialiser / définir mon mot de passe"
    // L'utilisateur reçoit un email avec un lien cliquable, exactement comme l'invitation initiale.
    if (inviteError.message?.toLowerCase().includes('already')) {
      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) return toast.error(`Erreur : ${resetError.message}`);
      toast.success(`Email de connexion envoyé à ${email}. Le client peut cliquer sur le lien pour définir son mot de passe.`, { duration: 6000 });
      return;
    }

    toast.error(`Erreur : ${inviteError.message}`);
  };

  const handleSaveClientInfo = async () => {
    setIsSavingInfo(true);
    const { error } = await supabase.from('clients').upsert({
      id: client.id,
      nom_complet: clientInfo.nomcomplet_client,
      email_contact: clientInfo.client_email,
      telephone: clientInfo.client_phone,
      adresse_postale: clientInfo.adresse_client,
      numero_dossier: clientInfo.numero_dossier,
      modalite_formation: clientInfo.modalite_formation,
      montant_prestation: clientInfo.montant_prestation,
      module_id: client.module_id,
      formateur_id: client.formateur_id
    }, { onConflict: 'id' });

    if (error) {
      toast.error("Erreur lors de la sauvegarde : " + error.message);
    } else {
      await fetchUtilisateurs();
      if (client.module_id) await generateSessions(client);
      toast.success("Informations personnelles sauvegardées !");
    }
    setIsSavingInfo(false);
  };

  const updateSession = async (id, payload) => {
    await supabase.from('sessions').update(payload).eq('id', id);
    if (fetchSessions) fetchSessions();
  };

  const handleAddCustomSession = async () => {
    const nextNum = clientSessions.length + 1;
    const { error } = await supabase.from('sessions').insert([{
      client_id: client.id,
      module_id: client.module_id,
      numero_seance: nextNum,
      titre: `Séance personnalisée ${nextNum}`,
      statut: 'À venir'
    }]);
    if (!error && fetchSessions) fetchSessions();
  };

  const handleDeleteSession = async (id) => {
    if (!window.confirm("Supprimer cet élément ?")) return;
    const { error } = await supabaseAdmin.from('sessions').delete().eq('id', id);
    if (error) { toast.error('Erreur suppression : ' + error.message); return; }
    if (fetchSessions) fetchSessions();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <button onClick={onBack} className="text-gray-500 hover:text-gray-900 font-bold flex items-center mb-4 transition-colors">
        <ChevronLeft className="w-5 h-5 mr-1" /> Retour à la supervision
      </button>

      <div className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between md:items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{client.nomcomplet_client || client.nom || "Client sans nom"}</h2>
          <p className="text-gray-500">{client.email || "Aucun email"} - N° Dossier: {client.numero_dossier || "Non défini"}</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <button
            onClick={() => handleDownloadPDF(client, 'emargement')}
            className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm"
          >
            <Download size={16} /> Récap Émargements
          </button>
          <button
            onClick={() => handleDownloadPDF(client)}
            className="bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 px-4 rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm"
          >
            <Download size={16} /> Récapitulatif Général
          </button>
          <button
            onClick={handleResendInvite}
            title="Renvoyer le lien d'invitation par email"
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm"
          >
            <Mail size={16} /> Renvoyer le lien
          </button>
          <span className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider ${client.status === 'Nouveau' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {client.status || 'Actif'}
          </span>
        </div>
      </div>

      <div className="flex gap-4 border-b border-gray-200 overflow-x-auto">
        <button onClick={() => setActiveTab('infos')} className={`shrink-0 px-4 py-3 font-bold text-sm ${activeTab === 'infos' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-800'}`}>Infos & Modalités</button>
        <button onClick={() => setActiveTab('seances')} className={`shrink-0 px-4 py-3 font-bold text-sm ${activeTab === 'seances' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-800'}`}>Supervision Séances</button>
        <button onClick={() => setActiveTab('docs_signes')} className={`shrink-0 px-4 py-3 font-bold text-sm ${activeTab === 'docs_signes' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-800'}`}>📁 Documents Signés</button>
        <button onClick={() => setActiveTab('docs')} className={`shrink-0 px-4 py-3 font-bold text-sm ${activeTab === 'docs' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-800'}`}>Documents liés</button>
      </div>

      {activeTab === 'infos' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-gray-800">Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Module Assigné</label>
              <select value={client.module_id || ''} onChange={(e) => handleModuleChange(client.id, e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-indigo-500 block w-full p-3 outline-none">
                <option value="">Aucun module</option>
                {modules.map(m => (<option key={m.id} value={m.id}>{m.nom}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Formateur Assigné</label>
              <select value={client.formateur_id || ''} onChange={(e) => assignFormateur(client.id, e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm font-bold rounded-xl focus:ring-indigo-500 block w-full p-3 outline-none">
                <option value="">Non assigné</option>
                {formateurs.map(f => (<option key={f.id} value={f.id}>{f.nom}</option>))}
              </select>
            </div>
          </div>

          <h3 className="text-lg font-bold text-gray-800 mt-8">Informations Personnelles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Nom Complet</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.nomcomplet_client} onChange={e => setClientInfo({ ...clientInfo, nomcomplet_client: e.target.value })} placeholder="Nom Complet (Génération Docs)" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Email Contact</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.client_email} onChange={e => setClientInfo({ ...clientInfo, client_email: e.target.value })} placeholder="Email Contact" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Téléphone</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.client_phone} onChange={e => setClientInfo({ ...clientInfo, client_phone: e.target.value })} placeholder="Téléphone" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Adresse Postale</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.adresse_client} onChange={e => setClientInfo({ ...clientInfo, adresse_client: e.target.value })} placeholder="Adresse complète" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">N° de Dossier</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.numero_dossier} onChange={e => setClientInfo({ ...clientInfo, numero_dossier: e.target.value })} placeholder="N° de Dossier" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Montant de la Prestation (€)</label>
              <input type="number" className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.montant_prestation} onChange={e => setClientInfo({ ...clientInfo, montant_prestation: e.target.value })} placeholder="Montant en euros (ex: 1500)" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Modalités de la formation</label>
              <select className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.modalite_formation} onChange={e => setClientInfo({ ...clientInfo, modalite_formation: e.target.value })}>
                <option value="Mixte">Mixte (Présentiel & Distanciel)</option>
                <option value="Présentiel">Présentiel</option>
                <option value="Distanciel">Distanciel</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end items-center gap-3 pt-4 mb-4 border-b border-gray-100 pb-8">
            <button
              onClick={() => setIsConfirmDeleteOpen(true)}
              className="px-6 py-3 text-red-600 font-bold hover:bg-red-50 rounded-xl transition-colors flex items-center"
            >
              <Trash2 size={18} className="mr-2" />
              Supprimer le client
            </button>
            <button
              onClick={handleSaveClientInfo}
              disabled={isSavingInfo}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all flex items-center disabled:opacity-50"
            >
              <Save size={18} className="mr-2" />
              {isSavingInfo ? 'Enregistrement...' : 'Enregistrer les informations'}
            </button>
          </div>

          <DeleteConfirmationModal
            isOpen={isConfirmDeleteOpen}
            onClose={() => setIsConfirmDeleteOpen(false)}
            onConfirm={() => {
              setIsConfirmDeleteOpen(false);
              handleDeleteClient(client.id);
            }}
            itemName={clientInfo.nomcomplet_client || client.nom || "ce client"}
            title="Supprimer ce client ?"
          />
        </div>
      )}

      {activeTab === 'docs_signes' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 gap-4">
            {/* Sessions signées */}
            {sessions
              .filter(s => s.client_id === client.id && (s.signed_pdf_url || s.file_url_signed || s.metadata?.file_url_signed))
              .map(session => {
                const signedUrl = session.signed_pdf_url || session.file_url_signed || session.metadata?.file_url_signed;
                return (
                  <div key={session.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-green-200 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                        <FileCheck size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm">{session.ressource_titre || session.nom || session.titre || 'Document Signé'}</h4>
                        <p className="text-[10px] text-gray-500 uppercase font-black">
                          Signé le {new Date(session.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setViewingSession && setViewingSession({ session: { ...session, file_url: signedUrl }, mode: 'view' })}
                        className="flex items-center gap-2 bg-white text-indigo-700 px-4 py-2 rounded-xl text-xs font-bold border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                      >
                        <Eye size={14} /> Voir
                      </button>
                      <button
                        onClick={() => window.open(signedUrl, '_blank')}
                        className="flex items-center gap-2 bg-white text-green-700 px-4 py-2 rounded-xl text-xs font-bold border border-green-200 hover:bg-green-600 hover:text-white transition-all shadow-sm"
                      >
                        <Download size={14} /> Télécharger
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* Documents administratifs signés */}
            {documents
              .filter(d => d.user_id === client.id && (d.statut === 'Signé' || d.signe_par_client))
              .map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-4 bg-emerald-50/30 rounded-2xl border border-emerald-100 hover:border-emerald-300 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                      <FileCheck size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{doc.nom}</h4>
                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">
                        Document Administratif Signé
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewingDocId && setViewingDocId(doc.id)}
                      className="flex items-center gap-2 bg-white text-indigo-700 px-4 py-2 rounded-xl text-xs font-bold border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    >
                      <Eye size={14} /> Voir
                    </button>
                    <button
                      onClick={() => window.open(doc.url || doc.file_url, '_blank')}
                      className="flex items-center gap-2 bg-white text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                    >
                      <Download size={14} /> Télécharger
                    </button>
                  </div>
                </div>
              ))}

            {(sessions.filter(s => s.client_id === client.id && (s.signed_pdf_url || s.file_url_signed || s.metadata?.file_url_signed)).length === 0 &&
              documents.filter(d => d.user_id === client.id && (d.statut === 'Signé' || d.signe_par_client)).length === 0) && (
              <div className="text-center py-8 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                <p className="text-gray-400 text-sm italic">Aucun document signé n'est archivé pour ce client.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'docs' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Documents de ce client</h3>
              <p className="text-xs text-gray-400 mt-0.5">Documents issus du module + ajouts personnalisés.</p>
            </div>
            <button
              onClick={() => setShowAddDocModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" /> Ajouter
            </button>
          </div>

          {isLoadingAssigned ? (
            <p className="text-gray-400 text-sm italic">Chargement...</p>
          ) : (moduleDocResources.length === 0 && assignedDocs.length === 0) ? (
            <div className="text-center py-10 text-gray-400">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm italic">Aucun document configuré pour ce client.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {moduleDocResources.length > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Depuis le module</p>
              )}
              {moduleDocResources.map(res => (
                <div key={res.id} className="flex items-center justify-between bg-indigo-50/40 rounded-2xl px-4 py-3 border border-indigo-100">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <span className="text-sm font-bold text-gray-700">{res.titre}</span>
                      {res.metadata?.requiresClientSignature && (
                        <span className="ml-2 text-[9px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase">à signer</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleGenerateDocx(client, res.titre)}
                    className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-100 transition-all"
                  >
                    Générer
                  </button>
                </div>
              ))}
              {assignedDocs.length > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 mt-3">Ajouts personnalisés</p>
              )}
              {assignedDocs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3 border border-gray-100 group">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-sm font-bold text-gray-700">{doc.template_titre}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleGenerateDocx(client, doc.template_titre)}
                      className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-indigo-100 transition-all"
                    >
                      Générer
                    </button>
                    <button
                      onClick={() => handleRemoveAssignedDoc(doc.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100"
                      title="Retirer ce document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAddDocModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
                <h4 className="text-base font-black text-gray-900 mb-1">Ajouter un document</h4>
                <p className="text-xs text-gray-400 mb-4">Choisissez un modèle de la modélothèque à ajouter.</p>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {Object.entries(documentTemplates || {})
                    .filter(([titre]) =>
                      !assignedDocs.some(d => d.template_titre === titre) &&
                      !moduleDocResources.some(r => r.titre === titre)
                    )
                    .map(([titre, tpl]) => (
                      <button
                        key={titre}
                        onClick={() => handleAddAssignedDoc(titre, tpl.url)}
                        className="w-full flex items-center gap-3 text-left bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 font-bold text-sm px-4 py-3 rounded-xl border border-gray-100 hover:border-indigo-200 transition-all"
                      >
                        <FileText className="w-4 h-4 shrink-0 text-indigo-300" />
                        {titre}
                      </button>
                    ))
                  }
                  {Object.entries(documentTemplates || {}).filter(([titre]) =>
                    !assignedDocs.some(d => d.template_titre === titre) &&
                    !moduleDocResources.some(r => r.titre === titre)
                  ).length === 0 && (
                    <p className="text-gray-400 text-sm italic text-center py-6">Tous les modèles disponibles sont déjà dans la liste.</p>
                  )}
                </div>
                <button
                  onClick={() => setShowAddDocModal(false)}
                  className="mt-4 w-full text-gray-500 hover:text-gray-800 font-bold text-sm py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-all"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'seances' && (
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-8 px-2">
            <div>
              <h3 className="text-xl font-black text-gray-900">Planning & Supervision</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1">Vue par Blocs de Séances</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setTargetSessionForAddition({ clientId: client.id, nextNum: clientSessions.length + 1 });
                  setIsSessionItemModalOpen(true);
                }}
                className="bg-indigo-600 hover:bg-black text-white text-xs font-black px-6 py-3.5 rounded-2xl flex items-center gap-2 shadow-lg transition-all"
              >
                <Plus size={16} /> Ajouter une étape
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {(() => {
              const grouped = clientSessions.reduce((acc, s) => {
                const key = (s.numero_seance === null || s.numero_seance === undefined) ? 'Sans numéro' : s.numero_seance;
                if (!acc[key]) acc[key] = { numero: s.numero_seance, items: [] };
                acc[key].items.push(s);
                return acc;
              }, {});

              return (
                <DndContext
                  onDragStart={({ active }) => setActiveId(active.id)}
                  onDragEnd={({ active, over }) => {
                    if (over && handleMoveSessionItem) {
                      const targetNum = over.id === '__admin' ? 0 : Number(over.id);
                      const src = sessions.find(s => String(s.id) === String(active.id));
                      if (src && src.numero_seance !== targetNum) {
                        const targetGroup = Object.values(grouped).find(g => {
                          const zId = g.numero === 0 ? '__admin' : String(g.numero ?? '__null');
                          return zId === over.id;
                        });
                        const firstItem = targetGroup?.items[0];
                        handleMoveSessionItem(active.id, targetNum, firstItem?.date, firstItem?.heure_debut, firstItem?.heure_fin);
                      }
                    }
                    setActiveId(null);
                  }}
                >
                  {Object.values(grouped).sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999)).map((group, gIdx) => {
                    const isAdminGroup = group.numero === 0 || group.items.some(s => s.is_administrative);
                    const zoneId = group.numero === 0 ? '__admin' : String(group.numero ?? '__null');
                    return (
                      <SessDropZone key={gIdx} zoneId={zoneId} isAdmin={isAdminGroup} hasActive={activeId != null}>
                        {(isGroupOver) => (
                          <>
                            <div className="bg-white p-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-50">
                              <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg ${isAdminGroup ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white'}`}>
                                  {isAdminGroup ? <Archive size={22} /> : (group.numero ?? '?')}
                                </div>
                                <div>
                                  <h4 className="font-black text-gray-900 text-lg uppercase tracking-tight">
                                    {isAdminGroup ? 'BLOC ADMINISTRATIF' : `SÉANCE ${group.numero}`}
                                    {isGroupOver && activeId && (
                                      <span className={`ml-3 text-[9px] font-black px-2 py-0.5 rounded-full animate-pulse ${isAdminGroup ? 'text-amber-600 bg-amber-100' : 'text-indigo-500 bg-indigo-100'}`}>Déposer ici</span>
                                    )}
                                  </h4>
                                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{isAdminGroup ? '7 jours avant la Séance 1' : 'Planification globale'}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                <div className="flex flex-col">
                                  <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1">Date</label>
                                  <input
                                    type="date"
                                    value={group.items[0]?.date || ''}
                                    onChange={(e) => { group.items.forEach(s => updateSessionDate(s.id, e.target.value)); }}
                                    className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                  />
                                </div>
                                <div className="flex flex-col">
                                  <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1">Début</label>
                                  <input
                                    type="time"
                                    value={editedTimes[group.items[0]?.id]?.start ?? group.items[0]?.heure_debut ?? ''}
                                    onChange={(e) => group.items.forEach(s => onTimeChange(s.id, 'start', e.target.value))}
                                    onBlur={() => group.items.forEach(s => onSaveTimes(s.id))}
                                    className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all w-24"
                                  />
                                </div>
                                <div className="flex flex-col">
                                  <label className="text-[9px] font-black text-gray-400 uppercase mb-1 ml-1">Fin</label>
                                  <input
                                    type="time"
                                    value={editedTimes[group.items[0]?.id]?.end ?? group.items[0]?.heure_fin ?? ''}
                                    onChange={(e) => group.items.forEach(s => onTimeChange(s.id, 'end', e.target.value))}
                                    onBlur={() => group.items.forEach(s => onSaveTimes(s.id))}
                                    className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all w-24"
                                  />
                                </div>
                                {lastModifiedSessionId && group.items.some(s => s.id === lastModifiedSessionId) && (
                                  <div className="flex items-center text-green-500 animate-pulse">
                                    <Check size={16} strokeWidth={3} />
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="p-4 space-y-3">
                              {group.items.map(s => {
                                const sMeta = s.metadata || {};
                                const clientRequired = sMeta.requiresClientSignature !== false;
                                const coachRequired = sMeta.requiresTrainerSignature === true || (s.type_activite === 'signature' && sMeta.requiresTrainerSignature !== false);
                                return (
                                  <SessDragItem key={s.id} itemId={s.id} activeId={activeId}>
                                    <div className="flex items-center gap-4">
                                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        s.type_activite === 'Exercice' ? 'bg-amber-50 text-amber-600' :
                                        s.type_activite === 'Document PDF' ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'
                                      }`}>
                                        {s.type_activite === 'Exercice' ? <PenTool size={20} /> : <FileText size={20} />}
                                      </div>
                                      <div>
                                        <h5 className="font-bold text-gray-900 text-sm">{s.ressource_titre || s.titre || s.nom || 'Activité'}</h5>
                                        <div className="flex items-center gap-3 mt-1">
                                          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{s.type_activite || 'Signature'}</span>
                                          <div className="flex items-center gap-2">
                                            {clientRequired ? (
                                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${s.statut_client === 'Signé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                Client: {s.statut_client === 'Signé' ? 'OK ✓' : 'Attente'}
                                              </span>
                                            ) : (
                                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-gray-100 text-gray-400">Client: N/A</span>
                                            )}
                                            {coachRequired ? (
                                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${s.statut_formateur === 'Signé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                Coach: {s.statut_formateur === 'Signé' ? 'OK ✓' : 'Attente'}
                                              </span>
                                            ) : (
                                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-gray-100 text-gray-400">Coach: N/A</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => { setDocSettingsTarget(s); setIsDocSettingsOpen(true); }}
                                        className="p-2.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                        title="Paramètres du document"
                                      >
                                        <Settings size={17} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          const docUrl = s.file_url || s.ressource_url;
                                          if (docUrl) {
                                            setViewingSession({ session: { ...s, file_url: docUrl }, mode: 'view' });
                                          } else {
                                            toast.error("Aucun document lié.");
                                          }
                                        }}
                                        className="p-2.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                        title="Consulter"
                                      >
                                        <Eye size={20} />
                                      </button>
                                      {(s.type_activite === 'Exercice' || s.type_activite === 'exercice') && (
                                        s.reponse_url ? (
                                          <button
                                            onClick={() => setCorrectionModalSession(s)}
                                            className={`relative p-2.5 rounded-xl transition-all ${s.correction_statut === 'Validé' ? 'text-green-600 hover:bg-green-50' : s.correction_statut === 'À corriger' ? 'text-amber-500 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                            title="Corriger le rendu"
                                          >
                                            <FileCheck size={18} />
                                            <span className={`absolute top-1.5 right-1.5 block h-2 w-2 rounded-full ring-2 ring-white ${s.correction_statut === 'Validé' ? 'bg-green-500' : s.correction_statut === 'À corriger' ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}`}></span>
                                          </button>
                                        ) : (
                                          <span className="relative p-2.5 text-gray-300 rounded-xl" title="Aucun rendu">
                                            <FileCheck size={18} />
                                          </span>
                                        )
                                      )}
                                      <button
                                        onClick={() => handleDeleteSession(s.id)}
                                        className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                        title="Supprimer"
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                    </div>
                                  </SessDragItem>
                                );
                              })}
                              {isAdminGroup && (
                                <button
                                  onClick={() => {
                                    const adminItem = group.items[0];
                                    setTargetSessionForAddition({ clientId: client.id, preSelectedSessionId: adminItem?.id, adminBloc: true });
                                    setIsSessionItemModalOpen(true);
                                  }}
                                  className="text-[10px] font-black bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600 transition-all shadow-sm flex items-center gap-2 mt-2"
                                >
                                  <Plus size={14} /> Ajouter un élément
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </SessDropZone>
                    );
                  })}
                </DndContext>
              );
            })()}
            {clientSessions.length === 0 && (
              <div className="py-20 text-center bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-100">
                <History className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-400 italic text-sm">Aucune séance n'est encore programmée.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'docs' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Documents Uploadés</h3>
          <div className="grid grid-cols-1 gap-3">
            {clientDocs.length > 0 ? clientDocs.map(doc => {
              const clientSigned = doc.signe_par_client;
              const formateurSigned = doc.signe_par_formateur;
              const needsClientSign = doc.requiresClientSignature !== false;
              const needsFormateurSign = doc.requiresTrainerSignature === true;
              const fullySignedByAll = (!needsClientSign || clientSigned) && (!needsFormateurSign || formateurSigned);
              return (
              <div key={doc.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between group hover:border-indigo-200 transition-all shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${fullySignedByAll ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}><FileText size={20} /></div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm truncate max-w-[200px]">{doc.nom}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${clientSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        Client: {clientSigned ? 'Signé ✓' : 'En attente'}
                      </span>
                      {(needsFormateurSign || formateurSigned) && (
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${formateurSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          Formateur: {formateurSigned ? 'Signé ✓' : 'En attente'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewingDocId && setViewingDocId(doc.id)} className="p-2 text-indigo-500 hover:bg-indigo-50 bg-gray-50 rounded-lg transition-colors" title="Voir"><Eye size={18} /></button>
                  <a href={doc.url || doc.file_url} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-indigo-600 bg-gray-50 rounded-lg" title="Télécharger"><Download size={18} /></a>
                  <button onClick={async () => { if (window.confirm(`Supprimer "${doc.nom}" ?`)) { await supabase.from('documents').delete().eq('id', doc.id); fetchDocuments && await fetchDocuments(); } }} className="p-2 text-gray-300 hover:text-red-500 bg-gray-50 rounded-lg transition-colors" title="Supprimer"><Trash2 size={18} /></button>
                </div>
              </div>
              );
            }) : <p className="text-gray-500 italic text-sm">Aucun document rattaché.</p>}
          </div>
        </div>
      )}
      <CorrectionModal
        isOpen={!!correctionModalSession}
        onClose={() => setCorrectionModalSession(null)}
        session={correctionModalSession}
        onSave={handleSaveCorrection}
      />
    </div>
  );
};

const AdminClientsView = ({
  handleAddUser, newUserName, setNewUserName,
  newUserEmail, setNewUserEmail,
  newUserRole, setNewUserRole, isAddingUser,
  clientPhone, setClientPhone,
  clientEmail, setClientEmail,
  clients, formateurs, assignFormateur, handleModuleChange,
  modules, handleGenerateDocx, sessions, documentTemplates, supabase,
  expandedClientId, setExpandedClientId, fetchUtilisateurs, fetchDocuments,
  activeTab, setActiveTab, setIsInviteModalOpen, fetchSessions, documents,
  pedagogicalResources, handleDownloadResource, handleUploadExerciseResponse, 
  generateSessions, handleDeleteClient, setIsSessionItemModalOpen, 
  setTargetSessionForAddition, setViewingSession,
  handleDownloadPDF, updateSessionDate, updateSessionTime, onTimeChange, onSaveTimes,
  editedTimes, lastModifiedSessionId,
  setDocSettingsTarget, setIsDocSettingsOpen, setViewingDocId,
  handleMoveSessionItem, handleSaveCorrection, handleAddAdminBloc
}) => {
  const clientsGroupedByFormateur = clients.reduce((acc, client) => {
    const fId = client.formateur_id || 'unassigned';
    if (!acc[fId]) acc[fId] = [];
    acc[fId].push(client);
    return acc;
  }, {});

  if (expandedClientId) {
    const selectedClient = clients.find(c => c.id === expandedClientId);
    if (selectedClient) {
      return (
        <ClientDetailView
          client={selectedClient} formateurs={formateurs} assignFormateur={assignFormateur}
          handleModuleChange={handleModuleChange} modules={modules} supabase={supabase}
          fetchUtilisateurs={fetchUtilisateurs} onBack={() => setExpandedClientId(null)}
          sessions={sessions} fetchSessions={fetchSessions} documents={documents} fetchDocuments={fetchDocuments}
          handleGenerateDocx={handleGenerateDocx} documentTemplates={documentTemplates}
          pedagogicalResources={pedagogicalResources}
          handleDownloadResource={handleDownloadResource}
          handleUploadExerciseResponse={handleUploadExerciseResponse}
          generateSessions={generateSessions}
          handleDeleteClient={handleDeleteClient}
          setIsSessionItemModalOpen={setIsSessionItemModalOpen}
          setTargetSessionForAddition={setTargetSessionForAddition}
          setViewingSession={setViewingSession}
          handleDownloadPDF={handleDownloadPDF}
          updateSessionDate={updateSessionDate}
          updateSessionTime={updateSessionTime}
          onTimeChange={onTimeChange}
          onSaveTimes={onSaveTimes}
          editedTimes={editedTimes}
          lastModifiedSessionId={lastModifiedSessionId}
          setDocSettingsTarget={setDocSettingsTarget}
          setIsDocSettingsOpen={setIsDocSettingsOpen}
          setViewingDocId={setViewingDocId}
          handleMoveSessionItem={handleMoveSessionItem}
          handleSaveCorrection={handleSaveCorrection}
          handleAddAdminBloc={handleAddAdminBloc}
        />
      );
    }
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
          <span className="w-2 h-6 bg-indigo-600 rounded-full mr-3"></span> Administration VB Coaching
        </h2>
        <div className="flex border-b border-gray-200 mb-6 font-sans">
          <button onClick={() => setActiveTab('clients')} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'clients' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Supervision Globale</button>
          <button onClick={() => setActiveTab('formateurs')} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'formateurs' ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Managers</button>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex items-center justify-between mb-8 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
              <Plus size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">Nouveau Membre</h3>
              <p className="text-sm text-gray-500">Invitez de nouveaux clients ou formateurs par email.</p>
            </div>
          </div>
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3.5 rounded-2xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 transform active:scale-95"
          >
            <Plus size={20} /> Inviter l'utilisateur
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
          <span className="w-2 h-6 bg-gray-900 rounded-full mr-3"></span> Vue d'ensemble (Tri par Formateur)
        </h2>
        <div className="space-y-8">
          {Object.keys(clientsGroupedByFormateur).map(fId => {
            const formateur = formateurs.find(f => String(f.id) === String(fId));
            const formateurName = formateur ? `${formateur.nom || ''} ${formateur.prenom || ''}`.trim() : 'NON ASSIGNÉ';
            return (
              <div key={fId} className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center">
                  <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs mr-3">{formateurName.charAt(0)}</span>
                  <h3 className="font-bold text-gray-900 uppercase tracking-wider text-sm">{formateurName}</h3>
                  <span className="ml-auto text-xs font-bold text-gray-500">{clientsGroupedByFormateur[fId].length} bénéficiaire(s)</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {clientsGroupedByFormateur[fId].map(client => (
                    <li key={client.id} className="p-4 hover:bg-gray-50/50 transition-colors flex items-center justify-between cursor-pointer" onClick={() => setExpandedClientId(client.id)}>
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-white border border-gray-200 text-gray-600 rounded-xl flex items-center justify-center mr-4 font-bold shadow-sm">{client.nom ? client.nom.charAt(0) : '?'}</div>
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-900 leading-tight">{client.nom || client.nomcomplet_client || 'Sans Nom'}</span>
                          <span className="text-xs text-gray-500">{client.email || 'Email non renseigné'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${client.status === 'Nouveau' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {client.status || 'Actif'}
                        </span>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const FormateurDetailView = ({
  formateur, onBack, supabase, fetchUtilisateurs, modules, clients,
  handleDeleteFormateur, documents, documentTemplates, handleGenerateDocx,
  setViewingDocId, fetchDocuments
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = React.useState(false);
  const [docToDelete, setDocToDelete] = React.useState(null);

  React.useEffect(() => { fetchDocuments(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteDoc = async () => {
    if (!docToDelete) return;
    const { error } = await supabase.from('documents').delete().eq('id', docToDelete.id);
    if (error) { toast.error('Erreur lors de la suppression : ' + error.message); console.error('[handleDeleteDoc]', error); }
    else { toast.success('Document supprimé.'); }
    await fetchDocuments();
    setDocToDelete(null);
  };
  const [legalInfo, setLegalInfo] = React.useState({
    nom: formateur.nom || '',
    formateur_siret: formateur.formateur_siret || formateur.siret || '',
    formateur_nda: formateur.formateur_nda || formateur.nda || '',
    adresse_formateur: formateur.adresse_formateur || formateur.adresse_pro || formateur.adresse_client || '',
    adresse_session: formateur.adresse_session || '',
    email: formateur.email || '',
    telephone: formateur.telephone || '',
    compagnie_assurance: formateur.compagnie_assurance || '',
    numero_assurance_rcp: formateur.numero_assurance_rcp || ''
  });
  const [sameAddress, setSameAddress] = React.useState(
    !formateur.adresse_session || formateur.adresse_session === (formateur.adresse_formateur || formateur.adresse_pro || formateur.adresse_client || '')
  );

  const trainerDocs = documents ? documents.filter(d => d.assigned_formateur_id === formateur.id) : [];

  const handleSave = async () => {
    setIsSaving(true);
    const { error } = await supabase
      .from('utilisateurs')
      .update({
        nom: legalInfo.nom,
        formateur_siret: legalInfo.formateur_siret,
        formateur_nda: legalInfo.formateur_nda,
        adresse_formateur: legalInfo.adresse_formateur,
        adresse_session: sameAddress ? legalInfo.adresse_formateur : legalInfo.adresse_session,
        email: legalInfo.email,
        telephone: legalInfo.telephone,
        compagnie_assurance: legalInfo.compagnie_assurance,
        numero_assurance_rcp: legalInfo.numero_assurance_rcp
      })
      .eq('id', formateur.id);

    if (error) {
      toast.error("Erreur lors de la sauvegarde : " + error.message);
    } else {
      await fetchUtilisateurs();
      toast.success("Informations légales enregistrées !");
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <button onClick={onBack} className="text-gray-500 hover:text-gray-900 font-bold flex items-center mb-4 transition-colors">
        <ChevronLeft className="w-5 h-5 mr-1" /> Retour à la liste des formateurs
      </button>

      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-6 mb-8 pb-8 border-b border-gray-100">
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center font-bold text-3xl shadow-inner">
            {formateur.nom ? formateur.nom.charAt(0) : '?'}
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">{formateur.nom}</h2>
            <p className="text-gray-500 text-lg">Profil Formateur & Informations Légales</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <FileText className="text-rose-500" /> Identité Professionnelle
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Raison Sociale / Nom complet</label>
                <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all font-medium"
                  value={legalInfo.nom} onChange={e => setLegalInfo({ ...legalInfo, nom: e.target.value })} placeholder="Ex: Matthys Coaching EURL" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">SIRET</label>
                  <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                    value={legalInfo.formateur_siret} onChange={e => setLegalInfo({ ...legalInfo, formateur_siret: e.target.value })} placeholder="14 chiffres" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">NDA (Qualiopi)</label>
                  <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                    value={legalInfo.formateur_nda} onChange={e => setLegalInfo({ ...legalInfo, formateur_nda: e.target.value })} placeholder="N° Déclaration" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Assurance RCP — Compagnie</label>
                <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                  value={legalInfo.compagnie_assurance} onChange={e => setLegalInfo({ ...legalInfo, compagnie_assurance: e.target.value })} placeholder="Ex: AXA, MAIF, Hiscox..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Assurance RCP — N° de contrat</label>
                <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                  value={legalInfo.numero_assurance_rcp} onChange={e => setLegalInfo({ ...legalInfo, numero_assurance_rcp: e.target.value })} placeholder="N° de contrat RCP" />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Plus className="text-indigo-500" /> Coordonnées & Contact
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Adresse Siège Social</label>
                <AddressInput
                  value={legalInfo.adresse_formateur}
                  onChange={val => setLegalInfo({ ...legalInfo, adresse_formateur: val })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sameAddress"
                  checked={sameAddress}
                  onChange={e => setSameAddress(e.target.checked)}
                  className="w-4 h-4 accent-rose-500 cursor-pointer rounded"
                />
                <label htmlFor="sameAddress" className="text-sm text-gray-600 cursor-pointer select-none">
                  Même adresse pour les sessions de formation
                </label>
              </div>
              {!sameAddress && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Adresse de Pratique</label>
                  <AddressInput
                    value={legalInfo.adresse_session}
                    onChange={val => setLegalInfo({ ...legalInfo, adresse_session: val })}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email</label>
                  <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                    value={legalInfo.email} onChange={e => setLegalInfo({ ...legalInfo, email: e.target.value })} placeholder="Email pro" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Téléphone</label>
                  <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
                    value={legalInfo.telephone} onChange={e => setLegalInfo({ ...legalInfo, telephone: e.target.value })} placeholder="06..." />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex justify-end items-center gap-4">
          <button
            onClick={() => setIsConfirmDeleteOpen(true)}
            className="px-6 py-4 text-red-600 font-bold hover:bg-red-50 rounded-2xl transition-all flex items-center gap-2"
          >
            <Trash2 size={20} />
            Supprimer le formateur
          </button>
          <button onClick={handleSave} disabled={isSaving} className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 px-10 rounded-2xl shadow-xl transition-all flex items-center gap-3 disabled:opacity-50">
            <Save size={20} />
            {isSaving ? 'Enregistrement...' : 'Enregistrer les informations légales'}
          </button>
        </div>

        <DeleteConfirmationModal
          isOpen={isConfirmDeleteOpen}
          onClose={() => setIsConfirmDeleteOpen(false)}
          onConfirm={() => {
            setIsConfirmDeleteOpen(false);
            handleDeleteFormateur(formateur.id);
            onBack();
          }}
          itemName={legalInfo.nom || "ce formateur"}
          title="Supprimer ce formateur ?"
        />
        <div className="mt-12 pt-12 border-t border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Archive className="text-rose-500" /> Documents Administratifs (Contrats / NDA...)
          </h3>
          
          <div className="bg-gray-50 rounded-[32px] p-6 border border-gray-100">
            <div className="flex flex-wrap gap-3 mb-8">
              {Object.entries(documentTemplates || {}).filter(([, tpl]) => (tpl.destination || 'client') === 'formateur').map(([key]) => (
                <button 
                  key={key} 
                  onClick={() => handleGenerateDocx(null, key, true, formateur.id)}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-lg transition-all flex items-center gap-2 transform active:scale-95"
                >
                  <PenTool size={16} /> Générer {key}
                </button>
              ))}
              {Object.entries(documentTemplates || {}).filter(([, tpl]) => (tpl.destination || 'client') === 'formateur').length === 0 && (
                <p className="text-gray-400 italic text-sm">Aucun modèle 'Administratif Formateur' configuré dans la Modélothèque.</p>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Suivi des signatures</h4>
              {trainerDocs.length > 0 ? trainerDocs.map(doc => {
                const isSigned = doc.signe_par_formateur || doc.statut === 'Signé';
                return (
                <div key={doc.id} className={`bg-white p-4 rounded-2xl border flex items-center justify-between group transition-all shadow-sm ${isSigned ? 'border-green-100 hover:border-green-300' : 'border-gray-100 hover:border-rose-200'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSigned ? 'bg-green-50 text-green-600' : 'bg-rose-50 text-rose-600'}`}>
                      {isSigned ? <FileCheck size={20} /> : <FileText size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{doc.nom}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-gray-400 font-bold uppercase">{doc.created_at ? (() => { const d = new Date(doc.created_at); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR'); })() : '—'}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${isSigned ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {isSigned ? 'Signé' : 'En attente de signature'}
                        </span>
                      </div>
                      {isSigned && doc.date_signature_formateur && (
                        <p className="text-[10px] text-green-600 mt-0.5">
                          Signé le {new Date(doc.date_signature_formateur).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewingDocId(doc.id)}
                      className="p-2.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      title="Consulter le document original"
                    >
                      <Eye size={20} />
                    </button>
                    {isSigned && doc.signed_pdf_url && (
                      <a
                        href={doc.signed_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm"
                        title="Télécharger le PDF signé"
                      >
                        <Download size={14} /> PDF signé
                      </a>
                    )}
                    <button
                      onClick={() => setDocToDelete(doc)}
                      className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all border border-red-200 hover:border-red-400"
                      title="Supprimer ce document"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                );
              }) : (
                <p className="text-gray-400 italic text-sm py-4">Aucun document généré pour le moment.</p>
              )}

              <DeleteConfirmationModal
                isOpen={!!docToDelete}
                onClose={() => setDocToDelete(null)}
                onConfirm={handleDeleteDoc}
                itemName={docToDelete?.nom || 'ce document'}
                title="Supprimer ce document ?"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Liste des clients assignés */}
      <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm mt-8">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Users className="text-rose-500" /> Clients Assignés
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.filter(c => c.formateur_id === formateur.id).map(client => {
            const assignedModule = modules.find(m => String(m.id) === String(client.module_id));
            return (
              <div key={client.id} className="p-4 border border-gray-50 rounded-2xl bg-gray-50/50 hover:bg-white hover:border-rose-200 transition-all group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-bold text-gray-700 shadow-sm group-hover:bg-rose-50 transition-colors">
                    {client.nom ? client.nom.charAt(0) : '?'}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">{client.nom}</h4>
                    <p className="text-[10px] text-gray-500 font-medium">{client.email}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${assignedModule ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-400'}`}>
                    {assignedModule ? assignedModule.nom : 'Pas de module assigné'}
                  </span>
                </div>
              </div>
            );
          })}
          {clients.filter(c => c.formateur_id === formateur.id).length === 0 && (
            <p className="text-gray-400 italic text-sm py-4">Aucun client n'est encore assigné à ce formateur.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminFormateursView = ({
  clients, formateurs, documents, expandedClientId, setExpandedClientId,
  supabase, fetchUtilisateurs, fetchDocuments, activeTab, setActiveTab,
  modules, sessions, handleDownloadResource, handleDeleteFormateur,
  documentTemplates, handleGenerateDocx, setViewingDocId,
  handleUploadDocxTemplate, newTemplateName, setNewTemplateName
}) => {
  const [selectedFormateurId, setSelectedFormateurId] = React.useState(null);
  const [selectedClientSummary, setSelectedClientSummary] = React.useState(null);
  // État pour la section "Modèles de documents formateurs"
  const [showTemplateUpload, setShowTemplateUpload] = React.useState(false);
  const [tplLocalName, setTplLocalName] = React.useState('');
  const [tplLocalFile, setTplLocalFile] = React.useState(null);
  const [isTplUploading, setIsTplUploading] = React.useState(false);

  if (selectedFormateurId) {
    const formateur = formateurs.find(f => f.id === selectedFormateurId);
    if (formateur) {
      return (
        <FormateurDetailView
          formateur={formateur}
          onBack={() => setSelectedFormateurId(null)}
          supabase={supabase}
          fetchUtilisateurs={fetchUtilisateurs}
          fetchDocuments={fetchDocuments}
          modules={modules}
          clients={clients}
          handleDeleteFormateur={handleDeleteFormateur}
          documents={documents}
          documentTemplates={documentTemplates}
          handleGenerateDocx={handleGenerateDocx}
          setViewingDocId={setViewingDocId}
        />
      );
    }
  }

  // --- Modal de Résumé de Planning pour l'Admin ---
  const renderClientSummary = () => {
    if (!selectedClientSummary) return null;
    const clientSessions = sessions.filter(s => s.client_id === selectedClientSummary.id).sort((a, b) => a.numero_seance - b.numero_seance);

    return (
      <div className="fixed inset-0 bg-gray-950/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center font-black text-xl">
                {selectedClientSummary.nom?.charAt(0)}
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 leading-none">Supervision : {selectedClientSummary.nom}</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-1.5">Planning & Émargements Qualiopi</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedClientSummary(null)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
            {clientSessions.length > 0 ? (
              <table className="w-full text-left border-collapse bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 text-sm">
                <thead>
                  <tr className="bg-gray-100/50 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                    <th className="p-4">Séance</th>
                    <th className="p-4">Date & Heures</th>
                    <th className="p-4">Activité</th>
                    <th className="p-4 text-center">Émargement Client</th>
                    <th className="p-4 text-center">Émargement Coach</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clientSessions.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <span className="font-black text-gray-900">S{s.numero_seance}</span>
                        <span className="ml-2 text-gray-500 font-medium">{s.nom}</span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-gray-700">{s.date ? new Date(s.date).toLocaleDateString() : 'Non planifié'}</div>
                        <div className="text-[10px] text-gray-400 font-bold">{s.heure_debut || '--:--'} - {s.heure_fin || '--:--'}</div>
                      </td>
                      <td className="p-4">
                        <span className="text-[10px] px-2 py-0.5 rounded-lg bg-gray-100 font-black uppercase text-gray-400 tracking-tighter">
                          {s.type_activite}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${s.statut_client === 'Signé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {s.statut_client === 'Signé' ? 'OK ✓' : 'Attente'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${s.statut_formateur === 'Signé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {s.statut_formateur === 'Signé' ? 'OK ✓' : 'Attente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                <p className="text-gray-400 italic">Aucune séance n'a été générée pour ce client.</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 text-right shrink-0">
            <button
               onClick={() => setSelectedClientSummary(null)}
               className="bg-gray-900 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-black transition-all"
            >
              Fermer la supervision
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">

      {/* ── Section : Modèles de documents formateurs ─────────────────────── */}
      {(() => {
        const formateurTemplates = Object.entries(documentTemplates || {})
          .filter(([, tpl]) => (tpl.destination || 'client') === 'formateur');

        const handleAddTemplate = async () => {
          if (!tplLocalFile || !tplLocalName.trim()) return;
          setIsTplUploading(true);
          await handleUploadDocxTemplate(tplLocalFile, tplLocalName.trim(), 'formateur', 'a_signer');
          setTplLocalName('');
          setTplLocalFile(null);
          setShowTemplateUpload(false);
          setIsTplUploading(false);
        };

        return (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                <span className="w-2 h-6 bg-rose-400 rounded-full"></span>
                Modèles de Documents Formateurs
              </h2>
              <button
                onClick={() => setShowTemplateUpload(v => !v)}
                className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm transition-all"
              >
                <Plus size={14} /> Ajouter un modèle
              </button>
            </div>

            {/* Formulaire d'ajout */}
            {showTemplateUpload && (
              <div className="mb-6 p-5 bg-rose-50 rounded-2xl border border-rose-100 space-y-3">
                <p className="text-xs text-rose-700 font-bold uppercase tracking-wider">
                  Fichier .docx avec balises : <code className="bg-rose-100 px-1 rounded">{`{{nom_formateur}}`}</code>, <code className="bg-rose-100 px-1 rounded">{`{{formateur_siret}}`}</code>, <code className="bg-rose-100 px-1 rounded">{`{{date_signature}}`}</code>…
                </p>
                <div className="flex flex-col md:flex-row gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5">Nom du bouton généré</label>
                    <input
                      type="text"
                      placeholder="Ex : Contrat de sous-traitance"
                      value={tplLocalName}
                      onChange={e => setTplLocalName(e.target.value)}
                      className="w-full text-sm p-3 bg-white border border-rose-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-400"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5">Fichier Word (.docx)</label>
                    <label className="flex items-center gap-2 bg-white border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm font-bold cursor-pointer hover:bg-rose-50 transition-all">
                      <FileText size={15} />
                      <span className="truncate">{tplLocalFile ? tplLocalFile.name : 'Choisir un fichier .docx'}</span>
                      <input type="file" accept=".docx" className="hidden" onChange={e => { if (e.target.files[0]) { setTplLocalFile(e.target.files[0]); if (!tplLocalName) setTplLocalName(e.target.files[0].name.replace(/\.[^/.]+$/, '')); } }} />
                    </label>
                  </div>
                  <button
                    onClick={handleAddTemplate}
                    disabled={!tplLocalFile || !tplLocalName.trim() || isTplUploading}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-sm transition-all disabled:opacity-40 whitespace-nowrap"
                  >
                    {isTplUploading ? 'Upload…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            )}

            {/* Liste des modèles existants */}
            {formateurTemplates.length === 0 ? (
              <div className="py-10 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <FileText className="mx-auto mb-3 text-gray-300" size={28} />
                <p className="text-gray-400 text-sm italic">Aucun modèle formateur configuré.</p>
                <p className="text-gray-300 text-xs mt-1">Ex : Contrat de sous-traitance, Lettre de mission, NDA…</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {formateurTemplates.map(([key, tpl]) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-rose-200 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{key}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Modèle Word · Formateur</p>
                      </div>
                    </div>
                    <a href={tpl.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Télécharger le modèle">
                      <Download size={15} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
          <span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span> Liste des Formateurs
        </h2>
        <div className="flex border-b border-gray-200 mb-6 font-sans">
          <button onClick={() => setActiveTab('clients')} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'clients' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Clients</button>
          <button onClick={() => setActiveTab('formateurs')} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'formateurs' ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Formateurs</button>
        </div>

        <ul className="space-y-6">
          {formateurs.map(f => {
            const sesClients = clients.filter(c => c.formateur_id === f.id);
            const isExpanded = expandedClientId === f.id;
            return (
              <li key={f.id} className={`p-6 border rounded-2xl transition-all ${isExpanded ? 'border-rose-200 bg-rose-50/10' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
                  <div className="flex items-center cursor-pointer hover:bg-white p-2 rounded-xl transition-all flex-1" onClick={() => setSelectedFormateurId(f.id)}>
                    <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mr-4 font-bold text-xl shadow-sm">{f.nom ? f.nom.charAt(0) : '?'}</div>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center justify-between pr-4">
                        <div>
                          <span className="font-bold text-gray-900 text-lg hover:text-rose-600 transition-colors">{f.nom}</span>
                          <span className="text-sm text-gray-500 block">{f.email}</span>
                        </div>
                        <span className="text-rose-400 bg-rose-50 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Voir profil <ChevronRight size={14} />
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 md:mt-0 ml-4 border-l border-gray-100 pl-4">
                    <button onClick={() => setExpandedClientId(isExpanded ? null : f.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-6 pt-6 border-t border-gray-200 animate-slide-up space-y-6">
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider flex items-center">
                        <Users className="w-3.5 h-3.5 mr-2" /> Clients Assignés
                      </h4>
                      {sesClients.length > 0 ? (
                        <div className="overflow-hidden border border-gray-100 rounded-xl shadow-sm">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Client</th>
                                <th className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Module</th>
                                <th className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Statut</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 bg-white">
                              {sesClients.map(client => {
                                const clientModule = modules?.find(m => String(m.id) === String(client.module_id));
                                return (
                                  <tr key={client.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="p-3">
                                      <div 
                                        className="font-bold text-sm text-indigo-600 hover:text-indigo-800 cursor-pointer underline underline-offset-2 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); setSelectedClientSummary(client); }}
                                      >
                                        {client.nom || client.nom_complet || "Client"}
                                      </div>
                                      <div className="text-[10px] text-gray-400">{client.email}</div>
                                    </td>
                                    <td className="p-3">
                                      <span className="text-xs font-medium text-gray-600">{clientModule?.nom || 'Non assigné'}</span>
                                    </td>
                                    <td className="p-3 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${client.status === 'Nouveau' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                                        {client.status || 'Actif'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <p className="text-sm text-gray-400 italic">Aucun client assigné à ce formateur.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {renderClientSummary()}
    </div>
  );
};
const DroppableMomentZone = ({ id, children, className }) => {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} transition-all ${isOver ? 'ring-2 ring-indigo-500 scale-[1.01]' : ''}`}>
      {children}
    </div>
  );
};

const DraggableGroupBlock = ({ resourceId, group, onDelete }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `drag-grp-${resourceId}` });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center justify-between p-3 rounded-xl border border-indigo-200 text-sm cursor-grab active:cursor-grabbing hover:bg-indigo-100 transition-all shadow-sm ${isDragging ? 'opacity-40 bg-indigo-50' : 'bg-white'}`}
    >
      <div className="flex items-center gap-3">
        <Layout size={16} className="text-indigo-600" />
        <span className="font-bold text-indigo-900">Groupe de documents : {group?.nom || 'Groupe Inconnu'}</span>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(resourceId); }} className="text-gray-300 hover:text-red-500 transition-colors p-1"><Trash2 size={14} /></button>
    </div>
  );
};

const IngenierieView = ({
  modules, moduleDocuments, handleAddModule, handleLinkDocument,
  newModuleName, setNewModuleName, newModuleSeances, setNewModuleSeances,
  newModDocName, setNewModDocName, newModDocType, setNewModDocType,
  newModDocFile, setNewModDocFile,
  addingToModuleId, setAddingToModuleId,
  handleUploadDocxTemplate, newTemplateName, setNewTemplateName,
  handleUploadResource, newResourceName, setNewResourceName, isUploadingResource,
  modelingModuleId, setModelingModuleId, moduleSessionTemplates, moduleStepResources, fetchModules,
  newStepTitle, setNewStepTitle, newStepActivity, setNewStepActivity,
  selectedResourceId, setSelectedResourceId, pedagogicalResources, isAddingStep,
  setIsAddingStep, isAddingStepResource, setIsAddingStepResource, supabase,
  createSessionFolder, handleDeleteFolder, handleDeleteStepResource, handleAddStepResource,
  handleRenameFolder, handleRenameResource, handleAddModuleMomentResource, handleRedistributeModuleDocs, documentTemplates
}) => {
  const [isResourceModalOpen, setIsResourceModalOpen] = React.useState(false);
  const [activeFolderId, setActiveFolderId] = React.useState(null);
  const [activeMoment, setActiveMoment] = React.useState(null);
  const [activeMomentModuleId, setActiveMomentModuleId] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);
  const [editValue, setEditValue] = React.useState('');

  const [documentGroups, setDocumentGroups] = React.useState([]);

  React.useEffect(() => {
    const fetchGroups = async () => {
      const { data, error } = await supabase.from('document_groups').select('*').order('nom', { ascending: true });
      if (!error && data) setDocumentGroups(data);
    };
    fetchGroups();
  }, [supabase]);

  const handleGroupDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;
    const resourceId = String(active.id).replace('drag-grp-', '');
    const overIdParts = String(over.id).split('-'); // expected 'drop-{moduleId}-{moment}'
    if (overIdParts[0] === 'drop' && overIdParts.length >= 3) {
      const targetMoment = overIdParts[2]; // 'debut' ou 'fin'
      const { error } = await supabase.from('module_step_resources').update({ moment: targetMoment }).eq('id', resourceId);
      if (!error) fetchModules();
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Ingénierie Formation</h1>
          <p className="text-gray-500 text-lg mt-1">Gérez la structure de vos modules et séances.</p>
        </div>
      </div>

      {/* Configuration Modules */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
          <span className="w-2 h-6 bg-purple-500 rounded-full mr-3"></span> Gestion des Modules
        </h2>
        <form onSubmit={handleAddModule} className="flex flex-col md:flex-row gap-4 items-end mb-8 bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du nouveau module</label>
            <input required type="text" value={newModuleName} onChange={e => setNewModuleName(e.target.value)} placeholder="Ex: Bilan 24h" className="w-full p-2.5 rounded-lg border outline-none text-sm" />
          </div>
          <div className="w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">Séances prévues</label>
            <input required type="number" min="1" value={newModuleSeances} onChange={e => setNewModuleSeances(e.target.value)} className="w-full p-2.5 rounded-lg border outline-none text-sm" />
          </div>
          <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg px-6 py-2.5 shadow-sm transition-colors">Créer Module</button>
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {modules.map(mod => {
            const docs = moduleDocuments.filter(md => md.module_id === mod.id);
            const templates = moduleSessionTemplates.filter(t => String(t.module_id) === String(mod.id));

            return (
              <div key={mod.id} className="border border-purple-100 bg-purple-50/20 p-5 rounded-2xl relative shadow-sm h-fit">
                <h3 className="font-bold text-gray-900 text-lg pr-24">{mod.nom}</h3>
                <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-1.5 rounded-xl absolute top-5 right-5">{mod.seances_prevues} Séance(s)</span>

                <h4 className="text-sm font-bold text-gray-600 mt-6 mb-3">Documents types ({docs.length})</h4>
                <ul className="space-y-2 mb-4">
                  {docs.map(d => (
                    <li key={d.id} className="text-xs flex items-center bg-white p-2.5 rounded-lg border border-gray-100 shadow-sm">
                      <strong className="w-24 shrink-0 text-gray-400 font-bold">{d.type_document}</strong>
                      <span className="text-gray-900 font-medium truncate">{d.nom}</span>
                    </li>
                  ))}
                  {docs.length === 0 && <li className="text-xs text-gray-400 italic">Aucun document type lié.</li>}
                </ul>

                {addingToModuleId === mod.id ? (
                  <form onSubmit={(e) => handleLinkDocument(e, mod)} className="bg-white p-4 rounded-xl shadow-sm border border-purple-200 flex flex-col gap-3 animate-fade-in">
                    <input required type="text" placeholder="Nom du document (Ex: Contrat)" value={newModDocName} onChange={e => setNewModDocName(e.target.value)} className="w-full text-sm p-2 border border-gray-200 rounded-lg outline-none focus:border-purple-500" />
                    <input type="file" onChange={(e) => setNewModDocFile(e.target.files[0] || null)} className="w-full text-sm p-2 border border-gray-200 rounded-lg outline-none focus:border-purple-500 bg-gray-50 text-gray-700" accept=".pdf,image/*" />
                    <div className="flex gap-2">
                      <select value={newModDocType} onChange={e => setNewModDocType(e.target.value)} className="flex-1 text-sm p-2 border border-gray-200 rounded-lg outline-none focus:border-purple-500">
                        <option value="Autre">Autre</option><option value="Contrat">Contrat</option><option value="Évaluation">Évaluation</option>
                      </select>
                      <button type="submit" className="bg-gray-900 text-white px-4 rounded-lg text-sm shrink-0 font-medium hover:bg-gray-800">Lier</button>
                      <button type="button" onClick={() => setAddingToModuleId(null)} className="text-gray-400 hover:text-gray-600 px-2 shrink-0">✕</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => { setAddingToModuleId(mod.id); setNewModDocName(''); setNewModDocType('Contrat'); setNewModDocFile?.(null); }} className="text-xs font-bold text-purple-600 hover:text-white hover:bg-purple-600 flex items-center bg-white border border-purple-200 px-4 py-2 rounded-lg transition-all">+ Doc. Type</button>
                    <button onClick={() => setModelingModuleId(modelingModuleId === mod.id ? null : mod.id)} className="text-xs font-bold text-indigo-600 hover:text-white hover:bg-indigo-600 flex items-center bg-white border border-indigo-200 px-4 py-2 rounded-lg transition-all">⚙️ Modéliser Parcours</button>
                    <button onClick={() => handleRedistributeModuleDocs(mod.id)} className="text-xs font-bold text-emerald-600 hover:text-white hover:bg-emerald-600 flex items-center bg-white border border-emerald-200 px-4 py-2 rounded-lg transition-all" title="Envoyer les documents de début/fin aux clients déjà assignés à ce module">🔄 Sync documents clients</button>
                  </div>
                )}

                {/* Interface de Modélisation du Parcours */}
                {modelingModuleId === mod.id && (
                  <DndContext onDragEnd={handleGroupDragEnd}>
                    <div className="mt-6 pt-6 border-t border-purple-100 animate-fade-in space-y-6">
                    <h4 className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                      <Layout size={16} /> Modélisation du Parcours
                    </h4>

                    {/* Zone Documents de Début de Parcours */}
                    {(() => {
                      const debutResources = moduleStepResources.filter(r => r.module_id === mod.id && r.moment === 'debut');
                      return (
                        <DroppableMomentZone id={`drop-${mod.id}-debut`} className="bg-emerald-50 border border-emerald-200 rounded-2xl overflow-hidden">
                          <div className="bg-emerald-100 px-4 py-3 flex flex-wrap items-center justify-between border-b border-emerald-200 gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-5 bg-emerald-500 rounded-full"></span>
                              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">Documents de Début de Parcours</span>
                              <span className="text-[9px] font-bold text-emerald-600 bg-emerald-200 px-2 py-0.5 rounded-full">Accessibles immédiatement</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <select 
                                onChange={async (e) => {
                                  if(!e.target.value) return;
                                  const grpId = e.target.value;
                                  const grpName = e.target.options[e.target.selectedIndex].text;
                                  await handleAddModuleMomentResource(mod.id, 'debut', { type: 'document_group', title: grpName, document_group_id: grpId });
                                  e.target.value = '';
                                }}
                                className="text-[10px] font-bold text-emerald-800 bg-white border border-emerald-300 px-2 py-1.5 rounded-lg outline-none cursor-pointer"
                              >
                                <option value="">+ Groupe...</option>
                                {documentGroups.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
                              </select>
                              <button
                                onClick={() => { setActiveMoment('debut'); setActiveMomentModuleId(mod.id); setActiveFolderId(null); setIsResourceModalOpen(true); }}
                                className="text-[10px] font-black bg-emerald-600 text-white px-3 py-1.5 rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-1.5"
                              >
                                <Plus size={12} /> Fichier
                              </button>
                            </div>
                          </div>
                          <div className="p-3 space-y-2">
                            {debutResources.length === 0 && <p className="text-[11px] text-emerald-600/60 italic px-1">Aucun document de début.</p>}
                            {debutResources.map(res => {
                              if (res.type === 'document_group') {
                                return <DraggableGroupBlock key={res.id} resourceId={res.id} group={documentGroups.find(g => g.id === res.document_group_id)} onDelete={handleDeleteStepResource} />;
                              }
                              return (
                                <div key={res.id} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-emerald-100 text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <span>{res.type === 'signature' ? '✍️' : '📄'}</span>
                                    <span className="font-bold text-gray-800">{res.titre}</span>
                                    <span className="text-[9px] text-gray-400 uppercase">{res.type}</span>
                                  </div>
                                  <button onClick={() => handleDeleteStepResource(res.id)} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>
                                </div>
                              );
                            })}
                          </div>
                        </DroppableMomentZone>
                      );
                    })()}

                    <div className="space-y-4">
                      {templates.map((template, idx) => {
                        const resources = moduleStepResources.filter(r => r.template_id === template.id);
                        return (
                          <div key={template.id} className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
                            <div className="bg-indigo-50/50 p-4 flex items-center justify-between border-b border-indigo-50">
                              <div className="flex items-center gap-3">
                                <span className="w-8 h-8 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold shadow-sm shrink-0">{idx + 1}</span>
                                <div className="flex-1">
                                  {editingId === template.id ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        autoFocus
                                        className="bg-white border border-indigo-300 rounded text-sm p-1 font-bold text-gray-900 w-full outline-none"
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            handleRenameFolder(template.id, editValue);
                                            setEditingId(null);
                                          } else if (e.key === 'Escape') setEditingId(null);
                                        }}
                                      />
                                      <button onClick={() => { handleRenameFolder(template.id, editValue); setEditingId(null); }} className="text-green-600 hover:text-green-700"><Check size={16} /></button>
                                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 group/title">
                                      <p className="font-bold text-gray-900">{template.titre}</p>
                                      <button 
                                        onClick={() => { setEditingId(template.id); setEditValue(template.titre); }}
                                        className="text-gray-300 hover:text-indigo-600 opacity-0 group-hover/title:opacity-100 transition-opacity"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                    </div>
                                  )}
                                  <p className="text-[10px] text-gray-400 uppercase font-black">Dossier Séance</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteFolder(template.id)}
                                className="text-gray-300 hover:text-red-500 bg-white w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
                              >✕</button>
                            </div>

                            <div className="p-4 space-y-2">
                              {resources.map((res) => (
                                <div key={res.id} className="flex items-center justify-between bg-gray-50/50 p-3 rounded-xl border border-gray-100 text-[11px]">
                                  <div className="flex items-center gap-3">
                                    <span className="text-gray-400">
                                      {res.type === 'signature' ? '✍️' : res.type === 'document' ? '📄' : '⚙️'}
                                    </span>
                                    <div className="flex flex-col flex-1">
                                      {editingId === res.id ? (
                                        <div className="flex items-center gap-2">
                                          <input
                                            autoFocus
                                            className="bg-white border border-indigo-200 rounded text-[11px] p-0.5 font-bold text-gray-800 w-full outline-none"
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                handleRenameResource(res.id, editValue);
                                                setEditingId(null);
                                              } else if (e.key === 'Escape') setEditingId(null);
                                            }}
                                          />
                                          <button onClick={() => { handleRenameResource(res.id, editValue); setEditingId(null); }} className="text-green-600 hover:text-green-700"><Check size={12} /></button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 group/restitle leading-none">
                                          <span className="font-bold text-gray-800">{res.titre}</span>
                                          <button 
                                            onClick={() => { setEditingId(res.id); setEditValue(res.titre); }}
                                            className="text-gray-300 hover:text-indigo-600 opacity-0 group-hover/restitle:opacity-100 transition-opacity"
                                          >
                                            <Pencil size={10} />
                                          </button>
                                        </div>
                                      )}
                                      <span className="text-[9px] text-gray-400 uppercase">{res.type} {res.ressource_id ? `(${res.ressource_id})` : ''}</span>
                                    </div>
                                  </div>
                                  <button onClick={() => handleDeleteStepResource(res.id)} className="text-gray-300 hover:text-red-400">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}

                              <button
                                onClick={() => { setActiveFolderId(template.id); setIsResourceModalOpen(true); }}
                                className="text-[10px] font-black bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-black transition-all shadow-lg flex items-center gap-2 mt-2"
                              >
                                <Plus size={14} /> Ajouter un élément
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {templates.length === 0 && (
                        <div className="bg-gray-50 border border-dashed border-gray-200 p-8 rounded-[32px] text-center">
                          <p className="text-gray-400 text-sm italic">Aucun dossier créé.</p>
                        </div>
                      )}
                    </div>

                    {/* Zone Documents de Fin de Parcours */}
                    {(() => {
                      const finResources = moduleStepResources.filter(r => r.module_id === mod.id && r.moment === 'fin');
                      return (
                        <DroppableMomentZone id={`drop-${mod.id}-fin`} className="bg-rose-50 border border-rose-200 rounded-2xl overflow-hidden">
                          <div className="bg-rose-100 px-4 py-3 flex flex-wrap items-center justify-between border-b border-rose-200 gap-2">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-5 bg-rose-500 rounded-full"></span>
                              <span className="text-xs font-black text-rose-800 uppercase tracking-wider">Documents de Fin de Parcours</span>
                              <span className="text-[9px] font-bold text-rose-600 bg-rose-200 px-2 py-0.5 rounded-full">Débloqués après le dernier RDV</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <select 
                                onChange={async (e) => {
                                  if(!e.target.value) return;
                                  const grpId = e.target.value;
                                  const grpName = e.target.options[e.target.selectedIndex].text;
                                  await handleAddModuleMomentResource(mod.id, 'fin', { type: 'document_group', title: grpName, document_group_id: grpId });
                                  e.target.value = '';
                                }}
                                className="text-[10px] font-bold text-rose-800 bg-white border border-rose-300 px-2 py-1.5 rounded-lg outline-none cursor-pointer"
                              >
                                <option value="">+ Groupe...</option>
                                {documentGroups.map(g => <option key={g.id} value={g.id}>{g.nom}</option>)}
                              </select>
                              <button
                                onClick={() => { setActiveMoment('fin'); setActiveMomentModuleId(mod.id); setActiveFolderId(null); setIsResourceModalOpen(true); }}
                                className="text-[10px] font-black bg-rose-600 text-white px-3 py-1.5 rounded-xl hover:bg-rose-700 transition-all flex items-center gap-1.5"
                              >
                                <Plus size={12} /> Fichier
                              </button>
                            </div>
                          </div>
                          <div className="p-3 space-y-2">
                            {finResources.length === 0 && <p className="text-[11px] text-rose-600/60 italic px-1">Aucun document de fin.</p>}
                            {finResources.map(res => {
                              if (res.type === 'document_group') {
                                return <DraggableGroupBlock key={res.id} resourceId={res.id} group={documentGroups.find(g => g.id === res.document_group_id)} onDelete={handleDeleteStepResource} />;
                              }
                              return (
                                <div key={res.id} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-rose-100 text-[11px]">
                                  <div className="flex items-center gap-2">
                                    <span>{res.type === 'signature' ? '✍️' : '📄'}</span>
                                    <span className="font-bold text-gray-800">{res.titre}</span>
                                    <span className="text-[9px] text-gray-400 uppercase">{res.type}</span>
                                  </div>
                                  <button onClick={() => handleDeleteStepResource(res.id)} className="text-gray-300 hover:text-rose-400"><Trash2 size={12} /></button>
                                </div>
                              );
                            })}
                          </div>
                        </DroppableMomentZone>
                      );
                    })()}

                    <form
                      onSubmit={async (e) => { e.preventDefault(); await createSessionFolder(mod.id, newStepTitle); }}
                      className="bg-indigo-900 p-4 rounded-2xl shadow-xl space-y-3"
                    >
                      <div className="flex gap-2">
                        <input required type="text" placeholder="Nouveau Dossier..." value={newStepTitle} onChange={e => setNewStepTitle(e.target.value)} className="flex-1 text-xs p-2.5 bg-indigo-800 border-none text-white rounded-xl outline-none" />
                        <button type="submit" disabled={isAddingStep} className="bg-white text-indigo-900 font-bold px-4 rounded-xl text-xs hover:bg-indigo-50 disabled:opacity-50">
                          {isAddingStep ? '...' : 'Créer Dossier'}
                        </button>
                      </div>
                    </form>
                  </div>
                  </DndContext>
                )}
              </div>
            );
          })}
          {modules.length === 0 && <div className="text-gray-500 italic col-span-2">Créez votre premier module.</div>}
        </div>
      </div>

      {/* Sections Ressources Pédagogiques et Bibliothèque de Modèles Word supprimées :
          - Les ressources s'ajoutent directement dans les dossiers des modules via "+ Ajouter"
          - Les modèles formateurs sont gérés dans la section Formateurs */}

      <StepResourceModal
        isOpen={isResourceModalOpen}
        onClose={() => { setIsResourceModalOpen(false); setActiveFolderId(null); setActiveMoment(null); setActiveMomentModuleId(null); }}
        pedagogicalResources={pedagogicalResources}
        documentTemplates={documentTemplates}
        supabase={supabase}
        momentLabel={activeMoment === 'debut' ? '🟢 Début de Parcours (Onboarding)' : activeMoment === 'fin' ? '🔴 Fin de Parcours (Outro)' : null}
        onSave={(data) => {
          if (activeMoment && activeMomentModuleId) {
            handleAddModuleMomentResource(activeMomentModuleId, activeMoment, data);
            setIsResourceModalOpen(false); setActiveMoment(null); setActiveMomentModuleId(null);
          } else {
            handleAddStepResource(activeFolderId, data);
          }
        }}
      />
    </div>
  );
};

const FormateurView = ({
  clients, formateurs, sessions, generateSessions,
  updateSessionDate, signSession, modules, currentUserId,
  expandedClientId, setExpandedClientId, userRole,
  handleAddSession, handleDeleteSession, updateSessionTime,
  handleGenerateDocx, documents, fetchUtilisateurs, documentTemplates,
  pedagogicalResources, handleDownloadResource, handleUploadExerciseResponse,
  setIsSessionItemModalOpen, setTargetSessionForAddition, setViewingSession,
  handleSignDocument, setViewingDocId,
  clientSkills, fetchClientSkills, supabase, fetchDocuments,
  handleMoveSessionItem, handleSaveCorrection
}) => {
  const [editedTimes, setEditedTimes] = React.useState({});
  const [savingId, setSavingId] = React.useState(null);
  const [correctionModalSession, setCorrectionModalSession] = React.useState(null);
  const [formateurClientTab, setFormateurClientTab] = React.useState('seances');
  const [formateurMainSection, setFormateurMainSection] = React.useState('clients'); // 'clients' | 'mes_docs'
  const [bilanDraft, setBilanDraft] = React.useState({});
  const [savingBilan, setSavingBilan] = React.useState(false);
  const [uploadingClientId, setUploadingClientId] = React.useState(null);
  const [clientDocFile, setClientDocFile] = React.useState(null);
  const [clientDocName, setClientDocName] = React.useState('');
  const [isUploadingClientDoc, setIsUploadingClientDoc] = React.useState(false);
  const [fActiveId, setFActiveId] = React.useState(null);
  const assignedClients = clients.filter(c => c.formateur_id === currentUserId);

  // Documents administratifs propres au formateur (envoyés par l'admin)
  const myAdminDocs = React.useMemo(() =>
    (documents || []).filter(d => d.assigned_formateur_id === currentUserId && d.visible_formateur !== false),
    [documents, currentUserId]
  );
  const pendingDocsCount = myAdminDocs.filter(d => !d.signe_par_formateur).length;

  React.useEffect(() => {
    setFormateurClientTab('seances');
    setBilanDraft({});
  }, [expandedClientId]);

  const onTimeChange = (sessionId, field, value) => {
    setEditedTimes(prev => ({
      ...prev,
      [sessionId]: {
        ...(prev[sessionId] || {
          start: sessions.find(s => s.id === sessionId)?.heure_debut || '',
          end: sessions.find(s => s.id === sessionId)?.heure_fin || ''
        }),
        [field]: value
      }
    }));
  };

  const onSaveTimes = async (sessionId) => {
    setSavingId(sessionId);
    const times = editedTimes[sessionId];
    if (times) {
      await updateSessionTime(sessionId, 'heure_debut', times.start);
      await updateSessionTime(sessionId, 'heure_fin', times.end);
    }
    setTimeout(() => setSavingId(null), 1500);
  };

  const calculateDuration = (start, end) => {
    if (!start || !end) return null;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  };

  const handleUploadForClient = async (clientId) => {
    if (!clientDocFile || !clientDocName.trim()) {
      toast.error('Veuillez renseigner un nom et choisir un fichier.');
      return;
    }
    setIsUploadingClientDoc(true);
    const ext = clientDocFile.name.split('.').pop();
    const safeN = clientDocName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `formateur_${currentUserId}/${Date.now()}_${safeN}.${ext}`;
    const { error: upErr } = await supabase.storage.from('documents').upload(fileName, clientDocFile);
    if (upErr) {
      toast.error('Erreur upload : ' + upErr.message);
      setIsUploadingClientDoc(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
    const { error: dbErr } = await supabase.from('documents').insert({
      nom: clientDocName.trim(),
      type_document: 'Administratif',
      user_id: clientId,
      assigned_formateur_id: currentUserId,
      url: publicUrl,
      visible_client: false,
      visible_formateur: true
    });
    if (!dbErr) {
      toast.success('Document ajouté au dossier client !');
      setClientDocFile(null);
      setClientDocName('');
      setUploadingClientId(null);
      if (fetchDocuments) fetchDocuments();
    } else {
      toast.error('Erreur base de données : ' + dbErr.message);
    }
    setIsUploadingClientDoc(false);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Navigation principale du formateur */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {formateurMainSection === 'clients' ? 'Mes Clients Assignés' : 'Mes Documents Administratifs'}
          </h1>
          <p className="text-gray-500 text-lg mt-1">
            {formateurMainSection === 'clients' ? "Suivez l'avancement et gérez les émargements." : 'Documents à consulter et à signer.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setFormateurMainSection('clients')}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              formateurMainSection === 'clients' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            👥 Mes Clients
          </button>
          <button
            onClick={() => setFormateurMainSection('mes_docs')}
            className={`relative px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              formateurMainSection === 'mes_docs' ? 'bg-rose-600 text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            📄 Docs Administratifs
            {pendingDocsCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                {pendingDocsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Section : Mes Documents Administratifs */}
      {formateurMainSection === 'mes_docs' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 text-lg mb-6 flex items-center gap-2">
            <span className="w-2 h-6 bg-rose-500 rounded-full"></span>
            Documents Administratifs &amp; Contrats
          </h3>
          {myAdminDocs.length === 0 ? (
            <div className="py-16 text-center">
              <Archive className="mx-auto mb-4 text-gray-300" size={40} />
              <p className="text-gray-400 italic">Aucun document administratif ne vous a été assigné.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myAdminDocs.map(doc => (
                <div key={doc.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between group hover:border-rose-200 transition-all shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{doc.nom}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          doc.signe_par_formateur ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {doc.signe_par_formateur ? '✓ Signé' : '⚠ À signer'}
                        </span>
                        {doc.created_at && (
                          <span className="text-[10px] text-gray-400">
                            Reçu le {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewingDocId && setViewingDocId(doc.id)}
                      className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      title="Consulter"
                    >
                      <Eye size={20} />
                    </button>
                    {!doc.signe_par_formateur ? (
                      <button
                        onClick={() => setViewingSession && setViewingSession({ session: { ...doc, file_url: doc.url || doc.file_url }, mode: 'sign' })}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-rose-100 flex items-center gap-2 transition-all"
                      >
                        <PenTool size={14} /> Signer
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-4 py-2 rounded-xl text-xs font-black border border-green-100">
                        <Check size={14} strokeWidth={4} /> Signé
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section : Mes Clients */}
      {formateurMainSection === 'clients' && (
      <div className="grid grid-cols-1 gap-6">
        {assignedClients.length > 0 ? assignedClients.map(client => {
          const clientSessions = sessions.filter(s => s.client_id === client.id);
          const isExpanded = expandedClientId === client.id;
          const assignedModule = modules?.find(m => String(m.id) === String(client.module_id));
          const progress = Math.min(100, Math.round(((client.seances_effectuees || 0) / (client.seances_totales || 10)) * 100));

          return (
            <div key={client.id} className={`bg-white rounded-3xl p-6 shadow-sm border ${isExpanded ? 'border-indigo-200' : 'border-gray-100'} transition-all`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center">
                  <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-2xl mr-4">{client.nom ? client.nom.charAt(0) : '?'}</div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xl">{client.nom}</h3>
                    <p className="text-sm text-gray-500 font-medium">{client.email}</p>
                  </div>
                </div>

                <div className="flex flex-1 max-w-xs flex-col">
                  <div className="flex justify-between text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                    <span>Progression</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                    className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${isExpanded ? 'bg-gray-100 text-gray-700' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'}`}
                  >
                    {isExpanded ? "Réduire" : "Gérer les séances"}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-8 pt-8 border-t border-gray-100 animate-slide-up">
                  <div className="flex gap-4 border-b border-gray-200 mb-6 font-sans">
                    <button onClick={() => setFormateurClientTab('seances')} className={`px-4 py-3 font-bold text-sm transition-all border-b-2 ${formateurClientTab === 'seances' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📅 Planning des Séances</button>
                    <button onClick={() => setFormateurClientTab('administratif')} className={`px-4 py-3 font-bold text-sm transition-all border-b-2 ${formateurClientTab === 'administratif' ? 'border-rose-600 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📄 Administratif</button>
                    <button onClick={() => setFormateurClientTab('docs_signes')} className={`px-4 py-3 font-bold text-sm transition-all border-b-2 ${formateurClientTab === 'docs_signes' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>📁 Documents Signés</button>
                    <button onClick={() => setFormateurClientTab('bilan')} className={`px-4 py-3 font-bold text-sm transition-all border-b-2 ${formateurClientTab === 'bilan' ? 'border-rose-500 text-rose-500' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>🎯 Bilan</button>
                  </div>

                  {formateurClientTab === 'administratif' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-2 h-5 bg-rose-500 rounded-full"></span>
                        <h4 className="font-black text-gray-800 text-sm uppercase tracking-tight">Documents Administratifs & Contrats</h4>
                      </div>
                      
                      {(() => {
                        const adminDocs = documents.filter(d =>
                          d.user_id === client.id &&
                          (d.type_document === 'Administratif' || d.type_document === 'Contrat' || d.type_document === 'Mission')
                        );
                        
                        if (adminDocs.length === 0) return (
                          <div className="py-12 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                            <Archive className="mx-auto mb-3 text-gray-300" size={32} />
                            <p className="text-gray-400 text-sm italic">Aucun document administratif en attente.</p>
                          </div>
                        );

                        return (
                          <div className="grid grid-cols-1 gap-3">
                            {adminDocs.map(doc => (
                              <div key={doc.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between group hover:border-rose-200 transition-all shadow-sm">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                                    <FileText size={20} />
                                  </div>
                                  <div>
                                    <p className="font-bold text-gray-900 text-sm">{doc.nom}</p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                      Généré le {new Date(doc.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => setViewingSession({ session: { ...doc, file_url: doc.url }, mode: 'view' })}
                                    className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                    title="Consulter"
                                  >
                                    <Eye size={20} />
                                  </button>
                                  {!doc.signe_par_formateur ? (
                                    <button 
                                      onClick={() => setViewingSession({ session: { ...doc, file_url: doc.url }, mode: 'sign' })}
                                      className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-rose-100 flex items-center gap-2 transition-all transform active:scale-95"
                                    >
                                      <PenTool size={14} /> Signer le document
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-4 py-2 rounded-xl text-xs font-black border border-green-100">
                                      <Check size={14} strokeWidth={4} /> Signé
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Upload formateur — ajouter un document au dossier client */}
                      <div className="mt-6 pt-5 border-t border-dashed border-gray-200">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-2 h-4 bg-indigo-400 rounded-full"></span>
                          <h4 className="font-black text-gray-700 text-xs uppercase tracking-tight">Ajouter un document au dossier client</h4>
                        </div>
                        {uploadingClientId === client.id ? (
                          <div className="bg-indigo-50 rounded-2xl p-4 space-y-3 border border-indigo-100">
                            <input
                              type="text"
                              value={clientDocName}
                              onChange={e => setClientDocName(e.target.value)}
                              placeholder="Nom du document (ex: Facture finale)"
                              className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <input
                              type="file"
                              onChange={e => setClientDocFile(e.target.files[0] || null)}
                              className="w-full bg-white border border-gray-200 text-sm rounded-xl p-2 outline-none"
                              accept=".pdf,.doc,.docx,image/*"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUploadForClient(client.id)}
                                disabled={isUploadingClientDoc}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black py-2.5 rounded-xl transition-all disabled:opacity-50"
                              >
                                {isUploadingClientDoc ? 'Envoi en cours...' : 'Envoyer le document'}
                              </button>
                              <button
                                onClick={() => { setUploadingClientId(null); setClientDocFile(null); setClientDocName(''); }}
                                className="px-4 py-2.5 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl hover:bg-gray-50 transition-all"
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setUploadingClientId(client.id)}
                            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black px-4 py-2.5 rounded-xl border border-indigo-100 transition-all"
                          >
                            <Upload size={14} /> Insérer un document (facture, justificatif...)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {formateurClientTab === 'docs_signes' && (
                    <div className="mb-4 space-y-6">

                      {/* --- Section 1 : Suivi des documents du client --- */}
                      {(() => {
                        const clientDocs = (documents || []).filter(d =>
                          String(d.user_id) === String(client.id) &&
                          d.visible_formateur !== false
                        );
                        if (clientDocs.length === 0) return null;
                        return (
                          <div>
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Suivi des documents</h4>
                            <div className="overflow-hidden rounded-2xl border border-gray-100">
                              <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest">
                                  <tr>
                                    <th className="px-4 py-3">Document</th>
                                    <th className="px-4 py-3">Statut</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                  {clientDocs.map(doc => {
                                    const isSigned = !!doc.signe_par_client;
                                    const fileUrl = doc.url || doc.file_url;
                                    return (
                                      <tr key={doc.id} className={`hover:bg-gray-50 transition-colors ${!isSigned ? 'bg-amber-50/30' : ''}`}>
                                        <td className="px-4 py-3">
                                          <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSigned ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                              {isSigned ? <FileCheck size={16} /> : <FileText size={16} />}
                                            </div>
                                            <span className="font-semibold text-gray-800 text-xs">{doc.nom || 'Document'}</span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${isSigned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {isSigned ? '✓ Signé' : '⚠ En attente'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          {fileUrl && (
                                            <a
                                              href={fileUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1.5 bg-white text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-bold border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                                            >
                                              <Eye size={13} /> Consulter
                                            </a>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      {/* --- Section 2 : Émargements de séances signés --- */}
                      {(() => {
                        const signedSessions = clientSessions.filter(s =>
                          (s.statut === 'Signé' || s.statut_client === 'Signé') &&
                          (s.signed_pdf_url || s.file_url_signed || s.metadata?.file_url_signed)
                        );
                        if (signedSessions.length === 0) return null;
                        return (
                          <div>
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Émargements de séances</h4>
                            <div className="overflow-hidden rounded-2xl border border-gray-100">
                              <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest">
                                  <tr>
                                    <th className="px-4 py-3">Séance</th>
                                    <th className="px-4 py-3">Date de signature</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                  {signedSessions.map(session => {
                                    const signedUrl = session.signed_pdf_url || session.file_url_signed || session.metadata?.file_url_signed;
                                    const dateSign = session.date_signature_client || session.date_signature_formateur || session.date_signature || session.updated_at;
                                    return (
                                      <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                          <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center shrink-0">
                                              <FileCheck size={16} />
                                            </div>
                                            <span className="font-semibold text-gray-800 text-xs">{session.ressource_titre || session.nom || session.titre || 'Émargement Signé'}</span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-500">
                                          {dateSign ? new Date(dateSign).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          <a
                                            href={signedUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 bg-white text-green-700 px-3 py-1.5 rounded-xl text-xs font-bold border border-green-200 hover:bg-green-600 hover:text-white transition-all shadow-sm"
                                          >
                                            <Download size={13} /> Télécharger
                                          </a>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      {/* --- État vide global --- */}
                      {(() => {
                        const hasClientDocs = (documents || []).some(d => String(d.user_id) === String(client.id) && d.visible_formateur !== false);
                        const hasSignedSessions = clientSessions.some(s =>
                          (s.statut === 'Signé' || s.statut_client === 'Signé') &&
                          (s.signed_pdf_url || s.file_url_signed || s.metadata?.file_url_signed)
                        );
                        if (!hasClientDocs && !hasSignedSessions) return (
                          <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <FileCheck className="mx-auto mb-3 text-gray-300" size={32} />
                            <p className="text-gray-400 text-sm italic">Aucun document disponible pour ce client.</p>
                          </div>
                        );
                        return null;
                      })()}

                    </div>
                  )}

                  {formateurClientTab === 'seances' && (
                    <>
                      <div className="flex items-center gap-3">
                        <h4 className="font-bold text-gray-800 flex items-center">
                          <span className="w-2 h-5 bg-indigo-500 rounded-full mr-2"></span>
                          Planning des Séances - {assignedModule?.nom || 'Sans module'}
                        </h4>

                        {(userRole === 'admin' || userRole === 'formateur') && (
                          <button
                            onClick={() => handleAddSession(client)}
                            className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-indigo-100 flex items-center"
                            title="Ajouter une séance"
                          >
                            <span className="mr-1.5">➕</span> Ajouter une séance
                          </button>
                        )}
                      </div>

                      <div className="mb-4 flex flex-wrap gap-2"></div>

                      {clientSessions.length > 0 ? (
                        <div className="overflow-hidden rounded-2xl border border-gray-100">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest">
                              <tr>
                                <th className="px-4 py-3 text-left">N° & Séance</th>
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Horaires (Début/Fin)</th>
                                <th className="px-4 py-3 text-left">Statut</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {(() => {
                                const grouped = clientSessions.reduce((acc, s) => {
                                  const key = s.numero_seance;
                                  if (!acc[key]) acc[key] = { numero: s.numero_seance, nom: (s.nom || '').split(' - ')[0], date: s.date, debut: s.heure_debut, fin: s.heure_fin, items: [] };
                                  acc[key].items.push(s);
                                  return acc;
                                }, {});

                                return (
                                  <DndContext
                                    onDragStart={({ active }) => setFActiveId(active.id)}
                                    onDragEnd={({ active, over }) => {
                                      if (over && handleMoveSessionItem) {
                                        const itemId = String(active.id).replace('fi-', '');
                                        const src = sessions.find(s => String(s.id) === itemId);
                                        const targetGroup = Object.values(grouped).find(g => `fg-${g.numero}` === over.id);
                                        if (src && targetGroup && src.numero_seance !== targetGroup.numero) {
                                          handleMoveSessionItem(src.id, targetGroup.numero, targetGroup.date, targetGroup.debut, targetGroup.fin);
                                        }
                                      }
                                      setFActiveId(null);
                                    }}
                                  >
                                    {Object.values(grouped).sort((a, b) => a.numero - b.numero).map((group, gIdx) => (
                                  <React.Fragment key={gIdx}>
                                    <FDropGroupRow groupNum={group.numero} hasActive={fActiveId != null}>
                                      {(isGroupOver) => (
                                        <>
                                          <td className="px-4 py-3 font-black text-indigo-900 border-l-4 border-indigo-500">
                                            <div className="flex items-center gap-2 text-xs">
                                              <Layout size={12} className="text-indigo-600" />
                                              <span>SÉANCE {group.numero} : {group.nom}</span>
                                              {isGroupOver && fActiveId && (
                                                <span className="ml-2 text-[9px] font-black text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full animate-pulse">Déposer ici</span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-4 py-3">
                                            <input
                                              type="date"
                                              value={group.date || ''}
                                              onChange={(e) => { group.items.forEach(s => updateSessionDate(s.id, e.target.value)); }}
                                              className="border-none bg-transparent font-bold text-indigo-700 text-xs focus:ring-0 outline-none w-full"
                                            />
                                          </td>
                                          <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                              <div className="flex flex-col gap-0.5">
                                                <input
                                                  type="time"
                                                  value={editedTimes[group.items[0]?.id]?.start ?? group.debut ?? ''}
                                                  onChange={(e) => group.items.forEach(s => onTimeChange(s.id, 'start', e.target.value))}
                                                  className="bg-transparent border-none text-[10px] w-16 font-bold text-indigo-600 focus:ring-0"
                                                />
                                                <input
                                                  type="time"
                                                  value={editedTimes[group.items[0]?.id]?.end ?? group.fin ?? ''}
                                                  onChange={(e) => group.items.forEach(s => onTimeChange(s.id, 'end', e.target.value))}
                                                  className="bg-transparent border-none text-[10px] w-16 font-bold text-indigo-600 focus:ring-0"
                                                />
                                              </div>
                                              <button onClick={() => group.items.forEach(s => onSaveTimes(s.id))} className="text-indigo-400 hover:text-indigo-600">
                                                <Save size={14} />
                                              </button>
                                            </div>
                                          </td>
                                          <td colSpan="2" className="px-4 py-3 text-right">
                                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">Container Séance</span>
                                          </td>
                                        </>
                                      )}
                                    </FDropGroupRow>

                                {/* Nested Items — Draggable */}
                                {group.items.map(session => (
                                  <FDragItemRow key={session.id} sessionId={session.id} activeId={fActiveId}>
                                    <td className="px-8 py-3 italic text-gray-600 text-[11px] flex items-center gap-2">
                                      <span className="text-[8px] text-gray-300 mr-0.5" title="Glisser pour déplacer">⠿</span>
                                      <span className="text-[14px]">
                                        {session.type_activite === 'signature' ? '✍️' : session.type_activite === 'document' ? '📄' : '⚙️'}
                                      </span>
                                      <span className="truncate">{session.ressource_titre || session.nom}</span>
                                    </td>
                                    <td colSpan="2" className="px-4 py-3 text-[10px] text-gray-400 italic">Hérité du dossier</td>
                                    <td className="px-4 py-3">
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`w-1.5 h-1.5 rounded-full ${session.statut_client === 'Signé' ? 'bg-green-500' : 'bg-orange-400'}`}></span>
                                          <span className="text-[8px] font-black uppercase text-gray-500">Client: {session.statut_client || (session.statut === 'Signé' ? 'Signé' : 'À venir')}</span>
                                        </div>
                                        {(session.metadata?.requiresTrainerSignature === true || (session.type_activite === 'signature' && session.metadata?.requiresTrainerSignature !== false)) && (
                                        <div className="flex items-center gap-1.5">
                                          <span className={`w-1.5 h-1.5 rounded-full ${session.statut_formateur === 'Signé' ? 'bg-green-500' : 'bg-orange-400'}`}></span>
                                          <span className="text-[8px] font-black uppercase text-gray-500">Coach: {session.statut_formateur || (session.type_activite === 'signature' && session.statut === 'Signé' ? 'Signé' : 'À venir')}</span>
                                        </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex justify-end items-center gap-2">
                                        {(() => {
                                          const today = new Date().toISOString().split('T')[0];
                                          const sessionDate = session.date || group.date;
                                          const isDateLocked = sessionDate && today < sessionDate;
                                          const metadata = session.metadata || {};
                                          const signedUrl = session.file_url_signed || metadata.file_url_signed;
                                          const isToSign = metadata.isToSign || session.type_activite === 'signature';
                                          const isSigned = session.statut_formateur === 'Signé' || session.statut === 'Signé';

                                          return (
                                            <div className="flex gap-2 items-center">
                                              {(session.type_activite === 'document' || session.type_activite === 'exercice' || session.type_activite === 'Exercice') && (
                                                <button
                                                  onPointerDown={e => e.stopPropagation()}
                                                  onClick={() => {
                                                    const docUrl = signedUrl || session.file_url || session.ressource_url;
                                                    setViewingSession({ session: { ...session, file_url: docUrl }, mode: 'view' });
                                                  }}
                                                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${signedUrl ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'}`}
                                                >
                                                  {signedUrl ? 'Voir Signé ↗' : 'Consulter'}
                                                </button>
                                              )}

                                              {isToSign && (
                                                <button
                                                  disabled={isSigned || isDateLocked}
                                                  onPointerDown={e => e.stopPropagation()}
                                                  onClick={() => signSession(session)}
                                                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${isSigned ? 'bg-green-50 text-green-600 border-green-200' : isDateLocked ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-rose-500 text-white border-rose-600 hover:bg-rose-700'}`}
                                                >
                                                  {isSigned ? 'Signé ✓' : isDateLocked ? 'Indisponible' : 'Signer'}
                                                </button>
                                              )}

                                              {signedUrl && (
                                                <button
                                                  onPointerDown={e => e.stopPropagation()}
                                                  onClick={() => handleDownloadResource(signedUrl)}
                                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                  title="Télécharger"
                                                >
                                                  <FileCheck size={16} />
                                                </button>
                                              )}
                                                {userRole === 'client' && (
                                                  <label className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white cursor-pointer hover:bg-emerald-700 transition-colors">
                                                    Soumettre Réponse
                                                    <input
                                                      type="file"
                                                      className="hidden"
                                                      onChange={(e) => e.target.files[0] && handleUploadExerciseResponse(session.id, e.target.files[0])}
                                                    />
                                                  </label>
                                                )}
                                              {(userRole === 'admin' || userRole === 'formateur') && (session.type_activite === 'exercice' || session.type_activite === 'Exercice') && (
                                                session.reponse_url ? (
                                                  <button
                                                    onClick={() => setCorrectionModalSession(session)}
                                                    className={`relative text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 ${session.correction_statut === 'Validé' ? 'bg-green-600 text-white hover:bg-green-700' : session.correction_statut === 'À corriger' ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                                  >
                                                    {session.correction_statut === 'Validé' ? (
                                                      <>✅ Validé</>
                                                    ) : session.correction_statut === 'À corriger' ? (
                                                      <>📝 À corriger</>
                                                    ) : (
                                                      <>
                                                        <span className="relative flex h-2 w-2">
                                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                                        </span>
                                                        Corriger
                                                      </>
                                                    )}
                                                  </button>
                                                ) : (
                                                  <span className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 flex items-center gap-1.5">
                                                    Aucun rendu
                                                  </span>
                                                )
                                              )}
                                              <button
                                                onClick={() => handleDeleteSession(session)}
                                                className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                  </FDragItemRow>
                                ))}
                                {/* Footer row with Add button */}
                                <tr className="bg-gray-50/20">
                                  <td colSpan="5" className="px-8 py-2 text-left border-l border-gray-100">
                                    <button
                                      onClick={() => {
                                        setTargetSessionForAddition({
                                          ...group,
                                          clientId: client.id,
                                          preSelectedSessionId: group.items[0]?.id
                                        });
                                        setIsSessionItemModalOpen(true);
                                      }}
                                      className="text-[10px] font-black bg-white text-indigo-600 px-4 py-1.5 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm border border-indigo-100 flex items-center gap-2"
                                    >
                                      <Plus size={12} /> Ajouter un élément
                                    </button>
                                  </td>
                                </tr>
                              </React.Fragment>
                            ))}
                          </DndContext>
                        );
                      })()}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <p className="text-gray-400 text-sm italic">Aucune séance n'est encore enregistrée pour ce client.</p>
                    </div>
                  )}
                  </>
                )}

                  {formateurClientTab === 'bilan' && (() => {
                    const existingSkill = (clientSkills || []).find(s => s.client_id === client.id) || {};
                    const getValue = (key) => bilanDraft[key] !== undefined ? bilanDraft[key] : (parseFloat(existingSkill[key]) || 0);
                    const getText = (key) => bilanDraft[key] !== undefined ? bilanDraft[key] : (existingSkill[key] || '');

                    const handleSaveBilan = async () => {
                      setSavingBilan(true);
                      const payload = {
                        client_id: client.id,
                        updated_at: new Date().toISOString(),
                      };
                      ANCHOR_KEYS.forEach(({ key }) => { payload[key] = getValue(key); });
                      payload.top_skill_1 = getText('top_skill_1');
                      payload.top_skill_2 = getText('top_skill_2');
                      payload.top_skill_3 = getText('top_skill_3');
                      payload.target_job = getText('target_job');
                      const { error } = await supabase.from('client_skills').upsert(payload, { onConflict: 'client_id' });
                      if (!error) {
                        toast.success('Bilan sauvegardé !');
                        await fetchClientSkills();
                        setBilanDraft({});
                      } else {
                        toast.error('Erreur sauvegarde : ' + error.message);
                      }
                      setSavingBilan(false);
                    };

                    return (
                      <div className="space-y-6">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-5 bg-rose-500 rounded-full"></span>
                          <h4 className="font-black text-gray-800 text-sm uppercase tracking-tight">Ancres de Carrière</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {ANCHOR_KEYS.map(({ key, label }) => (
                            <div key={key} className="bg-gray-50 rounded-2xl p-4">
                              <div className="flex justify-between items-center mb-2">
                                <label className="font-bold text-gray-700 text-sm">{label}</label>
                                <span className="text-rose-500 font-black text-lg w-8 text-right">{getValue(key)}</span>
                              </div>
                              <input
                                type="range" min="0" max="10" step="0.5"
                                value={getValue(key)}
                                onChange={e => setBilanDraft(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                                className="w-full accent-rose-500"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <span className="w-2 h-5 bg-indigo-500 rounded-full"></span>
                          <h4 className="font-black text-gray-800 text-sm uppercase tracking-tight">Points Forts</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {['top_skill_1', 'top_skill_2', 'top_skill_3'].map((key, i) => (
                            <div key={key}>
                              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Point fort {i + 1}</label>
                              <input
                                type="text"
                                value={getText(key)}
                                onChange={e => setBilanDraft(prev => ({ ...prev, [key]: e.target.value }))}
                                placeholder="Ex: Rigueur"
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white"
                              />
                            </div>
                          ))}
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Métier cible</label>
                          <input
                            type="text"
                            value={getText('target_job')}
                            onChange={e => setBilanDraft(prev => ({ ...prev, target_job: e.target.value }))}
                            placeholder="Ex: Développeur Full-Stack"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 bg-white"
                          />
                        </div>
                        <button
                          onClick={handleSaveBilan}
                          disabled={savingBilan}
                          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg shadow-rose-100 disabled:opacity-50"
                        >
                          {savingBilan ? <><Clock size={16} className="animate-spin" /> Sauvegarde...</> : <><Save size={16} /> Sauvegarder le bilan</>}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        }) : (
          <div className="col-span-full py-12 text-center bg-white rounded-3xl border-2 border-dashed border-gray-200">
            <p className="text-gray-400 font-medium italic">Aucun client ne vous est assigné actuellement.</p>
          </div>
        )}
      </div>
      )}
      <CorrectionModal
        isOpen={!!correctionModalSession}
        onClose={() => setCorrectionModalSession(null)}
        session={correctionModalSession}
        onSave={handleSaveCorrection}
      />
    </div>
  );
};

const DocumentsView = ({
  sessions, documents, clients, formateurs, userRole, currentUserId,
  handleSignDocument, handleDownloadPDF, handleAddDocument,
  updateDateSeance, newDocName, setNewDocName,
  newDocType, setNewDocType, newDocUrl, setNewDocUrl,
  newDocFile, setNewDocFile, newDocClientId, setNewDocClientId,
  newDocVisClient, setNewDocVisClient, newDocVisFormateur, setNewDocVisFormateur,
  isAddingDoc, selectedClientForDocs, setSelectedClientForDocs,
  signingDocId, setSigningDocId, viewingDocId, setViewingDocId,
  handleSignatureSave, documentTemplates, handleUploadDocxTemplate,
  newTemplateName, setNewTemplateName, setIsDeleteModalOpen, setTargetToDelete,
  newTemplateDestination, setNewTemplateDestination, supabase,
  onUpdateTemplateDestination,
  newTemplateClassification, setNewTemplateClassification, fetchDocuments
}) => {
  const [expandedId, setExpandedId] = React.useState(null);
  const [modelesTab, setModelesTab] = React.useState('modeles');
  const [clientDocTab, setClientDocTab] = React.useState('avant');
  const isAdmin = userRole === 'admin';
  const isClient = userRole === 'client';
  const isFormateur = userRole === 'formateur';

  // Groupes de documents
  const [documentGroups, setDocumentGroups] = React.useState([]);
  const [newGroupName, setNewGroupName] = React.useState('');
  const [isCreatingGroup, setIsCreatingGroup] = React.useState(false);
  const [selectedTemplateFile, setSelectedTemplateFile] = React.useState(null);
  const [expandedGroupId, setExpandedGroupId] = React.useState(null);

  const fetchDocumentGroups = React.useCallback(async () => {
    const { data, error } = await supabase.from('document_groups').select('*').order('nom', { ascending: true });
    if (!error && data) setDocumentGroups(data);
  }, [supabase]);

  React.useEffect(() => {
    if (isAdmin) fetchDocumentGroups();
  }, [isAdmin, fetchDocumentGroups]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setIsCreatingGroup(true);
    const { error } = await supabase.from('document_groups').insert([{ nom: newGroupName.trim() }]);
    setIsCreatingGroup(false);
    if (!error) {
      setNewGroupName('');
      fetchDocumentGroups();
      toast.success("Groupe créé avec succès.");
    } else {
      toast.error("Erreur de création du groupe : " + error.message);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce groupe ? Les documents qui y sont associés seront détachés.")) {
      await supabase.from('module_step_resources').update({ document_group_id: null }).eq('document_group_id', groupId);
      const { error } = await supabase.from('document_groups').delete().eq('id', groupId);
      if (!error) {
        fetchDocumentGroups();
        if (fetchDocuments) fetchDocuments();
        toast.success("Groupe supprimé.");
      } else {
        toast.error("Erreur lors de la suppression : " + error.message);
      }
    }
  };

  const handleToggleDocumentGroup = async (docId, nextGroupId) => {
    if (!docId) return;
    const { error } = await supabase.from('documents').update({ group_id: nextGroupId }).eq('id', docId);
    if (!error) {
      if (fetchDocuments) fetchDocuments();
      toast.success(nextGroupId ? "Document associé au groupe." : "Document détaché du groupe.");
    } else {
      toast.error("Erreur d'association : " + error.message);
    }
  };

  // Group clients by their documents
  const clientsWithDocs = React.useMemo(() => {
    let targetClients = clients;
    if (isFormateur) {
      targetClients = clients.filter(c => c.formateur_id === currentUserId);
    }

    return targetClients
      .map(client => ({
        ...client,
        docs: documents.filter(d => d.user_id === client.id)
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [clients, documents, isFormateur, currentUserId]);

  const displayedDocs = isAdmin ? documents :
    isClient ? documents.filter(d => d.user_id === currentUserId && d.visible_client) :
      isFormateur ? documents.filter(d => d.visible_formateur) : [];


  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
        {isClient ? "Mes Documents" : "Gestion des documents"}
      </h1>
      <p className="text-gray-500 text-lg">Consultez et {isClient ? 'signez vos' : 'vérifiez les'} fichiers légaux ou de synthèse.</p>

      {isAdmin && (
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setModelesTab('modeles')}
            className={`px-5 py-3 rounded-2xl font-bold transition-all shadow-sm ${modelesTab === 'modeles' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
            Modèles Automatiques (.docx)
          </button>
          <button
            onClick={() => setModelesTab('manuel')}
            className={`px-5 py-3 rounded-2xl font-bold transition-all shadow-sm ${modelesTab === 'manuel' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
          >
            Assigner un document libre
          </button>
        </div>
      )}

      {isAdmin && modelesTab === 'modeles' && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mb-8">
          <div className="flex justify-between items-start">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
              <span className="w-2 h-6 bg-amber-500 rounded-full mr-3"></span> Gestion des documents
            </h2>
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl shadow-sm text-[10px] text-blue-700 font-mono">
              <strong>Balises :</strong> {"{nom}"}, {"{adresse_formateur}"}, {"{formateur_nda}"}, {"{nomcomplet_client}"}, {"{prix_prestation}"}, {"{adresse_session}"}, {"{date_debut}"}...
            </div>
          </div>

          <div className="mb-8 p-5 bg-indigo-50 rounded-2xl border border-indigo-100">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Layout size={18}/> Groupes de documents</h3>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="text"
                placeholder="Nouveau groupe (ex: Pack de début)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="text-sm p-3 bg-white border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-xs"
              />
              <button
                onClick={handleCreateGroup}
                disabled={isCreatingGroup || !newGroupName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-md disabled:opacity-50"
              >
                Créer
              </button>
            </div>
            {documentGroups.length > 0 && (
              <div className="flex flex-col gap-3">
                {documentGroups.map(g => {
                  const groupDocs = documents.filter(d => d.group_id === g.id);
                  return (
                    <div key={g.id} className="bg-white rounded-xl border border-indigo-100 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-indigo-50 transition-colors" onClick={() => setExpandedGroupId(expandedGroupId === g.id ? null : g.id)}>
                        <div className="font-bold text-indigo-800 flex items-center gap-2">
                          {expandedGroupId === g.id ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                          {g.nom} <span className="text-xs font-normal text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">{groupDocs.length} doc(s)</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {expandedGroupId === g.id && (
                        <div className="p-3 bg-indigo-50/50 border-t border-indigo-100">
                          {groupDocs.length > 0 ? (
                            <ul className="space-y-2">
                              {groupDocs.map(d => (
                                <li key={d.id} className="text-sm text-gray-700 flex items-center gap-2">
                                  <FileText size={14} className="text-indigo-400" />
                                  {d.nom}
                                  <span className="text-[10px] text-gray-400 font-bold uppercase">({d.extension || 'docx'})</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-500 italic">Aucun document dans ce groupe.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mb-8 p-5 bg-amber-50 rounded-2xl border border-amber-100">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><FileText size={18}/> Nouveau Modèle</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-amber-800 uppercase mb-2">Nom du modèle</label>
                <input
                  type="text"
                  placeholder="Nom (Ex: Attestation de Fin de Formation)"
                  className="w-full text-sm p-3 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                  value={newTemplateName || ''}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-800 uppercase mb-2">Classification</label>
                <select
                  className="w-full text-sm p-3 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  value={newTemplateClassification}
                  onChange={(e) => setNewTemplateClassification(e.target.value)}
                >
                  <option value="telechargeable">📥 Téléchargeable</option>
                  <option value="a_signer">✍️ À signer</option>
                  <option value="a_generer">⚙️ À générer</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 items-center">
              <label className="inline-flex items-center gap-2 bg-white text-amber-600 border border-amber-600 hover:bg-amber-50 px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all shadow-sm">
                {selectedTemplateFile ? selectedTemplateFile.name : 'Sélectionner un fichier (.docx, .pdf)'}
                <input
                  type="file"
                  className="hidden"
                  accept=".docx, .pdf"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      const f = e.target.files[0];
                      setSelectedTemplateFile(f);
                      if (!newTemplateName) {
                        setNewTemplateName(f.name.replace(/\.[^/.]+$/, ''));
                      }
                    }
                  }}
                />
              </label>
              <button
                onClick={async () => {
                  if (!selectedTemplateFile || !newTemplateName) {
                     toast.error("Veuillez sélectionner un fichier et renseigner un nom.");
                     return;
                  }
                  await handleUploadDocxTemplate(selectedTemplateFile, newTemplateName, 'client', newTemplateClassification);
                  setNewTemplateName('');
                  setNewTemplateClassification('telechargeable');
                  setSelectedTemplateFile(null);
                }}
                disabled={!selectedTemplateFile || !newTemplateName}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-md disabled:opacity-50"
              >
                Créer le document
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.filter(d => !d.user_id && !d.assigned_formateur_id).map((doc) => {
              const classif = typeof doc.metadata === 'object' && doc.metadata ? doc.metadata.classification : 'telechargeable';
              const dest = doc.visible_formateur ? 'formateur' : 'client';
              return (
                <div key={doc.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-amber-500 transition-all group relative flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-tighter px-2 py-0.5 rounded-full ${
                      dest === 'formateur' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'
                    }`}>
                      {dest === 'formateur' ? '📋 Formateur' : '📁 Client'}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-tighter px-2 py-0.5 rounded-full ${
                      classif === 'a_generer' ? 'bg-purple-100 text-purple-600' :
                      classif === 'a_signer' ? 'bg-orange-100 text-orange-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {classif === 'a_generer' ? '⚙️ À générer' : classif === 'a_signer' ? '✍️ À signer' : '📥 Téléchargeable'}
                    </span>
                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full uppercase">
                      .{doc.extension || 'docx'}
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="text-[10px] text-gray-400 hover:text-amber-600 cursor-pointer font-bold transition-colors">
                        Mettre à jour
                        <input type="file" className="hidden" accept=".docx, .pdf" onChange={(e) => handleUploadDocxTemplate(e.target.files[0], doc.nom, dest)} />
                      </label>
                      <button 
                        onClick={() => {
                          setTargetToDelete({ id: doc.nom, type: 'template' });
                          setIsDeleteModalOpen(true);
                        }}
                        className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{doc.nom}</h3>
                  <div className="mt-auto pt-4 space-y-2">
                    {/* Modifier la destination inline */}
                    <select
                      className="w-full text-xs p-1.5 rounded-lg border border-gray-100 bg-gray-50 text-gray-500 font-medium cursor-pointer hover:border-amber-300 transition-colors"
                      value={dest}
                      onChange={(e) => onUpdateTemplateDestination && onUpdateTemplateDestination(doc.id, e.target.value)}
                    >
                      <option value="client">📁 Client</option>
                      <option value="formateur">📋 Formateur</option>
                    </select>
                    {/* Associer à un groupe */}
                    <select
                      className="w-full text-xs p-1.5 rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-700 font-medium cursor-pointer hover:border-indigo-300 transition-colors"
                      value={doc.group_id || ''}
                      onChange={(e) => handleToggleDocumentGroup(doc.id, e.target.value || null)}
                    >
                      <option value="">-- Sans groupe --</option>
                      {documentGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.nom}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
            {documents.filter(d => !d.user_id && !d.assigned_formateur_id).length === 0 && (
              <div className="col-span-full py-4 text-center text-gray-400 italic text-sm">Aucun modèle enregistré.</div>
            )}
          </div>
        </div>
      )}

      {/* Formulaire Administrateur d'ajout de document */}
      {isAdmin && modelesTab === 'manuel' && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-10"></div>
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
            <span className="w-2 h-6 bg-blue-500 rounded-full mr-3"></span> Mettre en ligne un Document
          </h2>
          <form onSubmit={handleAddDocument} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du Document</label>
                <input required type="text" value={newDocName} onChange={(e) => setNewDocName(e.target.value)} placeholder="Ex: Contrat de prestation" className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 w-full p-3 outline-none transition-all" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Type Document</label>
                <select required value={newDocType} onChange={(e) => setNewDocType(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 w-full p-3 outline-none transition-all">
                  <option value="Autre">Autre</option>
                  <option value="Contrat">Contrat</option>
                  <option value="Émargement">Émargement</option>
                  <option value="Évaluation">Évaluation</option>
                  <option value="Présence">Présence (Séance)</option>
                </select>
              </div>
              <div className="flex-1 col-span-1 md:col-span-3 lg:col-span-1 flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">PDF / Image</label>
                  <input type="file" onChange={(e) => setNewDocFile(e.target.files[0] || null)} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 w-full p-2 outline-none transition-all" accept=".pdf,image/*" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ou URL</label>
                  <input type="url" value={newDocUrl} onChange={(e) => setNewDocUrl(e.target.value)} placeholder="https://..." className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 w-full p-3 outline-none transition-all" />
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-end">
              <div className="w-full lg:flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Rattaché</label>
                <select required value={newDocClientId} onChange={(e) => setNewDocClientId(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 w-full p-3 outline-none">
                  <option value="">Sélectionner le bénéficiaire</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom} ({c.email})</option>)}
                </select>
              </div>

              <div className="flex gap-4 items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={newDocVisClient} onChange={(e) => setNewDocVisClient(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                  <span className="font-medium whitespace-nowrap">Visible Client</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={newDocVisFormateur} onChange={(e) => setNewDocVisFormateur(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                  <span className="font-medium whitespace-nowrap">Visible Formateur</span>
                </label>
              </div>

              <button type="submit" disabled={isAddingDoc} className="w-full lg:w-max bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl px-6 py-3 shrink-0 disabled:opacity-50 transition-colors shadow-sm">
                {isAddingDoc ? "Ajout..." : "Créer le document"}
              </button>
            </div>
          </form>
        </div>
      )}


      {/* Table Documents / Calendrier Sessions */}
      <div className="mt-6 space-y-6">
        {isFormateur ? (
          clientsWithDocs.map(client => {
            const isExpanded = expandedId === client.id;
            const clientDocs = client.docs;

            return (
              <div key={client.id} className={`bg-white rounded-3xl p-6 shadow-sm border ${isExpanded ? 'border-indigo-200' : 'border-gray-100'} transition-all`}>
                <div
                  className="flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : client.id)}
                >
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-xl mr-4">{client.nom ? client.nom.charAt(0) : '?'}</div>
                    <div className="flex flex-col">
                      <h3 className="font-bold text-gray-900 text-lg">{client.nom}</h3>
                      <p className="text-xs text-gray-500 font-medium">{clientDocs.length} document(s)</p>
                    </div>
                  </div>
                  <button className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${isExpanded ? 'bg-gray-100 text-gray-600' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'}`}>
                    {isExpanded ? "Fermer le dossier" : "Ouvrir le dossier"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-6 pt-6 border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-100 text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                          <th className="pb-3 px-2">Document</th>
                          <th className="pb-3 px-2">Statut Signature</th>
                          <th className="pb-3 px-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientDocs.map(doc => (
                          <tr key={doc.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors group">
                            <td className="py-4 px-2">
                              <div className="flex items-center">
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center mr-3 text-gray-500 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600"><FileText /></div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-gray-900 text-sm">{doc.nom}</span>
                                  {doc.type_document === 'Présence' && doc.date_seance && (
                                    <span className="text-[10px] text-gray-400 font-medium">Séance du : {new Date(doc.date_seance).toLocaleDateString('fr-FR')}</span>
                                  )}
                                  {doc.url && <button onClick={() => setViewingDocId(doc.id)} className="text-[10px] text-blue-600 font-bold hover:underline mt-0.5 text-left">Voir PDF ↗</button>}
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-2">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${doc.signe_par_client ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>Bénéficiaire</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${doc.signe_par_formateur ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>Formateur</span>
                              </div>
                            </td>
                            <td className="py-4 px-2 text-right">
                              <div className="flex justify-end gap-2">
                                {!doc.signe_par_formateur && (
                                  <button onClick={() => setSigningDocId(doc.id)} className="px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-lg text-[10px] hover:bg-indigo-700 shadow-sm shadow-indigo-100">Signer</button>
                                )}
                                <button onClick={() => handleDownloadPDF(doc)} className="p-1.5 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors" title="Télécharger">
                                  <DownloadIcon />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {clientDocs.length === 0 && (
                          <tr><td colSpan="3" className="py-8 text-center text-gray-400 italic text-sm">Aucun document pour ce bénéficiaire.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        ) : isClient ? (
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mb-8 max-w-5xl mx-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
              <span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span> Mes Documents et Supports
            </h2>
            <div className="flex flex-wrap gap-4 border-b border-gray-200 mb-6">
              <button onClick={() => setClientDocTab('avant')} className={`px-4 py-3 font-bold text-sm transition-colors ${clientDocTab === 'avant' ? 'border-b-2 border-rose-500 text-rose-500' : 'text-gray-500 hover:text-gray-800 border-b-2 border-transparent'}`}>À signer avant début</button>
              <button onClick={() => setClientDocTab('supports')} className={`px-4 py-3 font-bold text-sm transition-colors ${clientDocTab === 'supports' ? 'border-b-2 border-rose-500 text-rose-500' : 'text-gray-500 hover:text-gray-800 border-b-2 border-transparent'}`}>Supports de formation</button>
              <button onClick={() => setClientDocTab('fin')} className={`px-4 py-3 font-bold text-sm transition-colors ${clientDocTab === 'fin' ? 'border-b-2 border-rose-500 text-rose-500' : 'text-gray-500 hover:text-gray-800 border-b-2 border-transparent'}`}>Documents de fin</button>
            </div>

            <div className="space-y-4">
              {(() => {
                const clientDocs = displayedDocs;
                const clientSessions = (sessions || []).filter(s => s.client_id === currentUserId).sort((a, b) => new Date(a.date) - new Date(b.date));
                const currentDate = new Date();
                currentDate.setHours(0, 0, 0, 0);

                const renderDocRow = (doc) => (
                  <div key={doc.id} className="p-4 border border-gray-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-rose-200 bg-gray-50/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-rose-50 text-rose-600 flex items-center justify-center rounded-xl shrink-0"><FileText size={20} /></div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{doc.nom}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{doc.type_document || doc.type || 'Document'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {(!doc.signe_par_client && (doc.type_document === 'À signer' || (!doc.metadata && (doc.type_document === 'Contrat' || String(doc.nom).toLowerCase().includes('contrat') || String(doc.nom).toLowerCase().includes('convention'))))) && (
                        <button onClick={() => setSigningDocId(doc.id)} className="px-4 py-2 bg-rose-500 text-white font-bold rounded-lg text-xs shadow-sm hover:bg-rose-600 transition-colors">Signer Document</button>
                      )}
                      {doc.signe_par_client && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100">✓ Votré signature Validée</span>}
                      <button onClick={() => handleDownloadPDF(doc)} className="p-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm" title="Télécharger">
                        <DownloadIcon />
                      </button>
                    </div>
                  </div>
                );

                if (clientDocTab === 'avant') {
                  const items = clientDocs.filter(d => {
                    const moment = typeof d.metadata === 'object' && d.metadata !== null ? d.metadata.moment : null;
                    if (moment) return moment === 'debut';
                    return d.type_document === 'Contrat' || String(d.nom).toLowerCase().includes('contrat') || String(d.nom).toLowerCase().includes('convention') || String(d.nom).toLowerCase().includes('devis');
                  });
                  return items.length > 0 ? items.map(renderDocRow) : <p className="text-sm text-gray-500 italic py-4">Aucun document administratif en attente de validation.</p>;
                } else if (clientDocTab === 'fin') {
                  const items = clientDocs.filter(d => {
                    const moment = typeof d.metadata === 'object' && d.metadata !== null ? d.metadata.moment : null;
                    if (moment) return moment === 'fin';
                    return d.type_document === 'Évaluation' || String(d.nom).toLowerCase().includes('attestation') || String(d.nom).toLowerCase().includes('bilan');
                  });
                  return items.length > 0 ? items.map(renderDocRow) : <p className="text-sm text-gray-500 italic py-4">Les documents de fin de parcours apparaîtront ici.</p>;
                } else if (clientDocTab === 'supports') {
                  const supportDocs = clientDocs.filter(d => {
                    const moment = typeof d.metadata === 'object' && d.metadata !== null ? d.metadata.moment : null;
                    if (moment) return false;
                    return !['Contrat', 'Évaluation'].includes(d.type_document) && !String(d.nom).toLowerCase().includes('contrat') && !String(d.nom).toLowerCase().includes('attestation') && !String(d.nom).toLowerCase().includes('convention');
                  });
                  const unlockedSessions = clientSessions.filter(s => s.ressource_url && new Date(s.date) <= currentDate);
                  const lockedSessions = clientSessions.filter(s => s.ressource_url && new Date(s.date) > currentDate);

                  return (
                    <div className="space-y-6">
                      {unlockedSessions.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Supports Débloqués (Séances Passées)</h3>
                          <div className="space-y-3">
                            {unlockedSessions.map(s => (
                              <div key={s.id} className="p-4 border border-rose-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 bg-rose-50/50">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-rose-100 text-rose-600 flex items-center justify-center rounded-xl shrink-0">📚</div>
                                  <div>
                                    <p className="font-bold text-gray-900 text-sm">{s.ressource_titre || `Support de la session ${s.titre}`}</p>
                                    <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">{s.titre} du {new Date(s.date).toLocaleDateString()}</p>
                                  </div>
                                </div>
                                <a href={s.ressource_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-rose-600 text-white font-bold rounded-lg text-xs shadow-sm hover:bg-rose-700 transition-colors flex items-center gap-2">
                                  Accéder au contenu ↗
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {lockedSessions.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Accès Verrouillés (Sessions Futures)</h3>
                          <div className="space-y-3">
                            {lockedSessions.map(s => (
                              <div key={s.id} className="p-4 border border-gray-100 rounded-2xl flex items-center gap-4 bg-gray-50 opacity-60">
                                <div className="w-10 h-10 bg-gray-200 text-gray-500 flex items-center justify-center rounded-xl shrink-0">🔒</div>
                                <div>
                                  <p className="font-bold text-gray-700 text-sm">{s.ressource_titre || `Support de la session ${s.titre}`}</p>
                                  <p className="text-[10px] text-gray-500">Sera débloqué le {new Date(s.date).toLocaleDateString()}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {supportDocs.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 mt-6">Autres Documents Communs</h3>
                          <div className="space-y-3">
                            {supportDocs.map(renderDocRow)}
                          </div>
                        </div>
                      )}

                      {unlockedSessions.length === 0 && lockedSessions.length === 0 && supportDocs.length === 0 && (
                        <p className="text-sm text-gray-500 italic py-4">Aucun support pédagogique disponible pour le moment.</p>
                      )}
                    </div>
                  );
                }
              })()}
            </div>
          </div>

        ) : (
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center">
                <span className="w-2 h-6 bg-gray-900 rounded-full mr-3"></span> Liste des Documents
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-sm text-gray-500">
                    <th className="pb-3 font-medium">Document</th>
                    {!isClient && <th className="pb-3 font-medium">Bénéficiaire</th>}
                    <th className="pb-3 font-medium">Visibilité</th>
                    <th className="pb-3 font-medium">Statut de signature</th>
                    <th className="pb-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedDocs.map(doc => {
                    const clientAssocie = clients.find(c => c.id === doc.user_id);
                    return (
                      <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-4 font-bold text-gray-900 flex flex-col">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center mr-3 text-gray-500 shrink-0"><FileText /></div>
                            <span>{doc.nom}</span>
                          </div>
                          {doc.url && <button onClick={() => setViewingDocId(doc.id)} className="inline-flex mt-2 items-center text-xs px-3 py-1.5 bg-blue-50 text-blue-700 font-bold rounded-lg hover:bg-blue-100 transition-colors w-fit shadow-sm border border-blue-200">Voir le document ↗</button>}
                        </td>
                        {!isClient && (
                          <td className="py-4 text-sm text-gray-600 font-medium">
                            {clientAssocie?.nom || 'Non défini'}
                          </td>
                        )}
                        <td className="py-4 text-xs font-medium space-y-1">
                          <div className={`flex items-center ${doc.visible_client ? 'text-green-600' : 'text-gray-400'}`}>
                            <div className={`w-2 h-2 rounded-full mr-1.5 ${doc.visible_client ? 'bg-green-500' : 'bg-gray-300'}`}></div> Client
                          </div>
                          <div className={`flex items-center ${doc.visible_formateur ? 'text-blue-600' : 'text-gray-400'}`}>
                            <div className={`w-2 h-2 rounded-full mr-1.5 ${doc.visible_formateur ? 'bg-blue-500' : 'bg-gray-300'}`}></div> Formateur
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex flex-col gap-1">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold w-max border ${doc.signe_par_client ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                              }`}>
                              Client: {doc.signe_par_client ? '✓ Signé' : 'À signer'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold w-max border ${doc.signe_par_formateur ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                              }`}>
                              Formateur: {doc.signe_par_formateur ? '✓ Signé' : 'À signer'}
                            </span>
                          </div>
                          {doc.type_document === 'Présence' && (
                            <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                              <span title="Date de séance">📅</span>
                              {isFormateur ? (
                                <input type="date" value={doc.date_seance || ''} onChange={(e) => updateDateSeance(doc.id, e.target.value)} className="p-1 border border-indigo-200 rounded bg-indigo-50/50 outline-none w-28 text-[11px] text-gray-700 font-medium" />
                              ) : (
                                <span className="font-bold text-gray-700 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">{doc.date_seance ? new Date(doc.date_seance).toLocaleDateString() : 'Non définie'}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-4 text-right space-x-2 whitespace-nowrap">
                          {/* Bouton pour signer */}
                          {isClient && !doc.signe_par_client && (
                            <button onClick={() => setSigningDocId(doc.id)} className="inline-flex items-center text-sm px-4 py-1.5 bg-rose-500 text-white font-bold rounded-lg hover:bg-rose-600 shadow-sm transition-colors">
                              Signer (Client)
                            </button>
                          )}
                          {isFormateur && !doc.signe_par_formateur && (
                            <button onClick={() => setSigningDocId(doc.id)} className="inline-flex items-center text-sm px-4 py-1.5 bg-indigo-500 text-white font-bold rounded-lg hover:bg-indigo-600 shadow-sm transition-colors">
                              Signer (Coach)
                            </button>
                          )}
                          {((isClient && doc.signe_par_client) || (isFormateur && doc.signe_par_formateur) || isAdmin) && (
                            <button onClick={() => handleDownloadPDF(doc)} className="inline-flex items-center text-sm px-3 py-1.5 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
                              <span className="hidden lg:inline text-xs">Télécharger</span>
                              <span className="lg:hidden"><DownloadIcon /></span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {displayedDocs.length === 0 && (
                    <tr><td colSpan={isAdmin ? 5 : 4} className="py-8 text-center text-gray-500">Aucun document dans la base.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

const AccueilView = ({ setActiveTab, clientProgress, moduleName, totalSessions, signedSessions }) => (
  <div className="flex flex-col items-center justify-center pt-10 md:pt-20 animate-fade-in">
    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg text-rose-500 mb-6 border border-gray-100">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
    </div>
    <h1 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">Bonjour.</h1>
    <p className="text-lg text-gray-500 max-w-lg text-center leading-relaxed">Bienvenue sur votre espace VB Coaching. Suivez votre progression et accédez à vos séances.</p>

    {/* Barre de Progression */}
    <div className="w-full max-w-3xl mt-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-gray-700 uppercase tracking-widest">
          {moduleName ? `Progression du ${moduleName}` : 'Progression du parcours'}
        </span>
        <span className="text-sm font-black text-rose-500">{clientProgress}%</span>
      </div>
      <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-rose-500 transition-all duration-1000 ease-out" style={{ width: `${clientProgress}%` }}></div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-gray-400 italic">Suivi de votre assiduité en temps réel.</p>
        {totalSessions > 0 && (
          <p className="text-[10px] text-gray-400 font-semibold">{signedSessions} / {totalSessions} séances émargées</p>
        )}
      </div>
    </div>

    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('mes_seances')}>
        <h3 className="font-bold text-gray-800 text-lg mb-2">Planning des Séances</h3>
        <p className="text-sm text-gray-500 mb-4">Consultez vos dates et émarger vos rapports de présence.</p>
        <div className="bg-rose-50 text-rose-700 px-4 py-2 rounded-xl text-sm font-bold text-center">Voir mes séances</div>
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab('bilan')}>
        <h3 className="font-bold text-gray-800 text-lg mb-2">Synthèse de Bilan</h3>
        <p className="text-sm text-gray-500 mb-4">Vos résultats d'évaluation ont été traités par notre approche IA.</p>
        <div className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold text-center">Consulter mon bilan</div>
      </div>
    </div>
  </div>
);

const SessionsView = ({
  sessions, signSession, currentUserId, handleDownloadAttendanceCertificate, userRole,
  pedagogicalResources, handleDownloadResource, handleUploadExerciseResponse, setViewingSession
}) => {
  const mySessions = sessions.filter(s => s.client_id === currentUserId).sort((a, b) => a.numero_seance - b.numero_seance);
  const [exerciceModalSession, setExerciceModalSession] = React.useState(null);

  const calculateDuration = (start, end) => {
    if (!start || !end) return null;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Mes Séances d'Accompagnement</h1>
      <p className="text-gray-500 text-lg">Retrouvez le calendrier de vos 8 séances et signez vos émargements.</p>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <span className="w-2 h-6 bg-gray-900 rounded-full mr-3"></span> Liste des Séances
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-500 uppercase tracking-widest font-bold">
                <th className="pb-4">Séance</th>
                <th className="pb-4">Planification (Date & Heures)</th>
                <th className="pb-4 text-center">Statut</th>
                <th className="pb-4 text-right">Émargement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(() => {
                const grouped = mySessions.reduce((acc, s) => {
                  const key = s.numero_seance;
                  if (!acc[key]) acc[key] = { numero: s.numero_seance, nom: s.nom.split(' - ')[0], date: s.date, debut: s.heure_debut, fin: s.heure_fin, items: [] };
                  acc[key].items.push(s);
                  return acc;
                }, {});

                const sortedGroups = Object.values(grouped).sort((a, b) => a.numero - b.numero);

                return sortedGroups.map((group, gIdx) => {
                  const today = new Date().toISOString().split('T')[0];
                  const isFuture = group.date && group.date > today;
                  
                  const previousGroupNotSigned = gIdx > 0 && sortedGroups[gIdx - 1].items.some(s => s.statut !== 'Signé');
                  const isLocked = isFuture || previousGroupNotSigned;

                  return (
                    <React.Fragment key={gIdx}>
                      <tr className={`bg-gray-50/50 ${isLocked ? 'opacity-50' : ''}`}>
                        <td colSpan="4" className={`py-3 px-4 border-l-4 ${isLocked ? 'border-gray-300' : 'border-gray-900'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div className={`w-8 h-8 rounded-lg ${isLocked ? 'bg-gray-300' : 'bg-gray-900'} text-white flex items-center justify-center mr-3 text-xs font-black`}>#{group.numero}</div>
                              <span className={`font-black ${isLocked ? 'text-gray-400' : 'text-gray-900'} text-sm uppercase tracking-tighter`}>{group.nom}</span>
                            </div>
                            <div className="text-[10px] font-bold text-gray-500">
                              {isLocked && <span className="bg-gray-200 text-gray-500 px-2 py-0.5 rounded mr-2">🔒 VERROUILLÉ</span>}
                              {group.date ? new Date(group.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'Date à définir'} • {group.debut || '--:--'} - {group.fin || '--:--'}
                            </div>
                          </div>
                        </td>
                      </tr>
                      {group.items.map(session => (
                        <tr key={session.id} className={`transition-all ${isLocked ? 'opacity-40 grayscale pointer-events-none bg-gray-50/10' : 'hover:bg-gray-50/30'}`}>
                        <td className="py-4 pl-12">
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{session.type_activite === 'signature' ? '✍️' : session.type_activite === 'document' ? '📄' : '⚙️'}</span>
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-700 text-xs">{session.ressource_titre || session.nom}</span>
                              <span className="text-[9px] text-gray-400 uppercase font-black">{session.type_activite}</span>
                              {session.instructions && (session.type_activite === 'exercice' || session.type_activite === 'Exercice') && (
                                <p className="text-[10px] text-gray-500 mt-1 max-w-xs leading-relaxed">{session.instructions}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4"></td>
                        <td className="py-4 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${session.statut_client === 'Signé' ? 'bg-green-500' : 'bg-orange-400'}`}></span>
                              <span className="text-[9px] font-black uppercase text-gray-500">Moi: {session.statut_client || (session.statut === 'Signé' ? 'Signé' : 'À venir')}</span>
                            </div>
                            {(session.metadata?.requiresTrainerSignature === true || (session.type_activite === 'signature' && session.metadata?.requiresTrainerSignature !== false)) && (
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${session.statut_formateur === 'Signé' ? 'bg-green-500' : 'bg-orange-400'}`}></span>
                              <span className="text-[9px] font-black uppercase text-gray-500">Coach: {session.statut_formateur || (session.type_activite === 'signature' && session.statut === 'Signé' ? 'Signé' : 'À venir')}</span>
                            </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 text-right pr-4">
                          <div className="flex justify-end gap-2">
                            {(() => {
                              const today = new Date().toISOString().split('T')[0];
                              const sessionDate = session.date || group.date;
                              const isDateLocked = sessionDate && today < sessionDate;
                              const metadata = session.metadata || {};

                              const isSignatureCondition = session.type_activite === 'signature' || (session.type_activite === 'document' && (metadata.isToSign || metadata.requiresSignature || metadata.documentType === 'signature'));

                              if (isSignatureCondition) {
                                const signedUrl = session.file_url_signed || session.signed_pdf_url || metadata.file_url_signed;
                                const docUrl = session.file_url || session.ressource_url;
                                return (
                                  <div className="flex gap-2 items-center justify-end w-full">
                                    {docUrl && (
                                      <button
                                        onClick={() => {
                                          const fileUrl = signedUrl || docUrl;
                                          console.log('[Consulter] URL envoyée au visualiseur:', fileUrl);
                                          console.log('[Consulter] session:', session.id, session.ressource_titre);
                                          setViewingSession && setViewingSession({ session: { ...session, file_url: fileUrl }, mode: 'view' });
                                        }}
                                        className="text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                                      >
                                        Consulter
                                      </button>
                                    )}
                                    <button
                                      disabled={session.statut_client === 'Signé' || isDateLocked}
                                      onClick={() => {
                                        if (session.statut_client === 'Signé') return;
                                        if (session.type_activite === 'signature') {
                                          signSession && signSession(session);
                                        } else {
                                          const fileUrl = docUrl || null;
                                          setViewingSession && setViewingSession({ session: { ...session, file_url: fileUrl }, mode: 'sign' });
                                        }
                                      }}
                                      className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                                        session.statut_client === 'Signé'
                                          ? 'bg-green-50 text-green-600 border-green-200'
                                          : isDateLocked
                                          ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                                          : 'bg-rose-500 text-white border-rose-600 hover:bg-rose-700'
                                      }`}
                                    >
                                      {session.statut_client === 'Signé' ? 'Signé ✓' : isDateLocked ? 'Indisponible' : 'Signer le document'}
                                    </button>
                                  </div>
                                );
                              }

                              if (session.type_activite === 'document') {
                                const signedUrl = session.file_url_signed || session.signed_pdf_url || metadata.file_url_signed;
                                const docUrl = signedUrl || session.file_url || session.ressource_url;
                                return (
                                  <div className="flex gap-2 items-center justify-end w-full">
                                    <button
                                      onClick={() => {
                                        console.log('[Consulter Document] URL envoyée au visualiseur:', docUrl);
                                        setViewingSession && setViewingSession({ session: { ...session, file_url: docUrl }, mode: 'view' });
                                      }}
                                      className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                                        signedUrl ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                      }`}
                                    >
                                      {signedUrl ? 'Voir Signé ↗' : 'Consulter'}
                                    </button>
                                  </div>
                                );
                              }

                              if (session.type_activite === 'exercice' || session.type_activite === 'Exercice') {
                                return (
                                  <div className="flex gap-2 items-center">
                                    {session.reponse_url && (
                                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full ${session.correction_statut === 'Validé' ? 'bg-green-100 text-green-700' : session.correction_statut === 'À corriger' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                        {session.correction_statut === 'Validé' ? '✅ Validé' : session.correction_statut === 'À corriger' ? '📝 À corriger' : '📬 En attente'}
                                      </span>
                                    )}
                                    <button
                                      onClick={() => setExerciceModalSession(session)}
                                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                    >
                                      {session.reponse_url ? "Modifier le rendu" : "Accéder à l'exercice"}
                                    </button>
                                  </div>
                                );
                              }

                              return null;
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                    </React.Fragment>
                  );
                });
              })()}
              {mySessions.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-12 text-center text-gray-400 italic">Aucune séance n'est encore programmée. Votre coach les générera prochainement.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ExerciceModal
        isOpen={!!exerciceModalSession}
        onClose={() => setExerciceModalSession(null)}
        session={exerciceModalSession}
        onSubmit={handleUploadExerciseResponse}
      />
    </div>
  );
};

const BilanView = ({ handleDownloadPDF, clientId, clientSkills }) => {
  const skill = (clientSkills || []).find(s => s.client_id === clientId) || null;

  if (!skill) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Espace Connaissance de soi</h1>
          <p className="text-gray-500 text-lg mt-1">Retrouvez la synthèse de vos évaluations.</p>
        </div>
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-gray-100 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
            <Clock className="text-amber-400" size={32} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Synthèse en cours de préparation</h2>
          <p className="text-gray-500 text-sm">Votre formateur est en train de préparer votre synthèse.</p>
        </div>
      </div>
    );
  }

  const dynamicRadarData = ANCHOR_KEYS.map(({ key, label, description }) => ({
    subject: label,
    A: parseFloat(skill[key]) || 0,
    fullMark: 10,
    description,
  }));
  const topAncres = [...dynamicRadarData].sort((a, b) => b.A - a.A).slice(0, 2);
  const topSkills = [skill.top_skill_1, skill.top_skill_2, skill.top_skill_3].filter(Boolean);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Espace Connaissance de soi</h1>
          <p className="text-gray-500 text-lg mt-1">Retrouvez la synthèse de vos évaluations.</p>
        </div>
        <button onClick={handleDownloadPDF} className="mt-4 md:mt-0 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl font-medium shadow-md transition-all text-sm flex items-center w-fit">
          <DownloadIcon /> Télécharger la synthèse
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center"><span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span>Mes Points Forts</h2>
          <div className="space-y-3">
            {topSkills.length > 0 ? topSkills.map((sk, i) => (
              <div key={i} className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-500 text-white rounded-xl flex items-center justify-center font-bold text-sm shrink-0">{i + 1}</div>
                <span className="font-semibold text-indigo-900">{sk}</span>
              </div>
            )) : (
              <p className="text-sm text-gray-400 italic">Aucun point fort renseigné.</p>
            )}
            {skill.target_job && (
              <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
                <TrendingUp className="text-emerald-600 shrink-0" size={20} />
                <div>
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Métier cible</p>
                  <p className="font-semibold text-emerald-900 mt-0.5">{skill.target_job}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md flex flex-col items-center">
          <h2 className="text-xl w-full font-bold text-gray-800 flex items-center mb-2"><span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span>Mes Ancres de Carrière</h2>
          <div className="w-full h-[250px] relative -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="65%" data={dynamicRadarData}>
                <PolarGrid stroke="#f3f4f6" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 500 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Radar name="Score" dataKey="A" stroke="#f43f5e" strokeWidth={3} fill="#fb7185" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {topAncres.length > 0 && (
            <div className="w-full mt-2 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Vos dominantes</p>
              {topAncres.map((a, i) => (
                <div key={a.subject} className={`rounded-2xl p-4 border ${i === 0 ? 'bg-rose-50 border-rose-100' : 'bg-indigo-50 border-indigo-100'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${i === 0 ? 'text-rose-700' : 'text-indigo-700'}`}>{a.subject}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${i === 0 ? 'bg-rose-200 text-rose-800' : 'bg-indigo-200 text-indigo-800'}`}>{a.A} / 10</span>
                  </div>
                  <p className="text-xs text-gray-600 italic">{a.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Vue "Mes Documents" client ────────────────────────────────────────────────
// Lit directement module_step_resources (lecture seule) filtré par le module_id
// du client connecté. Aucune écriture sur les templates. Les signatures sont
// stockées dans la table `documents` avec user_id = currentUserId uniquement.
const ClientDocumentsView = ({ supabase, currentUserId, clients, documents, fetchDocuments }) => {
  const [moduleResources, setModuleResources] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [signingResource, setSigningResource] = React.useState(null);
  const [viewingResource, setViewingResource] = React.useState(null);
  const [debugInfo, setDebugInfo] = React.useState(null);
  const [expandedGroupId, setExpandedGroupId] = React.useState(null);
  const [groupNames, setGroupNames] = React.useState({}); // { groupId: nom }

  // Sécurité : on cherche UNIQUEMENT le client dont l'id correspond à l'utilisateur connecté
  const currentClient = React.useMemo(() => (clients || []).find(c => String(c.id) === String(currentUserId)), [clients, currentUserId]);
  const moduleId = currentClient?.module_id;

  React.useEffect(() => {
    console.log('[ClientDocumentsView] currentUserId:', currentUserId, '| clients total:', clients?.length, '| currentClient trouvé:', !!currentClient, '| moduleId:', moduleId);
    if (!moduleId) { setLoading(false); return; }
    (async () => {
      try {
        // Pas de filtre type dans la requête → filtre JS (évite problèmes NULL + PostgREST OR syntax)
        const { data, error } = await supabase
          .from('module_step_resources')
          .select('id, titre, file_url, moment, metadata, type, ordre, document_group_id')
          .eq('module_id', moduleId)
          .in('moment', ['debut', 'fin'])
          .order('ordre', { ascending: true });

        console.log('[ClientDocumentsView] module_step_resources résultat:', { count: data?.length, error, moduleId, data });

        if (error) {
          console.error('[ClientDocumentsView] Erreur requête:', error);
          setDebugInfo({ error: error.message, moduleId });
        } else {
          // Filtre JS : exclure les signatures (inclut les NULL et document_group)
          const filtered = (data || []).filter(r => r.type !== 'signature');
          console.log('[ClientDocumentsView] après filtre signature:', filtered.length, 'ressources');
          setModuleResources(filtered);
          setDebugInfo({ count: filtered.length, moduleId, rawCount: data?.length });

          // ─── Résolution des noms de groupes via document_groups ───
          const groupIds = filtered
            .filter(r => r.type === 'document_group' && r.document_group_id)
            .map(r => r.document_group_id);
          if (groupIds.length > 0) {
            const { data: grpData } = await supabase
              .from('document_groups')
              .select('id, nom')
              .in('id', groupIds);
            if (grpData) {
              const nameMap = {};
              grpData.forEach(g => { nameMap[g.id] = g.nom; });
              setGroupNames(nameMap);
              console.log('[ClientDocumentsView] noms groupes résolus:', nameMap);
            }
          }
        }
      } catch (e) {
        console.error('[ClientDocumentsView] Exception:', e);
        setDebugInfo({ error: e.message, moduleId });
      }
      setLoading(false);
    })();
  }, [moduleId, supabase, currentUserId]);

  // ─── Source 2 : documents per-client déjà dans la table documents ───
  // Capture les docs assignés manuellement ou via l'ancienne méthode de synchronisation
  const clientVisibleDocs = React.useMemo(() => {
    const myDocs = (documents || []).filter(d =>
      String(d.user_id) === String(currentUserId) && d.visible_client
    );
    console.log('[ClientDocumentsView] documents prop visible pour ce client:', myDocs.length);
    return myDocs;
  }, [documents, currentUserId]);

  // Évite les doublons : titres des ressources du module + titres des docs à l'intérieur des groupes
  const allKnownTitles = React.useMemo(() => {
    const titles = new Set(moduleResources.map(r => r.titre));
    // Ajouter les titres des documents dans chaque groupe
    moduleResources
      .filter(r => r.type === 'document_group' && r.document_group_id)
      .forEach(r => {
        (documents || [])
          .filter(d => d.group_id === r.document_group_id)
          .forEach(d => { if (d.nom) titles.add(d.nom); });
      });
    return titles;
  }, [moduleResources, documents]);

  const extraDebutDocs = React.useMemo(() => clientVisibleDocs.filter(d => {
    if (allKnownTitles.has(d.nom)) return false;
    const meta = typeof d.metadata === 'object' && d.metadata !== null ? d.metadata :
      (typeof d.metadata === 'string' && d.metadata?.startsWith('{') ? (() => { try { return JSON.parse(d.metadata); } catch { return {}; } })() : {});
    // Considère "debut" si moment=debut OU si c'est un type administratif sans moment précisé
    return meta.moment === 'debut' || (!meta.moment && (d.type_document === 'À signer' || d.type_document === 'Contrat' || d.type_document === 'Convention'));
  }), [clientVisibleDocs, allKnownTitles]);

  const extraFinDocs = React.useMemo(() => clientVisibleDocs.filter(d => {
    if (allKnownTitles.has(d.nom)) return false;
    const meta = typeof d.metadata === 'object' && d.metadata !== null ? d.metadata :
      (typeof d.metadata === 'string' && d.metadata?.startsWith('{') ? (() => { try { return JSON.parse(d.metadata); } catch { return {}; } })() : {});
    return meta.moment === 'fin';
  }), [clientVisibleDocs, allKnownTitles]);

  // Vérifie si CE client a déjà signé cette ressource (filtre strict sur currentUserId)
  const isSignedByClient = (resource) =>
    (documents || []).some(d => String(d.user_id) === String(currentUserId) && d.nom === resource.titre && d.signe_par_client);

  const handleSignSave = async (signatureDataUrl) => {
    if (!signingResource || !currentClient) return;

    let signedPdfUrl = signingResource.file_url; // fallback : URL originale

    // ── Étape 1 : Intégrer la signature dans le PDF via pdf-lib ──────────────
    if (signatureDataUrl && signingResource.file_url) {
      const toastId = 'pdf-sign';
      try {
        toast.loading('Intégration de la signature dans le document…', { id: toastId });

        // Télécharger le PDF original
        const pdfResponse = await fetch(signingResource.file_url);
        if (!pdfResponse.ok) throw new Error('Impossible de télécharger le PDF original.');
        const pdfBytes = await pdfResponse.arrayBuffer();

        // Charger le PDF avec pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width, height } = lastPage.getSize();

        // Décoder la signature PNG (base64 → Uint8Array)
        const base64Data = signatureDataUrl.split(',')[1];
        const sigBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const sigImage = await pdfDoc.embedPng(sigBytes);

        // Dimensionner la signature (max 160×60 pts)
        const maxW = 160, maxH = 60;
        const scale = Math.min(maxW / sigImage.width, maxH / sigImage.height, 1);
        const sigW = sigImage.width * scale;
        const sigH = sigImage.height * scale;

        // Position : bas-gauche de la dernière page, zone signature bénéficiaire
        const sigX = 60;
        const sigY = 110; // 110 pts depuis le bas

        lastPage.drawImage(sigImage, { x: sigX, y: sigY, width: sigW, height: sigH, opacity: 1 });

        // Ajouter nom + date sous la signature
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const signedDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const clientName = currentClient.nomcomplet_client || currentClient.nom || '';
        if (clientName) {
          lastPage.drawText(clientName, { x: sigX, y: sigY - 14, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
        }
        lastPage.drawText(`Signé le ${signedDate}`, { x: sigX, y: sigY - 26, size: 7, font, color: rgb(0.4, 0.4, 0.4) });

        // Exporter le PDF modifié
        const signedPdfBytes = await pdfDoc.save();
        const signedBlob = new Blob([signedPdfBytes], { type: 'application/pdf' });

        // Uploader dans Supabase Storage (bucket 'documents')
        const safeDocName = (signingResource.titre || 'document').replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40);
        const storagePath = `signed-documents/${currentUserId}/${Date.now()}_${safeDocName}.pdf`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from('documents')
          .upload(storagePath, signedBlob, { contentType: 'application/pdf', upsert: true });

        if (uploadError) {
          console.error('[handleSignSave] Erreur upload PDF signé:', uploadError);
          toast.error('Signature intégrée mais upload échoué — PDF original conservé.', { id: toastId });
        } else {
          const { data: { publicUrl } } = supabaseAdmin.storage.from('documents').getPublicUrl(storagePath);
          signedPdfUrl = publicUrl;
          toast.dismiss(toastId);
        }
      } catch (embedErr) {
        console.error('[handleSignSave] Erreur embedding signature pdf-lib:', embedErr);
        toast.error('Impossible d\'intégrer la signature dans le PDF — document original conservé.', { id: toastId });
        // On continue quand même avec l'URL originale
      }
    }

    // ── Étape 2 : Enregistrer en base avec l'URL du PDF signé ────────────────
    const { error } = await supabase.from('documents').insert([{
      user_id: currentUserId,
      organisation_id: currentClient.organisation_id,
      nom: signingResource.titre,
      url: signedPdfUrl,        // ← PDF avec signature intégrée
      type_document: 'À signer',
      visible_client: true,
      visible_formateur: true,
      signe_par_client: true,
      signature_client: signatureDataUrl, // ← PNG brut conservé en backup
    }]);
    if (error) { toast.error('Erreur lors de la signature : ' + error.message); return; }
    setSigningResource(null);
    if (fetchDocuments) await fetchDocuments();
    toast.success('✅ Document signé avec succès !');
  };

  // ─── Rendu d'un groupe de documents (type === 'document_group') ───
  const renderGroupCard = (resource) => {
    // Les docs du groupe sont dans la table documents avec group_id = document_group_id
    // Guard : si document_group_id est null (row corrompue), pas de docs
    const groupDocs = resource.document_group_id
      ? (documents || []).filter(d => d.group_id === resource.document_group_id)
      : [];
    const isExpanded = expandedGroupId === resource.id;
    // Priorité : nom depuis document_groups > titre si non générique > fallback
    const groupName = groupNames[resource.document_group_id]
      || (resource.titre && resource.titre !== 'Document' && resource.titre !== 'Groupe' ? resource.titre : null)
      || 'Groupe de documents';

    return (
      <div key={resource.id} className="border border-indigo-100 rounded-2xl overflow-hidden bg-white hover:border-indigo-200 transition-colors">
        {/* En-tête cliquable */}
        <button
          onClick={() => setExpandedGroupId(isExpanded ? null : resource.id)}
          className="w-full p-4 flex items-center justify-between hover:bg-indigo-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 flex items-center justify-center rounded-xl shrink-0"><Layout size={20} /></div>
            <div className="text-left">
              <p className="font-bold text-gray-900 text-sm">{groupName}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                {groupDocs.length} document{groupDocs.length !== 1 ? 's' : ''} · Groupe
              </p>
            </div>
          </div>
          {isExpanded
            ? <ChevronUp size={16} className="text-indigo-400 shrink-0" />
            : <ChevronDown size={16} className="text-gray-300 shrink-0" />}
        </button>

        {/* Contenu dépliable */}
        {isExpanded && (
          <div className="border-t border-indigo-50">
            {groupDocs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-5 italic">Aucun document dans ce groupe.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {groupDocs.map(doc => {
                  const fileUrl = doc.url || doc.file_url;
                  const isDocSigned = (documents || []).some(
                    d => String(d.user_id) === String(currentUserId) && d.nom === doc.nom && d.signe_par_client
                  );
                  const docMeta = typeof doc.metadata === 'string' && doc.metadata.startsWith('{')
                    ? (() => { try { return JSON.parse(doc.metadata); } catch { return {}; } })()
                    : (doc.metadata || {});
                  // Dans un groupe, tous les docs avec un fichier sont signables par défaut
                  // sauf si explicitement marqué "Téléchargeable uniquement"
                  const explicitlyNotToSign = doc.type_document === 'Téléchargeable' && docMeta.requiresClientSignature === false;
                  const canSign = fileUrl && !explicitlyNotToSign;

                  return (
                    <div key={doc.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={14} className={`shrink-0 ${canSign ? 'text-rose-400' : 'text-gray-400'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{doc.nom}</p>
                          <p className="text-[10px] uppercase tracking-wider" style={{ color: canSign ? '#f87171' : '#9ca3af' }}>
                            {canSign ? 'À signer' : (doc.type_document || 'Document')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isDocSigned && (
                          <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100">✓ Signé</span>
                        )}
                        {!isDocSigned && canSign && (
                          <button
                            onClick={() => setSigningResource({ id: doc.id, titre: doc.nom, file_url: fileUrl, moment: resource.moment, metadata: { ...docMeta, classification: 'a_signer' } })}
                            className="px-3 py-1.5 bg-rose-500 text-white font-bold rounded-lg text-xs hover:bg-rose-600 transition-colors shadow-sm"
                          >Signer</button>
                        )}
                        {fileUrl && (
                          <button
                            onClick={() => setViewingResource({ id: doc.id, titre: doc.nom, file_url: fileUrl })}
                            className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-50 transition-colors"
                          >Consulter</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Rendu d'une carte de ressource (source module_step_resources) ───
  const renderResourceCard = (resource) => {
    // Déléguer les groupes à renderGroupCard
    if (resource.type === 'document_group') return renderGroupCard(resource);

    const meta = typeof resource.metadata === 'string' && resource.metadata.startsWith('{')
      ? (() => { try { return JSON.parse(resource.metadata); } catch { return {}; } })()
      : (resource.metadata || {});

    // Compatibilité double format :
    //  - ancien format (instantiateDocument) : meta.classification === 'a_signer'
    //  - nouveau format (StepResourceModal)  : meta.requiresClientSignature === true
    const needsSignature =
      meta.classification === 'a_signer' ||
      meta.requiresClientSignature === true ||
      meta.documentType === 'signature';

    const label = needsSignature ? 'À signer' : 'Téléchargeable';
    const signed = isSignedByClient(resource);

    return (
      <div key={resource.id} className="p-4 border border-gray-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white hover:border-rose-200 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 flex items-center justify-center rounded-xl shrink-0 ${needsSignature ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-500'}`}><FileText size={20} /></div>
          <div>
            <p className="font-bold text-gray-900 text-sm">{resource.titre}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {signed && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100">✓ Signé</span>}
          {!signed && needsSignature && resource.file_url && (
            <button onClick={() => setSigningResource(resource)} className="px-4 py-2 bg-rose-500 text-white font-bold rounded-lg text-xs shadow-sm hover:bg-rose-600 transition-colors">Signer le document</button>
          )}
          {resource.file_url && (
            <button onClick={() => setViewingResource(resource)} className="px-3 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-xs">Consulter</button>
          )}
        </div>
      </div>
    );
  };

  // ─── Rendu d'une carte de document per-client (source documents table) ───
  const renderDocumentCard = (doc) => (
    <div key={doc.id} className="p-4 border border-gray-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white hover:border-rose-200 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-rose-50 text-rose-600 flex items-center justify-center rounded-xl shrink-0"><FileText size={20} /></div>
        <div>
          <p className="font-bold text-gray-900 text-sm">{doc.nom}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">{doc.type_document || 'Document'}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {doc.signe_par_client && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100">✓ Signé</span>}
        {(doc.url || doc.file_url) && (
          <button onClick={() => setViewingResource({ ...doc, titre: doc.nom, file_url: doc.url || doc.file_url })} className="px-3 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-xs">Consulter</button>
        )}
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
    </div>
  );

  if (!moduleId) return (
    <div className="max-w-3xl mx-auto py-20 text-center">
      <FileText size={48} className="mx-auto mb-4 text-gray-200" />
      <p className="font-bold text-lg text-gray-700">Aucun parcours assigné</p>
      <p className="text-sm text-gray-400 mt-1">Votre accompagnateur vous assignera bientôt un module de formation.</p>
    </div>
  );

  const debutResources = moduleResources.filter(r => r.moment === 'debut');
  const finResources = moduleResources.filter(r => r.moment === 'fin');
  const hasAnything = debutResources.length > 0 || finResources.length > 0 || extraDebutDocs.length > 0 || extraFinDocs.length > 0;

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Mes Documents</h1>
        <p className="text-gray-500 text-lg mt-1">Documents administratifs de votre parcours d'accompagnement.</p>
      </div>

      {(debutResources.length > 0 || extraDebutDocs.length > 0) && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
            <h2 className="font-bold text-gray-900 text-lg">Documents de début de parcours</h2>
            <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded-full">Accessibles immédiatement</span>
          </div>
          <div className="space-y-3">
            {debutResources.map(renderResourceCard)}
            {extraDebutDocs.map(renderDocumentCard)}
          </div>
        </div>
      )}

      {(finResources.length > 0 || extraFinDocs.length > 0) && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-2 h-6 bg-rose-500 rounded-full"></div>
            <h2 className="font-bold text-gray-900 text-lg">Documents de fin de parcours</h2>
          </div>
          <div className="space-y-3">
            {finResources.map(renderResourceCard)}
            {extraFinDocs.map(renderDocumentCard)}
          </div>
        </div>
      )}

      {!hasAnything && (
        <div className="text-center py-16 text-gray-400">
          <FileText size={48} className="mx-auto mb-4 text-gray-200" />
          <p className="font-bold text-gray-600">Aucun document pour le moment</p>
          <p className="text-sm mt-1">Votre accompagnateur n'a pas encore ajouté de documents à ce module.</p>
          {debugInfo && (
            <p className="text-[10px] font-mono text-gray-300 mt-3">
              module: {debugInfo.moduleId} · ressources: {debugInfo.count ?? '?'} · docs visibles: {clientVisibleDocs.length}
              {debugInfo.error && <span className="text-red-400"> · erreur: {debugInfo.error}</span>}
            </p>
          )}
        </div>
      )}

      {signingResource && (
        <DocumentViewerModal
          isOpen={true}
          url={signingResource.file_url}
          title={signingResource.titre}
          onClose={() => setSigningResource(null)}
          supabase={supabase}
          mode="sign"
          isInteractiveConsent={false}
          onSave={handleSignSave}
        />
      )}
      {viewingResource && (
        <DocumentViewerModal
          isOpen={true}
          url={viewingResource.file_url}
          title={viewingResource.titre}
          onClose={() => setViewingResource(null)}
          supabase={supabase}
          mode="view"
          isInteractiveConsent={false}
          onSave={() => {}}
        />
      )}
    </div>
  );
};

const ExercicesView = ({ setActiveTab, sessions, currentUserId, handleUploadExerciseResponse }) => {
  const exerciseSessions = (sessions || [])
    .filter(s => String(s.client_id) === String(currentUserId) && s.type_activite === 'exercice')
    .sort((a, b) => (a.numero_seance || 0) - (b.numero_seance || 0));
  const [exerciceModalSession, setExerciceModalSession] = React.useState(null);

  return (
    <div className="space-y-6 animate-fade-in relative flex flex-col max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Outils Pédagogiques</h1>
          <p className="text-gray-500 text-lg">Exercices assignés par votre accompagnateur.</p>
        </div>
      </div>

      {exerciseSessions.length === 0 ? (
        <div className="bg-white py-20 text-center rounded-3xl border border-dashed border-gray-200">
          <FileText className="mx-auto text-gray-200 mb-4" size={40} />
          <p className="text-gray-400 italic">Aucun exercice prévu pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {exerciseSessions.map(s => {
            const isDone = s.statut_client === 'Signé' || s.statut === 'Signé';
            const isUpcoming = s.date && new Date(s.date) > new Date();
            return (
              <div key={s.id} className="bg-white border-2 border-gray-100 rounded-3xl p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">{s.ressource_titre || s.nom || `Exercice séance ${s.numero_seance}`}</h3>
                {s.date && (
                  <p className="text-gray-400 text-sm mb-4">
                    {isUpcoming ? `Prévu le ${new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : `Du ${new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide ${s.correction_statut === 'Validé' ? 'bg-green-100 text-green-700' : s.correction_statut === 'À corriger' ? 'bg-amber-100 text-amber-700' : s.reponse_url ? 'bg-indigo-100 text-indigo-700' : isDone ? 'bg-green-100 text-green-800' : isUpcoming ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-orange-700'}`}>
                    {s.correction_statut === 'Validé' ? '✅ Validé' : s.correction_statut === 'À corriger' ? '📝 À corriger' : s.reponse_url ? '📬 En attente de correction' : isDone ? '✔ Terminé' : isUpcoming ? '🔒 À venir' : '⏳ En cours'}
                  </span>
                </div>
                {s.correction_commentaire && (
                  <div className="mt-3 px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Retour du coach</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{s.correction_commentaire}</p>
                  </div>
                )}
                {!isUpcoming && (
                  <button
                    onClick={() => setExerciceModalSession(s)}
                    className="mt-4 block w-full text-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    {s.reponse_url ? "Modifier le rendu" : "Accéder à l'exercice"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ExerciceModal
        isOpen={!!exerciceModalSession}
        onClose={() => setExerciceModalSession(null)}
        session={exerciceModalSession}
        onSubmit={handleUploadExerciseResponse}
      />
    </div>
  );
};

const ProfileView = ({ currentUserId, supabase, fetchUtilisateurs, formateurs, clients, userRole, orgSettings, onOrgSaved, currentOrgId }) => {
  const user = userRole === 'formateur' ? formateurs.find(f => f.id === currentUserId) : (userRole === 'client' ? clients.find(c => c.id === currentUserId) : null);

  const [logoUrl, setLogoUrl] = useState(orgSettings?.logo_url || '');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [profileData, setProfileData] = useState({
    nom: user?.nom || '',
    nom_organisme: orgSettings?.nom || '',
    adresse_formateur: user?.adresse_formateur || user?.adresse_pro || '',
    adresse_session: user?.adresse_session || '',
    adresse_org: orgSettings?.adresse || '',
    code_postal_org: orgSettings?.code_postal || '',
    ville_org: orgSettings?.ville || '',
    siret: user?.formateur_siret || orgSettings?.siret || '',
    nda: user?.formateur_nda || orgSettings?.nda || '',
    email: user?.email || '',
    telephone: user?.telephone || '',
    compagnie_assurance: user?.compagnie_assurance || '',
    numero_assurance_rcp: user?.numero_assurance_rcp || '',
    nomcomplet: user?.nomcomplet_client || user?.nom || '',
    adresse_client: user?.adresse_postale || '',
    site_web: orgSettings?.site_web || ''
  });
  const [sameAddress, setSameAddress] = useState(
    !user?.adresse_session || user?.adresse_session === (user?.adresse_formateur || user?.adresse_pro || '')
  );

  // Pour les admins et formateurs : charger les vraies données depuis la BDD
  useEffect(() => {
    if ((userRole === 'admin' || userRole === 'formateur') && currentUserId) {
      supabase.from('utilisateurs').select('*').eq('id', currentUserId).single()
        .then(({ data }) => {
          if (data) {
            setProfileData(prev => ({
              ...prev,
              nom: data.nom || '',
              email: data.email || '',
              telephone: data.telephone || '',
              adresse_formateur: data.adresse_formateur || '',
              adresse_session: data.adresse_session || '',
              siret: data.formateur_siret || '',
              nda: data.formateur_nda || '',
              compagnie_assurance: data.compagnie_assurance || '',
              numero_assurance_rcp: data.numero_assurance_rcp || '',
            }));
          }
        });
    }
  }, [userRole, currentUserId]);

  // Synchro nom organisme, siret, nda, site_web, adresse et logo depuis orgSettings (admin)
  useEffect(() => {
    if (userRole === 'admin' && orgSettings) {
      setProfileData(prev => ({
        ...prev,
        nom_organisme: orgSettings.nom || '',
        siret: orgSettings.siret || '',
        nda: orgSettings.nda || '',
        site_web: orgSettings.site_web || '',
        adresse_org: orgSettings.adresse || '',
        code_postal_org: orgSettings.code_postal || '',
        ville_org: orgSettings.ville || ''
      }));
      setLogoUrl(orgSettings.logo_url || '');
    }
  }, [userRole, orgSettings]);

  const handleLogoUpload = async (file) => {
    const orgId = orgSettings?.id || currentOrgId;
    if (!file || !orgId) { toast.error("Impossible d'identifier votre organisation. Réessayez."); return; }
    setIsUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `${orgId}/logo.${ext}`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
    if (error) { toast.error('Erreur upload logo : ' + error.message); setIsUploadingLogo(false); return; }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    const newLogoUrl = data.publicUrl;
    setLogoUrl(newLogoUrl);
    await supabase.from('organisations').update({ logo_url: newLogoUrl }).eq('id', orgId);
    if (onOrgSaved) onOrgSaved({ logo_url: newLogoUrl });
    setIsUploadingLogo(false);
    toast.success('Logo mis à jour !');
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = async () => {
    setIsSaving(true);
    let error;
    if (userRole === 'client') {
      const result = await supabase.from('clients').update({
        nom_complet: profileData.nomcomplet,
        adresse_postale: profileData.adresse_client
      }).eq('id', currentUserId);
      error = result.error;
    } else {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const result = await supabase.from('utilisateurs').update({
        nom: profileData.nom,
        email: profileData.email,
        telephone: profileData.telephone,
        adresse_formateur: profileData.adresse_formateur,
        adresse_session: sameAddress ? profileData.adresse_formateur : profileData.adresse_session,
        formateur_siret: profileData.siret,
        formateur_nda: profileData.nda,
        compagnie_assurance: profileData.compagnie_assurance,
        numero_assurance_rcp: profileData.numero_assurance_rcp
      }).eq('email', authUser.email);
      error = result.error;
      if (!error && userRole === 'admin' && orgSettings?.id) {
        const orgResult = await supabase.from('organisations').update({
          nom: profileData.nom_organisme,
          siret: profileData.siret,
          nda: profileData.nda,
          site_web: profileData.site_web,
          adresse: profileData.adresse_org,
          code_postal: profileData.code_postal_org,
          ville: profileData.ville_org
        }).eq('id', orgSettings.id);
        if (orgResult.error) error = orgResult.error;
        else if (onOrgSaved) onOrgSaved({
          nom: profileData.nom_organisme,
          siret: profileData.siret,
          nda: profileData.nda,
          site_web: profileData.site_web,
          adresse: profileData.adresse_org,
          code_postal: profileData.code_postal_org,
          ville: profileData.ville_org
        });
      }
    }
    if (!error) {
      toast.success('Profil mis à jour avec succès !');
      fetchUtilisateurs();
    } else {
      toast.error('Erreur lors de la mise à jour : ' + error.message);
    }
    setIsSaving(false);
  };

  const inputCls = "w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm";
  const labelCls = "block text-xs font-bold text-gray-400 uppercase mb-2";

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center">
          <span className="w-2 h-8 bg-indigo-600 rounded-full mr-4"></span> Mon Profil
        </h2>

        {userRole === 'client' ? (
          <div className="space-y-5">
            <div>
              <label className={labelCls}>Nom Complet</label>
              <input className={inputCls} value={profileData.nomcomplet} onChange={e => setProfileData({ ...profileData, nomcomplet: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Adresse</label>
              <input className={inputCls} value={profileData.adresse_client} onChange={e => setProfileData({ ...profileData, adresse_client: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Logo organisme (admin uniquement) */}
            {userRole === 'admin' && (
              <div>
                <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <Upload size={16} className="text-indigo-500" /> Logo de votre espace
                </h3>
                <div className="flex items-center gap-6">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-24 h-24 object-contain rounded-xl border border-gray-200 bg-gray-50 p-2" />
                  ) : (
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 bg-gray-50 gap-1">
                      <Upload size={24} />
                      <span className="text-xs text-center leading-tight">Votre logo</span>
                    </div>
                  )}
                  <div>
                    <input type="file" accept="image/*" id="profile-logo-upload" className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); }} />
                    <label htmlFor="profile-logo-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
                      {isUploadingLogo ? 'Chargement...' : 'Télécharger votre logo'}
                    </label>
                    <p className="text-xs text-gray-400 mt-2">PNG, JPG, SVG — 2 Mo max</p>
                  </div>
                </div>
              </div>
            )}
            {/* Identité */}
            <div>
              <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
                <FileText size={16} className="text-indigo-500" /> Identité Professionnelle
              </h3>
              <div className="space-y-4">
                {userRole === 'admin' ? (
                  <div>
                    <label className={labelCls}>Raison Sociale</label>
                    <input className={inputCls} value={profileData.nom_organisme} onChange={e => setProfileData({ ...profileData, nom_organisme: e.target.value })} placeholder="Nom de votre entreprise" />
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Raison Sociale / Nom complet</label>
                    <input className={inputCls} value={profileData.nom} onChange={e => setProfileData({ ...profileData, nom: e.target.value })} placeholder="Nom de votre entreprise" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>SIRET</label>
                    <input className={inputCls} value={profileData.siret} onChange={e => setProfileData({ ...profileData, siret: e.target.value })} placeholder="14 chiffres" />
                  </div>
                  <div>
                    <label className={labelCls}>NDA (Qualiopi)</label>
                    <input className={inputCls} value={profileData.nda} onChange={e => setProfileData({ ...profileData, nda: e.target.value })} placeholder="N° Déclaration" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Assurance RCP — Compagnie</label>
                  <input className={inputCls} value={profileData.compagnie_assurance} onChange={e => setProfileData({ ...profileData, compagnie_assurance: e.target.value })} placeholder="Ex: AXA, MAIF, Hiscox..." />
                </div>
                <div>
                  <label className={labelCls}>Assurance RCP — N° de contrat</label>
                  <input className={inputCls} value={profileData.numero_assurance_rcp} onChange={e => setProfileData({ ...profileData, numero_assurance_rcp: e.target.value })} placeholder="N° de contrat RCP" />
                </div>
              </div>
            </div>

            {/* Contact */}
            <div>
              <h3 className="text-base font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Plus size={16} className="text-rose-500" /> Coordonnées & Contact
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelCls}>Email professionnel</label>
                  <input className={inputCls} type="email" value={profileData.email} onChange={e => setProfileData({ ...profileData, email: e.target.value })} placeholder="email@pro.fr" />
                </div>
                <div>
                  <label className={labelCls}>Téléphone</label>
                  <input className={inputCls} type="tel" value={profileData.telephone} onChange={e => setProfileData({ ...profileData, telephone: e.target.value })} placeholder="06..." />
                </div>
              </div>
              {userRole === 'admin' && (
                <div className="mb-4">
                  <label className={labelCls}>Site internet</label>
                  <input className={inputCls} type="url" value={profileData.site_web} onChange={e => setProfileData({ ...profileData, site_web: e.target.value })} placeholder="https://www.votresite.fr" />
                </div>
              )}
              <div className="space-y-4">
                {userRole === 'admin' ? (
                  <>
                    <div>
                      <label className={labelCls}>Adresse Siège Social</label>
                      <input className={inputCls} value={profileData.adresse_org} onChange={e => setProfileData({ ...profileData, adresse_org: e.target.value })} placeholder="N° et nom de rue" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Code Postal</label>
                        <input className={inputCls} value={profileData.code_postal_org} onChange={e => setProfileData({ ...profileData, code_postal_org: e.target.value })} placeholder="75000" />
                      </div>
                      <div>
                        <label className={labelCls}>Ville</label>
                        <input className={inputCls} value={profileData.ville_org} onChange={e => setProfileData({ ...profileData, ville_org: e.target.value })} placeholder="Paris" />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className={labelCls}>Adresse Siège Social</label>
                      <AddressInput value={profileData.adresse_formateur} onChange={val => setProfileData({ ...profileData, adresse_formateur: val })} />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="profSameAddress" checked={sameAddress} onChange={e => setSameAddress(e.target.checked)} className="w-4 h-4 accent-indigo-500 cursor-pointer rounded" />
                      <label htmlFor="profSameAddress" className="text-sm text-gray-600 cursor-pointer select-none">Même adresse pour les sessions de formation</label>
                    </div>
                    {!sameAddress && (
                      <div>
                        <label className={labelCls}>Adresse de Pratique</label>
                        <AddressInput value={profileData.adresse_session} onChange={val => setProfileData({ ...profileData, adresse_session: val })} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="pt-8 mt-6 border-t border-gray-100">
          <button
            onClick={handleUpdate}
            disabled={isSaving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save size={20} /> {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RessourcesView = ({ pedagogicalResources, supabase, currentUserId }) => {
  const [persoResources, setPersoResources] = React.useState([]);
  const [uploadFile, setUploadFile] = React.useState(null);
  const [uploadName, setUploadName] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);
  const [showUploadForm, setShowUploadForm] = React.useState(false);

  const fetchPersoResources = React.useCallback(async () => {
    if (!currentUserId) return;
    const { data } = await supabase.storage
      .from('ressources-pedagogiques')
      .list(`formateur-perso/${currentUserId}`);
    if (data) setPersoResources(data.filter(f => f.name !== '.emptyFolderPlaceholder'));
  }, [supabase, currentUserId]);

  React.useEffect(() => { fetchPersoResources(); }, [fetchPersoResources]);

  const handleDownloadShared = async (fileName) => {
    const { data, error } = await supabase.storage.from('ressources-pedagogiques').createSignedUrl(fileName, 60);
    if (!error && data) window.open(data.signedUrl, '_blank');
    else toast.error('Erreur téléchargement : ' + error?.message);
  };

  const handleDownloadPerso = async (fileName) => {
    const path = `formateur-perso/${currentUserId}/${fileName}`;
    const { data, error } = await supabase.storage.from('ressources-pedagogiques').createSignedUrl(path, 60);
    if (!error && data) window.open(data.signedUrl, '_blank');
    else toast.error('Erreur téléchargement : ' + error?.message);
  };

  const handlePersonalUpload = async () => {
    if (!uploadFile || !uploadName.trim()) { toast.error('Renseignez un nom et sélectionnez un fichier.'); return; }
    setIsUploading(true);
    const ext = uploadFile.name.split('.').pop();
    const safeN = uploadName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const path = `formateur-perso/${currentUserId}/${Date.now()}_${safeN}.${ext}`;
    const { error } = await supabase.storage.from('ressources-pedagogiques').upload(path, uploadFile);
    if (error) { toast.error('Erreur upload : ' + error.message); }
    else {
      toast.success('Document enregistré dans votre espace !');
      setUploadFile(null); setUploadName(''); setShowUploadForm(false);
      fetchPersoResources();
    }
    setIsUploading(false);
  };

  const ResourceCard = ({ name, displayName, onDownload, accent = 'emerald' }) => (
    <div className={`bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 bg-${accent}-50 text-${accent}-600 rounded-2xl flex items-center justify-center group-hover:bg-${accent}-600 group-hover:text-white transition-colors`}>
          <FileText size={24} />
        </div>
        <button onClick={onDownload} className={`text-gray-400 hover:text-${accent}-600 transition-colors`}>
          <Download size={20} />
        </button>
      </div>
      <h3 className="font-bold text-gray-900 text-sm mb-1 truncate" title={displayName}>{displayName}</h3>
      <button
        onClick={onDownload}
        className={`mt-4 w-full py-2 bg-gray-50 text-gray-700 text-xs font-bold rounded-xl border border-gray-100 hover:bg-${accent}-600 hover:text-white hover:border-${accent}-600 transition-all uppercase tracking-wider`}
      >
        Télécharger
      </button>
    </div>
  );

  return (
    <div className="space-y-10 animate-fade-in max-w-5xl mx-auto">

      {/* Section 1 : Mes documents personnels */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Mon Espace Documents</h1>
            <p className="text-gray-500 text-lg">Stockez vos supports de cours, assurances, et documents personnels.</p>
          </div>
          <button
            onClick={() => setShowUploadForm(v => !v)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-100 transition-all"
          >
            <Upload size={16} /> Ajouter un document
          </button>
        </div>

        {showUploadForm && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 mb-6 space-y-3">
            <input
              type="text"
              value={uploadName}
              onChange={e => setUploadName(e.target.value)}
              placeholder="Nom du document (ex: Attestation Assurance 2025)"
              className="w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <input
              type="file"
              onChange={e => setUploadFile(e.target.files[0] || null)}
              className="w-full bg-white border border-gray-200 text-sm rounded-xl p-2 outline-none"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            />
            <div className="flex gap-2">
              <button
                onClick={handlePersonalUpload}
                disabled={isUploading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                {isUploading ? 'Envoi...' : 'Enregistrer'}
              </button>
              <button
                onClick={() => { setShowUploadForm(false); setUploadFile(null); setUploadName(''); }}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-50 transition-all"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {persoResources.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {persoResources.map(res => {
              const displayName = res.name.replace(/^\d+_/, '').replace(/_/g, ' ');
              return <ResourceCard key={res.name} name={res.name} displayName={displayName} onDownload={() => handleDownloadPerso(res.name)} accent="indigo" />;
            })}
          </div>
        ) : (
          <div className="bg-white py-14 text-center rounded-3xl border border-dashed border-gray-200">
            <FileText className="mx-auto text-gray-200 mb-4" size={40} />
            <p className="text-gray-400 italic text-sm">Aucun document personnel. Cliquez sur "Ajouter un document" pour commencer.</p>
          </div>
        )}
      </div>

      {/* Section 2 : Ressources partagées par l'administration */}
      {pedagogicalResources.length > 0 && (
        <div>
          <div className="mb-5">
            <h2 className="text-xl font-extrabold text-gray-700 tracking-tight">Bibliothèque Partagée</h2>
            <p className="text-gray-400 text-sm">Documents mis à disposition par l'administration.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pedagogicalResources.map(res => {
              const displayName = res.name.split('_').slice(1).join('_') || res.name;
              return <ResourceCard key={res.name} name={res.name} displayName={displayName} onDownload={() => handleDownloadShared(res.name)} accent="emerald" />;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const SetPasswordView = ({ supabase, onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState('');

  // Au montage : vérifier le token dans l'URL via verifyOtp
  useEffect(() => {
    const verifyToken = async () => {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');

      if (tokenHash && type) {
        // Échanger le token_hash contre une session Supabase
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type
        });
        if (error) {
          console.error('Erreur verifyOtp:', error);
          setVerifyError('Le lien est invalide ou a expiré. Demandez un nouveau lien à votre administrateur.');
        }
      }
      // Si pas de token_hash, on cherche access_token (ancien flux)
      // Supabase le gère automatiquement via onAuthStateChange
      setIsVerifying(false);
    };
    verifyToken();
  }, [supabase]);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < 8) {
      setErrorMsg('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Les mots de passe ne correspondent pas.');
      return;
    }

    setIsUpdating(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      // Nettoyer les tokens sensibles mais garder l'email pour le LoginView si besoin
      const params = new URLSearchParams(window.location.hash.substring(1));
      const email = params.get('email');
      const newHash = email ? `#email=${encodeURIComponent(email)}` : '';
      window.history.replaceState(null, '', window.location.pathname + newHash);
      onComplete();
    } else {
      setErrorMsg('Erreur : ' + error.message);
    }
    setIsUpdating(false);
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full max-w-md animate-fade-in text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-6 shadow-lg animate-pulse">VB</div>
          <p className="text-gray-500 font-medium">Vérification de votre lien en cours...</p>
        </div>
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full max-w-md animate-fade-in text-center">
          <div className="w-16 h-16 bg-red-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-6 shadow-lg">!</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Lien expiré</h2>
          <p className="text-gray-500 text-sm mb-6">{verifyError}</p>
          <button onClick={() => { window.history.replaceState(null, '', '/'); window.location.reload(); }} className="bg-gray-900 text-white font-bold py-3 px-6 rounded-xl">Retour à l'accueil</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full max-w-md animate-fade-in">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-6 shadow-lg">VB</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Finalisez votre accès</h2>
        <p className="text-gray-500 text-sm mb-6 text-center">Créez votre mot de passe pour accéder à VBERP.</p>
        <form onSubmit={handleSetPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nouveau mot de passe</label>
            <input
              type="password"
              required
              minLength={8}
              placeholder="Minimum 8 caractères"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Confirmer le mot de passe</label>
            <input
              type="password"
              required
              placeholder="Saisissez à nouveau votre mot de passe"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>
          {errorMsg && (
            <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{errorMsg}</p>
          )}
          <button
            type="submit"
            disabled={isUpdating}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isUpdating ? 'Configuration en cours...' : 'Valider et accéder à mon espace'}
          </button>
        </form>
      </div>
    </div>
  );
};

const ResetPasswordPage = ({ supabase, onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => {
    const verifyToken = async () => {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');

      if (tokenHash && type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        if (error) {
          setVerifyError('Lien expiré ou invalide. Veuillez refaire une demande de réinitialisation.');
        }
      }
      setIsVerifying(false);
    };
    verifyToken();
  }, [supabase]);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < 8) {
      setErrorMsg('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Les mots de passe ne correspondent pas.');
      return;
    }

    setIsUpdating(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      onComplete();
    } else {
      setErrorMsg('Erreur lors de la mise à jour : ' + error.message);
    }
    setIsUpdating(false);
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md animate-fade-in text-center">
          <div className="w-16 h-16 bg-rose-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-6 shadow-lg animate-pulse">VB</div>
          <p className="text-gray-500 font-medium">Vérification de votre lien en cours...</p>
        </div>
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full max-w-md animate-fade-in text-center">
          <div className="w-16 h-16 bg-red-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-6">!</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Lien expiré</h2>
          <p className="text-gray-500 text-sm mb-6">{verifyError}</p>
          <button onClick={() => { window.history.replaceState(null, '', '/'); window.location.reload(); }} className="bg-gray-900 text-white font-bold py-3 px-6 rounded-xl">Retour à l'accueil</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 w-full max-w-md animate-fade-in">
        <div className="w-16 h-16 bg-rose-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-6 shadow-lg">VB</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Nouveau mot de passe</h2>
        <p className="text-gray-500 text-sm mb-6 text-center">Créez votre nouveau mot de passe sécurisé.</p>
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nouveau mot de passe</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Confirmer le mot de passe</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {errorMsg && (
            <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{errorMsg}</p>
          )}
          <button
            type="submit"
            disabled={isUpdating}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all disabled:opacity-50"
          >
            {isUpdating ? 'Enregistrement...' : 'Enregistrer le nouveau mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
};

const InviteModal = ({ isOpen, onClose, onInvite, isAddingUser, formateurs }) => {
  const [formData, setFormData] = useState({ nom: '', email: '', role: 'client', formateur_id: '' });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl p-8 shadow-2xl border border-gray-100 w-full max-w-md animate-scale-up relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-gray-600">✕</button>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Inviter un Utilisateur</h2>
        <p className="text-gray-500 text-sm mb-8">Un email sera envoyé pour définir le mot de passe.</p>

        <form onSubmit={(e) => { e.preventDefault(); onInvite(formData); }} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nom Complet</label>
            <input
              required
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              value={formData.nom}
              onChange={e => setFormData({ ...formData, nom: e.target.value })}
              placeholder="Jean Dupont"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email</label>
            <input
              required
              type="email"
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="jean.dupont@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Rôle</label>
            <select
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="client">Client (Bénéficiaire)</option>
              <option value="formateur">Formateur (Coach)</option>
            </select>
          </div>

          {formData.role === 'client' && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Formateur Référent</label>
              <select
                required
                className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                value={formData.formateur_id}
                onChange={e => setFormData({ ...formData, formateur_id: e.target.value })}
              >
                <option value="">Sélectionner un formateur</option>
                {formateurs.map(f => (
                  <option key={f.id} value={f.id}>{f.nom}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={isAddingUser}
            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {isAddingUser ? 'Envoi...' : 'Envoyer l\'invitation'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// PARAMÈTRES ORGANISME (ADMIN)
// ==========================================

const OrganisationSettingsView = ({ supabase, currentOrgId, orgSettings, onSaved }) => {
  const [nom, setNom] = useState(orgSettings?.nom || '');
  const [siret, setSiret] = useState(orgSettings?.siret || '');
  const [adresse, setAdresse] = useState(orgSettings?.adresse || '');
  const [logoUrl, setLogoUrl] = useState(orgSettings?.logo_url || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (orgSettings) {
      setNom(orgSettings.nom || '');
      setSiret(orgSettings.siret || '');
      setAdresse(orgSettings.adresse || '');
      setLogoUrl(orgSettings.logo_url || '');
    }
  }, [orgSettings]);

  const handleLogoUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${currentOrgId}/logo.${ext}`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
    if (error) { toast.error("Erreur upload logo : " + error.message); setIsUploading(false); return; }
    const { data } = supabase.storage.from('logos').getPublicUrl(path);
    setLogoUrl(data.publicUrl);
    setIsUploading(false);
    toast.success("Logo uploadé !");
  };

  const handleSave = async () => {
    setIsSaving(true);
    const { error } = await supabase.from('organisations').update({ nom, siret, adresse, logo_url: logoUrl }).eq('id', currentOrgId);
    if (error) { toast.error("Erreur : " + error.message); }
    else { toast.success("Paramètres sauvegardés !"); onSaved({ nom, siret, adresse, logo_url: logoUrl }); }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Paramètres de l'organisme</h2>
        <p className="text-gray-500 text-sm mt-1">Ces informations apparaîtront sur vos documents officiels.</p>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-3">Logo de l'organisme</label>
          <div className="flex items-center gap-6">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo organisme" className="w-24 h-24 object-contain rounded-xl border border-gray-200 bg-gray-50 p-2" />
            ) : (
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 bg-gray-50">
                <Upload className="w-8 h-8" />
              </div>
            )}
            <div>
              <input type="file" accept="image/*" id="logo-upload" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); }} />
              <label htmlFor="logo-upload" className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm px-4 py-2.5 rounded-xl transition-colors">
                {isUploading ? 'Chargement...' : 'Changer le logo'}
              </label>
              <p className="text-xs text-gray-400 mt-2">PNG, JPG, SVG — 2 Mo max</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Nom de l'organisme</label>
          <input type="text" value={nom} onChange={e => setNom(e.target.value)}
            className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Numéro SIRET</label>
          <input type="text" value={siret} onChange={e => setSiret(e.target.value)} placeholder="ex : 123 456 789 00010"
            className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Adresse</label>
          <textarea value={adresse} onChange={e => setAdresse(e.target.value)} rows={3}
            placeholder="ex : 1 rue de la Formation, 75000 Paris"
            className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all resize-none" />
        </div>

        <button onClick={handleSave} disabled={isSaving}
          className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {isSaving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
        </button>
      </div>
    </div>
  );
};

// ==========================================
// COMPOSANT PRINCIPAL
// ==========================================

const FichesMetiersView = ({ userRole, currentUserId, currentOrgId, supabase, clients, formateurs }) => {
  const [fiches, setFiches] = useState([]);
  const [assignedFiches, setAssignedFiches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSector, setFilterSector] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // States pour Admin/Formateur
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newFiche, setNewFiche] = useState({ title: '', sector: '', studies: '', skills: '', hourly_rate: '', average_salary: '', description: '', extra_info: '', career_evolution: '', working_conditions: '', qualities: '' });
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [ficheToAssign, setFicheToAssign] = useState(null);
  const [selectedClientToAssign, setSelectedClientToAssign] = useState('');
  const [selectedFiche, setSelectedFiche] = useState(null);

  const fetchFiches = async () => {
    setLoading(true);
    if (userRole === 'admin' || userRole === 'formateur') {
      let q = supabase.from('job_sheets').select('*').order('created_at', { ascending: false });
      if (currentOrgId) q = q.eq('organisation_id', currentOrgId);
      const { data, error } = await q;
      if (data) setFiches(data);
    } else if (userRole === 'client') {
      const { data, error } = await supabase
        .from('client_job_sheets')
        .select('*, job_sheets(*)')
        .eq('client_id', currentUserId);
      if (data) setAssignedFiches(data.map(d => d.job_sheets).filter(Boolean));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFiches();
  }, [userRole, currentUserId]);

  const handleAddFiche = async (e) => {
    e.preventDefault();
    if (!newFiche.title || !newFiche.sector) return toast.error("Titre et secteur requis");
    const { error } = await supabase.from('job_sheets').insert([{ ...newFiche, organisation_id: currentOrgId }]);
    if (error) return toast.error("Erreur d'ajout : " + error.message);
    toast.success("Fiche métier ajoutée !");
    setIsAddModalOpen(false);
    setNewFiche({ title: '', sector: '', studies: '', skills: '', hourly_rate: '', average_salary: '', description: '', extra_info: '', career_evolution: '', working_conditions: '', qualities: '' });
    fetchFiches();
  };

  const handleAssignFiche = async () => {
    if (!ficheToAssign || !selectedClientToAssign) return toast.error("Sélectionnez un client");
    const { error } = await supabase.from('client_job_sheets').insert([{
      job_sheet_id: ficheToAssign.id,
      client_id: selectedClientToAssign,
      assigned_by_formateur_id: userRole === 'formateur' ? currentUserId : null
    }]);
    if (error) {
      if (error.code === '23505') return toast.error("Ce client a déjà reçu cette fiche !");
      return toast.error("Erreur d'assignation : " + error.message);
    }
    toast.success("Fiche assignée avec succès !");
    setIsAssignModalOpen(false);
    setFicheToAssign(null);
  };

  const sectors = [...new Set((userRole === 'client' ? assignedFiches : fiches).map(f => f?.sector))].filter(Boolean);
  const displayFiches = (userRole === 'client' ? assignedFiches : fiches)
    .filter(f => filterSector ? f?.sector === filterSector : true)
    .filter(f => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = f?.title?.toLowerCase().includes(q);
      const matchSkills = f?.skills?.toLowerCase().includes(q);
      const matchSector = f?.sector?.toLowerCase().includes(q);
      return matchTitle || matchSkills || matchSector;
    })
    .filter(Boolean);

  // Pour le select client
  const availableClients = userRole === 'formateur' ? clients.filter(c => c.formateur_id === currentUserId) : clients;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Fiches Métiers</h2>
          <p className="text-gray-500 text-sm mt-1">
            {userRole === 'client' ? "Découvrez les métiers sélectionnés pour vous." : "Explorez et gérez le référentiel des métiers."}
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          {/* Barre de recherche */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Rechercher un métier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-rose-500 transition-all"
            />
          </div>
          {sectors.length > 0 && (
            <select
              value={filterSector}
              onChange={(e) => setFilterSector(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-rose-500 transition-all w-full md:w-auto"
            >
              <option value="">Tous les secteurs</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {(userRole === 'admin' || userRole === 'formateur') && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-rose-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-rose-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 whitespace-nowrap w-full md:w-auto"
            >
              <Plus size={18} /> Nouvelle Fiche
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64"><div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div></div>
      ) : displayFiches.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl text-center border border-gray-100 shadow-sm flex flex-col items-center">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
            {searchQuery || filterSector ? <Search size={32} /> : <Briefcase size={32} />}
          </div>
          <h3 className="text-xl font-black text-gray-800 mb-2">
            {searchQuery || filterSector ? "Aucun métier ne correspond à votre recherche" : "Aucune fiche métier trouvée"}
          </h3>
          <p className="text-gray-500">
            {searchQuery || filterSector 
              ? "Essayez avec d'autres mots-clés ou modifiez vos filtres." 
              : (userRole === 'client' ? "Votre conseiller ne vous a pas encore assigné de fiches métiers." : "Le référentiel est actuellement vide.")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-bold text-gray-500 px-1">{displayFiches.length} métier{displayFiches.length > 1 ? 's' : ''} trouvé{displayFiches.length > 1 ? 's' : ''}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayFiches.map(fiche => (
            <div 
              key={fiche.id} 
              className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow group flex flex-col cursor-pointer relative"
              onClick={() => setSelectedFiche(fiche)}
            >
              <div className="flex justify-between items-start mb-4">
                <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">{fiche.sector}</span>
                {(userRole === 'admin' || userRole === 'formateur') && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setFicheToAssign(fiche); setIsAssignModalOpen(true); }} 
                    className="text-gray-400 hover:text-rose-500 transition-colors p-1 z-10" 
                    title="Envoyer à un bénéficiaire"
                  >
                    <Users size={18} />
                  </button>
                )}
              </div>
              <h3 className="text-lg font-extrabold text-gray-900 mb-2 leading-tight group-hover:text-rose-600 transition-colors">{fiche.title}</h3>
              <p className="text-sm text-gray-600 mb-4 flex-1 line-clamp-3" title={fiche.description}>{fiche.description}</p>
              
              <div className="space-y-2 mt-auto pt-4 border-t border-gray-50">
                {fiche.average_salary && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400 font-medium">Salaire moyen :</span>
                    <span className="font-bold text-gray-700">{fiche.average_salary} €</span>
                  </div>
                )}
                {fiche.studies && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400 font-medium">Études :</span>
                    <span className="font-semibold text-gray-700 truncate w-3/5 text-right" title={fiche.studies}>{fiche.studies}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Modal Ajout */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-gray-900/70 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-gray-900 mb-6">Ajouter une fiche métier</h3>
            <form onSubmit={handleAddFiche} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Titre du métier *</label><input required className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.title} onChange={e => setNewFiche({...newFiche, title: e.target.value})} /></div>
                <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Secteur *</label><input required className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.sector} onChange={e => setNewFiche({...newFiche, sector: e.target.value})} /></div>
                <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Études conseillées</label><input className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.studies} onChange={e => setNewFiche({...newFiche, studies: e.target.value})} /></div>
                <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Salaire moyen (€)</label><input type="number" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.average_salary} onChange={e => setNewFiche({...newFiche, average_salary: e.target.value})} /></div>
              </div>
              <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Missions principales *</label><textarea required rows={3} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.description} onChange={e => setNewFiche({...newFiche, description: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Compétences techniques</label><input className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.skills} onChange={e => setNewFiche({...newFiche, skills: e.target.value})} placeholder="Ex: React, Node.js" /></div>
                <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Qualités requises</label><input className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.qualities} onChange={e => setNewFiche({...newFiche, qualities: e.target.value})} placeholder="Ex: Rigueur, Empathie" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Évolution de carrière</label><textarea rows={2} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.career_evolution} onChange={e => setNewFiche({...newFiche, career_evolution: e.target.value})} /></div>
                <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Conditions de travail</label><textarea rows={2} className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.working_conditions} onChange={e => setNewFiche({...newFiche, working_conditions: e.target.value})} placeholder="Ex: Bureau, Télétravail, Déplacements" /></div>
              </div>
              <div><label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Informations supplémentaires</label><input className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400" value={newFiche.extra_info} onChange={e => setNewFiche({...newFiche, extra_info: e.target.value})} /></div>
              
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-50">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-5 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Annuler</button>
                <button type="submit" className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors shadow-lg">Enregistrer la fiche</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Assignation */}
      {isAssignModalOpen && ficheToAssign && (
        <div className="fixed inset-0 bg-gray-900/70 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md border border-gray-100">
            <h3 className="text-xl font-black text-gray-900 mb-2">Envoyer une fiche métier</h3>
            <p className="text-sm text-gray-500 mb-6">Assignez la fiche <strong className="text-gray-900">"{ficheToAssign.title}"</strong> à un bénéficiaire.</p>
            
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Sélectionner un bénéficiaire</label>
              <select className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-400 text-sm font-semibold text-gray-700" value={selectedClientToAssign} onChange={e => setSelectedClientToAssign(e.target.value)}>
                <option value="">-- Choisir un client --</option>
                {availableClients.map(c => <option key={c.id} value={c.id}>{c.nom} ({c.email_contact})</option>)}
              </select>
            </div>
            
            <div className="flex justify-end gap-3">
              <button onClick={() => { setIsAssignModalOpen(false); setFicheToAssign(null); setSelectedClientToAssign(''); }} className="px-5 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-colors">Annuler</button>
              <button onClick={handleAssignFiche} disabled={!selectedClientToAssign} className="px-6 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">Envoyer au client</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détails Fiche */}
      {selectedFiche && (
        <div className="fixed inset-0 bg-gray-900/70 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedFiche(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedFiche(null)} className="absolute top-6 right-6 w-10 h-10 bg-white hover:bg-gray-100 text-gray-500 rounded-full flex items-center justify-center transition-colors shadow-sm z-10">
              <X size={20} />
            </button>
            
            {/* Bannière visuelle selon secteur */}
            <div className={`h-24 md:h-32 w-full ${(() => {
              const s = (selectedFiche.sector || '').toLowerCase();
              if (s.includes('it') || s.includes('numérique')) return 'bg-gradient-to-r from-blue-500 to-indigo-600';
              if (s.includes('santé') || s.includes('social')) return 'bg-gradient-to-r from-emerald-400 to-teal-500';
              if (s.includes('btp') || s.includes('construction') || s.includes('artisanat')) return 'bg-gradient-to-r from-amber-400 to-orange-500';
              if (s.includes('art') || s.includes('design') || s.includes('communication')) return 'bg-gradient-to-r from-purple-500 to-pink-500';
              if (s.includes('administration') || s.includes('gestion')) return 'bg-gradient-to-r from-slate-500 to-gray-600';
              return 'bg-gradient-to-r from-rose-500 to-red-500';
            })()} relative`} id="modal-banner">
               <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white to-transparent"></div>
            </div>
            
            <div id="fiche-modal-content" className="bg-white">
              <div className="p-8 md:p-10 border-b border-gray-100 relative">
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                  <span className={`text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-wider ${(() => {
                    const s = (selectedFiche.sector || '').toLowerCase();
                    if (s.includes('it') || s.includes('numérique')) return 'bg-blue-50 text-blue-600';
                    if (s.includes('santé') || s.includes('social')) return 'bg-emerald-50 text-emerald-600';
                    if (s.includes('btp') || s.includes('construction') || s.includes('artisanat')) return 'bg-amber-50 text-amber-600';
                    if (s.includes('art') || s.includes('design') || s.includes('communication')) return 'bg-purple-50 text-purple-600';
                    if (s.includes('administration') || s.includes('gestion')) return 'bg-slate-50 text-slate-600';
                    return 'bg-rose-50 text-rose-600';
                  })()}`}>{selectedFiche.sector}</span>
                  
                  <button 
                    onClick={async () => {
                      const element = document.getElementById('fiche-modal-content');
                      if (!element) return;
                      const tId = toast.loading('Génération du PDF en cours...');
                      try {
                        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
                        const imgData = canvas.toDataURL('image/png');
                        const pdf = new jsPDF('p', 'mm', 'a4');
                        const pdfWidth = pdf.internal.pageSize.getWidth();
                        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                        pdf.save(`Fiche_Metier_${selectedFiche.title.replace(/\s+/g, '_')}.pdf`);
                        toast.success('PDF téléchargé avec succès !', { id: tId });
                      } catch (error) {
                        toast.error('Erreur lors de la génération', { id: tId });
                      }
                    }}
                    className="flex items-center justify-center gap-2 bg-gray-50 text-gray-700 hover:bg-gray-100 px-4 py-2 rounded-xl text-sm font-bold transition-colors border border-gray-200"
                  >
                    <Download size={16} /> Télécharger en PDF
                  </button>
                </div>
                
                <h2 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight mb-6">{selectedFiche.title}</h2>
                
                {/* Qualités requises (Tags) */}
                {selectedFiche.qualities && (
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-wider mr-2">Qualités :</span>
                    {selectedFiche.qualities.split(',').map((quality, index) => (
                      <span key={index} className="bg-amber-50 border border-amber-100 text-amber-700 px-3 py-1 rounded-lg text-sm font-bold shadow-sm">
                        {quality.trim()}
                      </span>
                    ))}
                  </div>
                )}
                {/* Compétences Techniques (Tags) */}
                {selectedFiche.skills && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className="text-sm font-bold text-gray-400 uppercase tracking-wider mr-2">Technique :</span>
                    {selectedFiche.skills.split(',').map((skill, index) => (
                      <span key={index} className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-sm font-bold shadow-sm">
                        {skill.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Contenu principal en 2 colonnes */}
              <div className="p-8 md:p-10 flex flex-col lg:flex-row gap-10">
                
                {/* Colonne Gauche (Principal) */}
                <div className="flex-1 space-y-10">
                  <section>
                    <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
                      <FileCheck className="text-rose-500" size={24} /> Missions principales
                    </h3>
                    <p className="text-gray-700 text-lg leading-relaxed">{selectedFiche.description}</p>
                  </section>
                  
                  {(selectedFiche.career_evolution || selectedFiche.extra_info) && (
                    <section>
                      <h3 className="text-xl font-black text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="text-blue-500" size={24} /> Évolution de carrière
                      </h3>
                      <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                        {selectedFiche.career_evolution && <p className="text-gray-800 text-base leading-relaxed mb-3">{selectedFiche.career_evolution}</p>}
                        {selectedFiche.extra_info && <p className="text-blue-900 text-sm font-medium">{selectedFiche.extra_info}</p>}
                      </div>
                    </section>
                  )}
                </div>
                
                {/* Colonne Droite (Infos Clés) */}
                <div className="lg:w-80 space-y-6">
                  {selectedFiche.working_conditions && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -z-10 group-hover:scale-150 transition-transform"></div>
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <MapPin size={16} className="text-purple-400" /> Conditions de travail
                      </h4>
                      <p className="font-semibold text-gray-800">{selectedFiche.working_conditions}</p>
                    </div>
                  )}

                  {selectedFiche.studies && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-50 rounded-bl-full -z-10 group-hover:scale-150 transition-transform"></div>
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <FileText size={16} className="text-indigo-400" /> Formation requise
                      </h4>
                      <p className="font-semibold text-gray-800">{selectedFiche.studies}</p>
                    </div>
                  )}
                  
                  {(selectedFiche.average_salary || selectedFiche.hourly_rate) && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -z-10 group-hover:scale-150 transition-transform"></div>
                      <h4 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Briefcase size={16} className="text-emerald-400" /> Rémunération
                      </h4>
                      <div className="space-y-3 mt-4">
                        {selectedFiche.average_salary && (
                          <div className="flex flex-col">
                            <span className="text-gray-500 text-xs uppercase font-bold">Salaire moyen</span>
                            <span className="font-black text-gray-900 text-xl">{selectedFiche.average_salary} € <span className="text-sm font-medium text-gray-500">/ mois</span></span>
                          </div>
                        )}
                        {selectedFiche.hourly_rate && (
                          <div className="flex flex-col mt-2">
                            <span className="text-gray-500 text-xs uppercase font-bold">Taux horaire</span>
                            <span className="font-black text-gray-900 text-xl">{selectedFiche.hourly_rate} € <span className="text-sm font-medium text-gray-500">/ h</span></span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
              </div>
            </div>

            {(userRole === 'admin' || userRole === 'formateur') && (
              <div className="p-6 md:p-8 bg-gray-50 border-t border-gray-100 flex justify-between items-center rounded-b-3xl">
                <p className="text-sm text-gray-500 font-medium">Vous pensez que ce métier correspond à l'un de vos bénéficiaires ?</p>
                <button 
                  onClick={() => { setFicheToAssign(selectedFiche); setSelectedFiche(null); setIsAssignModalOpen(true); }}
                  className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-lg"
                >
                  <Users size={18} /> Assigner
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const getInitials = (name) => {
  if (!name || typeof name !== 'string') return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// ==========================================
// AUTOMATION SETTINGS VIEW
// ==========================================
const KNOWN_TRIGGER_TYPES = ['no_signature', 'reminder_before_session', 'welcome'];

const TRIGGER_LABELS = {
  no_signature: 'Relance émargement non signé',
  reminder_before_session: 'Rappel avant séance',
  welcome: 'Email de bienvenue',
};

const getTriggerLabel = (type) => TRIGGER_LABELS[type] || type;

const TRIGGER_VARS = {
  no_signature: ['{{client_name}}', '{{session_title}}', '{{session_date}}'],
  reminder_before_session: ['{{client_name}}', '{{session_title}}', '{{session_date}}'],
  welcome: ['{{client_name}}'],
};

const EMPTY_FORM = {
  trigger_type: 'no_signature',
  delay_days: 3,
  email_subject: '',
  email_body: '',
  is_active: true,
};

function AutomationSettingsView({ supabase }) {
  const [settings, setSettings] = useState([]);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [customTriggerName, setCustomTriggerName] = useState('');

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('automation_settings')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) setSettings(data);
  };

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('automation_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(50);
    if (data) setLogs(data);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (showLogs) fetchLogs();
  }, [showLogs]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setCustomTriggerName('');
    setIsAdding(true);
  };

  const openEdit = (s) => {
    const isCustom = !KNOWN_TRIGGER_TYPES.includes(s.trigger_type);
    setForm({
      trigger_type: isCustom ? '__custom__' : s.trigger_type,
      delay_days: s.delay_days,
      email_subject: s.email_subject,
      email_body: s.email_body,
      is_active: s.is_active,
    });
    setCustomTriggerName(isCustom ? s.trigger_type : '');
    setEditingId(s.id);
    setIsAdding(true);
  };

  const cancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCustomTriggerName('');
  };

  const saveForm = async () => {
    if (!form.email_subject.trim() || !form.email_body.trim()) {
      toast.error('Sujet et corps du mail sont requis.');
      return;
    }
    if (form.trigger_type === '__custom__' && !customTriggerName.trim()) {
      toast.error('Veuillez donner un nom au type personnalisé.');
      return;
    }
    setIsSaving(true);
    const resolvedTriggerType = form.trigger_type === '__custom__'
      ? customTriggerName.trim().toLowerCase().replace(/\s+/g, '_')
      : form.trigger_type;
    const payload = { ...form, trigger_type: resolvedTriggerType, updated_at: new Date().toISOString() };
    if (editingId) {
      const { error } = await supabase
        .from('automation_settings')
        .update(payload)
        .eq('id', editingId);
      if (error) { toast.error('Erreur lors de la mise à jour.'); setIsSaving(false); return; }
      toast.success('Relance mise à jour.');
    } else {
      const { error } = await supabase.from('automation_settings').insert(payload);
      if (error) { toast.error('Erreur lors de la création.'); setIsSaving(false); return; }
      toast.success('Relance créée.');
    }
    setIsSaving(false);
    cancelForm();
    fetchSettings();
  };

  const toggleActive = async (s) => {
    const { error } = await supabase
      .from('automation_settings')
      .update({ is_active: !s.is_active, updated_at: new Date().toISOString() })
      .eq('id', s.id);
    if (error) { toast.error('Erreur de mise à jour.'); return; }
    fetchSettings();
  };

  const deleteSetting = async (id) => {
    if (!window.confirm('Supprimer cette relance ?')) return;
    const { error } = await supabase.from('automation_settings').delete().eq('id', id);
    if (error) { toast.error('Erreur lors de la suppression.'); return; }
    toast.success('Relance supprimée.');
    fetchSettings();
  };

  const triggerManual = async () => {
    setIsTesting(true);
    try {
      const resp = await fetch('/api/automation/process', { method: 'GET' });
      if (resp.status === 404) {
        toast.error('Fonction non disponible — déployez l\'application sur Vercel pour activer les relances automatiques.');
        return;
      }
      const json = await resp.json();
      if (resp.ok) toast.success(`Exécution terminée — ${json.sent} email(s) envoyé(s).`);
      else toast.error(`Erreur : ${json.error}`);
    } catch (e) {
      toast.error('Impossible de contacter la fonction de workflow.');
    }
    setIsTesting(false);
    if (showLogs) fetchLogs();
  };

  const insertVar = (varName) => {
    setForm(f => ({ ...f, email_body: f.email_body + varName }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Paramètres de Relance</h1>
            <p className="text-sm text-gray-500">Automatisations email pilotées par Vercel Cron (chaque jour à 8h)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={triggerManual}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <Clock className="w-4 h-4" />
            {isTesting ? 'En cours…' : 'Tester maintenant'}
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nouvelle relance
          </button>
        </div>
      </div>

      {/* Formulaire Ajout / Édition */}
      {isAdding && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-rose-100">
          <h2 className="text-base font-bold text-gray-800 mb-4">
            {editingId ? 'Modifier la relance' : 'Créer une relance'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Type de déclencheur</label>
              <select
                value={form.trigger_type}
                onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300"
              >
                <option value="no_signature">Relance émargement non signé</option>
                <option value="reminder_before_session">Rappel avant séance</option>
                <option value="welcome">Email de bienvenue (nouveau client)</option>
                <option value="__custom__">+ Type personnalisé…</option>
              </select>
              {form.trigger_type === '__custom__' && (
                <input
                  type="text"
                  placeholder="Nom du type (ex : newsletter_mensuelle)"
                  value={customTriggerName}
                  onChange={e => setCustomTriggerName(e.target.value)}
                  className="mt-2 w-full border border-rose-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300"
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                {form.trigger_type === 'no_signature'
                  ? 'Délai après la séance (jours)'
                  : form.trigger_type === 'reminder_before_session'
                  ? 'Jours avant la séance'
                  : form.trigger_type === 'welcome'
                  ? 'Jours après la création du compte'
                  : 'Fréquence de répétition (jours)'}
              </label>
              <input
                type="number"
                min={1}
                value={form.delay_days}
                onChange={e => setForm(f => ({ ...f, delay_days: parseInt(e.target.value) || 1 }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Objet du mail</label>
            <input
              type="text"
              placeholder="Ex : Rappel — votre émargement est en attente"
              value={form.email_subject}
              onChange={e => setForm(f => ({ ...f, email_subject: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1">Corps du mail</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {(TRIGGER_VARS[form.trigger_type] || ['{{client_name}}']).map(v => (
                <button
                  key={v}
                  onClick={() => insertVar(v)}
                  className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 font-mono"
                >
                  {v}
                </button>
              ))}
            </div>
            <textarea
              rows={6}
              placeholder="Bonjour {{client_name}},&#10;&#10;Nous n'avons pas encore reçu votre émargement pour {{session_title}} du {{session_date}}."
              value={form.email_body}
              onChange={e => setForm(f => ({ ...f, email_body: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300 font-mono resize-y"
            />
          </div>
          <div className="flex items-center justify-between mt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-sm font-medium text-gray-700">Activer immédiatement</span>
              <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))} className="focus:outline-none">
                {form.is_active
                  ? <ToggleRight className="w-6 h-6 text-rose-500" />
                  : <ToggleLeft className="w-6 h-6 text-gray-400" />}
              </button>
            </label>
            <div className="flex gap-2">
              <button onClick={cancelForm} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={saveForm}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 disabled:opacity-50 transition-all"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liste des relances */}
      <div className="space-y-3">
        {settings.length === 0 && !isAdding && (
          <div className="bg-white rounded-2xl p-10 text-center border border-dashed border-gray-200">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Aucune relance configurée. Cliquez sur "Nouvelle relance" pour commencer.</p>
          </div>
        )}
        {settings.map(s => (
          <div key={s.id} className={`bg-white rounded-2xl p-5 shadow-sm border transition-all ${s.is_active ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-60'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.is_active ? 'bg-rose-50' : 'bg-gray-100'}`}>
                  <Mail className={`w-4 h-4 ${s.is_active ? 'text-rose-500' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-sm">{getTriggerLabel(s.trigger_type)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.trigger_type === 'no_signature'
                      ? `Si non signé après ${s.delay_days} jour${s.delay_days > 1 ? 's' : ''}`
                      : s.trigger_type === 'reminder_before_session'
                      ? `${s.delay_days} jour${s.delay_days > 1 ? 's' : ''} avant la séance`
                      : s.trigger_type === 'welcome'
                      ? `Envoyé ${s.delay_days} jour${s.delay_days > 1 ? 's' : ''} après la création du compte`
                      : `Envoi répété tous les ${s.delay_days} jour${s.delay_days > 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(s)}
                  title={s.is_active ? 'Désactiver' : 'Activer'}
                  className="focus:outline-none"
                >
                  {s.is_active
                    ? <ToggleRight className="w-6 h-6 text-rose-500 hover:text-rose-700" />
                    : <ToggleLeft className="w-6 h-6 text-gray-300 hover:text-gray-500" />}
                </button>
                <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-all">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => deleteSetting(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 pl-12">
              <p className="text-xs text-gray-500 font-medium">Objet : <span className="font-normal text-gray-700">{s.email_subject || <em>—</em>}</span></p>
              <p className="text-xs text-gray-400 mt-1 line-clamp-2 font-mono whitespace-pre-wrap">{s.email_body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Journal des envois */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowLogs(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-all"
        >
          <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
            <History className="w-4 h-4 text-gray-400" />
            Journal des envois (50 derniers)
          </div>
          {showLogs ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showLogs && (
          <div className="border-t border-gray-100 overflow-x-auto">
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Aucun envoi enregistré.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Date d'envoi</th>
                    <th className="text-left px-4 py-2 font-semibold">Email destinataire</th>
                    <th className="text-left px-4 py-2 font-semibold">Type</th>
                    <th className="text-left px-4 py-2 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-gray-600">
                        {new Date(log.sent_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2 text-gray-800 font-medium">{log.client_email || '—'}</td>
                      <td className="px-4 py-2 text-gray-500">{log.reference_type || '—'}</td>
                      <td className="px-4 py-2">
                        <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-md font-medium">
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  // --- États Session et Navigation ---
  const [userRole, setUserRole] = useState(null); // 'admin' | 'formateur' | 'client' | null
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeTab, setActiveTab] = useState('accueil');
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Détection synchrone au démarrage : lien invitation (token_hash ou access_token dans le hash)
  const [isSettingPassword, setIsSettingPassword] = useState(() => {
    const hash = window.location.hash;
    const path = window.location.pathname;
    return (
      path === '/set-password' ||
      hash.includes('type=invite') ||
      (hash.includes('access_token') && !hash.includes('type=recovery')) ||
      (hash.includes('token_hash') && !hash.includes('type=recovery'))
    );
  });

  const [isResetPassword, setIsResetPassword] = useState(() => {
    const hash = window.location.hash;
    const path = window.location.pathname;
    return (
      path === '/reset-password' ||
      hash.includes('type=recovery')
    );
  });

  const [resetSuccessMsg, setResetSuccessMsg] = useState('');
  const [isSignup, setIsSignup] = useState(() => window.location.pathname === '/signup');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [currentOrgId, setCurrentOrgId] = useState(null);
  const [orgSettings, setOrgSettings] = useState(null);

  // --- Vérification initiale de la session ---
  useEffect(() => {
    const initSession = async () => {
      setIsLoadingSession(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user?.email) {
        console.log('[App] Session trouvée pour:', session.user.email);

        // Utilise supabaseAdmin pour bypasser RLS et toujours trouver le profil
        const { data: userData } = await supabaseAdmin.from('utilisateurs').select('role, id, organisation_id').eq('email', session.user.email).maybeSingle();
        if (userData && userData.role) {
          handleLogin(userData.role, userData.id, userData.organisation_id);
        } else {
          const { data: clientData } = await supabaseAdmin.from('clients').select('id').ilike('email_contact', session.user.email).maybeSingle();
          if (clientData) {
            handleLogin('client', clientData.id);
          } else {
            // Session active mais aucun profil DB trouvé
            const metaRole = session.user?.user_metadata?.role;
            if (!metaRole || metaRole === 'admin') {
              // Admin sans organisation → setup
              setNeedsSetup(true);
            }
            // Client/formateur sans enregistrement DB → ne jamais rediriger vers setup
          }
        }
      }
      setIsLoadingSession(false);
    };
    initSession();
  }, []);

  // États de sélection et d'affichage centralisés
  const [signingSessionId, setSigningSessionId] = useState(null);
  const [signingDocId, setSigningDocId] = useState(null);
  const [viewingDocId, setViewingDocId] = useState(null);
  const [viewingSession, setViewingSession] = useState(null); // { session, mode: 'view'|'sign' }
  const [lastModifiedSessionId, setLastModifiedSessionId] = useState(null);
  const [editedTimes, setEditedTimes] = useState({});
  const [isSessionItemModalOpen, setIsSessionItemModalOpen] = useState(false);
  const [isDocSettingsOpen, setIsDocSettingsOpen] = useState(false);
  const [docSettingsTarget, setDocSettingsTarget] = useState(null); // session row
  const [targetSessionForAddition, setTargetSessionForAddition] = useState(null);

  // Modèles de Documents par défaut
  const [documentTemplates, setDocumentTemplates] = useState({});
  const [selectedClientForDocs, setSelectedClientForDocs] = useState('');
  const [expandedClientId, setExpandedClientId] = useState(null);

  // --- Supabase Database (États locaux mis à jour via DB) ---
  const [formateurs, setFormateurs] = useState([]);
  const [clients, setClients] = useState([]);
  const [documents, setDocuments] = useState([]);

  // États Modules Supabase
  const [modules, setModules] = useState([]);
  const [moduleDocuments, setModuleDocuments] = useState([]);
  const [moduleSessionTemplates, setModuleSessionTemplates] = useState([]);
  const [moduleStepResources, setModuleStepResources] = useState([]);

  // États formulaire "Ajouter un compte"
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('client');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);

  // États formulaire "Ingénierie Modules" (Admin)
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleSeances, setNewModuleSeances] = useState(1);
  const [newModDocName, setNewModDocName] = useState('');
  const [newModDocType, setNewModDocType] = useState('Contrat');
  const [sessions, setSessions] = useState([]);
  const [newModDocFile, setNewModDocFile] = useState(null);
  const [addingToModuleId, setAddingToModuleId] = useState(null);
  const [modelingModuleId, setModelingModuleId] = useState(null);

  // États formulaire "Étape de Parcours"
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepActivity, setNewStepActivity] = useState('Signature');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [isAddingStepResource, setIsAddingStepResource] = useState(false);
  const [isAddingStep, setIsAddingStep] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState(null);

  // États formulaire "Ajouter un document"
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState('Autre');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [newDocFile, setNewDocFile] = useState(null);
  const [newDocClientId, setNewDocClientId] = useState('');
  const [newDocVisClient, setNewDocVisClient] = useState(true);
  const [newDocVisFormateur, setNewDocVisFormateur] = useState(true);
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDestination, setNewTemplateDestination] = useState('client'); // 'client' | 'formateur'
  const [newTemplateClassification, setNewTemplateClassification] = useState('telechargeable'); // 'a_generer' | 'a_signer' | 'telechargeable'
  const [pedagogicalResources, setPedagogicalResources] = useState([]);
  const [newResourceName, setNewResourceName] = useState('');
  const [isUploadingResource, setIsUploadingResource] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [targetToDelete, setTargetToDelete] = useState(null); // { type: 'template'|'client'|'formateur', id: ... }
  const [clientSkills, setClientSkills] = useState([]);



  const fetchModules = async () => {
    let mQuery = supabase.from('modules').select('id, nom, seances_prevues, prix_prestation');
    if (currentOrgId) mQuery = mQuery.eq('organisation_id', currentOrgId);
    const { data: mData, error: mErr } = await mQuery;
    if (!mErr && mData) setModules(mData);

    const { data: mdData, error: mdErr } = await supabase.from('module_documents').select('*');
    if (!mdErr && mdData) setModuleDocuments(mdData);

    const { data: mstData, error: mstErr } = await supabase.from('module_session_templates').select('*').order('ordre', { ascending: true });
    if (!mstErr && mstData) setModuleSessionTemplates(mstData);

    const { data: msrData, error: msrErr } = await supabase.from('module_step_resources').select('*').order('ordre', { ascending: true });
    if (!msrErr && msrData) setModuleStepResources(msrData);
  };

  const fetchSessions = async () => {
    let q = supabase.from('sessions').select('*');
    if (currentOrgId) q = q.eq('organisation_id', currentOrgId);
    const { data, error } = await q;
    if (!error && data) setSessions(data);
  };

  const fetchUtilisateurs = async () => {
    // 1. Charger les formateurs depuis 'utilisateurs'
    let fQuery = supabase
      .from('utilisateurs')
      .select('id, nom, email, role, formateur_siret, formateur_nda, adresse_formateur, adresse_session, telephone, compagnie_assurance, numero_assurance_rcp')
      .eq('role', 'formateur');
    if (currentOrgId) fQuery = fQuery.eq('organisation_id', currentOrgId);
    const { data: formateursData, error: formateursError } = await fQuery;

    // 2. Charger les clients depuis 'clients' (Source unique selon instruction utilisateur)
    let cQuery = supabase.from('clients').select('*');
    if (currentOrgId) cQuery = cQuery.eq('organisation_id', currentOrgId);
    const { data: clientsData, error: clientsError } = await cQuery;

    if (formateursError) console.error("Erreur fetch formateurs:", formateursError);
    if (clientsError) console.error("Erreur fetch clients:", clientsError);

    if (formateursData) {
      setFormateurs(formateursData);
    }

    if (clientsData) {
      // Mapping standard depuis la table 'clients'
      const mappedClients = clientsData.map(c => ({
        id: c.id,
        nom: c.nom_complet || "Client sans nom",
        email: c.email_contact,
        role: 'client',
        numero_dossier: c.numero_dossier,
        formateur_id: c.formateur_id,
        module_id: c.module_id,
        seances_effectuees: c.seances_effectuees || 0,
        seances_totales: c.seances_totales || 0,
        nomcomplet_client: c.nom_complet,
        client_phone: c.telephone,
        client_email: c.email_contact,
        adresse_session: c.adresse_postale,
        montant_prestation: c.montant_prestation,
        modalite_formation: c.modalite_formation || 'Mixte',
        organisation_id: c.organisation_id || null
      }));
      setClients(mappedClients);
    }
  };

  const fetchDocuments = async () => {
    // 1. Charger les documents classiques (contrats générés, preuves, etc.)
    const { data: docsData, error } = await supabase.from('documents').select('*');
    console.log('[fetchDocuments] Récupération de TOUS les documents de la DB:', docsData, error);
    if (!error && docsData) setDocuments(docsData);

    // 2. Charger les modèles maîtres depuis la table unifiée module_step_resources (type='document' uniquement)
    const { data: modsData, error: modErr } = await supabase.from('module_step_resources').select('*').eq('type', 'document');
    if (!modErr && modsData) {
      console.log(`[fetchDocuments] ${modsData.length} modèles documents récupérés.`);
      const templates = {};
      modsData.forEach(m => {
        // Mapping schema : titre -> nom, file_url -> url, destination -> routing
        if (m.titre && m.file_url) {
          const parsedMeta = (typeof m.metadata === 'string' && m.metadata.startsWith('{')) ? JSON.parse(m.metadata) : (m.metadata || {});
          templates[m.titre] = {
            id: m.id,
            url: m.file_url,
            name: m.titre,
            destination: m.destination || 'client',
            classification: parsedMeta.classification || 'telechargeable',
            document_group_id: m.document_group_id || null,
            metadata: parsedMeta
          };
        }
      });
      setDocumentTemplates(templates);
    } else if (modErr) {
      console.error("[fetchDocuments] Erreur lors de la récupération des ressources modèles :", modErr);
      // Fallback
      const refs = docsData?.filter(d => d.type_document === 'Modèle Référence') || [];
      const templates = {};
      refs.forEach(r => {
        templates[r.nom] = { url: r.url, name: r.nom };
      });
      setDocumentTemplates(templates);
    }
  };

  const fetchClientSkills = async () => {
    const { data, error } = await supabase.from('client_skills').select('*');
    if (!error && data) setClientSkills(data);
  };

  const fetchOrgSettings = async () => {
    if (!currentOrgId) return;
    const { data } = await supabase.from('organisations').select('id, nom, logo_url, siret, adresse, code_postal, ville, nda, site_web').eq('id', currentOrgId).single();
    if (data) setOrgSettings(data);
  };

  const fetchPedagogicalResources = async () => {
    const { data, error } = await supabase.storage.from('ressources-pedagogiques').list();
    if (!error && data) {
      setPedagogicalResources(data.filter(f => f.name !== '.emptyFolderPlaceholder'));
    }
  };

  const handleUploadResource = async (file) => {
    if (!file || !newResourceName.trim()) return;
    setIsUploadingResource(true);
    const ext = file.name.split('.').pop();
    const cleanName = newResourceName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${Date.now()}_${cleanName}.${ext}`;

    const { error } = await supabase.storage.from('ressources-pedagogiques').upload(fileName, file);

    if (!error) {
      toast.success('Ressource pédagogique ajoutée avec succès !');
      setNewResourceName('');
      fetchPedagogicalResources();
    } else {
      console.error("Erreur upload ressource:", error);
      toast.error('Erreur lors de l\'upload : ' + error.message);
    }
    setIsUploadingResource(false);
  };

  const handleInviteUser = async (formData) => {
    const { email, nom, role } = formData;
    setIsAddingUser(true);

    // 1. Créer un client admin avec la service_role_key
    const serviceKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      toast.error("Clé de service non configurée. Vérifiez REACT_APP_SUPABASE_SERVICE_ROLE_KEY dans Vercel.");
      setIsAddingUser(false);
      return;
    }

    const adminClient = createClient(
      process.env.REACT_APP_SUPABASE_URL,
      serviceKey
    );

    // 2. Envoyer l'invitation via Supabase Auth Admin
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: nom, role: role }
    });

    if (inviteError) {
      console.error("Erreur invitation Supabase:", inviteError);
      toast.error(`L'invitation a échoué : ${inviteError.message}`);
      setIsAddingUser(false);
      return;
    }

    const newUserId = inviteData.user?.id;

    // 3. Créer l'entrée dans la table correspondante
    if (role === 'client') {
      // Pour les clients : on utilise la table 'clients' avec l'UUID de l'Auth
      // CRUCIAL : on utilise adminClient pour outrepasser les règles RLS lors de l'insertion initiale
      const formateurIntId = formData.formateur_id ? Number(formData.formateur_id) : null;
      const formateurRecord = formateurIntId ? formateurs.find(f => f.id === formateurIntId) : null;
      const { error: dbError } = await adminClient.from('clients').insert([{
        id: newUserId,
        nom_complet: nom,
        email_contact: email,
        formateur_id: formateurIntId,
        formateur_auth_uid: formateurRecord?.auth_uid || null,
        organisation_id: currentOrgId
      }]);
      if (dbError) {
        console.error("Erreur DB clients après invitation:", dbError);
        toast.error(`Erreur side-effect clients : ${dbError.message}`);
      } else {
        // Initialisation automatique des documents depuis la modélothèque
        const defaultClientDocs = Object.entries(documentTemplates || {})
          .filter(([, tpl]) => (tpl.destination || 'client') === 'client')
          .map(([titre, tpl], idx) => ({
            client_id: newUserId,
            template_titre: titre,
            template_url: tpl.url || null,
            destination: 'client',
            ordre: idx,
            organisation_id: currentOrgId
          }));
        if (defaultClientDocs.length > 0) {
          const { error: docsError } = await adminClient.from('client_documents').insert(defaultClientDocs);
          if (docsError) console.error('Erreur init client_documents:', docsError);
        }
      }
    } else {
      // Pour les formateurs : on garde la table 'utilisateurs' (ID entier automatique)
      // On stocke aussi l'auth_uid (UUID Supabase Auth) pour les balises de documents
      const { error: dbError } = await supabase.from('utilisateurs').insert([{
        nom: nom,
        email: email,
        role: role,
        organisation_id: currentOrgId,
        auth_uid: newUserId || null
      }]);
      if (dbError) console.error("Erreur DB utilisateurs après invitation:", dbError);
    }

    toast.success(`✅ Invitation envoyée par email à ${email} !`);
    setIsAddingUser(false);
    setIsInviteModalOpen(false);
    fetchUtilisateurs();
  };

  // --- Actions Navigation ---
  const handleLogin = (role, id = null, orgId = null) => {
    setUserRole(role);
    setCurrentUserId(id);
    setCurrentOrgId(orgId);
    if (role === 'admin') setActiveTab('clients');
    if (role === 'formateur') setActiveTab('clients');
    if (role === 'client') setActiveTab('accueil');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserRole(null);
    setCurrentUserId(null);
    setCurrentOrgId(null);
    setActiveTab('accueil');
    setMobileMenuOpen(false);
  };

  // --- Suppression Sécurisée (Cascade & Auth) ---
  const handleDeleteClient = async (clientId) => {
    try {
      // Utiliser supabaseAdmin pour contourner RLS sur toutes les opérations de suppression
      // 1. Supprimer les séances
      await supabaseAdmin.from('sessions').delete().eq('client_id', clientId);
      // 2. Supprimer les documents
      await supabaseAdmin.from('documents').delete().eq('user_id', clientId);
      // 3. Supprimer le client (DOIT être en dernier avant Auth)
      const { error: deleteErr } = await supabaseAdmin.from('clients').delete().eq('id', clientId);
      if (deleteErr) throw new Error("Erreur suppression client table : " + deleteErr.message);
      // 4. Supprimer le compte Auth (si possible)
      await supabaseAdmin.auth.admin.deleteUser(clientId);

      toast.success("Client et toutes ses données supprimés avec succès.");
      setExpandedClientId(null);
      await fetchUtilisateurs();
      await fetchSessions();
      await fetchDocuments();
    } catch (err) {
      console.error("Erreur suppression client:", err);
      toast.error("Erreur lors de la suppression : " + err.message);
      setExpandedClientId(null);
      await fetchUtilisateurs();
    }
  };

  const handleDeleteFormateur = async (formateurId) => {
    try {
      // 1. Désassigner les clients
      await supabase.from('clients').update({ formateur_id: null }).eq('formateur_id', formateurId);
      // 2. Supprimer le formateur
      const { error } = await supabase.from('utilisateurs').delete().eq('id', formateurId);
      // 3. Supprimer le compte Auth
      await supabaseAdmin.auth.admin.deleteUser(formateurId);

      if (!error) {
        await fetchUtilisateurs();
        toast.success("Utilisateur supprimé.");
      } else {
        toast.error("Erreur lors de la suppression : " + error.message);
      }
    } catch (err) {
      console.error("Erreur suppression formateur:", err);
      fetchUtilisateurs();
    }
  };

  // --- Suppression via modale de confirmation ---
  const handleConfirmDelete = async () => {
    if (!targetToDelete) return;
    setIsDeleteModalOpen(false);
    if (targetToDelete.type === 'template') {
      await handleDeleteDocxTemplate(targetToDelete.id);
    } else if (targetToDelete.type === 'client') {
      await handleDeleteClient(targetToDelete.id);
    } else if (targetToDelete.type === 'formateur') {
      await handleDeleteFormateur(targetToDelete.id);
    }
    setTargetToDelete(null);
  };

  // --- Actions Supabase : Utilisateurs ---
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    setIsAddingUser(true);

    let error;
    if (newUserRole === 'client') {
      const { error: clientError } = await supabase
        .from('clients')
        .insert([{
          nom_complet: newUserName,
          email_contact: newUserEmail,
          telephone: clientPhone,
          formateur_id: null,
          organisation_id: currentOrgId
        }]);
      error = clientError;
    } else {
      const { error: userError } = await supabase
        .from('utilisateurs')
        .insert([{
          nom: newUserName,
          email: newUserEmail,
          role: newUserRole,
          organisation_id: currentOrgId
        }])
        .select();
      error = userError;
    }

    if (error) {
      console.error("Erreur ajout user", error);
      toast.error('Erreur ajout serveur : ' + error?.message);
    } else {
      toast.success(`Utilisateur ${newUserName} ajouté avec succès !`);
      await fetchUtilisateurs();
      await fetchDocuments();
      setNewUserName('');
      setNewUserEmail('');
      setClientPhone('');
      setClientEmail('');
    }
    setIsAddingUser(false);
  };
  const instantiateDocument = async (client, templateResource, moment) => {
    const meta = typeof templateResource.metadata === 'string' && templateResource.metadata.startsWith('{') ? JSON.parse(templateResource.metadata) : (templateResource.metadata || {});
    const classification = meta.classification || 'telechargeable';

    // Anti-doublon : ne pas recréer un document déjà existant pour ce client
    const { data: existing } = await supabase.from('documents')
      .select('id').eq('user_id', client.id).eq('nom', templateResource.titre).maybeSingle();
    if (existing) return;

    let docId = null;

    if (classification === 'a_generer') {
      try {
        console.log(`Génération auto du document ${templateResource.titre} pour le client ${client.id}`);
        const generatedDoc = await handleGenerateDocx(client, templateResource.titre, false, null, true);
        if (generatedDoc) docId = generatedDoc.id;
      } catch (e) {
        console.error("Erreur génération automatique :", e);
      }
    } else {
      const { data: newDoc, error: insertErr } = await supabase.from('documents').insert([{
        user_id: client.id,
        organisation_id: client.organisation_id,
        nom: templateResource.titre,
        url: templateResource.file_url,
        type_document: classification === 'a_signer' ? 'À signer' : 'Téléchargeable',
        visible_client: moment === 'debut',
        visible_formateur: true,
        // metadata retiré : colonne inexistante dans la table documents
      }]).select().single();

      if (insertErr) {
        console.error('[instantiateDocument] Erreur insertion document:', insertErr.message, { client: client.id, doc: templateResource.titre });
        return;
      }
      if (newDoc) docId = newDoc.id;
    }

    if (docId) {
      await supabase.from('client_documents').insert([{
        client_id: client.id,
        document_id: docId,
        module_id: client.module_id,
        status: 'pending',
        moment: moment,
        metadata: { classification }
      }]);
    }
  };

  const distributeDocumentsForModule = async (client, moduleId) => {
    try {
      console.log(`[distributeDocuments] Distribution auto pour client ${client.id} / module ${moduleId}`);
      const { data: resources, error: resErr } = await supabase
        .from('module_step_resources')
        .select('*')
        .eq('module_id', moduleId)
        .in('moment', ['debut', 'fin']);
      
      if (resErr || !resources || resources.length === 0) return;

      for (const res of resources) {
        if (res.type === 'document_group' && res.document_group_id) {
          const { data: groupDocs, error: grpErr } = await supabase
            .from('module_step_resources')
            .select('*')
            .eq('document_group_id', res.document_group_id);
            
          if (!grpErr && groupDocs) {
            for (const doc of groupDocs) {
              if (doc.type === 'document') await instantiateDocument(client, doc, res.moment);
            }
          }
        } else if (res.type === 'document') {
          await instantiateDocument(client, res, res.moment);
        }
      }
      fetchDocuments();
    } catch (e) {
      console.error("[distributeDocuments] Erreur :", e);
    }
  };

  const handleModuleChange = async (clientId, moduleId) => {
    console.log('[handleModuleChange] Début. clientId:', clientId, 'moduleId:', moduleId);
    const finalModuleId = moduleId || null;

    // 1. Sauvegarde dans Supabase table 'clients'
    const { error: updateError } = await supabase
      .from('clients')
      .update({ module_id: finalModuleId })
      .eq('id', clientId);

    if (updateError) {
      console.error("[handleModuleChange] Erreur lors de l'update client:", updateError);
      toast.error("Erreur lors de l'assignation : " + updateError.message);
      return;
    }

    console.log('[handleModuleChange] Update réussi. Récupération du client pour vérification...');
    const { data: updatedClient, error: fetchErr } = await supabase.from('clients').select('*').eq('id', clientId).single();
    if (fetchErr) {
      console.error("[handleModuleChange] Erreur lors de la récupération du client mis à jour:", fetchErr);
      return;
    }

    console.log('[handleModuleChange] Client mis à jour récupéré:', JSON.stringify(updatedClient, null, 2));

    if (updatedClient && finalModuleId) {
      // Mapping pour compatibilité avec generateSessions (nom_complet -> nom)
      const compatibleClient = {
        ...updatedClient,
        nom: updatedClient.nom_complet || updatedClient.nom || updatedClient.email || 'Bénéficiaire',
        id: updatedClient.id,
        module_id: finalModuleId
      };

      console.log('[handleModuleChange] Déclenchement de generateSessions...');
      // 3. Déclenchement automatique des sessions (Qualiopi)
      await generateSessions(compatibleClient);
      
      // 3.5. Distribution automatique des documents
      await distributeDocumentsForModule(compatibleClient, finalModuleId);
    } else {
      console.warn('[handleModuleChange] Conditions non remplies pour generateSessions:', { hasClient: !!updatedClient, hasModule: !!finalModuleId });
    }

    // 4. Rafraîchir l'UI globale
    await fetchUtilisateurs();
    await fetchDocuments();
  };

  // --- Actions Supabase : Configuration Modules ---
  const handleAddModule = async (e) => {
    e.preventDefault();
    if (!newModuleName.trim()) return;
    const { error } = await supabase.from('modules').insert([{ nom: newModuleName, seances_prevues: parseInt(newModuleSeances), organisation_id: currentOrgId }]);
    if (!error) { 
      await fetchModules(); 
      setNewModuleName(''); 
      setNewModuleSeances(1); 
      toast.success("Module créé avec succès !");
    }
    else toast.error('Erreur lors de la création du module : ' + error.message);
  };

  const handleLinkDocument = async (e, selectedModule) => {
    e.preventDefault();
    const modId = selectedModule.id;

    if (!newModDocName.trim()) return;

    let finalUrl = '';
    if (newModDocFile) {
      const fileExt = newModDocFile.name.split('.').pop();
      const fileName = `module_${modId}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, newModDocFile);
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
        finalUrl = publicUrl;
      }
    }

    const { error } = await supabase.from('module_documents').insert([{
      module_id: Number(modId),
      nom: newModDocName,
      type_document: newModDocType,
      url: finalUrl
    }]);

    if (!error) {
      setAddingToModuleId(null);
      setNewModDocName('');
      setNewModDocType('Autre');
      setNewModDocFile(null);
      await fetchModules();
      toast.success("Document lié au module !");
    } else {
      toast.error("Erreur liaison document : " + error.message);
    }
  };

  const createSessionFolder = async (moduleId, title) => {
    console.log("Tentative d'ajout pour le module (ID converti en Number):", Number(moduleId));
    if (!title.trim()) return;

    setIsAddingStep(true);
    const { error } = await supabase.from('module_session_templates').insert([{
      module_id: Number(moduleId),
      titre: title,
      ordre: moduleSessionTemplates.filter(t => String(t.module_id) === String(moduleId)).length + 1
    }]);

    if (error) {
      console.error("Erreur création dossier Supabase:", error);
      toast.error("Erreur lors de la création du dossier : " + error.message);
    } else {
      console.log("Dossier créé avec succès, lancement du rafraîchissement (fetchModules)");
      setNewStepTitle('');
      await fetchModules();
      toast.success("Dossier de séance créé !");
    }
    setIsAddingStep(false);
  };

  const handleRenameFolder = async (folderId, newTitle) => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('module_session_templates').update({ titre: newTitle }).eq('id', folderId);
    if (!error) {
      await fetchModules();
      toast.success("Séance renommée avec succès !");
    } else {
      toast.error("Erreur renommage : " + error.message);
    }
  };

  const handleRenameResource = async (resourceId, newTitle) => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from('module_step_resources').update({ titre: newTitle }).eq('id', resourceId);
    if (!error) {
      await fetchModules();
      toast.success("Élément renommé !");
    } else {
      toast.error("Erreur renommage : " + error.message);
    }
  };

  const handleAddStepResource = async (templateId, stepData) => {
    if (!templateId) return;

    setIsAddingStepResource(true);
    const { error } = await supabase.from('module_step_resources').insert([{
      template_id: templateId,
      titre: stepData.title || (stepData.type === 'signature' ? 'Émargement' : 'Document'),
      type: stepData.type,
      ressource_id: (stepData.resourceId && !stepData.resourceId.includes('/')) ? stepData.resourceId : null,
      file_url: (stepData.fileUrl) ? stepData.fileUrl : ((stepData.resourceId && stepData.resourceId.includes('/')) ? stepData.resourceId : null),
      metadata: stepData.metadata,
      destination: stepData.destination || 'client',
      ordre: moduleStepResources.filter(r => r.template_id === templateId).length + 1,
      ...(stepData.instructions ? { instructions: stepData.instructions } : {})
    }]);

    if (error) {
      console.error("Erreur ajout ressource:", error);
      toast.error("Erreur lors de l'ajout : " + error.message);
    } else {
      setIsResourceModalOpen(false);
      await fetchModules();
    }
    setIsAddingStepResource(false);
  };

  const handleAddModuleMomentResource = async (moduleId, moment, stepData) => {
    setIsAddingStepResource(true);
    const { data: newResource, error } = await supabase.from('module_step_resources').insert([{
      module_id: moduleId,
      moment: moment,
      template_id: null,
      titre: stepData.title || (stepData.type === 'signature' ? 'Émargement' : stepData.type === 'document_group' ? stepData.title || 'Groupe' : 'Document'),
      type: stepData.type,
      ressource_id: (stepData.resourceId && !stepData.resourceId.includes('/')) ? stepData.resourceId : null,
      file_url: stepData.fileUrl || ((stepData.resourceId && stepData.resourceId.includes('/')) ? stepData.resourceId : null),
      metadata: stepData.metadata,
      destination: stepData.destination || 'client',
      document_group_id: stepData.document_group_id || null,
      ordre: moduleStepResources.filter(r => r.module_id === moduleId && r.moment === moment).length + 1,
    }]).select().single();
    if (error) {
      toast.error("Erreur lors de l'ajout : " + error.message);
    } else {
      // Auto-distribuer ce document aux clients déjà assignés à ce module
      if ((moment === 'debut' || moment === 'fin') && newResource && stepData.type === 'document') {
        const assignedClients = clients.filter(c =>
          String(c.module_id) === String(moduleId) &&
          (!currentOrgId || String(c.organisation_id) === String(currentOrgId))
        );
        for (const client of assignedClients) {
          await instantiateDocument(client, newResource, moment);
        }
        if (assignedClients.length > 0) {
          toast.success(`✅ Document distribué à ${assignedClients.length} client(s) existant(s)`);
        }
      }
      await fetchModules();
    }
    setIsAddingStepResource(false);
  };

  // Redistribue manuellement tous les documents début/fin d'un module à ses clients (sans toucher aux séances)
  const handleRedistributeModuleDocs = async (moduleId) => {
    const assignedClients = clients.filter(c =>
      String(c.module_id) === String(moduleId) &&
      (!currentOrgId || String(c.organisation_id) === String(currentOrgId))
    );
    if (assignedClients.length === 0) {
      toast('Aucun client assigné à ce module.'); return;
    }
    toast('Redistribution en cours...');
    for (const client of assignedClients) {
      await distributeDocumentsForModule(client, moduleId);
    }
    await fetchDocuments();
    toast.success(`✅ Documents redistribués à ${assignedClients.length} client(s)`);
  };

  const handleDeleteFolder = async (folderId) => {
    if (!window.confirm("Supprimer ce dossier et tout son contenu ?")) return;
    const { error } = await supabase.from('module_session_templates').delete().eq('id', folderId);
    if (!error) await fetchModules();
    else toast.error("Erreur supression : " + error.message);
  };

  const handleDeleteStepResource = async (resourceId) => {
    if (!window.confirm("Supprimer cet élément ?")) return;
    const { error } = await supabase.from('module_step_resources').delete().eq('id', resourceId);
    if (!error) await fetchModules();
    else toast.error("Erreur supression : " + error.message);
  };

  const generateSessions = async (client) => {
    // Client ID est systématiquement un UUID (String)
    const finalClientId = client.id;
    console.log("Tentative de génération pour le client:", finalClientId);

    // Module ID est systématiquement un BigInt (Number)
    const finalModuleId = Number(client.module_id);

    console.log(`[generateSessions] Début. ClientID: ${finalClientId}, ModuleID: ${finalModuleId}`);

    const moduleId = finalModuleId; 
    if (!moduleId || isNaN(moduleId)) {
      console.warn("[generateSessions] ID de module invalide ou absent pour le client:", finalClientId);
      return;
    }

    // Récupérer l'objet module correspondant
    const module = modules.find(m => String(m.id) === String(moduleId));
    if (!module) {
      console.error("[generateSessions] Module non trouvé dans l'état local pour l'id:", moduleId, "Modules dispos:", modules.map(m => m.id));
      return;
    }

    // Verrou de concurrence local pour empêcher que l'effet ne s'exécute plusieurs fois simultanément
    window._generatingSessionsFor = window._generatingSessionsFor || new Set();
    if (window._generatingSessionsFor.has(client.id)) return;
    window._generatingSessionsFor.add(client.id);

    try {
      // 1. Charger les templates pour ce module (bigint)
      const { data: templates, error: tempError } = await supabase
        .from('module_session_templates')
        .select('*')
        .eq('module_id', moduleId)
        .order('ordre', { ascending: true });

      console.log('[generateSessions] Templates récupérés:', templates?.length || 0, 'Erreur:', tempError);

      if (tempError) {
        console.error('[generateSessions] Erreur fetch templates:', tempError);
        return;
      }

      // 2. Vérifier les séances existantes pour ce client (UUID ou BigInt)
      const { data: existingSessions, error: checkError } = await supabase
        .from('sessions')
        .select('nom')
        .eq('client_id', finalClientId);

      if (checkError) {
        console.error('Erreur vérification séances:', checkError);
        return;
      }

      const existingTitles = new Set((existingSessions || []).map(s => s.nom));
      const sessionsToInsert = [];

      // 3. Si templates existent, on les utilise. Sinon, fallback sur l'ancienne logique
      if (templates && templates.length > 0) {
        // Nouvelle logique Imbriquée (Keyro)
        for (const t of templates) {
          console.log('[generateSessions] Traitement template:', t.id, t.titre);
          const { data: resources } = await supabase
            .from('module_step_resources')
            .select('*')
            .eq('template_id', t.id)
            .order('ordre', { ascending: true });

          console.log(`[generateSessions]   -> ${resources?.length || 0} ressources trouvées pour template ${t.id}`);

          if (resources && resources.length > 0) {
            resources.forEach(res => {
              sessionsToInsert.push({
                client_id: finalClientId,
                module_id: finalModuleId,
                numero_seance: t.ordre,
                nom: `${t.titre} - ${res.titre}`, // Rend le nom unique pour la DB
                type_activite: (res.type && res.type.toLowerCase().includes('signature')) ? 'signature' :
                               (res.type && res.type.toLowerCase().includes('exercice')) ? 'exercice' : 'document',
                ressource_id: res.ressource_id || null,
                file_url: res.file_url || null,
                ressource_titre: res.titre,
                metadata: (typeof res.metadata === 'string' && res.metadata.startsWith('{')) ? JSON.parse(res.metadata) : (res.metadata || {}), // Propagate metadata
                statut: 'À venir',
                statut_client: 'À venir',
                statut_formateur: 'À venir',
                organisation_id: client.organisation_id || null
              });
            });
          } else {
            // Dossier vide
            sessionsToInsert.push({
              client_id: finalClientId,
              module_id: finalModuleId,
              numero_seance: t.ordre,
              nom: t.titre,
              type_activite: 'Dossier (Vide)',
              metadata: {},
              statut: 'À venir',
              statut_client: 'À venir',
              statut_formateur: 'À venir',
              organisation_id: client.organisation_id || null
            });
          }
        }
      } else {
        // Fallback backward compatibility : génération par nombre de séances prévues
        for (let i = 1; i <= module.seances_prevues; i++) {
          const defaultTitle = `${module.nom} - Séance ${i}`;
          if (!existingTitles.has(defaultTitle)) {
            sessionsToInsert.push({
              client_id: finalClientId,
              module_id: finalModuleId,
              file_url: null,
              numero_seance: i,
              nom: defaultTitle,
              metadata: {},
              statut: 'À venir',
              statut_client: 'À venir',
              statut_formateur: 'À venir',
              organisation_id: client.organisation_id || null
            });
          }
        }
      }

      // 2. Déduplication manuelle pour éviter l'erreur 42P10 (absence d'index unique ON CONFLICT)
      console.log('[generateSessions] Récupération des séances existantes pour déduplication...');
      const { data: alreadyInDb, error: fetchSessionsErr } = await supabase
        .from('sessions')
        .select('nom, ressource_titre')
        .eq('client_id', finalClientId)
        .eq('module_id', finalModuleId);

      if (fetchSessionsErr) {
        console.error('[generateSessions] Erreur lors de la récupération pour déduplication:', fetchSessionsErr);
        // On continue quand même, au risque de créer des doublons si le fetch échoue
      }

      const finalSessionsToInsert = sessionsToInsert.filter(newSession => {
        const isDuplicate = alreadyInDb?.some(existing => 
          existing.nom === newSession.nom && 
          (existing.ressource_titre === newSession.ressource_titre || (!existing.ressource_titre && !newSession.ressource_titre))
        );
        return !isDuplicate;
      });

      console.log(`[generateSessions] Après déduplication : ${finalSessionsToInsert.length} séances à insérer.`);

      if (finalSessionsToInsert.length === 0) {
        console.log('[generateSessions] Toutes les séances existent déjà. Pas d\'insertion nécessaire.');
        if (typeof fetchSessions === 'function') await fetchSessions();
        return;
      }

      // 3. Insertion simple (sans ON CONFLICT)
      const { error } = await supabase.from('sessions').insert(finalSessionsToInsert);

      if (!error) {
        console.log(`[generateSessions] SUCCÈS: ${finalSessionsToInsert.length} séance(s) insérée(s).`);
        if (typeof fetchSessions === 'function') await fetchSessions();
      } else {
        console.error('[generateSessions] ERREUR insertion finale :', error);
        console.error('[generateSessions] Payload tenté:', finalSessionsToInsert);
      }
    } finally {
      window._generatingSessionsFor.delete(client.id);
    }
  };

  const onTimeChange = (sessionId, field, value) => {
    setEditedTimes(prev => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], [field]: value }
    }));
  };

  const onSaveTimes = async (sessionId) => {
    const times = editedTimes[sessionId];
    if (!times) return;
    
    setLastModifiedSessionId(sessionId);
    const updates = {};
    if (times.start) updates.heure_debut = times.start;
    if (times.end) updates.heure_fin = times.end;

    const { error } = await supabase.from('sessions').update(updates).eq('id', sessionId);
    if (!error) {
      await fetchSessions();
      setEditedTimes(prev => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    }
  };

  const updateSessionTime = async (sessionId, field, value) => {
    setLastModifiedSessionId(sessionId);
    const { error } = await supabase.from('sessions').update({ [field]: value }).eq('id', sessionId);
    if (!error) await fetchSessions();
  };

  const updateSessionDate = async (sessionId, newDate) => {
    setLastModifiedSessionId(sessionId);
    const { error } = await supabase.from('sessions').update({ date: newDate }).eq('id', sessionId);
    if (!error) await fetchSessions();
  };

  const signSession = (session) => {
    setSigningSessionId(session.id);
  };

  /**
   * Superpose la signature sur le PDF original et sauvegarde le résultat
   */
   // --- Fonctions utilitaires Archivage ---
  const overlaySignatureOnPdf = async (session, client, role) => {
    try {
      console.log("[SignatureProof] Début de la génération pour session:", session.id, role);
      
      const originalRelativePath = session.file_url || session.ressource_url || session.file_url_signed || session.metadata?.file_url_signed;
      if (!originalRelativePath) {
        console.log("[SignatureProof] Pas de chemin de document pour apposer la signature.");
        return null;
      }

      // 1. Obtenir une URL de lecture valide (signée si nécessaire) pour le fetch
      console.log("[SignatureProof] Obtention URL signée pour original:", originalRelativePath);
      
      // Extraction du bucket/path
      const extractBucketPath = (fullUrl) => {
        if (!fullUrl) return null;
        let bucket = 'documents';
        let path = fullUrl;
        
        const match = fullUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?|$)/);
        if (match) {
          bucket = match[1];
          path = decodeURIComponent(match[2]);
        } else {
          const isRessource = fullUrl.startsWith('ressources') || fullUrl.startsWith('modeling-imports');
          bucket = isRessource ? 'ressources-pedagogiques' : 'documents';
        }

        // Rectification bucket
        if (path.startsWith('modeling-imports/') && bucket === 'documents') {
          bucket = 'ressources-pedagogiques';
        }
        return { bucket, path };
      };

      const extracted = extractBucketPath(originalRelativePath);
      if (!extracted) return null;

      const { data: signData, error: signErr } = await supabase.storage.from(extracted.bucket).createSignedUrl(extracted.path, 300);
      if (signErr || !signData?.signedUrl) {
        throw new Error(`Erreur signature URL pour archivage: ${signErr?.message}`);
      }

      // 2. Récupérer le PDF original via l'URL signée
      const existingPdfBytes = await fetch(signData.signedUrl).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} lors de la lecture du PDF original`);
        return res.arrayBuffer();
      });
      
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // 3. Ajouter le bloc de signature sur la dernière page
      const pages = pdfDoc.getPages();
      const lastPage = pages[pages.length - 1];
      const { width } = lastPage.getSize();

      // Overlay consentement interactif — config extensible par modèle de document SaaS
      // Clé : identifiant du modèle (session.consent_template). 'default' = Attestation VB.
      // Coordonnées en points pdf-lib (origine bas-gauche). À calibrer selon chaque PDF source.
      const CONSENT_OVERLAYS = {
        default: { pageIndex: 0, checkboxX: 67, autoriseY: 318, refuseY: 291 },
      };

      if (session.document_choice) {
        const overlay = CONSENT_OVERLAYS[session.consent_template] || CONSENT_OVERLAYS.default;
        const consentPage = pages[overlay.pageIndex];
        const checkY = session.document_choice === 'autorise' ? overlay.autoriseY : overlay.refuseY;
        consentPage.drawText('X', {
          x: overlay.checkboxX,
          y: checkY,
          size: 12,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
      }

      const formateur = formateurs.find(f => f.id === session.formateur_id);
      const signerName = (role === 'formateur' || role === 'admin')
        ? (formateur?.nom || 'Le Formateur')
        : (client.nom_complet || client.nom || 'Le Client');

      const xPos = role === 'formateur' || role === 'admin' ? width / 2 + 10 : 50;
      const now = new Date();
      const nowStr = now.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

      lastPage.drawText(role === 'formateur' || role === 'admin' ? 'Le sous-traitant' : 'Le bénéficiaire', {
        x: xPos, y: 90, size: 10, font: helveticaBold, color: rgb(0, 0, 0),
      });
      lastPage.drawText(signerName, {
        x: xPos, y: 74, size: 10, font: helvetica, color: rgb(0, 0, 0),
      });
      lastPage.drawText(`Signé numériquement le ${nowStr}`, {
        x: xPos, y: 58, size: 8, font: helvetica, color: rgb(0.33, 0.33, 0.33),
      });

      // 6. Exporter le PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const file = new File([blob], `signed_${session.id}_${role}.pdf`, { type: 'application/pdf' });

      // 7. Upload sur Supabase Storage
      const fileName = `signed_${session.id}_${role}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('signed_documents')
        .upload(fileName, file);

      if (uploadError) {
        console.error("[SignatureProof] Erreur upload:", uploadError);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('signed_documents')
        .getPublicUrl(fileName);

      console.log("[SignatureProof] SUCCÈS - Document généré:", publicUrl);
      return publicUrl;
    } catch (err) {
      console.error("[SignatureProof] Erreur globale lors de la superposition:", err);
      return null;
    }
  };

  const handleSessionSignatureSave = async (sessionId, signatureDataUrl, documentChoice) => {
    const session = sessions.find(s => String(s.id) === String(sessionId));
    if (!session) {
      toast.error('Session introuvable (id: ' + sessionId + ')');
      return;
    }

    setLastModifiedSessionId(sessionId);
    const updateData = {};
    const client = clients.find(c => c.id === session.client_id);

    if (userRole === 'formateur' || userRole === 'admin') {
      updateData.date_signature_formateur = new Date().toISOString();
      updateData.statut_formateur = 'Signé';
      updateData.statut = 'Signé';
    } else {
      updateData.date_signature_client = new Date().toISOString();
      updateData.statut_client = 'Signé';
      updateData.statut = 'Signé';
    }

    if (documentChoice) {
      updateData.document_choice = documentChoice;
    }

    // Automatisation de l'archivage: Génère un PDF signé lors de chaque validation s'il y a un document existant
    if ((session.type_activite === 'document' || session.type_activite === 'signature') && client) {
      const signedUrl = await overlaySignatureOnPdf({ ...session, ...updateData }, client, userRole);
      if (signedUrl) {
        updateData.metadata = { ...(session.metadata || {}), file_url_signed: signedUrl };
        updateData.signed_pdf_url = signedUrl; // Colonne dédiée pour l'onglet Documents Signés
      }
    }

    const { error } = await supabase.from('sessions').update(updateData).eq('id', sessionId);

    if (!error) {
      if (updateData.statut === 'Signé') {
        const client = clients.find(c => c.id === session.client_id);
        if (client) {
          const newEffectuees = (client.seances_effectuees || 0) + 1;
          await supabase.from('clients').update({ seances_effectuees: newEffectuees }).eq('id', client.id);
          await fetchUtilisateurs();
        }
      }
      await fetchSessions();
      toast.success(`Émargement enregistré avec succès !`);
      setViewingSession(null); // Close viewer if open
    } else {
      console.error("Erreur signature session:", error);
      toast.error("Erreur lors de la signature : " + error.message);
    }
  };

  const handleEmargementSave = async (formateurSig, clientSig) => {
    const sessionId = signingSessionId;
    if (!sessionId) return;

    const updateData = {};

    if (formateurSig) {
      updateData.signature_formateur = formateurSig;
      updateData.statut_formateur = 'Signé';
      updateData.date_signature_formateur = new Date().toISOString();
      updateData.statut = 'Signé';
    }

    if (clientSig) {
      updateData.signature_client = clientSig;
      updateData.statut_client = 'Signé';
      updateData.date_signature_client = new Date().toISOString();
      if (!formateurSig) updateData.statut = 'Signé';
    }

    const { error } = await supabase.from('sessions').update(updateData).eq('id', sessionId);
    if (!error) {
      await fetchSessions();
      setSigningSessionId(null);
      toast.success('Émargement enregistré !');
    } else {
      toast.error('Erreur : ' + error.message);
    }
  };

  const handleAddSessionItem = async (data) => {
    if (!targetSessionForAddition) return;
    
    setIsSessionItemModalOpen(false);
    
    const clientId = targetSessionForAddition.clientId;
    const { sessionChoice, sessionData } = data;

    let numero = 1;
    let date = null;
    let debut = null;
    let fin = null;

    if (sessionChoice === 'existing') {
      numero = sessionData.numero_seance;
      date = sessionData.date;
      debut = sessionData.heure_debut;
      fin = sessionData.heure_fin;
    } else {
      // Nouvelle séance
      const clientSessions = sessions.filter(s => s.client_id === clientId);
      numero = clientSessions.length > 0 ? Math.max(...clientSessions.map(s => s.numero_seance)) + 1 : 1;
      date = sessionData.date;
      debut = sessionData.heure_debut;
      fin = sessionData.heure_fin;
    }

    const targetGroupItems = sessions.filter(s =>
      s.client_id === clientId && s.numero_seance === numero
    );
    const nextPos = targetGroupItems.length > 0
      ? Math.max(...targetGroupItems.map(s => s.position || 0)) + 1
      : 0;

    const { error } = await supabase.from('sessions').insert([{
      client_id: clientId,
      module_id: clients.find(c => c.id === clientId)?.module_id,
      numero_seance: numero,
      nom: data.title,
      ressource_titre: data.title,
      type_activite: data.type,
      file_url: data.resourceId,
      ressource_url: data.resourceId,
      is_administrative: numero === 0,
      position: nextPos,
      metadata: {
        isCustom: true,
        documentType: data.type === 'signature' ? 'signature' : (data.isToSign ? 'signature' : 'info')
      },
      statut: 'À venir',
      statut_client: 'À venir',
      statut_formateur: 'À venir',
      date: date,
      heure_debut: debut,
      heure_fin: fin,
      ...(data.instructions ? { instructions: data.instructions } : {})
    }]);



    if (!error) {
      await fetchSessions();
      toast.success("Élément ajouté avec succès !");
    } else {
      console.error("Erreur ajout item:", error);
      toast.error("Erreur lors de l'ajout.");
    }
  };

  const handleMoveSessionItem = async (sessionId, targetNumeroSeance, targetDate, targetDebut, targetFin) => {
    const movedSession = sessions.find(s => s.id === sessionId);
    const targetGroupItems = sessions.filter(s =>
      s.client_id === movedSession?.client_id &&
      s.numero_seance === targetNumeroSeance &&
      s.id !== sessionId
    );
    const nextPosition = targetGroupItems.length > 0
      ? Math.max(...targetGroupItems.map(s => s.position || 0)) + 1
      : 0;

    const { error } = await supabase.from('sessions').update({
      numero_seance: targetNumeroSeance,
      date: targetDate || null,
      heure_debut: targetDebut || null,
      heure_fin: targetFin || null,
      position: nextPosition,
      is_administrative: targetNumeroSeance === 0,
    }).eq('id', sessionId);

    if (!error) {
      await fetchSessions();
      toast.success("Activité déplacée avec succès !");
    } else {
      toast.error("Erreur lors du déplacement : " + error.message);
    }
  };

  const handleAddAdminBloc = async (clientId) => {
    const hasAdminBloc = sessions.some(s => s.client_id === clientId && s.is_administrative);
    if (hasAdminBloc) {
      toast.error("Un bloc administratif existe déjà pour ce bénéficiaire.");
      return;
    }
    const regularSessions = sessions.filter(s => s.client_id === clientId && !s.is_administrative);
    const seance1Date = regularSessions
      .filter(s => s.numero_seance === 1)
      .find(s => s.date)?.date;
    let adminDate = null;
    if (seance1Date) {
      const d = new Date(seance1Date);
      d.setDate(d.getDate() - 7);
      adminDate = d.toISOString().split('T')[0];
    }
    const client = clients.find(c => c.id === clientId);
    const { error } = await supabase.from('sessions').insert([{
      client_id: clientId,
      module_id: client?.module_id || null,
      organisation_id: currentOrgId,
      numero_seance: 0,
      nom: 'Bloc Administratif',
      ressource_titre: 'Document administratif',
      type_activite: 'Document PDF',
      is_administrative: true,
      position: 0,
      date: adminDate,
      statut: 'À venir',
      statut_client: 'À venir',
      statut_formateur: 'À venir',
      metadata: { isCustom: true, documentType: 'info' }
    }]);
    if (!error) {
      await fetchSessions();
      toast.success("Bloc Administratif créé !");
    } else {
      toast.error("Erreur : " + error.message);
    }
  };

  const handleAddSession = async (client) => {
    const clientSessions = sessions.filter(s => s.client_id === client.id).sort((a, b) => a.numero_seance - b.numero_seance);
    const nextNum = clientSessions.length > 0 ? Math.max(...clientSessions.map(s => s.numero_seance)) + 1 : 1;
    const module = modules.find(m => m.id === client.module_id);
    const moduleName = module ? module.nom : "Séance";

    const { error: insError } = await supabase.from('sessions').insert([{
      numero_seance: nextNum,
      nom: `${moduleName} - Séance ${nextNum}`,
      client_id: client.id,
      module_id: client.module_id,
      metadata: {},
      statut: 'À venir',
      statut_client: 'À venir',
      statut_formateur: 'À venir'
    }]);

    if (!insError) {
      const newTotal = (client.seances_totales || 0) + 1;
      await supabase.from('clients').update({ seances_totales: newTotal }).eq('id', client.id);
      await fetchUtilisateurs();
      await fetchSessions();
    } else {
      toast.error("Erreur lors de l'ajout de la séance: " + insError.message);
    }
  };

  const handleDeleteSession = async (sessionOrId) => {
    const session = typeof sessionOrId === 'object' ? sessionOrId : sessions.find(s => s.id === sessionOrId);
    if (!session) return;

    const isCustom = session.metadata?.isCustom === true;
    const confirmMsg = isCustom ? "Supprimer cet élément personnalisé ?" : `Supprimer la séance N°${session.numero_seance} ?`;
    
    if (!window.confirm(confirmMsg)) return;

    const { error: delError } = await supabase.from('sessions').delete().eq('id', session.id);

    if (!delError) {
      if (!isCustom) {
        const client = clients.find(c => c.id === session.client_id);
        if (client) {
          const newTotal = Math.max(0, (client.seances_totales || 0) - 1);
          await supabase.from('clients').update({ seances_totales: newTotal }).eq('id', client.id);
          await fetchUtilisateurs();
        }
      }
      await fetchSessions();
    } else {
      toast.error("Erreur suppression: " + delError.message);
    }
  };

  const assignFormateur = async (userId, formateurId) => {
    const { error } = await supabase.from('clients').update({ formateur_id: formateurId || null }).eq('id', userId);
    if (!error) {
      setClients(clients.map(c => c.id === userId ? { ...c, formateur_id: formateurId } : c));
    } else {
      toast.error("Erreur assignation: " + error.message);
    }
  };

  const handleUploadDocxTemplate = async (fileArg, typeArg, destinationArg, classificationArg) => {
    try {
      const file = fileArg || null;
      const type = typeArg || newTemplateName || (file ? file.name.replace(/\.[^/.]+$/, '') : null);
      const destination = destinationArg || newTemplateDestination || 'client';
      const classification = classificationArg || newTemplateClassification || 'telechargeable';

      if (!file) {
        toast.error("Veuillez sélectionner un fichier .docx ou .pdf d'abord.");
        return;
      }

      const fileExt = file.name.split('.').pop().toLowerCase();
      // Supprime les accents (é→e, à→a, etc.) puis remplace tout ce qui n'est pas alphanumérique par _
      const safeType = type.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `template_${safeType}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
      setDocumentTemplates(prev => ({
        ...prev,
        [type]: { url: publicUrl, name: file.name, destination, classification }
      }));

      // Sauvegarder dans module_step_resources (Source unifiée)
      const { data: existing } = await supabase.from('module_step_resources').select('id, metadata').eq('titre', type).eq('type', 'document');

      const metadataObj = { classification };
      if (existing && existing.length > 0) {
        const oldMeta = (typeof existing[0].metadata === 'string' && existing[0].metadata.startsWith('{')) ? JSON.parse(existing[0].metadata) : (existing[0].metadata || {});
        const newMeta = JSON.stringify({ ...oldMeta, classification });
        await supabase.from('module_step_resources').update({ file_url: publicUrl, destination, metadata: newMeta, extension: fileExt }).eq('id', existing[0].id);
      } else {
        await supabase.from('module_step_resources').insert([{
          titre: type,
          file_url: publicUrl,
          type: 'document',
          destination,
          metadata: JSON.stringify(metadataObj),
          extension: fileExt
        }]);
      }

      // Sync avec documents
      const { data: existingDoc } = await supabase.from('documents').select('id').eq('nom', type);
      if (existingDoc && existingDoc.length > 0) {
        await supabase.from('documents').update({ url: publicUrl, extension: fileExt }).eq('id', existingDoc[0].id);
      } else {
        await supabase.from('documents').insert([{
          nom: type,
          type_action: 'Modèle Référence',
          url: publicUrl,
          extension: fileExt
        }]);
      }

      await fetchDocuments();

      // Auto-distribution aux formateurs si destination = 'formateur'
      if (destination === 'formateur') {
        const { data: allFormateurs } = await supabase.from('utilisateurs').select('*').eq('role', 'formateur');
        if (allFormateurs && allFormateurs.length > 0) {
          toast.loading(`Génération des documents pour ${allFormateurs.length} formateur(s)…`, { id: 'tpl-dist' });

          const isDocxTemplate = fileExt === 'docx';
          let templateBuffer = null;

          // Pré-chargement du template une seule fois
          if (isDocxTemplate) {
            try {
              const tplResponse = await fetch(publicUrl);
              if (tplResponse.ok) templateBuffer = await tplResponse.arrayBuffer();
            } catch (fetchErr) {
              console.warn('[handleUploadDocxTemplate] Impossible de charger le template pour remplissage:', fetchErr.message);
            }
          }

          const docsToInsert = [];

          for (const f of allFormateurs) {
            let finalUrl = publicUrl; // fallback : template brut
            let finalExt = fileExt;

            if (isDocxTemplate && templateBuffer) {
              try {
                // Remplissage du template avec les données du formateur
                const zip = new PizZip(templateBuffer);
                const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });

                doc.render({
                  nom: f.nom || '',
                  nom_formateur: f.nom || '',
                  formateur_nom_complet: f.nom || '',
                  raison_sociale: f.nom || '',
                  adresse_formateur: f.adresse_formateur || f.adresse_pro || f.adresse || '',
                  adresse_session: f.adresse_session || f.adresse_formateur || f.adresse_pro || f.adresse || '',
                  formateur_nda: f.formateur_nda || f.nda || '',
                  formateur_siret: f.formateur_siret || f.siret || '',
                  email_formateur: f.email || '',
                  tel_formateur: f.telephone || '',
                  compagnie_assurance: f.compagnie_assurance || '',
                  numero_assurance_rcp: f.numero_assurance_rcp || '',
                  date_signature: new Date().toLocaleDateString('fr-FR'),
                });

                const filledBlob = doc.getZip().generate({
                  type: 'blob',
                  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                });

                const safeFormateurName = (f.nom || 'formateur')
                  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const filledPath = `generated/${safeType}_${safeFormateurName}_${Date.now()}.docx`;

                const { error: upErr } = await supabaseAdmin.storage
                  .from('documents')
                  .upload(filledPath, filledBlob, {
                    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    upsert: true
                  });

                if (!upErr) {
                  const { data: { publicUrl: filledUrl } } = supabaseAdmin.storage.from('documents').getPublicUrl(filledPath);
                  finalUrl = filledUrl;
                  finalExt = 'docx';
                }
              } catch (fillErr) {
                console.warn(`[handleUploadDocxTemplate] Erreur remplissage pour ${f.nom}:`, fillErr.message);
                // Fallback sur le template brut
              }
            }

            docsToInsert.push({
              nom: type,
              type_document: 'Administratif',
              url: finalUrl,
              assigned_formateur_id: f.id,
              signe_par_formateur: false,
              signe_par_client: false,
              visible_formateur: true,
              extension: finalExt
            });
          }

          await supabaseAdmin.from('documents').insert(docsToInsert);
          await fetchDocuments();
          toast.success(`"${type}" généré et distribué à ${allFormateurs.length} formateur(s) pour signature.`, { id: 'tpl-dist' });
        } else {
          toast.success(`Modèle pour "${type}" enregistré.`);
        }
      } else {
        toast.success(`Modèle pour "${type}" enregistré avec succès.`);
      }
    } catch (err) {
      console.error("Upload Template Error:", err);
      toast.error("Erreur lors de l'upload: " + (err.message || 'Erreur inconnue'));
    }
  };

  const handleDeleteDocxTemplate = async (templateKey) => {
    try {
      const template = documentTemplates[templateKey];
      if (!template) return;

      // Extraction du nom du fichier pour le storage
      const fileName = template.url.split('/').pop().split('?')[0];

      // 1. Supprimer du storage
      await supabase.storage.from('documents').remove([fileName]);

      // 2. Supprimer de documents (Modèle Référence)
      await supabase.from('documents').delete().eq('nom', templateKey).eq('type_document', 'Modèle Référence');

      // 3. Supprimer de module_step_resources
      await supabase.from('module_step_resources').delete().eq('titre', templateKey);

      // 4. Update local state
      const newTemplates = { ...documentTemplates };
      delete newTemplates[templateKey];
      setDocumentTemplates(newTemplates);

      toast.success(`Modèle "${templateKey}" supprimé définitivement.`);
    } catch (err) {
      console.error("Delete Template Error:", err);
      toast.error("Erreur lors de la suppression.");
    }
  };

  // Mise à jour de la destination d'un modèle existant
  const handleUpdateTemplateDestination = async (templateKey, newDest) => {
    await supabase.from('module_step_resources').update({ destination: newDest }).eq('titre', templateKey);
    setDocumentTemplates(prev => ({ ...prev, [templateKey]: { ...prev[templateKey], destination: newDest } }));
    toast.success(`Destination de "${templateKey}" mise à jour.`);
  };

  // Sauvegarde des paramètres d'un document de planning (rename + qui signe)
  const handleSaveDocSettings = async ({ nom, requiresClientSignature, requiresTrainerSignature }) => {
    if (!docSettingsTarget) return;
    const id = docSettingsTarget.id;
    const currentMeta = docSettingsTarget.metadata || {};
    const newMeta = {
      ...currentMeta,
      requiresClientSignature,
      requiresTrainerSignature,
    };
    const { error } = await supabase
      .from('sessions')
      .update({ ressource_titre: nom.trim() || docSettingsTarget.ressource_titre, metadata: newMeta })
      .eq('id', id);
    if (!error) {
      await fetchSessions();
      setIsDocSettingsOpen(false);
      setDocSettingsTarget(null);
      toast.success(`Paramètres du document "${nom}" enregistrés.`);
    } else {
      toast.error('Erreur lors de la sauvegarde : ' + error.message);
    }
  };

  const handleDownloadResource = async (fileName) => {
    try {
      // Si le fileName est déjà une URL complète (modélothèque), on l'ouvre
      if (fileName && (fileName.startsWith('http') || fileName.startsWith('https'))) {
        window.open(fileName, '_blank');
        return;
      }

      // Sinon, on va chercher le fichier dans ton storage Supabase
      // On tente d'abord 'ressources-pedagogiques' (historique) puis 'documents' (nouveauté)
      let { data, error } = await supabase.storage
        .from('ressources-pedagogiques')
        .createSignedUrl(fileName, 3600);

      if (error || !data?.signedUrl) {
        console.log('handleDownloadResource: Pas trouvé dans ressources-pedagogiques, tentative dans documents...');
        const secondTry = await supabase.storage
          .from('documents')
          .createSignedUrl(fileName, 3600);
        
        data = secondTry.data;
        error = secondTry.error;
      }

      if (error || !data?.signedUrl) throw error || new Error("Fichier introuvable dans le stockage.");
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error("Erreur téléchargement:", err);
      toast.error('Erreur lors du téléchargement : ' + (err.message || 'Fichier introuvable'));
    }
  };

  const handleUploadExerciseResponse = async (sessionId, file) => {
    try {
      const fileExt = file.name.split('.').pop();
      const targetSession = sessions.find(s => s.id === sessionId);
      const client = clients.find(c => c.id === targetSession?.client_id);
      const normalize = (str) => (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toUpperCase();
      const nomClient = normalize(client?.nom_complet || client?.nom || 'CLIENT');
      const nomExercice = normalize(targetSession?.ressource_titre || 'EXERCICE');
      const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
      const fileName = `${nomClient}_${nomExercice}_${date}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('exercice-returns')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('exercice-returns')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          reponse_url: publicUrl,
          statut: 'Rendu'
        })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      await fetchSessions();
      toast.success('Réponse envoyée avec succès !');
    } catch (error) {
      console.error('Erreur upload exercice:', error);
      toast.error('Erreur lors de l\'envoi : ' + error.message);
    }
  };

  const handleSaveCorrection = async (sessionId, statut, commentaire) => {
    const { error } = await supabase.from('sessions')
      .update({ correction_statut: statut, correction_commentaire: commentaire })
      .eq('id', sessionId);
    if (error) throw error;
    await fetchSessions();
    toast.success('Correction enregistrée !');
  };

  const handleGenerateDocx = async (clientRow, type, isForFormateur = false, formateurId = null, isAutoGenerate = false) => {
    try {
      const templateInfo = documentTemplates[type];
      if (!templateInfo || !templateInfo.url) {
        toast.error(`Aucun modèle .docx trouvé pour "${type}". Veuillez l'uploader dans l'onglet Ingénierie.`);
        return;
      }

      // Destination automatique depuis la configuration du modèle
      const templateDestination = templateInfo.destination || 'client';
      const effectiveIsForFormateur = isForFormateur || templateDestination === 'formateur';

      let dataToMerge = {};
      let targetId = null;
      let targetName = "Document";
      let uploadBucket = 'documents';
      let finalClient = null;

      if (effectiveIsForFormateur || formateurId) {
        const fId = formateurId || (clientRow ? clientRow.id : null);
        const { data: theFormateur } = await supabase.from('utilisateurs').select('*').eq('id', fId).single();
        if (!theFormateur) throw new Error("Formateur non trouvé");

        dataToMerge = {
          nom: theFormateur.nom || '',
          nom_formateur: theFormateur.nom || '',
          formateur_nom_complet: theFormateur.nom || '',
          raison_sociale: theFormateur.nom || '',
          adresse_formateur: theFormateur.adresse_formateur || theFormateur.adresse_pro || theFormateur.adresse_client || theFormateur.adresse || '',
          adresse_session: theFormateur.adresse_session || theFormateur.adresse_formateur || theFormateur.adresse_pro || theFormateur.adresse || '',
          formateur_nda: theFormateur.formateur_nda || theFormateur.nda || '',
          formateur_siret: theFormateur.formateur_siret || theFormateur.siret || '',
          email_formateur: theFormateur.email || '',
          tel_formateur: theFormateur.telephone || '',
          compagnie_assurance: theFormateur.compagnie_assurance || '',
          numero_assurance_rcp: theFormateur.numero_assurance_rcp || '',
          date_signature: new Date().toLocaleDateString('fr-FR')
        };
        targetId = fId;
        targetName = theFormateur.nom || "Formateur";
      } else {
        // 1. Récupération depuis la table ciblée 'clients'
        const { data: theClient } = await supabase.from('clients').select('*').eq('id', clientRow.id).single();
        finalClient = theClient || clientRow; // fallback

        // 2. Récupération formateur dans 'utilisateurs'
        let theCoach = { nom: 'Non assigné' };
        if (finalClient.formateur_id) {
          const { data: coachData } = await supabase.from('utilisateurs').select('*').eq('id', finalClient.formateur_id).single();
          if (coachData) theCoach = coachData;
        }

        const module = modules.find(m => m.id === (finalClient.module_id || clientRow.module_id));

        // Extraction impérative des dates via requête sur sessions
        const { data: sessionDates, error: dateError } = await supabase
          .from('sessions')
          .select('date')
          .eq('client_id', clientRow.id)
          .not('date', 'is', null)
          .order('date', { ascending: true });

        let dateDebut = '[Date non définie]';
        let dateFin = '[Date non définie]';

        if (!dateError && sessionDates && sessionDates.length > 0) {
          dateDebut = new Date(sessionDates[0].date).toLocaleDateString('fr-FR');
          dateFin = new Date(sessionDates[sessionDates.length - 1].date).toLocaleDateString('fr-FR');
        }

        dataToMerge = {
          nom: theCoach.nom || 'Coach',
          nom_formateur: theCoach.nom || 'Coach',
          formateur_nom_complet: theCoach.nom || '',
          raison_sociale: theCoach.nom || 'Coach',
          adresse_formateur: theCoach.adresse_formateur || theCoach.adresse_pro || theCoach.adresse_client || theCoach.adresse || '',
          formateur_nda: theCoach.formateur_nda || theCoach.nda || '',
          formateur_siret: theCoach.formateur_siret || theCoach.siret || '',
          email_formateur: theCoach.email || '',
          tel_formateur: theCoach.telephone || '',
          nomcomplet_client: finalClient.nom_complet || finalClient.nomcomplet_client || `${finalClient.nom || ''} ${finalClient.prenom || ''}`.trim(),
          client_phone: finalClient.telephone || finalClient.client_phone || '',
          client_email: finalClient.email_contact || finalClient.client_email || finalClient.email || '',
          prix_prestation: finalClient.montant_prestation || module?.prix_prestation || '',
          adresse_session: finalClient.adresse_postale || finalClient.adresse_session || finalClient.adresse_client || '',
          modalite_formation: finalClient.modalite_formation || 'Mixte',
          date_debut: dateDebut,
          date_fin: dateFin,
          date_signature: new Date().toLocaleDateString('fr-FR'),
          formation_nom: module?.nom || 'Formation'
        };
        targetId = clientRow.id;
        targetName = finalClient.nom_complet || clientRow.nom || "Client";
      }

      const response = await fetch(templateInfo.url);
      if (!response.ok) throw new Error(`Fetch template error: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();

      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      doc.render(dataToMerge);
      
      const docxBlob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      // Étape 1 : Conversion DOCX → PDF (via ConvertAPI si disponible, sinon DOCX direct)
      toast.loading('Génération du document…', { id: 'gen-doc' });
      const safeName = targetName.replace(/\s+/g, '_');

      let finalBlob = docxBlob;
      let finalExt = 'docx';
      let finalMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      try {
        toast.loading('Conversion en PDF…', { id: 'gen-doc' });
        const pdfBlob = await convertDocxBlobToPdf(docxBlob);
        finalBlob = pdfBlob;
        finalExt = 'pdf';
        finalMime = 'application/pdf';
      } catch (convErr) {
        console.warn('[handleGenerateDocx] ConvertAPI indisponible, fallback DOCX :', convErr.message);
        toast.loading('PDF indisponible — génération DOCX…', { id: 'gen-doc' });
        // Continuer avec le DOCX brut
      }

      const finalFileName = `${type}_${safeName}_${Date.now()}.${finalExt}`;

      // INTERDICTION de télécharger sur l'ordinateur de l'Admin pour la lettre de mission (demande utilisateur)
      const isMissionLetter = type.toLowerCase().includes('mission') || type.toLowerCase().includes('lettre');
      if (!isMissionLetter && !effectiveIsForFormateur && !formateurId && !isAutoGenerate) {
        saveAs(finalBlob, finalFileName);
      }

      // Upload du fichier généré
      toast.loading('Upload du document…', { id: 'gen-doc' });
      const uploadFile = new File([finalBlob], finalFileName, { type: finalMime });
      const { error: uploadError } = await supabase.storage.from(uploadBucket).upload(finalFileName, uploadFile);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from(uploadBucket).getPublicUrl(finalFileName);

      const docToInsert = {
        nom: `${type} - ${targetName}`,
        type_document: 'Administratif',
        url: publicUrl,
        signe_par_client: false,
        signe_par_formateur: false,
        visible_admin: true,
      };

      if (effectiveIsForFormateur || formateurId) {
        docToInsert.assigned_formateur_id = targetId;
        docToInsert.visible_formateur = true;
        docToInsert.visible_client = false;
      } else {
        docToInsert.user_id = targetId;
        docToInsert.visible_client = true;
        docToInsert.visible_formateur = true;
        if (finalClient && finalClient.formateur_id) {
          docToInsert.assigned_formateur_id = finalClient.formateur_id;
        }
      }

      console.log('Données envoyées à Supabase :', JSON.stringify(docToInsert, null, 2));

      const { data: insertedDocs, error: insertError } = await supabase.from('documents').insert([docToInsert]).select();
      if (insertError) {
        console.error('Erreur insert Supabase :', insertError);
        throw new Error(`Erreur Supabase : ${insertError.message || insertError.details || JSON.stringify(insertError)}`);
      }

      await fetchDocuments();
      if (!isAutoGenerate) toast.success(`Document généré et archivé.`, { id: 'gen-doc' });
      return insertedDocs ? insertedDocs[0] : null;
    } catch (error) {
      console.error("Docx Error:", error);
      if (!isAutoGenerate) toast.error("Erreur lors de la génération : " + error.message, { id: 'gen-doc' });
      return null;
    }
  };

  const handleAddDocument = async (e) => {
    e.preventDefault();
    if (!newDocName.trim() || !newDocClientId) return;
    setIsAddingDoc(true);

    let finalUrl = newDocUrl;
    if (newDocFile) {
      const fileExt = newDocFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, newDocFile);

      if (uploadError) {
        console.error("Erreur upload:", uploadError);
        toast.error("Erreur upload: " + uploadError.message);
        setIsAddingDoc(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);
      finalUrl = publicUrl;
    }

    const { error } = await supabase
      .from('documents')
      .insert([{
        nom: newDocName,
        type_document: newDocType,
        url: finalUrl,
        user_id: newDocClientId,
        visible_client: newDocVisClient,
        visible_formateur: newDocVisFormateur,
        signe_par_client: false,
        signe_par_formateur: false
      }]);

    if (!error) {
      // Rechargement immédiat pour récupérer le document dans l'UI
      await fetchDocuments();
      setNewDocName('');
      setNewDocType('Autre');
      setNewDocUrl('');
      setNewDocFile(null);
      setNewDocClientId('');
      setNewDocVisClient(true);
      setNewDocVisFormateur(true);
    } else {
      console.error("Erreur ajout doc", error);
      toast.error('Erreur Doc : ' + error.message);
    }
    setIsAddingDoc(false);
  };

  const handleSignDocument = async (docId, signerType, signatureDataUrl = null) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    // signerType = 'client' ou 'formateur'
    const updateColumn = signerType === 'client'
      ? { signe_par_client: true, date_signature_client: new Date().toISOString() }
      : { signe_par_formateur: true, date_signature_formateur: new Date().toISOString() }; // Ajout de la date formateur utile

    if (signatureDataUrl) {
      // Sauvegarde de l'image en Base64 directement dans les colonnes comme demandé
      if (signerType === 'client') updateColumn.signature_client = signatureDataUrl;
      else updateColumn.signature_formateur = signatureDataUrl;
    }

    const simulatedDoc = { ...doc, ...updateColumn };

    // Met à jour Supabase, mais aussi on empêche les clics multiples
    setDocuments(documents.map(d => d.id === docId ? simulatedDoc : d));

    // Progression : Chaque signature doit faire avancer la barre (demande)
    if (signerType === 'client') {
      const client = clients.find(c => c.id === simulatedDoc.user_id);
      if (client) {
        const newSeances = (client.seances_effectuees || 0) + 1;
        setClients(clients.map(c => c.id === client.id ? { ...c, seances_effectuees: newSeances } : c));
        await supabase.from('utilisateurs').update({ seances_effectuees: newSeances }).eq('id', client.id);
      }
    }

    const { error } = await supabase
      .from('documents')
      .update({
        ...updateColumn,
        statut: (updateColumn.signe_par_client || updateColumn.signe_par_formateur) ? 'Signé' : doc.statut,
        visible_admin: true // S'assurer que l'admin le voit dans "Documents Signés"
      })
      .eq('id', docId);

    if (error) {
      toast.error("Erreur signature: " + error.message);
      // rollback state en cas d'erreur
      await fetchDocuments();
    }
  };

  const handleDocumentSignatureSave = async (docId, signatureDataUrl = null, documentChoice = null) => {
    const doc = documents.find(d => String(d.id) === String(docId));
    if (!doc) {
      toast.error('Document introuvable (id: ' + docId + ')');
      return;
    }

    const TOAST_ID = 'sign-doc';
    toast.loading('Signature du document en cours…', { id: TOAST_ID });

    try {
      const formateur = formateurs.find(f => f.id === doc.assigned_formateur_id);
      const signerName = formateur?.nom || 'Le Formateur';
      const now = new Date();
      const nowStr = now.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

      const docUrl = doc.url || '';
      const isDocx = /\.(docx|doc)$/i.test(docUrl);

      let pdfBlob;
      let targetPdfBytes;

      // Extract bucket and path
      const urlMatch = docUrl.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
      let bucket = 'documents';
      let path = docUrl;
      if (urlMatch) {
        bucket = urlMatch[1];
        path = decodeURIComponent(urlMatch[2]);
      }

      // Résolution de l'URL de téléchargement : URL publique directe ou signed URL
      let fetchUrl = docUrl;
      if (!docUrl.startsWith('http')) {
        // Chemin relatif → URL publique
        fetchUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      }
      // Si l'URL publique échoue (bucket privé), on tente une signed URL
      const testResp = await fetch(fetchUrl, { method: 'HEAD' }).catch(() => null);
      if (!testResp || !testResp.ok) {
        const { data: signData, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
        if (signErr || !signData?.signedUrl) throw new Error('Lecture document impossible : ' + (signErr?.message || 'URL inaccessible'));
        fetchUrl = signData.signedUrl;
      }

      if (isDocx) {
        toast.loading('Conversion du document DOCX en PDF…', { id: TOAST_ID });
        const docxBytes = await fetch(fetchUrl).then(r => r.arrayBuffer());
        const tempPdfBlob = await convertDocxBlobToPdf(new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
        targetPdfBytes = await tempPdfBlob.arrayBuffer();
      } else {
        targetPdfBytes = await fetch(fetchUrl).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        });
      }

      // Étape 2 : On superpose la signature par coordonnées (pdf-lib)
      const pdfDoc = await PDFDocument.load(targetPdfBytes);
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pages = pdfDoc.getPages();
      const lastPage = pages[pages.length - 1];
      const { width } = lastPage.getSize();

      // Overlay consentement interactif — même config que overlaySignatureOnPdf
      const CONSENT_OVERLAYS = {
        default: { pageIndex: 0, checkboxX: 67, autoriseY: 318, refuseY: 291 },
      };
      if (documentChoice) {
        const overlay = CONSENT_OVERLAYS[doc.consent_template] || CONSENT_OVERLAYS.default;
        const consentPage = pages[overlay.pageIndex];
        const checkY = documentChoice === 'autorise' ? overlay.autoriseY : overlay.refuseY;
        consentPage.drawText('X', { x: overlay.checkboxX, y: checkY, size: 12, font: helveticaBold, color: rgb(0, 0, 0) });
      }

      // Coordonnées pour la zone "Le sous-traitant" (droite de la page)
      const xPos = width / 2 + 10;
      let yOffset = 112;

      // Superposer l'image de signature manuscrite (PNG transparent) si fournie
      if (signatureDataUrl) {
        try {
          const sigBytes = await fetch(signatureDataUrl).then(r => r.arrayBuffer());
          const sigImg = await pdfDoc.embedPng(sigBytes);
          // Mise à l'échelle : largeur max 150pt, hauteur proportionnelle
          const aspect = sigImg.width / sigImg.height;
          const sigW = Math.min(150, sigImg.width);
          const sigH = sigW / aspect;
          lastPage.drawImage(sigImg, { x: xPos, y: yOffset, width: sigW, height: sigH });
        } catch (imgErr) {
          console.warn("Erreur lors de l'intégration de l'image de signature:", imgErr);
        }
      }

      // Texte d'horodatage en dessous de l'image
      lastPage.drawText('Le sous-traitant', {
        x: xPos, y: 100, size: 10, font: helveticaBold, color: rgb(0, 0, 0),
      });
      lastPage.drawText(signerName, {
        x: xPos, y: 84, size: 10, font: helvetica, color: rgb(0, 0, 0),
      });
      lastPage.drawText(`Signé numériquement le ${nowStr}`, {
        x: xPos, y: 68, size: 8, font: helvetica, color: rgb(0.33, 0.33, 0.33),
      });

      const pdfBytesOut = await pdfDoc.save();
      pdfBlob = new Blob([pdfBytesOut], { type: 'application/pdf' });

      // Upload du PDF signé
      toast.loading('Upload du document signé…', { id: TOAST_ID });
      const fileName = `signed_${docId}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, new File([pdfBlob], fileName, { type: 'application/pdf' }));
      if (uploadError) throw new Error('Upload : ' + uploadError.message);

      const { data: { publicUrl: signedPdfUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);

      const updateData = {
        signe_par_formateur: true,
        date_signature_formateur: now.toISOString(),
        statut: 'Signé',
        visible_admin: true,
        signed_pdf_url: signedPdfUrl,
        ...(documentChoice ? { document_choice: documentChoice } : {}),
      };
      const { error: dbError } = await supabase.from('documents').update(updateData).eq('id', docId);
      if (dbError) throw dbError;

      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, ...updateData } : d));
      toast.success('Document signé avec succès !', { id: TOAST_ID });

    } catch (err) {
      console.error('[handleDocumentSignatureSave]', err);
      toast.error('Erreur : ' + err.message, { id: TOAST_ID });
      await fetchDocuments();
    }
  };

  const updateDateSeance = async (docId, date) => {

    setDocuments(documents.map(d => d.id === docId ? { ...d, date_seance: date } : d));
    const { error } = await supabase.from('documents').update({ date_seance: date }).eq('id', docId);
    if (error) {
      console.error("Erreur update date seance", error);
      toast.error("Erreur lors de l'enregistrement de la date.");
      await fetchDocuments();
    }
  };

  const handleSignatureSave = async (dataUrl) => {
    if (!signingDocId) return;
    await handleSignDocument(signingDocId, userRole === 'client' ? 'client' : 'formateur', dataUrl);
    setSigningDocId(null);
  };

  const handleDownloadPDF = async (doc, recapType = 'general') => {
    if (doc && doc.id) {
      // Détection : Si doc n'a pas d'URL mais a un rôle ou email, c'est un client -> Générer Récapitulatif
      const isClientRecap = (doc.role || doc.email) && !doc.url && !doc.url_signed_pdf;

      if (isClientRecap) {
        try {
          const isEmargementOnly = recapType === 'emargement';
          toast.loading(isEmargementOnly ? "Génération du récap émargements..." : "Génération du récapitulatif...", { id: 'recap' });
          const clientSessions = sessions.filter(s => s.client_id === doc.id).sort((a, b) => {
            if (a.numero_seance !== b.numero_seance) return a.numero_seance - b.numero_seance;
            return new Date(a.created_at) - new Date(b.created_at);
          });

          // Group sessions by numero_seance
          const grouped = clientSessions.reduce((acc, s) => {
            if (!acc[s.numero_seance]) acc[s.numero_seance] = { numero: s.numero_seance, nom: s.nom, date: s.date, debut: s.heure_debut, fin: s.heure_fin, items: [] };
            acc[s.numero_seance].items.push(s);
            return acc;
          }, {});

          const recapEl = document.createElement('div');
          recapEl.style.width = '800px';
          recapEl.style.padding = '50px';
          recapEl.style.background = '#fff';
          recapEl.style.fontFamily = 'Arial, sans-serif';
          recapEl.style.position = 'fixed';
          recapEl.style.left = '-9999px';

          let sessionsContent = Object.values(grouped).sort((a, b) => a.numero - b.numero).map(g => {
            const filteredItems = isEmargementOnly ? g.items.filter(i => i.type_activite === 'signature') : g.items;
            if (filteredItems.length === 0) return '';
            const itemsHtml = filteredItems.map(item => {
              const sigClient = item.signature_image || item.signature_client || null;
              const sigCoach = item.signature_formateur || null;
              const dateSigClient = item.date_signature_client ? new Date(item.date_signature_client).toLocaleString('fr-FR') : (item.statut === 'Signé' ? 'Horodatage certifié' : null);
              const dateSigCoach = item.date_signature_formateur ? new Date(item.date_signature_formateur).toLocaleString('fr-FR') : (item.statut_formateur === 'Signé' ? 'Horodatage certifié' : null);

              return `
                <div style="margin-bottom: 25px; padding-left: 20px; border-left: 3px solid #f3f4f6;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: bold; font-size: 14px; color: #1f2937;">${item.type_activite === 'signature' ? '✍️' : '📄'} ${item.ressource_titre || item.nom}</span>
                    <span style="font-size: 11px; font-weight: 800; color: ${item.statut === 'Signé' ? '#059669' : '#f59e0b'}; text-transform: uppercase;">${item.statut}</span>
                  </div>
                  
                  <div style="display: flex; gap: 40px; margin-top: 10px;">
                    ${sigClient ? `
                      <div style="flex: 1;">
                        <p style="font-size: 9px; font-weight: bold; color: #9ca3af; margin-bottom: 5px; text-transform: uppercase;">Signature Bénéficiaire</p>
                        <img src="${sigClient}" style="max-width: 150px; height: 60px; border: 1px solid #f3f4f6; padding: 5px; border-radius: 8px;" />
                        <p style="font-size: 8px; color: #6b7280; margin-top: 3px;">Signé le ${dateSigClient}</p>
                      </div>
                    ` : ''}
                    ${sigCoach ? `
                      <div style="flex: 1;">
                        <p style="font-size: 9px; font-weight: bold; color: #9ca3af; margin-bottom: 5px; text-transform: uppercase;">Signature Formateur</p>
                        <img src="${sigCoach}" style="max-width: 150px; height: 60px; border: 1px solid #f3f4f6; padding: 5px; border-radius: 8px;" />
                        <p style="font-size: 8px; color: #6b7280; margin-top: 3px;">Signé le ${dateSigCoach}</p>
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('');

            return `
              <div style="margin-bottom: 40px; page-break-inside: avoid;">
                <div style="background: #f8fafc; padding: 15px 20px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <h3 style="margin: 0; color: #4f46e5; font-size: 16px;">SÉANCE ${g.numero} : ${g.nom.split(' - ')[0]}</h3>
                    <p style="margin: 5px 0 0; font-size: 12px; color: #64748b; font-weight: bold;">
                      📅 ${g.date ? new Date(g.date).toLocaleDateString('fr-FR') : 'Date non définie'} 
                      &nbsp;&nbsp; ⏰ ${g.debut || '--:--'} - ${g.fin || '--:--'}
                    </p>
                  </div>
                </div>
                <div style="padding-left: 10px;">
                  ${itemsHtml}
                </div>
              </div>
            `;
          }).join('');

          recapEl.innerHTML = `
            <div style="border: 1px solid #e2e8f0; border-radius: 24px; padding: 40px; background: #fff;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px; padding-bottom: 30px; border-bottom: 2px solid #f1f5f9;">
                <div>
                  <h1 style="color: #4f46e5; font-size: 28px; font-weight: 900; margin: 0; letter-spacing: -0.025em;">${isEmargementOnly ? 'FEUILLES D\'ÉMARGEMENT' : 'RÉCAPITULATIF DE SÉANCES'}</h1>
                  <p style="color: #94a3b8; font-size: 11px; font-weight: bold; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.1em;">${isEmargementOnly ? 'Émargements signés — Traçabilité Qualiopi' : 'Document de traçabilité Qualiopi'}</p>
                </div>
                <div style="text-align: right;">
                  <h2 style="font-size: 18px; font-weight: 800; color: #1e293b; margin: 0;">${doc.nomcomplet_client || doc.nom}</h2>
                  <p style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 600;">Dossier : ${doc.numero_dossier || 'N/A'}</p>
                </div>
              </div>

              <div>
                ${sessionsContent}
              </div>

              <div style="margin-top: 50px; padding: 25px; background: #fdf2f2; border-radius: 16px; border: 1px solid #fee2e2;">
                <p style="font-size: 10px; color: #b91c1c; font-weight: bold; text-align: center; margin: 0; line-height: 1.5;">
                  Ce document certifie l'ensemble des activités réalisées et signées par les deux parties.<br/>
                  Généré automatiquement par VB Logiciel le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}.
                </p>
              </div>
            </div>
          `;

          document.body.appendChild(recapEl);
          await new Promise(r => setTimeout(r, 500));
          const canvas = await html2canvas(recapEl, { scale: 2 });
          document.body.removeChild(recapEl);

          const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 40, 40, 515, (canvas.height * 515) / canvas.width);
          pdf.save(`${isEmargementOnly ? 'Emargements' : 'Recapitulatif'}_${doc.nom || 'Client'}_${Date.now()}.pdf`);
          
          toast.success(isEmargementOnly ? "Récap émargements généré !" : "Récapitulatif généré !", { id: 'recap' });
          return;
        } catch (err) {
          console.error("Recap Error:", err);
          toast.error("Erreur lors de la génération du récapitulatif", { id: 'recap' });
          return;
        }
      }

      const urlToDownload = doc.url_signed_pdf || doc.url;
      if (!urlToDownload) return toast.error("Aucun fichier à télécharger");

      const fetchBase64Image = async (url) => {
        if (!url) return null;
        if (url.startsWith('data:image')) return url; // Already base64
        try {
          const res = await fetch(url);
          const blobImg = await res.blob();
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blobImg);
          });
        } catch (e) {
          console.error("Erreur téléchargement image :", e);
          return null;
        }
      };

      try {
        const res = await fetch(urlToDownload);
        if (!res.ok) throw new Error(`Impossible de récupérer le document (${res.status})`);

        const blob = await res.blob();
        let pdfDoc;

        if (blob.type === 'application/pdf' || urlToDownload.toLowerCase().includes('.pdf')) {
          const pdfBytes = await blob.arrayBuffer();
          pdfDoc = await PDFDocument.load(pdfBytes);
        } else {
          pdfDoc = await PDFDocument.create();
          const page = pdfDoc.addPage([595.28, 841.89]);
          const imageBytes = await blob.arrayBuffer();
          const img = blob.type === 'image/png'
            ? await pdfDoc.embedPng(imageBytes)
            : await pdfDoc.embedJpg(imageBytes);
          const { width, height } = img.scaleToFit(500, 700);
          page.drawImage(img, { x: 47, y: 841.89 - height - 80, width, height });
        }

        const client = clients.find(c => c.id === doc.user_id);
        const clientName = client ? client.nom : 'Bénéficiaire';

        const formateur = formateurs.find(f => f.id === client?.formateur_id);
        const formateurName = formateur ? formateur.nom : 'Formateur';

        const now = new Date();
        const dateText = now.toLocaleDateString('fr-FR');
        const timeText = now.toLocaleTimeString('fr-FR');

        const signatureClientUrl = doc.signature_client || doc.signature_client_url || null;
        const signatureFormateurUrl = doc.signature_formateur || doc.signature_formateur_url || null;

        console.log('Signature Client:', signatureClientUrl);
        console.log('Signature Formateur:', signatureFormateurUrl);

        const clientImageBase64 = await fetchBase64Image(signatureClientUrl);
        const formateurImageBase64 = await fetchBase64Image(signatureFormateurUrl);

        const certEl = document.createElement('div');
        certEl.style.width = '794px';
        certEl.style.minHeight = '1123px';
        certEl.style.padding = '40px';
        certEl.style.fontFamily = 'Arial, Helvetica, sans-serif';
        certEl.style.background = '#ffffff';
        certEl.style.color = '#1f2937';
        certEl.style.position = 'fixed';
        certEl.style.left = '-9999px';
        certEl.style.top = '-9999px';

        const renderSigBlock = (role, imageBase64, name) => {
          const imageHtml = imageBase64
            ? `<img src="${imageBase64}" style="max-width: 280px; height: auto; border: 1px solid #d1d5db;" />`
            : '<div style="width:280px;height:120px;border:1px dashed #9ca3af;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:12px;">Aucune signature attachée</div>';

          return `
            <div style="flex:1; min-width:280px; padding: 14px; border: 1px solid #d1d5db; border-radius: 12px; margin: 8px;">
              <h3 style="font-size: 16px; margin-bottom: 10px;">${role}</h3>
              <p style="font-size: 12px; margin-bottom: 8px; font-weight: bold;">${name}</p>
              <p style="font-size: 12px; margin-bottom: 10px;">${dateText} à ${timeText}</p>
              ${imageHtml}
            </div>
          `;
        };

        certEl.innerHTML = `
          <div style="padding: 20px; border: 1px solid #d1d5db; border-radius: 12px;">
            <h1 style="font-size: 24px; margin-bottom: 16px;">Certificat de signature électronique</h1>
            <p style="font-size: 14px; margin-bottom: 16px;"><strong>Document :</strong> ${doc.nom || 'Document'}</p>
            <div style="display:flex; flex-wrap:wrap; gap:16px;">
              ${renderSigBlock('Client', clientImageBase64, clientName)}
              ${renderSigBlock('Formateur', formateurImageBase64, formateurName)}
            </div>
            <p style="font-size: 11px; margin-top: 30px; color:#4b5563;">Mentions légales : Ce document fait foi de preuve d'émargement pour Qualiopi, certifié par les deux parties.</p>
          </div>
        `;

        document.body.appendChild(certEl);

        // Petite pause pour être sûr que le rendu image (Base64) est bien injecté
        await new Promise((resolve) => setTimeout(resolve, 500));

        const canvas = await html2canvas(certEl, { scale: 2, backgroundColor: '#ffffff' });
        document.body.removeChild(certEl);

        const certPdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const imgData = canvas.toDataURL('image/png');
        certPdf.addImage(imgData, 'PNG', 0, 0, 595.28, 841.89);

        const certPdfBytes = certPdf.output('arraybuffer');
        const certPageDoc = await PDFDocument.load(certPdfBytes);
        const [certPage] = await pdfDoc.copyPages(certPageDoc, [0]);
        pdfDoc.addPage(certPage);

        const finalPdfBytes = await pdfDoc.save();
        const finalBlob = new Blob([finalPdfBytes], { type: 'application/pdf' });

        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(finalBlob);
        downloadLink.download = `certificat_signature_${doc.id}_${Date.now()}.pdf`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(downloadLink.href);

      } catch (error) {
        console.error('Erreur de génération du PDF final :', error);
        toast.error('Impossible de générer le PDF signé. Vérifiez la console.');
      }
    } else {
      toast.success('Simulation : Téléchargement du bilan...');
    }
  };



  // --- Chargement des données au lancement (Supabase) ---
  useEffect(() => {
    fetchUtilisateurs();
    fetchDocuments();
    fetchModules();
    fetchSessions();
    fetchPedagogicalResources();
    fetchClientSkills();
    fetchOrgSettings();

    // Détection des liens d'invitation ou de récupération de mot de passe
    supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === 'PASSWORD_RECOVERY' ||
        (event === 'SIGNED_IN' && window.location.hash.includes('type=invite')) ||
        window.location.pathname === '/set-password'
      ) {
        setIsSettingPassword(true);
      }
    });
  }, [userRole]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // Auto-génération supprimée : elle déclenchait generateSessions 3x lors du chargement des données.
  // Les séances sont désormais générées uniquement via le bouton manuel dans la vue Formateur.

  // Affichage du simulateur de connexion ou de la page de mot de passe
  if (isSettingPassword) {
    return (
      <SetPasswordView
        supabase={supabase}
        onComplete={async () => {
          // Attendre que Supabase finalise la session
          await new Promise(r => setTimeout(r, 500));

          // Récupérer l'utilisateur authentifié
          const { data: { user } } = await supabase.auth.getUser();

          if (user && user.email) {
            // Chercher le rôle dans la base de données (admin/formateur)
            const { data: userData } = await supabase
              .from('utilisateurs')
              .select('role, id')
              .eq('email', user.email)
              .single();

            console.log('DB user data:', userData);

            if (userData && userData.role) {
              // ⚡ D'ABORD définir le rôle, PUIS masquer le formulaire de mot de passe
              handleLogin(userData.role, userData.id);
              setIsSettingPassword(false);
              return;
            }
          }

          // Fallback: pas de rôle trouvé
          console.warn('Impossible de déterminer le rôle automatiquement.');
          setIsSettingPassword(false);
        }}
      />
    );
  }

  if (isResetPassword) {
    return (
      <ResetPasswordPage
        supabase={supabase}
        onComplete={async () => {
          // Auto login process
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user && user.email) {
            const { data: userData } = await supabase.from('utilisateurs').select('role, id').eq('email', user.email).single();
            if (userData && userData.role) {
              handleLogin(userData.role, userData.id);
              setIsResetPassword(false);
              return;
            }
            
            const { data: clientData } = await supabase.from('clients').select('id').ilike('email_contact', user.email).single();
            if (clientData && clientData.id) {
               handleLogin('client', clientData.id);
               setIsResetPassword(false);
               return;
            }
          }
          
          // Fallback if role not found
          await supabase.auth.signOut();
          window.history.replaceState(null, '', '/');
          setIsResetPassword(false);
          setResetSuccessMsg("Votre mot de passe a été réinitialisé avec succès. Connectez-vous avec vos nouveaux identifiants.");
        }}
      />
    );
  }

  if (isSignup) {
    return (
      <SignupView
        supabase={supabase}
        onComplete={() => { window.history.replaceState(null, '', '/'); setIsSignup(false); }}
      />
    );
  }

  if (needsSetup) {
    return (
      <SetupOrganisationPage />
    );
  }

  if (isLoadingSession) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mb-4"></div>
        <div className="text-gray-400 font-bold uppercase tracking-widest text-[10px] animate-pulse">Chargement de votre session...</div>
      </div>
    );
  }

  if (!userRole) {
    return <LoginView handleLogin={handleLogin} supabase={supabase} successMessage={resetSuccessMsg} onNeedsSetup={() => setNeedsSetup(true)} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Sidebar Mobile Overlay */}
      <div className={`fixed inset-0 bg-gray-900/50 z-40 transition-opacity md:hidden ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setMobileMenuOpen(false)}></div>

      {/* Navigation Sidebar (Dynamic par Rôle) */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-gray-300 transition-transform transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static md:flex-shrink-0 flex flex-col`}>
        <div className="flex items-center justify-between h-20 px-6 border-b border-gray-800 bg-gray-950">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center mr-3 font-bold text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]">VB</div>
            <span className="text-xl font-bold text-white tracking-widest">ERP</span>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
          {userRole === 'admin' && (
            <>
              <button onClick={() => { setActiveTab('clients'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'clients' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Users className="w-5 h-5 mr-3" /> Clients
              </button>
              <button onClick={() => { setActiveTab('formateurs'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'formateurs' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Users className="w-5 h-5 mr-3" /> Formateurs
              </button>
              <button onClick={() => { setActiveTab('gestion_documents'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'gestion_documents' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <FileText className="w-5 h-5 mr-3" /> Gestion des documents
              </button>
              <button onClick={() => { setActiveTab('modules'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'modules' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Settings className="w-5 h-5 mr-3" /> Modules
              </button>
              <button onClick={() => { setActiveTab('fiches_metiers'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'fiches_metiers' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Briefcase className="w-5 h-5 mr-3" /> Fiches Métiers
              </button>
              <button onClick={() => { setActiveTab('relances'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'relances' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Bell className="w-5 h-5 mr-3" /> Relances Auto
              </button>
              <button onClick={() => { setActiveTab('parametres_org'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'parametres_org' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Settings className="w-5 h-5 mr-3" /> Paramètres
              </button>
            </>
          )}

          {userRole === 'formateur' && (
            <>
              <button onClick={() => { setActiveTab('clients'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'clients' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Users className="w-5 h-5 mr-3" /> Mes Clients
              </button>
              <button onClick={() => { setActiveTab('fiches_metiers'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'fiches_metiers' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Briefcase className="w-5 h-5 mr-3" /> Fiches Métiers
              </button>
            </>
          )}

          {userRole === 'client' && (
            <>
              <button onClick={() => { setActiveTab('accueil'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'accueil' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><LayoutDashboard className="w-5 h-5 mr-3" /> Accueil</button>
              <button onClick={() => { setActiveTab('mes_seances'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'mes_seances' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><FileText className="w-5 h-5 mr-3" /> Mes Séances</button>
              <button onClick={() => { setActiveTab('mes_documents'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'mes_documents' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><FileText className="w-5 h-5 mr-3" /> Mes Documents</button>
              <button onClick={() => { setActiveTab('bilan'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'bilan' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><Users className="w-5 h-5 mr-3" /> Mon bilan</button>
              <button onClick={() => { setActiveTab('exercices'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'exercices' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><Plus className="w-5 h-5 mr-3" /> Exercices</button>
              <button onClick={() => { setActiveTab('fiches_metiers'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'fiches_metiers' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><Briefcase className="w-5 h-5 mr-3" /> Fiches Métiers</button>
            </>
          )}


          {userRole === 'formateur' && (
            <button onClick={() => { setActiveTab('ressources'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'ressources' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
              <FileText className="w-5 h-5 mr-3" /> Ressources
            </button>
          )}
        </nav>

        <div className="p-4 bg-gray-950 border-t border-gray-800">
          <button onClick={handleLogout} className="w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 hover:bg-red-500/10 hover:text-red-400 text-gray-400 font-medium">
            <LogOut className="w-5 h-5 mr-3" /> Déconnexion
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="md:hidden bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between z-10 w-full shrink-0">
          <button onClick={() => setMobileMenuOpen(true)} className="text-gray-500">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="font-bold text-gray-900 border border-gray-200 px-3 py-1 rounded capitalize">{userRole}</div>
        </header>

        <header className="hidden md:flex bg-white px-10 py-5 border-b border-gray-100 shadow-sm z-10 justify-between items-center w-full shrink-0">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-bold text-gray-800 capitalize">Espace {userRole}</h2>
            <span className="bg-green-50 text-green-700 text-xs font-bold px-2 py-1 rounded-md border border-green-200">Connecté en ligne</span>
          </div>

          <div className="flex items-center space-x-4">
            {(() => {
              let displayName = "";
              let rawName = "";
              if (userRole === 'admin') {
                displayName = orgSettings?.nom || "Mon espace";
              } else if (userRole === 'formateur') {
                rawName = formateurs.find(f => f.id === currentUserId)?.nom;
                displayName = rawName || "Coach";
              } else if (userRole === 'client') {
                rawName = clients.find(c => c.id === currentUserId)?.nom;
                displayName = rawName || "Bénéficiaire";
              }

              return (
                <>
                  <div className="text-right mr-2">
                    <p className="text-sm font-bold text-gray-800 leading-tight">
                      {displayName}
                    </p>
                  </div>
                  {userRole === 'admin' && orgSettings?.logo_url ? (
                    <img
                      src={orgSettings.logo_url}
                      alt="Logo"
                      onClick={() => setActiveTab('profil')}
                      className="w-10 h-10 rounded-full object-contain bg-white border-2 border-indigo-200 p-0.5 shadow-sm cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all"
                    />
                  ) : (
                    <div
                      onClick={() => setActiveTab('profil')}
                      className="w-10 h-10 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center font-bold text-sm text-indigo-700 shadow-sm cursor-pointer hover:bg-indigo-600 hover:text-white transition-all transform hover:scale-105"
                    >
                      {userRole === 'admin' ? "AD" : getInitials(rawName)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50/50 p-6 md:p-10 w-full h-full">
          {activeTab === 'profil' && <ProfileView
            currentUserId={currentUserId}
            supabase={supabase}
            fetchUtilisateurs={fetchUtilisateurs}
            formateurs={formateurs}
            clients={clients}
            userRole={userRole}
            orgSettings={orgSettings}
            currentOrgId={currentOrgId}
            onOrgSaved={(updated) => setOrgSettings(prev => ({ ...prev, ...updated }))}
          />}
          {activeTab === 'fiches_metiers' && <FichesMetiersView
            userRole={userRole}
            currentUserId={currentUserId}
            currentOrgId={currentOrgId}
            supabase={supabase}
            clients={clients}
            formateurs={formateurs}
          />}
          {activeTab === 'parametres_org' && userRole === 'admin' && (
            <OrganisationSettingsView
              supabase={supabase}
              currentOrgId={currentOrgId}
              orgSettings={orgSettings}
              onSaved={(updated) => setOrgSettings(prev => ({ ...prev, ...updated }))}
            />
          )}
          {activeTab === 'clients' && userRole === 'admin' && <AdminClientsView
            handleAddUser={handleAddUser}
            newUserName={newUserName} setNewUserName={setNewUserName}
            newUserEmail={newUserEmail} setNewUserEmail={setNewUserEmail}
            newUserRole={newUserRole} setNewUserRole={setNewUserRole}
            clientPhone={clientPhone} setClientPhone={setClientPhone}
            clientEmail={clientEmail} setClientEmail={setClientEmail}
            isAddingUser={isAddingUser}
            clients={clients}
            formateurs={formateurs}
            assignFormateur={assignFormateur}
            handleModuleChange={handleModuleChange}
            modules={modules}
            handleGenerateDocx={handleGenerateDocx}
            sessions={sessions}
            documentTemplates={documentTemplates}
            supabase={supabase}
            expandedClientId={expandedClientId}
            setExpandedClientId={setExpandedClientId}
            fetchUtilisateurs={fetchUtilisateurs}
            fetchDocuments={fetchDocuments}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            setIsInviteModalOpen={setIsInviteModalOpen}
            pedagogicalResources={pedagogicalResources}
            fetchSessions={fetchSessions}
            documents={documents}
            handleDownloadResource={handleDownloadResource}
            handleUploadExerciseResponse={handleUploadExerciseResponse}
            generateSessions={generateSessions}
            handleDeleteClient={handleDeleteClient}
            setIsSessionItemModalOpen={setIsSessionItemModalOpen}
            setTargetSessionForAddition={setTargetSessionForAddition}
            setViewingSession={setViewingSession}
            handleDownloadPDF={handleDownloadPDF}
            updateSessionDate={updateSessionDate}
            updateSessionTime={updateSessionTime}
            onTimeChange={onTimeChange}
            onSaveTimes={onSaveTimes}
            editedTimes={editedTimes}
            lastModifiedSessionId={lastModifiedSessionId}
            setDocSettingsTarget={setDocSettingsTarget}
            setIsDocSettingsOpen={setIsDocSettingsOpen}
            setViewingDocId={setViewingDocId}
            handleMoveSessionItem={handleMoveSessionItem}
            handleSaveCorrection={handleSaveCorrection}
            handleAddAdminBloc={handleAddAdminBloc}
          />}
          {activeTab === 'formateurs' && userRole === 'admin' && <AdminFormateursView
            clients={clients}
            formateurs={formateurs}
            documents={documents}
            expandedClientId={expandedClientId}
            setExpandedClientId={setExpandedClientId}
            supabase={supabase}
            fetchUtilisateurs={fetchUtilisateurs}
            fetchDocuments={fetchDocuments}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            modules={modules}
            sessions={sessions}
            handleDownloadResource={handleDownloadResource}
            handleDeleteFormateur={handleDeleteFormateur}
            documentTemplates={documentTemplates}
            handleGenerateDocx={handleGenerateDocx}
            setViewingDocId={setViewingDocId}
            handleUploadDocxTemplate={handleUploadDocxTemplate}
            newTemplateName={newTemplateName}
            setNewTemplateName={setNewTemplateName}
          />}
          {activeTab === 'relances' && userRole === 'admin' && <AutomationSettingsView
            supabase={supabaseAdmin}
          />}
          {activeTab === 'modules' && userRole === 'admin' && <IngenierieView
            modules={modules}
            moduleDocuments={moduleDocuments}
            handleAddModule={handleAddModule}
            handleLinkDocument={handleLinkDocument}
            newModuleName={newModuleName}
            setNewModuleName={setNewModuleName}
            newModuleSeances={newModuleSeances}
            setNewModuleSeances={setNewModuleSeances}
            newModDocName={newModDocName}
            setNewModDocName={setNewModDocName}
            newModDocType={newModDocType}
            setNewModDocType={setNewModDocType}
            newModDocFile={newModDocFile}
            setNewModDocFile={setNewModDocFile}
            addingToModuleId={addingToModuleId}
            setAddingToModuleId={setAddingToModuleId}
            handleUploadDocxTemplate={handleUploadDocxTemplate}
            newTemplateName={newTemplateName}
            setNewTemplateName={setNewTemplateName}
            handleUploadResource={handleUploadResource}
            newResourceName={newResourceName}
            setNewResourceName={setNewResourceName}
            isUploadingResource={isUploadingResource}
            modelingModuleId={modelingModuleId}
            setModelingModuleId={setModelingModuleId}
            moduleSessionTemplates={moduleSessionTemplates}
            moduleStepResources={moduleStepResources}
            fetchModules={fetchModules}
            newStepTitle={newStepTitle}
            setNewStepTitle={setNewStepTitle}
            newStepActivity={newStepActivity}
            setNewStepActivity={setNewStepActivity}
            selectedResourceId={selectedResourceId}
            setSelectedResourceId={setSelectedResourceId}
            pedagogicalResources={pedagogicalResources}
            isAddingStep={isAddingStep}
            setIsAddingStep={setIsAddingStep}
            isAddingStepResource={isAddingStepResource}
            setIsAddingStepResource={setIsAddingStepResource}
            supabase={supabase}
            createSessionFolder={createSessionFolder}
            isResourceModalOpen={isResourceModalOpen}
            setIsResourceModalOpen={setIsResourceModalOpen}
            activeFolderId={activeFolderId}
            setActiveFolderId={setActiveFolderId}
            handleDeleteFolder={handleDeleteFolder}
            handleDeleteStepResource={handleDeleteStepResource}
            handleAddStepResource={handleAddStepResource}
            handleRenameFolder={handleRenameFolder}
            handleRenameResource={handleRenameResource}
            handleAddModuleMomentResource={handleAddModuleMomentResource}
            handleRedistributeModuleDocs={handleRedistributeModuleDocs}
            documentTemplates={documentTemplates}
          />}
          {activeTab === 'clients' && userRole === 'formateur' && <FormateurView
            clients={clients}
            formateurs={formateurs}
            sessions={sessions}
            generateSessions={generateSessions}
            updateSessionDate={updateSessionDate}
            signSession={signSession}
            modules={modules}
            userRole={userRole}
            currentUserId={currentUserId}
            expandedClientId={expandedClientId}
            setExpandedClientId={setExpandedClientId}
            handleAddSession={handleAddSession}
            handleDeleteSession={handleDeleteSession}
            updateSessionTime={updateSessionTime}
            handleGenerateDocx={handleGenerateDocx}
            documents={documents}
            fetchUtilisateurs={fetchUtilisateurs}
            documentTemplates={documentTemplates}
            pedagogicalResources={pedagogicalResources}
            handleDownloadResource={handleDownloadResource}
            handleUploadExerciseResponse={handleUploadExerciseResponse}
            setIsSessionItemModalOpen={setIsSessionItemModalOpen}
            setTargetSessionForAddition={setTargetSessionForAddition}
            onTimeChange={onTimeChange}
            onSaveTimes={onSaveTimes}
            setLastModifiedSessionId={setLastModifiedSessionId}
            lastModifiedSessionId={lastModifiedSessionId}
            setViewingSession={setViewingSession}
            handleSignDocument={handleSignDocument}
            setViewingDocId={setViewingDocId}
            clientSkills={clientSkills}
            fetchClientSkills={fetchClientSkills}
            supabase={supabase}
            fetchDocuments={fetchDocuments}
            handleMoveSessionItem={handleMoveSessionItem}
            handleSaveCorrection={handleSaveCorrection}
          />}
          {activeTab === 'accueil' && (() => {
            const _client = clients.find(c => c.id === currentUserId);
            const _module = modules.find(m => String(m.id) === String(_client?.module_id));
            const _clientSessions = sessions.filter(s => String(s.client_id) === String(currentUserId));
            const _signed = _clientSessions.filter(s => s.statut === 'Signé' || s.statut_client === 'Signé').length;
            const _total = _clientSessions.length;
            const _progress = _total > 0 ? Math.min(100, Math.round((_signed / _total) * 100)) : 0;
            return <AccueilView
              setActiveTab={setActiveTab}
              clientProgress={_progress}
              moduleName={_module?.nom || null}
              totalSessions={_total}
              signedSessions={_signed}
            />;
          })()}
          {activeTab === 'mes_seances' && <SessionsView sessions={sessions} signSession={signSession} currentUserId={currentUserId} userRole={userRole} pedagogicalResources={pedagogicalResources} handleDownloadResource={handleDownloadResource} handleUploadExerciseResponse={handleUploadExerciseResponse} setViewingSession={setViewingSession} />}
          {activeTab === 'mes_documents' && <ClientDocumentsView supabase={supabaseAdmin} currentUserId={currentUserId} clients={clients} documents={documents} fetchDocuments={fetchDocuments} />}
          {activeTab === 'bilan' && <BilanView handleDownloadPDF={handleDownloadPDF} clientId={currentUserId} clientSkills={clientSkills} />}
          {activeTab === 'exercices' && <ExercicesView setActiveTab={setActiveTab} sessions={sessions} currentUserId={currentUserId} handleUploadExerciseResponse={handleUploadExerciseResponse} />}
          {activeTab === 'gestion_documents' && <DocumentsView
            sessions={sessions}
            documents={documents}
            clients={clients}
            formateurs={formateurs}
            userRole={userRole}
            currentUserId={currentUserId}
            handleSignDocument={handleSignDocument}
            handleDownloadPDF={handleDownloadPDF}
            handleAddDocument={handleAddDocument}
            updateDateSeance={updateDateSeance}
            newDocName={newDocName} setNewDocName={setNewDocName}
            newDocType={newDocType} setNewDocType={setNewDocType}
            newDocUrl={newDocUrl} setNewDocUrl={setNewDocUrl}
            newDocFile={newDocFile} setNewDocFile={setNewDocFile}
            newDocClientId={newDocClientId} setNewDocClientId={setNewDocClientId}
            newDocVisClient={newDocVisClient} setNewDocVisClient={setNewDocVisClient}
            newDocVisFormateur={newDocVisFormateur} setNewDocVisFormateur={setNewDocVisFormateur}
            isAddingDoc={isAddingDoc}
            selectedClientForDocs={selectedClientForDocs}
            setSelectedClientForDocs={setSelectedClientForDocs}
            signingDocId={signingDocId}
            setSigningDocId={setSigningDocId}
            viewingDocId={viewingDocId}
            setViewingDocId={setViewingDocId}
            handleSignatureSave={handleSignatureSave}
            newTemplateName={newTemplateName}
            setNewTemplateName={setNewTemplateName}
            newTemplateDestination={newTemplateDestination}
            setNewTemplateDestination={setNewTemplateDestination}
            newTemplateClassification={newTemplateClassification}
            setNewTemplateClassification={setNewTemplateClassification}
            fetchDocuments={fetchDocuments}
            setIsDeleteModalOpen={setIsDeleteModalOpen}
            setTargetToDelete={setTargetToDelete}
            supabase={supabase}
            handleUploadDocxTemplate={handleUploadDocxTemplate}
            onUpdateTemplateDestination={handleUpdateTemplateDestination}
          />}
          {activeTab === 'ressources' && userRole === 'formateur' && <RessourcesView pedagogicalResources={pedagogicalResources} supabase={supabase} currentUserId={currentUserId} />}

          {activeTab === 'set-password' && <SetPasswordView supabase={supabase} onComplete={() => setActiveTab('accueil')} />}
        </main>
      </div>

      {/* Modals Qualiopi */}
      <SignatureModal
        isOpen={signingDocId !== null}
        onClose={() => setSigningDocId(null)}
        onSave={handleSignatureSave}
      />

      <EmargementModal
        isOpen={signingSessionId !== null}
        onClose={() => setSigningSessionId(null)}
        onSave={handleEmargementSave}
        sessionTitle={(() => { const s = sessions.find(s => s.id === signingSessionId); return s?.ressource_titre || s?.nom; })()}
        signerRole={userRole}
      />

      <SessionItemModal
        isOpen={isSessionItemModalOpen}
        onClose={() => setIsSessionItemModalOpen(false)}
        pedagogicalResources={pedagogicalResources}
        supabase={supabase}
        onSave={handleAddSessionItem}
        clientSessions={sessions.filter(s => s.client_id === targetSessionForAddition?.clientId)}
        preSelectedSessionId={targetSessionForAddition?.preSelectedSessionId || null}
        preSelectedLabel={targetSessionForAddition?.numero ? `SÉANCE ${targetSessionForAddition.numero}` : null}
      />

      {/* Visionneuse PDF pour docs de la modélothèque */}
      <DocumentViewerModal
        isOpen={viewingDocId !== null}
        url={(() => { const d = documents.find(doc => doc.id === viewingDocId); return d?.signed_pdf_url || d?.url || null; })()}
        title={documents.find(doc => doc.id === viewingDocId)?.nom}
        onClose={() => setViewingDocId(null)}
        supabase={supabase}
        mode="view"
      />

      {/* Visionneuse PDF pour sessions (lecture + signature obligatoire) */}
      <DocumentViewerModal
        isOpen={viewingSession !== null}
        url={resolveFileUrl(
          viewingSession?.session
            ? (viewingSession.session.signed_pdf_url || viewingSession.session.file_url || viewingSession.session.ressource_url || null)
            : null
        )}
        title={viewingSession?.session
          ? (viewingSession.session.ressource_titre || viewingSession.session.nom || 'Document')
          : ''
        }
        supabase={supabase}
        mode={viewingSession?.mode || 'view'}
        isInteractiveConsent={viewingSession?.session?.is_interactive_consent === true}
        onClose={() => setViewingSession(null)}
        onSave={viewingSession?.mode === 'sign' ? async (signatureDataUrl, documentChoice) => {
          const sessionOrDoc = viewingSession.session;
          setViewingSession(null);
          const isDocument = documents.some(d => String(d.id) === String(sessionOrDoc.id));
          if (isDocument) {
            await handleDocumentSignatureSave(sessionOrDoc.id, signatureDataUrl, documentChoice);
          } else {
            await handleSessionSignatureSave(sessionOrDoc.id, signatureDataUrl, documentChoice);
          }
        } : undefined}
      />

      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInviteUser}
        isAddingUser={isAddingUser}
        formateurs={formateurs}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Supprimer définitivement ?"
        itemName={targetToDelete?.type === 'template' ? `le modèle "${targetToDelete.id}"` : "cet élément"}
      />

      <DocumentSettingsModal
        isOpen={isDocSettingsOpen}
        session={docSettingsTarget}
        onClose={() => { setIsDocSettingsOpen(false); setDocSettingsTarget(null); }}
        onSave={handleSaveDocSettings}
      />

      <Toaster />
    </div>
  );
}