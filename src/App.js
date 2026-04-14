import React, { useState, useEffect, useRef } from 'react';
import { Plus, Users, FileText, Settings, LogOut, LayoutDashboard, ChevronDown, ChevronUp, Save, Trash2, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Buffer } from 'buffer';
import process from 'process';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { PDFDocument } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip
} from 'recharts';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

// Instance d'administration (Service Role) - EXPOSÉE CÔTÉ CLIENT (Risque de sécurité accepté par l'utilisateur)
const supabaseAdmin = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
);

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.process = process;
}

// --- Icônes Simplifiées (Lucide déjà importé) ---
const DownloadIcon = () => <FileText className="w-4 h-4 mr-2" />;


// --- Données du Graphique Ancres de Carrière ---
const radarData = [
  { subject: 'Technique', A: 5.5, fullMark: 6 },
  { subject: 'Management', A: 2.0, fullMark: 6 },
  { subject: 'Autonomie', A: 3.8, fullMark: 6 },
  { subject: 'Sécurité', A: 5.8, fullMark: 6 },
  { subject: 'Entrepreneur', A: 1.5, fullMark: 6 },
  { subject: 'Service', A: 3.0, fullMark: 6 },
  { subject: 'Défi', A: 2.5, fullMark: 6 },
  { subject: 'Lifestyle', A: 4.2, fullMark: 6 },
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

const DocumentViewerModal = ({ isOpen, document, onClose }) => {
  if (!isOpen || !document) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/80 z-[100] flex items-center justify-center p-2 md:p-8 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col relative overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white z-10 shrink-0">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center mr-4 text-gray-600 font-bold">PDF</div>
            <h3 className="font-extrabold text-lg text-gray-900">{document.nom}</h3>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors">✕</button>
        </div>
        <div className="flex-1 bg-gray-100 p-2 md:p-6 overflow-hidden">
          {document.url ? (
            <iframe src={document.url} title={document.nom} className="w-full h-full rounded-xl border border-gray-200 shadow-sm bg-white" />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 font-medium">Aucun fichier joint à ce document.</div>
          )}
        </div>
        {document.signe_par_client && (
          <div className="bg-green-50 border-t border-green-200 p-4 shrink-0 flex items-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 mr-4 font-bold text-xl">✓</div>
            <div className="flex-1">
              <p className="font-bold text-green-800 text-lg">Document validé numériquement</p>
              <p className="text-sm text-green-700 mt-0.5">Certifié signé le {document.date_signature_client ? new Date(document.date_signature_client).toLocaleString('fr-FR') : 'Date inconnue'} {document.signature_client_url ? '(Signature attachée)' : ''}</p>
              {document.signature_client_url && <a href={document.signature_client_url} target="_blank" rel="noreferrer" className="text-xs text-green-600 underline font-medium mt-1 inline-block">Voir le tracé de la signature</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// COMPOSANTS DE VUES EXTRAITS DE APP
// ==========================================

const LoginView = ({ handleLogin, supabase, successMessage }) => {
  const [email, setEmail] = useState(() => {
    // Tenter de pré-remplir l'email depuis l'URL (#email=... ou ?email=...)
    const params = new URLSearchParams(window.location.hash.substring(1) || window.location.search);
    return params.get('email') || '';
  });
  const [password, setPassword] = useState('');
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
        .select('role, id')
        .eq('email', userEmail)
        .single();

      if (userData && userData.role) {
        handleLogin(userData.role, userData.id);
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
        console.error('Utilisateur non trouvé dans les DBs:', dbError || clientError);
        setErrorMsg('Votre compte existe mais n\'est pas encore configuré dans les tables de données. Contactez l\'administrateur.');
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
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Votre mot de passe"
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
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
            {isLoading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
};

const ClientDetailView = ({
  client, formateurs, assignFormateur, handleModuleChange, modules,
  supabase, fetchUtilisateurs, onBack, sessions, fetchSessions, documents, handleGenerateDocx, documentTemplates,
  pedagogicalResources
}) => {
  const [activeTab, setActiveTab] = React.useState('infos');
  const [isSavingInfo, setIsSavingInfo] = React.useState(false);
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

  const clientSessions = sessions ? sessions.filter(s => s.client_id === client.id).sort((a,b)=> a.numero_seance - b.numero_seance) : [];
  const clientDocs = documents ? documents.filter(d => d.user_id === client.id) : [];

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
      formateur_id: client.formateur_id // Hérité de l'assignation globale
    }, { onConflict: 'id' });

    if (error) {
      alert("Erreur lors de la sauvegarde : " + error.message);
    } else {
      await fetchUtilisateurs();
      alert("Informations personnelles sauvegardées avec succès !");
    }
    setIsSavingInfo(false);
  };

  const updateSession = async (id, payload) => {
    await supabase.from('sessions').update(payload).eq('id', id);
    if(fetchSessions) fetchSessions();
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
    if (!window.confirm("Supprimer cette séance ?")) return;
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (!error && fetchSessions) fetchSessions();
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
        <div className="mt-4 md:mt-0">
          <span className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider ${client.status === 'Nouveau' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
            {client.status || 'Actif'}
          </span>
        </div>
      </div>

      <div className="flex gap-4 border-b border-gray-200">
        <button onClick={() => setActiveTab('infos')} className={`px-4 py-3 font-bold text-sm ${activeTab === 'infos' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-800'}`}>Infos & Modalités</button>
        <button onClick={() => setActiveTab('seances')} className={`px-4 py-3 font-bold text-sm ${activeTab === 'seances' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-800'}`}>Supervision Séances</button>
        <button onClick={() => setActiveTab('docs')} className={`px-4 py-3 font-bold text-sm ${activeTab === 'docs' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-800'}`}>Documents liés</button>
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
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.nomcomplet_client} onChange={e => setClientInfo({...clientInfo, nomcomplet_client: e.target.value})} placeholder="Nom Complet (Génération Docs)" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Email Contact</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.client_email} onChange={e => setClientInfo({...clientInfo, client_email: e.target.value})} placeholder="Email Contact" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Téléphone</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.client_phone} onChange={e => setClientInfo({...clientInfo, client_phone: e.target.value})} placeholder="Téléphone" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Adresse Postale</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.adresse_client} onChange={e => setClientInfo({...clientInfo, adresse_client: e.target.value})} placeholder="Adresse complète" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">N° de Dossier</label>
              <input className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.numero_dossier} onChange={e => setClientInfo({...clientInfo, numero_dossier: e.target.value})} placeholder="N° de Dossier" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Montant de la Prestation (€)</label>
              <input type="number" className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.montant_prestation} onChange={e => setClientInfo({...clientInfo, montant_prestation: e.target.value})} placeholder="Montant en euros (ex: 1500)" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Modalités de la formation</label>
              <select className="w-full p-3 text-sm border bg-gray-50 border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-colors" value={clientInfo.modalite_formation} onChange={e => setClientInfo({...clientInfo, modalite_formation: e.target.value})}>
                <option value="Mixte">Mixte (Présentiel & Distanciel)</option>
                <option value="Présentiel">Présentiel</option>
                <option value="Distanciel">Distanciel</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end pt-4 mb-4 border-b border-gray-100 pb-8">
            <button 
              onClick={handleSaveClientInfo}
              disabled={isSavingInfo}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all flex items-center disabled:opacity-50"
            >
              <Save size={18} className="mr-2" />
              {isSavingInfo ? 'Enregistrement...' : 'Enregistrer les informations'}
            </button>
          </div>

          <h3 className="text-lg font-bold text-gray-800 mt-2">Générateurs Automatiques</h3>
          <div className="flex gap-2 flex-wrap pt-2">
             {Object.keys(documentTemplates || {}).map(key => (
               <button key={key} onClick={() => handleGenerateDocx(client, key)} className="bg-indigo-50 flex items-center text-indigo-700 px-4 py-2 rounded-xl text-sm font-bold border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all">
                 <FileText className="w-4 h-4 mr-2" /> Générer {key}
               </button>
             ))}
           </div>
        </div>
      )}

      {activeTab === 'seances' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-800">Calendrier des Séances</h3>
            <button onClick={handleAddCustomSession} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm transition-all">
              <Plus size={14} /> Ajouter une étape personnalisée
            </button>
          </div>
          <div className="space-y-4">
            {clientSessions.length > 0 ? clientSessions.map(session => (
              <div key={session.id} className="p-5 border border-gray-100 rounded-2xl bg-gray-50 flex flex-col gap-4 relative group">
                <button onClick={() => handleDeleteSession(session.id)} className="absolute top-4 right-4 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 size={16} />
                </button>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Titre de la séance / étape</label>
                    <input 
                      type="text" 
                      className="w-full p-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-gray-800"
                      defaultValue={session.titre} 
                      onBlur={(e) => updateSession(session.id, {titre: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Type d'Activité</label>
                    <select 
                      className="w-full p-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-indigo-500 bg-white"
                      defaultValue={session.type_activite || 'Signature'}
                      onChange={(e) => updateSession(session.id, {type_activite: e.target.value})}
                    >
                      <option value="Signature">Signature Présence</option>
                      <option value="Document PDF">Document PDF</option>
                      <option value="Exercice">Exercice / Outil</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-gray-200/50">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date</label>
                    <input type="date" className="w-full p-2 text-xs border border-gray-200 rounded-lg outline-none" defaultValue={session.date || ''} onBlur={(e) => updateSession(session.id, {date: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Heure</label>
                    <input type="time" className="w-full p-2 text-xs border border-gray-200 rounded-lg outline-none" defaultValue={session.heure_debut || ''} onBlur={(e) => updateSession(session.id, {heure_debut: e.target.value})} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Ressource Pédagogique (Modélothèque)</label>
                    <select 
                      className="w-full p-2 text-xs border border-gray-200 rounded-lg outline-none bg-white"
                      defaultValue={session.ressource_id || ''}
                      onChange={(e) => updateSession(session.id, {ressource_id: e.target.value})}
                    >
                      <option value="">Aucune ressource liée</option>
                      {pedagogicalResources.map(res => (
                        <option key={res.name} value={res.name}>{res.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )) : <p className="text-gray-500 italic text-sm text-center py-8">Aucune séance n'est encore programmée pour ce client.</p>}
          </div>
        </div>
      )}

      {activeTab === 'docs' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Documents Uploadés</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clientDocs.length > 0 ? clientDocs.map(doc => (
              <div key={doc.id} className="p-4 border border-gray-100 rounded-2xl flex items-center justify-between group hover:border-indigo-300">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 flex items-center justify-center rounded-xl"><FileText size={20} /></div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm truncate max-w-[150px]">{doc.nom}</p>
                    <p className="text-[10px] text-gray-500">{doc.type}</p>
                  </div>
                </div>
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-indigo-600 bg-gray-50 rounded-lg"><Download size={18} /></a>
              </div>
            )) : <p className="text-gray-500 italic text-sm">Aucun document rattaché.</p>}
          </div>
        </div>
      )}
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
  pedagogicalResources
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
          sessions={sessions} fetchSessions={fetchSessions} documents={documents} 
          handleGenerateDocx={handleGenerateDocx} documentTemplates={documentTemplates} 
          pedagogicalResources={pedagogicalResources}
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

const AdminFormateursView = ({ clients, formateurs, documents, expandedClientId, setExpandedClientId, supabase, fetchUtilisateurs, fetchDocuments, activeTab, setActiveTab, modules }) => {
  const [selectedFormateurId, setSelectedFormateurId] = React.useState(null);

  if (selectedFormateurId) {
    const formateur = formateurs.find(f => f.id === selectedFormateurId);
    if (formateur) {
      return (
        <FormateurDetailView 
          formateur={formateur} 
          onBack={() => setSelectedFormateurId(null)} 
          supabase={supabase} 
          fetchUtilisateurs={fetchUtilisateurs} 
        />
      );
    }
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
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
                              const clientModule = modules.find(m => m.id === client.module_id);
                              return (
                                <tr key={client.id} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="p-3">
                                    <div className="font-bold text-sm text-gray-800">{client.nom || client.nomcomplet_client}</div>
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
  modelingModuleId, setModelingModuleId, moduleSessionTemplates, fetchModules,
  newStepTitle, setNewStepTitle, newStepActivity, setNewStepActivity,
  selectedResourceId, setSelectedResourceId, pedagogicalResources, isAddingStep,
  setIsAddingStep, supabase
}) => (
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
          return (
            <div key={mod.id} className="border border-purple-100 bg-purple-50/20 p-5 rounded-2xl relative shadow-sm">
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
                <div className="flex gap-2">
                  <button onClick={() => { setAddingToModuleId(mod.id); setNewModDocName(''); setNewModDocType('Contrat'); setNewModDocFile?.(null); }} className="text-xs font-bold text-purple-600 hover:text-white hover:bg-purple-600 flex items-center bg-white border border-purple-200 px-4 py-2 rounded-lg transition-all">+ Doc. Type</button>
                  <button onClick={() => setModelingModuleId(modelingModuleId === mod.id ? null : mod.id)} className="text-xs font-bold text-indigo-600 hover:text-white hover:bg-indigo-600 flex items-center bg-white border border-indigo-200 px-4 py-2 rounded-lg transition-all">⚙️ Modéliser Parcours</button>
                </div>
              )}

              {/* Interface de Modélisation du Parcours (New) */}
              {modelingModuleId === mod.id && (
                <div className="mt-6 pt-6 border-t border-purple-100 animate-fade-in">
                  <h4 className="text-sm font-bold text-indigo-700 mb-4 flex items-center gap-2">
                    <Layout size={16} /> Modélisation du Parcours Client
                  </h4>
                  
                  <div className="space-y-3 mb-6">
                    {moduleSessionTemplates.filter(t => t.module_id === mod.id).map((template, idx) => (
                      <div key={template.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-xs">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold">{idx + 1}</span>
                          <div>
                            <p className="font-bold text-gray-900">{template.titre}</p>
                            <p className="text-[10px] text-gray-500">{template.type_activite} {template.ressource_id ? `• Ressource liée` : ''}</p>
                          </div>
                        </div>
                        <button 
                          onClick={async () => {
                            const { error } = await supabase.from('module_session_templates').delete().eq('id', template.id);
                            if (!error) fetchModules();
                          }}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {moduleSessionTemplates.filter(t => t.module_id === mod.id).length === 0 && (
                      <p className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-xl border border-dashed border-gray-200 text-center">Aucune étape définie pour ce module.</p>
                    )}
                  </div>

                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newStepTitle.trim()) return;
                      setIsAddingStep(true);
                      const { error } = await supabase.from('module_session_templates').insert([{
                        module_id: mod.id,
                        titre: newStepTitle,
                        type_activite: newStepActivity,
                        ressource_id: selectedResourceId || null,
                        ordre: moduleSessionTemplates.filter(t => t.module_id === mod.id).length + 1
                      }]);
                      if (!error) {
                        setNewStepTitle('');
                        setSelectedResourceId('');
                        fetchModules();
                      }
                      setIsAddingStep(false);
                    }}
                    className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 space-y-3"
                  >
                    <input 
                      required 
                      type="text" 
                      placeholder="Titre de l'étape (ex: Séance 1 : Analyse)" 
                      value={newStepTitle} 
                      onChange={e => setNewStepTitle(e.target.value)} 
                      className="w-full text-xs p-2.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500" 
                    />
                    <div className="flex gap-2">
                      <select 
                        value={newStepActivity} 
                        onChange={e => setNewStepActivity(e.target.value)} 
                        className="flex-1 text-xs p-2.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 bg-white"
                      >
                        <option value="Signature">Signature Présence</option>
                        <option value="Document PDF">Document PDF</option>
                        <option value="Exercice">Exercice / Outil</option>
                      </select>
                      <select 
                        value={selectedResourceId} 
                        onChange={e => setSelectedResourceId(e.target.value)} 
                        className="flex-1 text-xs p-2.5 border border-gray-200 rounded-lg outline-none focus:border-indigo-500 bg-white"
                      >
                        <option value="">Aucune Ressource</option>
                        {pedagogicalResources.map(res => (
                          <option key={res.name} value={res.name}>{res.name}</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      type="submit" 
                      disabled={isAddingStep}
                      className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg text-xs hover:bg-indigo-700 transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                      {isAddingStep ? 'Ajout...' : '+ Ajouter cette étape'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
        {modules.length === 0 && <div className="text-gray-500 italic col-span-2">Créez votre premier module depuis le formulaire ci-dessus.</div>}
      </div>
    </div>

    {/* Gestion des Ressources Pédagogiques (New) */}
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mt-8">
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
        <span className="w-2 h-6 bg-emerald-500 rounded-full mr-3"></span> Gestion des Ressources Pédagogiques
      </h2>
      <div className="bg-emerald-50/50 border border-emerald-100 p-6 rounded-2xl flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-emerald-800 uppercase mb-2">Nom de la Ressource</label>
          <input 
            type="text" 
            placeholder="Ex: Guide Qualiopi 2024" 
            value={newResourceName}
            onChange={e => setNewResourceName(e.target.value)}
            className="w-full text-sm p-3 bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>
        <div className="flex-none w-full md:w-auto">
          <label className={`flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all shadow-md ${(!newResourceName || isUploadingResource) ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {isUploadingResource ? 'Upload...' : 'Uploader Ressource'}
            <input 
              type="file" 
              className="hidden" 
              disabled={!newResourceName || isUploadingResource}
              onChange={e => e.target.files[0] && handleUploadResource(e.target.files[0])}
            />
          </label>
        </div>
      </div>
    </div>

    {/* Gestion des Modèles Word (.docx) */}
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mt-8">
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
        <span className="w-2 h-6 bg-blue-500 rounded-full mr-3"></span> Bibliothèque de Modèles Word (.docx)
      </h2>
      <p className="text-sm text-gray-500 mb-6">Uploadez vos modèles Word contenant les tags <code>{"{nomcomplet_client}"}</code>, <code>{"{adresse_session}"}</code>, etc.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center"><FileText className="mr-2" size={18}/> Nouveau Modèle</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Nom du type (Ex: Contrat, Attestation...)</label>
              <input 
                type="text" 
                value={newTemplateName} 
                onChange={e => setNewTemplateName(e.target.value)}
                placeholder="Ex: Contrat de formation"
                className="w-full p-2.5 rounded-lg border outline-none text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Fichier .docx</label>
              <div className="flex gap-2">
                <label className={`flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all shadow-md ${!newTemplateName ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      Uploader le Modèle (.docx)
                      <input
                        type="file"
                        className="hidden"
                        disabled={!newTemplateName}
                        accept=".docx"
                        onChange={(e) => {
                          if (e.target.files[0]) {
                            handleUploadDocxTemplate(e.target.files[0], newTemplateName);
                            setNewTemplateName('');
                          }
                        }}
                      />
                    </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const FormateurView = ({
  clients, formateurs, sessions, generateSessions,
  updateSessionDate, signSession, modules, currentUserId,
  expandedClientId, setExpandedClientId, userRole,
  handleAddSession, handleDeleteSession, updateSessionTime,
  handleGenerateDocx, documents, fetchUtilisateurs, documentTemplates,
  pedagogicalResources
}) => {
  const [editedTimes, setEditedTimes] = React.useState({}); // { sessionId: { start, end } }
  const [savingId, setSavingId] = React.useState(null);
  const assignedClients = clients.filter(c => c.formateur_id === currentUserId);

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

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Mes Clients Assignés</h1>
          <p className="text-gray-500 text-lg mt-1">Suivez l'avancement et gérez les émargements des sessions.</p>
        </div>
      </div>



      <div className="grid grid-cols-1 gap-6">
        {assignedClients.length > 0 ? assignedClients.map(client => {
          const clientSessions = sessions.filter(s => s.client_id === client.id);
          const isExpanded = expandedClientId === client.id;
          const assignedModule = modules.find(m => m.id === client.module_id);
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

                  {/* Gestion Documentaire Dynamique */}
                  <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Modèles Disponibles */}
                    <div className="bg-indigo-50/30 border border-indigo-100 p-4 rounded-2xl col-span-full">
                      <h4 className="text-[10px] font-bold text-indigo-800 uppercase tracking-widest mb-3 flex items-center">
                        <span className="w-1.5 h-3 bg-indigo-500 rounded-full mr-2"></span> Modèles Disponibles
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {Object.keys(documentTemplates).map(key => (
                          <button
                            key={key}
                            onClick={() => handleGenerateDocx(client, key)}
                            className="flex items-center justify-between text-[10px] font-bold py-2 px-3 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 transition-all text-gray-700 shadow-sm"
                          >
                            <span className="truncate mr-2" title={key}>{key}</span>
                            <DownloadIcon size={14} className="shrink-0 text-indigo-600" />
                          </button>
                        ))}
                        {Object.keys(documentTemplates).length === 0 && (
                          <span className="text-xs text-gray-400 italic py-2">Aucun modèle uploadé dans la modélothèque.</span>
                        )}
                      </div>
                    </div>
                  </div>


                  {clientSessions.length > 0 ? (
                    <>
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
                            {clientSessions.sort((a, b) => a.numero_seance - b.numero_seance).map(session => (
                              <tr key={session.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-4 font-bold text-gray-900">N°{session.numero_seance} - {session.nom}</td>
                                <td className="px-4 py-4">
                                  <input
                                    type="date"
                                    value={session.date || ''}
                                    onChange={(e) => updateSessionDate(session.id, e.target.value)}
                                    className="border border-gray-200 rounded-lg p-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex flex-col gap-1">
                                      <input
                                        type="time"
                                        value={editedTimes[session.id]?.start ?? session.heure_debut ?? ''}
                                        onChange={(e) => onTimeChange(session.id, 'start', e.target.value)}
                                        className="border border-gray-200 rounded-lg p-1 text-[10px] w-20 outline-none focus:ring-1 focus:ring-indigo-500"
                                        title="Heure début"
                                      />
                                      <input
                                        type="time"
                                        value={editedTimes[session.id]?.end ?? session.heure_fin ?? ''}
                                        onChange={(e) => onTimeChange(session.id, 'end', e.target.value)}
                                        className="border border-gray-200 rounded-lg p-1 text-[10px] w-20 outline-none focus:ring-1 focus:ring-indigo-500"
                                        title="Heure fin"
                                      />
                                    </div>
                                    <button
                                      onClick={() => onSaveTimes(session.id)}
                                      className={`p-1.5 rounded-lg transition-all ${savingId === session.id
                                        ? 'bg-green-100 text-green-600'
                                        : 'bg-indigo-50 text-indigo-500 hover:bg-indigo-100'
                                        }`}
                                      title="Enregistrer les horaires"
                                    >
                                      {savingId === session.id ? <Plus className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                  <div className="mt-1 text-[9px] font-medium text-gray-400">
                                    {calculateDuration(
                                      editedTimes[session.id]?.start ?? session.heure_debut,
                                      editedTimes[session.id]?.end ?? session.heure_fin
                                    ) ? (
                                      <span className="text-indigo-500 italic">Durée : {calculateDuration(
                                        editedTimes[session.id]?.start ?? session.heure_debut,
                                        editedTimes[session.id]?.end ?? session.heure_fin
                                      )}</span>
                                    ) : (
                                      "Durée : 0h"
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${session.statut === 'Signé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                    }`}>{session.statut}</span>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <div className="flex justify-end items-center gap-2">
                                    {(userRole === 'admin' || userRole === 'formateur') && session.statut !== 'Signé' && (
                                      <button
                                        onClick={() => handleDeleteSession(session)}
                                        className="text-rose-400 hover:text-rose-600 transition-colors p-1"
                                        title="Supprimer cette séance"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                    {session.statut !== 'Signé' ? (
                                      <button
                                        onClick={() => signSession(session)}
                                        disabled={!session.date || (new Date(session.date).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0))}
                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${(!session.date || (new Date(session.date).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0)))
                                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                          : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                                          }`}
                                      >
                                        {(!session.date || (new Date(session.date).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0)))
                                          ? 'Verrouillé'
                                          : 'Émarger (Coach)'}
                                      </button>
                                    ) : (
                                      <span className="text-green-500"><Plus /></span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                    </>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <p className="text-gray-400 text-sm italic">Aucune séance n'est encore enregistrée pour ce client.</p>
                      {!client.module_id && <p className="text-xs text-rose-500 mt-2 font-bold">⚠️ Assignez un module à ce client pour générer ses séances.</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }) : (
          <div className="col-span-full py-12 text-center bg-white rounded-3xl border-2 border-dashed border-gray-200">
            <p className="text-gray-400 font-medium italic">Aucun client ne vous est assigné actuellement.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const DocumentsView = ({
  userRole, documents, clients, formateurs, handleSignDocument, handleDownloadPDF,
  handleAddDocument, newDocName, setNewDocName, newDocType, setNewDocType, newDocUrl, setNewDocUrl,
  newDocFile, setNewDocFile, updateDateSeance,
  newDocClientId, setNewDocClientId, newDocVisClient, setNewDocVisClient,
  newDocVisFormateur, setNewDocVisFormateur, isAddingDoc, currentUserId,
  selectedClientForDocs, setSelectedClientForDocs, signingDocId, setSigningDocId, viewingDocId, setViewingDocId,
  handleSignatureSave,
  documentTemplates, handleUploadDocxTemplate, newTemplateName, setNewTemplateName, sessions
}) => {
  const [expandedId, setExpandedId] = React.useState(null);
  const [modelesTab, setModelesTab] = React.useState('modeles');
  const [clientDocTab, setClientDocTab] = React.useState('avant');
  const isAdmin = userRole === 'admin';
  const isClient = userRole === 'client';
  const isFormateur = userRole === 'formateur';

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
        {isClient ? "Mes Documents" : "Gestion Documentaire"}
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
              <span className="w-2 h-6 bg-amber-500 rounded-full mr-3"></span> Ma Modélothèque
            </h2>
            <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl shadow-sm text-[10px] text-blue-700 font-mono">
              <strong>Balises :</strong> {"{nom}"}, {"{adresse_formateur}"}, {"{formateur_nda}"}, {"{nomcomplet_client}"}, {"{prix_prestation}"}, {"{adresse_session}"}, {"{date_debut}"}...
            </div>
          </div>

          <div className="mb-8 p-5 bg-amber-50 rounded-2xl border border-amber-100 flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-xs font-bold text-amber-800 uppercase mb-2">Générer un nouveau type de document</label>
              <input
                type="text"
                placeholder="Nom (Ex: Attestation de Fin de Formation)"
                className="w-full text-sm p-3 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500"
                value={newTemplateName || ''}
                onChange={(e) => setNewTemplateName(e.target.value)}
              />
            </div>
            <div className="flex-none">
              <label className={`flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 rounded-xl font-bold text-sm cursor-pointer transition-all shadow-md ${!newTemplateName ? 'opacity-50 cursor-not-allowed' : ''}`}>
                Uploader le Modèle (.docx)
                <input
                  type="file"
                  className="hidden"
                  disabled={!newTemplateName}
                  accept=".docx"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      handleUploadDocxTemplate(e.target.files[0], newTemplateName);
                      setNewTemplateName('');
                    }
                  }}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.keys(documentTemplates || {}).map(key => (
              <div key={key} className="p-4 border border-gray-100 bg-gray-50/50 rounded-2xl group hover:border-amber-500 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-tighter">Modèle Actif</span>
                  <label className="text-[10px] text-gray-400 hover:text-amber-600 cursor-pointer font-bold transition-colors">
                    Mettre à jour
                    <input type="file" className="hidden" accept=".docx" onChange={(e) => handleUploadDocxTemplate(e.target.files[0], key)} />
                  </label>
                </div>
                <h3 className="font-bold text-gray-900 text-sm mb-1">{key}</h3>
                <p className="text-[10px] text-gray-500 truncate">{documentTemplates[key]?.name || "Modèle chargé"}</p>
              </div>
            ))}
            {Object.keys(documentTemplates || {}).length === 0 && (
              <div className="col-span-full py-4 text-center text-gray-400 italic text-sm">Aucun modèle .docx enregistré.</div>
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
                const clientSessions = (sessions || []).filter(s => s.client_id === currentUserId).sort((a,b) => new Date(a.date) - new Date(b.date));
                const currentDate = new Date();
                currentDate.setHours(0,0,0,0);

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
                      {!doc.signe_par_client && (
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
                  const items = clientDocs.filter(d => d.type_document === 'Contrat' || String(d.nom).toLowerCase().includes('contrat') || String(d.nom).toLowerCase().includes('convention') || String(d.nom).toLowerCase().includes('devis'));
                  return items.length > 0 ? items.map(renderDocRow) : <p className="text-sm text-gray-500 italic py-4">Aucun document administratif en attente de validation.</p>;
                } else if (clientDocTab === 'fin') {
                  const items = clientDocs.filter(d => d.type_document === 'Évaluation' || String(d.nom).toLowerCase().includes('attestation') || String(d.nom).toLowerCase().includes('bilan'));
                  return items.length > 0 ? items.map(renderDocRow) : <p className="text-sm text-gray-500 italic py-4">Les documents de fin de parcours apparaîtront ici.</p>;
                } else if (clientDocTab === 'supports') {
                  const supportDocs = clientDocs.filter(d => !['Contrat', 'Évaluation'].includes(d.type_document) && !String(d.nom).toLowerCase().includes('contrat') && !String(d.nom).toLowerCase().includes('attestation') && !String(d.nom).toLowerCase().includes('convention'));
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

const AccueilView = ({ setActiveTab, clientProgress }) => (
  <div className="flex flex-col items-center justify-center pt-10 md:pt-20 animate-fade-in">
    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg text-rose-500 mb-6 border border-gray-100">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
    </div>
    <h1 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">Bonjour.</h1>
    <p className="text-lg text-gray-500 max-w-lg text-center leading-relaxed">Bienvenue sur votre espace VB Coaching. Suivez votre progression Qualiopi et accédez à vos séances.</p>

    {/* Barre de Progression Qualiopi */}
    <div className="w-full max-w-3xl mt-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-gray-700 uppercase tracking-widest">Progression Qualiopi</span>
        <span className="text-sm font-black text-rose-500">{clientProgress}%</span>
      </div>
      <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-rose-500 transition-all duration-1000 ease-out" style={{ width: `${clientProgress}%` }}></div>
      </div>
      <p className="text-[10px] text-gray-400 mt-2 italic text-left">Mise à jour automatique par signature électronique (Qualiopi).</p>
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

const SessionsView = ({ sessions, signSession, currentUserId, handleDownloadAttendanceCertificate, userRole }) => {
  const mySessions = sessions.filter(s => s.client_id === currentUserId).sort((a, b) => a.numero_seance - b.numero_seance);

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
              {mySessions.map((session) => (
                <tr key={session.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-5">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mr-4 text-gray-900 font-black">#{session.numero_seance}</div>
                      <span className="font-bold text-gray-900">{session.nom}</span>
                    </div>
                  </td>
                  <td className="py-5 font-medium text-gray-600">
                    <div className="flex flex-col">
                      <span>{session.date ? new Date(session.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'À définir'}</span>
                      {session.heure_debut && session.heure_fin && (
                        <span className="text-[10px] text-indigo-600 font-bold mt-1">
                          ⌚ {session.heure_debut} - {session.heure_fin} ({calculateDuration(session.heure_debut, session.heure_fin)})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-5 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${session.statut === 'Signé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                      {session.statut === 'Signé' ? 'Signé ✓' : 'À signer'}
                    </span>
                  </td>
                  <td className="py-5 text-right">
                    {session.statut !== 'Signé' ? (
                      <button
                        onClick={() => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const sessionDate = new Date(session.date);
                          if (!session.date || sessionDate > today) {
                            // Ne rien faire si date future (sécurité client)
                            return;
                          }
                          signSession(session);
                        }}
                        disabled={!session.date || (new Date(session.date).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0))}
                        className={`px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all ${(session.date && new Date(session.date).setHours(0, 0, 0, 0) <= new Date().setHours(0, 0, 0, 0))
                          ? 'bg-rose-500 text-white hover:bg-rose-600 hover:shadow-md'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                      >
                        {(!session.date || (new Date(session.date).setHours(0, 0, 0, 0) > new Date().setHours(0, 0, 0, 0)))
                          ? 'Verrouillé (Date future)'
                          : 'Signer (Emarger)'}
                      </button>
                    ) : (
                      <span className="text-green-500 font-bold text-sm bg-green-50 px-3 py-1 rounded-lg border border-green-100">Confirmé</span>
                    )}
                  </td>
                </tr>
              ))}
              {mySessions.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-12 text-center text-gray-400 italic">Aucune séance n'est encore programmée. Votre coach les générera prochainement.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

const BilanView = ({ handleDownloadPDF }) => (
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
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center"><span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span>Mes Intérêts Dominants</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 hover:bg-indigo-100 transition-colors group">
            <div className="w-12 h-12 bg-indigo-500 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 shadow-sm transition-transform"><Users /></div>
            <h3 className="font-bold text-indigo-900 text-lg">Conventionnel</h3>
            <p className="text-xs text-indigo-700 mt-1">Profil respectueux des normes.</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 hover:bg-emerald-100 transition-colors group">
            <div className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 shadow-sm transition-transform"><Settings /></div>
            <h3 className="font-bold text-emerald-900 text-lg">Investigateur</h3>
            <p className="text-xs text-emerald-700 mt-1">Goût prononcé pour la technique.</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md flex flex-col items-center">
        <h2 className="text-xl w-full font-bold text-gray-800 flex items-center mb-2"><span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span>Mes Ancres de Carrière</h2>
        <div className="w-full h-[250px] relative -ml-4">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
              <PolarGrid stroke="#f3f4f6" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 500 }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
              <Radar name="Score" dataKey="A" stroke="#f43f5e" strokeWidth={3} fill="#fb7185" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-gray-600 bg-gray-50 py-2 px-4 rounded-lg w-full text-center">Dominantes : <strong className="text-gray-900">Sécurité (5.8)</strong> et <strong className="text-gray-900">Technique (5.5)</strong></p>
      </div>
    </div>
  </div>
);

const ExercicesView = ({ setActiveTab }) => (
  <div className="space-y-6 animate-fade-in relative h-[calc(100vh-140px)] flex flex-col max-w-5xl mx-auto">
    <div className="flex justify-between items-center mb-6">
      <div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Outils Pédagogiques</h1>
        <p className="text-gray-500 text-lg">Retrouvez les évaluations actives et passées.</p>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full cursor-pointer" onClick={() => setActiveTab('bilan')}>
      <div className="bg-white border-2 border-green-100 rounded-3xl p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="absolute top-0 right-0 w-24 h-24 bg-green-50 rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">Test des Ancres de Carrière</h3>
        <p className="text-gray-500 text-sm mb-4">Exercice de 40 questions. Permet de définir vos dominantes professionnelles.</p>
        <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">✔ Terminé</span>
      </div>
    </div>
  </div>
);

const ProfileView = ({ currentUserId, supabase, fetchUtilisateurs, formateurs, clients, userRole }) => {
  const user = userRole === 'admin' ? { nom: 'Administrateur', email: 'admin@vb-coaching.fr' } : (userRole === 'formateur' ? formateurs.find(f => f.id === currentUserId) : clients.find(c => c.id === currentUserId));
  
  const [profileData, setProfileData] = useState({
    nom: user?.nom || '',
    adresse: user?.adresse_formateur || user?.adresse_session || '',
    siret: user?.formateur_siret || '',
    nda: user?.formateur_nda || '',
    nomcomplet: user?.nomcomplet_client || user?.nom || ''
  });

  const handleUpdate = async () => {
    const updates = {
      nom: profileData.nom,
      adresse_formateur: profileData.adresse,
      formateur_siret: profileData.siret,
      formateur_nda: profileData.nda,
      nomcomplet_client: profileData.nomcomplet
    };
    
    let error;
    if (userRole === 'client') {
      const result = await supabase.from('clients').update({
        nom_complet: profileData.nomcomplet,
        adresse_postale: profileData.adresse
      }).eq('id', currentUserId);
      error = result.error;
    } else {
      const result = await supabase.from('utilisateurs').update(updates).eq('id', currentUserId);
      error = result.error;
    }
    if (!error) {
      alert('Profil mis à jour avec succès !');
      fetchUtilisateurs();
    } else {
      alert('Erreur lors de la mise à jour : ' + error.message);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl mx-auto">
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <span className="w-2 h-8 bg-indigo-600 rounded-full mr-4"></span> Mon Profil
        </h2>
        
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nom Complet / Raison Sociale</label>
            <input 
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={profileData.nomcomplet}
              onChange={e => setProfileData({...profileData, nomcomplet: e.target.value})}
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Adresse</label>
            <input 
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-sans"
              value={profileData.adresse}
              onChange={e => setProfileData({...profileData, adresse: e.target.value})}
            />
          </div>

          {(userRole === 'admin' || userRole === 'formateur') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">SIRET</label>
                <input 
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={profileData.siret}
                  onChange={e => setProfileData({...profileData, siret: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">NDA (Numéro Déclaration Activité)</label>
                <input 
                  className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  value={profileData.nda}
                  onChange={e => setProfileData({...profileData, nda: e.target.value})}
                />
              </div>
            </div>
          )}

          <div className="pt-6">
            <button 
              onClick={handleUpdate}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <Save size={20} /> Enregistrer les modifications
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RessourcesView = ({ pedagogicalResources, supabase }) => {
  const handleDownload = async (fileName) => {
    const { data, error } = await supabase.storage.from('ressources-pedagogiques').createSignedUrl(fileName, 60);
    if (!error && data) {
      window.open(data.signedUrl, '_blank');
    } else {
      alert('Erreur lors du téléchargement : ' + error?.message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Ressources Pédagogiques</h1>
          <p className="text-gray-500 text-lg">Bibliothèque de documents partagés par l'administration.</p>
        </div>
      </div>
      
      {pedagogicalResources.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pedagogicalResources.map(res => (
            <div key={res.name} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <FileText size={24} />
                </div>
                <button 
                  onClick={() => handleDownload(res.name)}
                  className="text-gray-400 hover:text-emerald-600 transition-colors"
                >
                  <Download size={20} />
                </button>
              </div>
              <h3 className="font-bold text-gray-900 text-sm mb-1 truncate" title={res.name.split('_').slice(1).join('_')}>
                {res.name.split('_').slice(1).join('_') || res.name}
              </h3>
              <p className="text-[10px] text-gray-400">Ajouté le {new Date(res.created_at).toLocaleDateString()}</p>
              
              <button 
                 onClick={() => handleDownload(res.name)}
                 className="mt-4 w-full py-2 bg-gray-50 text-gray-700 text-xs font-bold rounded-xl border border-gray-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all uppercase tracking-wider"
              >
                Télécharger
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white py-20 text-center rounded-3xl border border-dashed border-gray-200">
          <FileText className="mx-auto text-gray-200 mb-4" size={48} />
          <p className="text-gray-400 italic">Aucune ressource disponible pour le moment.</p>
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
            <input 
              type="password" 
              required 
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Confirmer le mot de passe</label>
            <input 
              type="password" 
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
            />
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
              onChange={e => setFormData({...formData, nom: e.target.value})}
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
              onChange={e => setFormData({...formData, email: e.target.value})}
              placeholder="jean.dupont@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Rôle</label>
            <select
              className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              value={formData.role}
              onChange={e => setFormData({...formData, role: e.target.value})}
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
                onChange={e => setFormData({...formData, formateur_id: e.target.value})}
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
// COMPOSANT PRINCIPAL
// ==========================================

export default function App() {
  // --- États Session et Navigation ---
  const [userRole, setUserRole] = useState(null); // 'admin' | 'formateur' | 'client' | null
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeTab, setActiveTab] = useState('accueil');
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

  // États de sélection et d'affichage centralisés
  const [signingSessionId, setSigningSessionId] = useState(null);
  const [signingDocId, setSigningDocId] = useState(null);
  const [viewingDocId, setViewingDocId] = useState(null);

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
  const [isAddingStep, setIsAddingStep] = useState(false);

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
  const [pedagogicalResources, setPedagogicalResources] = useState([]);
  const [newResourceName, setNewResourceName] = useState('');
  const [isUploadingResource, setIsUploadingResource] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);



  const fetchModules = async () => {
    const { data: mData, error: mErr } = await supabase.from('modules').select('id, nom, seances_prevues, prix_prestation');
    if (!mErr && mData) setModules(mData);

    const { data: mdData, error: mdErr } = await supabase.from('module_documents').select('*');
    if (!mdErr && mdData) setModuleDocuments(mdData);

    const { data: mstData, error: mstErr } = await supabase.from('module_session_templates').select('*').order('ordre', { ascending: true });
    if (!mstErr && mstData) setModuleSessionTemplates(mstData);
  };

  const fetchSessions = async () => {
    const { data, error } = await supabase.from('sessions').select('*');
    if (!error && data) setSessions(data);
  };

  const fetchUtilisateurs = async () => {
    // 1. Charger les formateurs depuis 'utilisateurs'
    const { data: formateursData, error: formateursError } = await supabase
      .from('utilisateurs')
      .select('id, nom, email, role, formateur_siret, formateur_nda, adresse_formateur, telephone')
      .eq('role', 'formateur');

    // 2. Charger les clients depuis 'clients' (Source unique selon instruction utilisateur)
    const { data: clientsData, error: clientsError } = await supabase
      .from('clients')
      .select('*');

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
        modalite_formation: c.modalite_formation || 'Mixte'
      }));
      setClients(mappedClients);
    }
  };

  const fetchDocuments = async () => {
    // 1. Charger les documents classiques (contrats générés, preuves, etc.)
    const { data: docsData, error } = await supabase.from('documents').select('*');
    if (!error && docsData) setDocuments(docsData);

    // 2. Charger les modèles maîtres depuis la nouvelle table modeles_documents
    const { data: modsData, error: modErr } = await supabase.from('modeles_documents').select('*');
    if (!modErr && modsData) {
      const templates = {};
      modsData.forEach(m => {
        templates[m.nom] = { url: m.url, name: m.nom };
      });
      setDocumentTemplates(templates);
    } else if (modErr) {
      console.warn("Table modeles_documents inaccessible, fallback sur documents (Modèle Référence)");
      // Fallback au cas où la table n'est pas encore créée
      const refs = docsData?.filter(d => d.type_document === 'Modèle Référence') || [];
      const templates = {};
      refs.forEach(r => {
        templates[r.nom] = { url: r.url, name: r.nom };
      });
      setDocumentTemplates(templates);
    }
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
      alert('Ressource pédagogique ajoutée avec succès !');
      setNewResourceName('');
      fetchPedagogicalResources();
    } else {
      console.error("Erreur upload ressource:", error);
      alert('Erreur lors de l\'upload : ' + error.message);
    }
    setIsUploadingResource(false);
  };

  const handleInviteUser = async (formData) => {
    const { email, nom, role } = formData;
    setIsAddingUser(true);

    // 1. Créer un client admin avec la service_role_key
    const serviceKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      alert("Clé de service non configurée. Vérifiez REACT_APP_SUPABASE_SERVICE_ROLE_KEY dans Vercel.");
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
      alert(`L'invitation a échoué : ${inviteError.message}`);
      setIsAddingUser(false);
      return;
    }

    const newUserId = inviteData.user?.id;

    // 3. Créer l'entrée dans la table correspondante
    if (role === 'client') {
      // Pour les clients : on utilise la table 'clients' avec l'UUID de l'Auth
      // CRUCIAL : on utilise adminClient pour outrepasser les règles RLS lors de l'insertion initiale
      const { error: dbError } = await adminClient.from('clients').insert([{
        id: newUserId,
        nom_complet: nom,
        email_contact: email,
        formateur_id: formData.formateur_id ? Number(formData.formateur_id) : null
      }]);
      if (dbError) {
        console.error("Erreur DB clients après invitation:", dbError);
        alert(`Erreur side-effect clients : ${dbError.message}`);
      }
    } else {
      // Pour les formateurs : on garde la table 'utilisateurs' (ID entier automatique)
      const { error: dbError } = await supabase.from('utilisateurs').insert([{
        nom: nom,
        email: email,
        role: role
      }]);
      if (dbError) console.error("Erreur DB utilisateurs après invitation:", dbError);
    }

    alert(`✅ Invitation envoyée par email à ${email} !`);
    setIsAddingUser(false);
    setIsInviteModalOpen(false);
    fetchUtilisateurs();
  };

  // --- Actions Navigation ---
  const handleLogin = (role, id = null) => {
    setUserRole(role);
    setCurrentUserId(id);
    if (role === 'admin') setActiveTab('clients');
    if (role === 'formateur') setActiveTab('clients');
    if (role === 'client') setActiveTab('accueil');
  };

  const handleLogout = () => {
    setUserRole(null);
    setCurrentUserId(null);
    setActiveTab('accueil');
    setMobileMenuOpen(false);
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
          formateur_id: null // Pas de formateur sélectionné pour l'ajout manuel simple
        }]);
      error = clientError;
    } else {
      const { error: userError } = await supabase
        .from('utilisateurs')
        .insert([{
          nom: newUserName,
          email: newUserEmail,
          role: newUserRole,
        }])
        .select();
      error = userError;
    }

    if (error) {
      console.error("Erreur ajout user", error);
      alert('Erreur ajout serveur : ' + error?.message);
    } else {
      alert(`Utilisateur ${newUserName} ajouté avec succès !`);
      await fetchUtilisateurs();
      await fetchDocuments();
      setNewUserName('');
      setNewUserEmail('');
      setClientPhone('');
      setClientEmail('');
    }
    setIsAddingUser(false);
  };

  const handleModuleChange = async (clientId, moduleId) => {
    const finalModuleId = moduleId ? Number(moduleId) : null;

    // 1. Sauvegarde dans Supabase table 'clients'
    const { error: updateError } = await supabase
      .from('clients')
      .update({ module_id: finalModuleId })
      .eq('id', clientId);

    if (updateError) {
      console.error("Erreur assignation module:", updateError);
      alert("Erreur lors de l'assignation : " + updateError.message);
      return;
    }

    // 2. Récupérer l'objet client frais pour Qualiopi (séances)
    const { data: updatedClient } = await supabase.from('clients').select('*').eq('id', clientId).single();

    if (updatedClient && finalModuleId) {
      // Mapping pour compatibilité avec generateSessions (nom_complet -> nom)
      const compatibleClient = {
        ...updatedClient,
        nom: updatedClient.nom_complet,
        id: updatedClient.id,
        module_id: finalModuleId
      };
      
      // 3. Déclenchement automatique des sessions (Qualiopi)
      await generateSessions(compatibleClient);
    }

    // 4. Rafraîchir l'UI globale
    await fetchUtilisateurs();
    await fetchDocuments();
  };

  // --- Actions Supabase : Configuration Modules ---
  const handleAddModule = async (e) => {
    e.preventDefault();
    if (!newModuleName.trim()) return;
    const { error } = await supabase.from('modules').insert([{ nom: newModuleName, seances_prevues: parseInt(newModuleSeances) }]);
    if (!error) { await fetchModules(); setNewModuleName(''); setNewModuleSeances(1); }
    else alert('Erreur Mod: ' + error.message);
  };

  const handleLinkDocument = async (e, selectedModule) => {
    e.preventDefault();
    // AUCUNE VALIDATION LOCALE - On force l'envoi de l'ID actuel (BIGINT) vers le RPC
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
      module_id: Number(modId), // Injection directe dans la table BIGINT (int8)
      nom: newModDocName,
      type_document: newModDocType,
      url: finalUrl
    }]);

    if (error) {
      console.error("Détail de l'erreur RPC Supabase :", error);
      alert('Erreur lors de la liaison du document additionnel : ' + error.message);
    } else {
      await fetchModules();
      setNewModDocName('');
      setNewModDocFile(null);
      setAddingToModuleId(null);
    }
  };

  const generateSessions = async (client) => {
    if (!client.module_id) return;
    const module = modules.find(m => m.id === client.module_id);
    if (!module) return;

    // Verrou de concurrence local pour empêcher que l'effet ne s'exécute plusieurs fois simultanément
    window._generatingSessionsFor = window._generatingSessionsFor || new Set();
    if (window._generatingSessionsFor.has(client.id)) return;
    window._generatingSessionsFor.add(client.id);

    try {
      // 1. Charger les templates pour ce module (bigint)
      const { data: templates, error: tempError } = await supabase
        .from('module_session_templates')
        .select('*')
        .eq('module_id', module.id)
        .order('ordre', { ascending: true });

      if (tempError) {
        console.error('Erreur fetch templates:', tempError);
        return;
      }

      // 2. Vérifier les séances existantes pour ce client (UUID)
      const { data: existingSessions, error: checkError } = await supabase
        .from('sessions')
        .select('titre')
        .eq('client_id', client.id);

      if (checkError) {
        console.error('Erreur vérification séances:', checkError);
        return;
      }

      const existingTitles = new Set((existingSessions || []).map(s => s.titre));
      const sessionsToInsert = [];

      // 3. Si templates existent, on les utilise. Sinon, fallback sur l'ancienne logique
      if (templates && templates.length > 0) {
        templates.forEach((t, idx) => {
          if (!existingTitles.has(t.titre)) {
            sessionsToInsert.push({
              client_id: client.id,
              module_id: module.id,
              numero_seance: t.ordre || (idx + 1),
              titre: t.titre,
              type_activite: t.type_activite,
              ressource_id: t.ressource_id,
              statut: 'À venir'
            });
          }
        });
      } else {
        // Fallback backward compatibility : génération par nombre de séances prévues
        for (let i = 1; i <= module.seances_prevues; i++) {
          const defaultTitle = `${module.nom} - Séance ${i}`;
          if (!existingTitles.has(defaultTitle)) {
            sessionsToInsert.push({
              client_id: client.id,
              module_id: module.id,
              numero_seance: i,
              titre: defaultTitle,
              statut: 'À venir'
            });
          }
        }
      }

      if (sessionsToInsert.length === 0) {
        return;
      }

      // 2. Upsert : Empêche physiquement le doublon (via contrainte DB) 
      const { error } = await supabase.from('sessions').upsert(sessionsToInsert, {
        onConflict: 'client_id, module_id, nom',
        ignoreDuplicates: true
      });
      
      if (!error) {
        await fetchSessions();
        // Optionnel : console.log pour suivi silencieux
        console.log(`${sessionsToInsert.length} séance(s) générée(s) pour ${client.nom}.`);
      } else {
        console.error('Erreur génération séances :', error);
      }
    } finally {
      window._generatingSessionsFor.delete(client.id);
    }
  };

  const handleAddSession = async (client) => {
    const clientSessions = sessions.filter(s => s.client_id === client.id).sort((a, b) => a.numero_seance - b.numero_seance);
    const nextNum = clientSessions.length + 1;
    const module = modules.find(m => m.id === client.module_id);
    const moduleName = module ? module.nom : "Séance";

    const { error: insError } = await supabase.from('sessions').insert([{
      numero_seance: nextNum,
      nom: `${moduleName} - Séance ${nextNum}`,
      client_id: client.id,
      module_id: client.module_id,
      statut: 'À venir'
    }]);

    if (!insError) {
      const newTotal = (client.seances_totales || 0) + 1;
      await supabase.from('clients').update({ seances_totales: newTotal }).eq('id', client.id);
      await fetchUtilisateurs();
      await fetchSessions();
    } else {
      alert("Erreur lors de l'ajout de la séance: " + insError.message);
    }
  };

  const handleDeleteSession = async (session) => {
    const client = clients.find(c => c.id === session.client_id);
    if (!client) return;

    if (!window.confirm(`Supprimer la séance N°${session.numero_seance} de ${client.nom} ?`)) return;

    const { error: delError } = await supabase.from('sessions').delete().eq('id', session.id);

    if (!delError) {
      const newTotal = Math.max(0, (client.seances_totales || 0) - 1);
      await supabase.from('clients').update({ seances_totales: newTotal }).eq('id', client.id);
      await fetchUtilisateurs();
      await fetchSessions();
    } else {
      alert("Erreur suppression: " + delError.message);
    }
  };

  const updateSessionTime = async (sessionId, field, value) => {
    const { error } = await supabase.from('sessions').update({ [field]: value }).eq('id', sessionId);
    if (!error) await fetchSessions();
  };

  const updateSessionDate = async (sessionId, newDate) => {
    const { error } = await supabase.from('sessions').update({ date: newDate }).eq('id', sessionId);
    if (!error) await fetchSessions();
  };

  const signSession = (session) => {
    setSigningSessionId(session.id);
  };

  const handleSessionSignatureSave = async (sessionId, signatureDataUrl) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    const updateData = {
      statut: 'Signé', // On marque comme signé si une signature intervient
    };

    if (userRole === 'formateur') {
      updateData.signature_formateur = signatureDataUrl;
      updateData.date_signature_formateur = new Date().toISOString();
    } else {
      updateData.signature_image = signatureDataUrl;
      updateData.date_signature = new Date().toISOString();
    }

    const { error } = await supabase.from('sessions').update(updateData).eq('id', sessionId);

    if (!error) {
      const client = clients.find(c => c.id === session.client_id);
      if (client) {
        const newEffectuees = (client.seances_effectuees || 0) + 1;
        await supabase.from('clients').update({ seances_effectuees: newEffectuees }).eq('id', client.id);
        await fetchUtilisateurs();
      }
      await fetchSessions();
      alert(`Séance émargée avec succès !`);
    } else {
      console.error("Erreur signature session:", error);
      alert("Erreur lors de la signature : " + error.message);
    }
  };

  const assignFormateur = async (userId, formateurId) => {
    const userIdParsed = userId;
    const formateurIdParsed = formateurId || null;

    // Validation simple pour UUID (string non vide)
    if (!userIdParsed) return;

    const { error } = await supabase
      .from('clients')
      .update({ formateur_id: formateurIdParsed })
      .eq('id', userIdParsed);

    if (!error) {
      setClients(clients.map(c => c.id === userIdParsed ? { ...c, formateur_id: formateurIdParsed } : c));
    } else {
      console.error("Erreur assignation", error);
      alert("Erreur: " + error.message);
    }
  };

  const handleUploadDocxTemplate = async (fileArg, typeArg) => {
    try {
      const file = fileArg || null;
      const type = typeArg || newTemplateName;

      if (!file) {
        alert("Veuillez sélectionner un fichier .docx d'abord.");
        return;
      }
      if (!type) {
        alert("Veuillez saisir un nom pour ce type de modèle.");
        return;
      }

      const fileName = `template_${type}_${Date.now()}.docx`;
      const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName);
      setDocumentTemplates(prev => ({
        ...prev,
        [type]: { url: publicUrl, name: file.name }
      }));

      // Sauvegarder dans modeles_documents
      const { data: existing } = await supabase.from('modeles_documents').select('id').eq('nom', type);

      if (existing && existing.length > 0) {
        await supabase.from('modeles_documents').update({ url: publicUrl }).eq('id', existing[0].id);
      } else {
        await supabase.from('modeles_documents').insert([{
          nom: type,
          url: publicUrl
        }]);
      }

      // Sync avec documents
      const { data: existingDoc } = await supabase.from('documents').select('id').eq('nom', type).eq('type_document', 'Modèle Référence');
      if (existingDoc && existingDoc.length > 0) {
        await supabase.from('documents').update({ url: publicUrl }).eq('id', existingDoc[0].id);
      } else {
        await supabase.from('documents').insert([{
          nom: type,
          type_document: 'Modèle Référence',
          url: publicUrl,
          visible_client: false,
          visible_formateur: false
        }]);
      }

      await fetchDocuments();
      alert(`Modèle Word pour "${type}" enregistré avec succès.`);
    } catch (err) {
      console.error("Upload Template Error:", err);
      alert("Erreur lors de l'upload: " + (err.message || 'Erreur inconnue'));
    }
  };

  const handleGenerateDocx = async (clientRow, type) => {
    try {
      const templateInfo = documentTemplates[type];
      if (!templateInfo || !templateInfo.url) {
        alert(`Aucun modèle .docx trouvé pour "${type}". Veuillez l'uploader dans l'onglet Ingénierie.`);
        return;
      }

      // 1. Récupération depuis la table ciblée 'clients'
      const { data: theClient } = await supabase.from('clients').select('*').eq('id', clientRow.id).single();
      const finalClient = theClient || clientRow; // fallback

      // 2. Récupération formateur dans 'utilisateurs'
      let theCoach = { nom: 'Non assigné' };
      if (finalClient.formateur_id) {
        const { data: coachData } = await supabase.from('utilisateurs').select('*').eq('id', finalClient.formateur_id).single();
        if (coachData) theCoach = coachData;
      }

      if (!finalClient.module_id && !clientRow.module_id) {
        alert("Veuillez d'abord assigner un module à ce client.");
        return;
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


      const response = await fetch(templateInfo.url);
      if (!response.ok) throw new Error(`Fetch template error: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();

      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      const fallbackNomFormateur = 'Nom du formateur non renseigné';
      doc.setData({
        nom: theCoach.nom || fallbackNomFormateur,
        nom_formateur: theCoach.nom || fallbackNomFormateur,
        raison_sociale: theCoach.nom || fallbackNomFormateur,
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
      });

      doc.render();
      const out = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      // Save as file for manual check, then upload
      const safeNomClient = (finalClient.nom_complet || clientRow.nom || 'Client').replace(/\s+/g, '_');
      const finalFileName = `${type}_${safeNomClient}_final.docx`;
      saveAs(out, finalFileName);

      // Auto-upload the result too
      const { error: uploadError } = await supabase.storage.from('documents').upload(`${Date.now()}_${finalFileName}`, out);
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(`${Date.now()}_${finalFileName}`);
        await supabase.from('documents').insert([{
          nom: `${type === 'contrat' ? 'Contrat' : 'Document'} - ${finalClient.nom_complet || finalClient.nomcomplet_client || clientRow.nom}`,
          type_document: 'Autre',
          url: publicUrl,
          user_id: clientRow.id,
          visible_client: true,
          visible_formateur: true
        }]);

        await fetchDocuments();
        alert(`Document "${finalFileName}" généré et archivé.`);
      }
    } catch (error) {
      console.error("Docx Error:", error);
      alert("Erreur lors de la génération du document Word.");
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
        alert("Erreur upload: " + uploadError.message);
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
      alert('Erreur Doc : ' + error.message);
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
      .update(updateColumn)
      .eq('id', docId);

    if (error) {
      alert("Erreur signature: " + error.message);
      // rollback state en cas d'erreur
      await fetchDocuments();
    }
  };

  const updateDateSeance = async (docId, date) => {
    setDocuments(documents.map(d => d.id === docId ? { ...d, date_seance: date } : d));
    const { error } = await supabase.from('documents').update({ date_seance: date }).eq('id', docId);
    if (error) {
      console.error("Erreur update date seance", error);
      alert("Erreur lors de l'enregistrement de la date.");
      await fetchDocuments();
    }
  };

  const handleSignatureSave = async (dataUrl) => {
    if (!signingDocId) return;
    await handleSignDocument(signingDocId, userRole === 'client' ? 'client' : 'formateur', dataUrl);
    setSigningDocId(null);
  };

  const handleDownloadPDF = async (doc) => {
    if (doc && doc.id) {
      const urlToDownload = doc.url_signed_pdf || doc.url;
      if (!urlToDownload) return alert("Aucun fichier à télécharger");

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
        alert('Impossible de générer le PDF signé. Vérifiez la console.');
      }
    } else {
      alert('Simulation : Téléchargement du bilan...');
    }
  };



  // --- Chargement des données au lancement (Supabase) ---
  useEffect(() => {
    fetchUtilisateurs();
    fetchDocuments();
    fetchModules();
    fetchSessions();
    fetchPedagogicalResources();

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
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          console.log('Auth user après SetPassword:', user, authError);
          
          if (user && user.email) {
            // Chercher le rôle dans la base de données
            const { data: userData, error: dbError } = await supabase
              .from('utilisateurs')
              .select('role, id')
              .eq('email', user.email)
              .single();
            
            console.log('DB user data:', userData, dbError);
            
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
          // On ne fait pas de log out car l'utilisateur est nouvellement authentifié
          // mais on peut signer la session out pour forcer un vrain login, ou juste le renvoyer
          await supabase.auth.signOut();
          window.history.replaceState(null, '', '/');
          setIsResetPassword(false);
          setResetSuccessMsg("Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.");
        }} 
      />
    );
  }

  if (!userRole) {
    return <LoginView handleLogin={handleLogin} supabase={supabase} successMessage={resetSuccessMsg} />;
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
              <button onClick={() => { setActiveTab('modélothèque'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'modélothèque' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <FileText className="w-5 h-5 mr-3" /> Modélothèque
              </button>
              <button onClick={() => { setActiveTab('modules'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'modules' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
                <Settings className="w-5 h-5 mr-3" /> Modules
              </button>
            </>
          )}

          {userRole === 'formateur' && (
            <button onClick={() => { setActiveTab('clients'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'clients' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
              <Users className="w-5 h-5 mr-3" /> Mes Clients
            </button>
          )}

          {userRole === 'client' && (
            <>
              <button onClick={() => { setActiveTab('accueil'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'accueil' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><LayoutDashboard className="w-5 h-5 mr-3" /> Accueil</button>
              <button onClick={() => { setActiveTab('mes_seances'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'mes_seances' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><FileText className="w-5 h-5 mr-3" /> Mes Séances</button>
              <button onClick={() => { setActiveTab('bilan'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'bilan' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><Users className="w-5 h-5 mr-3" /> Mon bilan</button>
              <button onClick={() => { setActiveTab('exercices'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'exercices' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><Plus className="w-5 h-5 mr-3" /> Exercices</button>
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
            <div className="text-right mr-2">
              <p className="text-sm font-bold text-gray-800 leading-tight">
                {userRole === 'admin' && "Profil Admin"}
                {userRole === 'formateur' && (formateurs.find(f => f.id === currentUserId)?.nom || "Coach")}
                {userRole === 'client' && (clients.find(c => c.id === currentUserId)?.nom || "Bénéficiaire")}
              </p>
            </div>
            <div 
              onClick={() => setActiveTab('profil')}
              className="w-10 h-10 rounded-full bg-indigo-100 border-2 border-indigo-200 flex items-center justify-center font-bold text-sm text-indigo-700 shadow-sm cursor-pointer hover:bg-indigo-600 hover:text-white transition-all transform hover:scale-105"
            >
              {userRole === 'admin' ? "AD" : (userRole === 'formateur' ? "CH" : "CL")}
            </div>
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
          />}
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
            setIsInviteModalOpen={setIsInviteModalOpen}
            pedagogicalResources={pedagogicalResources}
            fetchSessions={fetchSessions}
            documents={documents}
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
            supabase={supabase}
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
          />}
          {activeTab === 'accueil' && <AccueilView setActiveTab={setActiveTab} clientProgress={currentUserId ? Math.min(100, Math.round(((clients.find(c => c.id === currentUserId)?.seances_effectuees || 0) / (clients.find(c => c.id === currentUserId)?.seances_totales || 10)) * 100)) : 0} />}
          {activeTab === 'mes_seances' && <SessionsView sessions={sessions} signSession={signSession} currentUserId={currentUserId} userRole={userRole} />}
          {activeTab === 'bilan' && <BilanView handleDownloadPDF={handleDownloadPDF} />}
          {activeTab === 'exercices' && <ExercicesView setActiveTab={setActiveTab} />}
          {activeTab === 'modélothèque' && <DocumentsView
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
            documentTemplates={documentTemplates}
            handleUploadDocxTemplate={handleUploadDocxTemplate}
            newTemplateName={newTemplateName}
            setNewTemplateName={setNewTemplateName}
          />}
          {activeTab === 'ressources' && userRole === 'formateur' && <RessourcesView pedagogicalResources={pedagogicalResources} supabase={supabase} />}

          {activeTab === 'set-password' && <SetPasswordView supabase={supabase} onComplete={() => setActiveTab('accueil')} />}
        </main>
      </div>

      {/* Modals Qualiopi */}
      <SignatureModal
        isOpen={signingDocId !== null}
        onClose={() => setSigningDocId(null)}
        onSave={handleSignatureSave}
      />

      <SignatureModal
        isOpen={signingSessionId !== null}
        onClose={() => setSigningSessionId(null)}
        onSave={(signature) => handleSessionSignatureSave(signingSessionId, signature)}
      />

      <DocumentViewerModal
        isOpen={viewingDocId !== null}
        document={documents.find(d => d.id === viewingDocId)}
        onClose={() => setViewingDocId(null)}
      />

      <InviteModal 
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInviteUser}
        isAddingUser={isAddingUser}
        formateurs={formateurs}
      />

    </div>
  );
}

const FormateurDetailView = ({ formateur, onBack, supabase, fetchUtilisateurs }) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [legalInfo, setLegalInfo] = React.useState({
    nom: formateur.nom || '',
    formateur_siret: formateur.formateur_siret || formateur.siret || '',
    formateur_nda: formateur.formateur_nda || formateur.nda || '',
    adresse_formateur: formateur.adresse_formateur || formateur.adresse_pro || formateur.adresse_client || '',
    email: formateur.email || '',
    telephone: formateur.telephone || ''
  });

  const handleSave = async () => {
    setIsSaving(true);
    const { error } = await supabase
      .from('utilisateurs')
      .update({
        nom: legalInfo.nom,
        formateur_siret: legalInfo.formateur_siret,
        formateur_nda: legalInfo.formateur_nda,
        adresse_formateur: legalInfo.adresse_formateur,
        email: legalInfo.email,
        telephone: legalInfo.telephone
      })
      .eq('id', formateur.id);

    if (error) {
      alert("Erreur lors de la sauvegarde : " + error.message);
    } else {
      await fetchUtilisateurs();
      alert("Informations légales enregistrées !");
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
                  value={legalInfo.nom} onChange={e => setLegalInfo({...legalInfo, nom: e.target.value})} placeholder="Ex: Matthys Coaching EURL" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">SIRET</label>
                  <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" 
                    value={legalInfo.formateur_siret} onChange={e => setLegalInfo({...legalInfo, formateur_siret: e.target.value})} placeholder="14 chiffres" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">NDA (Qualiopi)</label>
                  <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" 
                    value={legalInfo.formateur_nda} onChange={e => setLegalInfo({...legalInfo, formateur_nda: e.target.value})} placeholder="N° Déclaration" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Plus className="text-indigo-500" /> Coordonnées & Contact
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Adresse Professionnelle</label>
                <textarea rows="2" className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" 
                  value={legalInfo.adresse_formateur} onChange={e => setLegalInfo({...legalInfo, adresse_formateur: e.target.value})} placeholder="Adresse complète du siège" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email</label>
                  <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" 
                    value={legalInfo.email} onChange={e => setLegalInfo({...legalInfo, email: e.target.value})} placeholder="Email pro" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Téléphone</label>
                  <input className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" 
                    value={legalInfo.telephone} onChange={e => setLegalInfo({...legalInfo, telephone: e.target.value})} placeholder="06..." />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex justify-end">
          <button onClick={handleSave} disabled={isSaving} className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 px-10 rounded-2xl shadow-xl transition-all flex items-center gap-3 disabled:opacity-50">
            <Save size={20} />
            {isSaving ? 'Enregistrement...' : 'Enregistrer les informations légales'}
          </button>
        </div>
      </div>
    </div>
  );
};

