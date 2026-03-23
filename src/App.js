import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { PDFDocument } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip
} from 'recharts';

// --- Icônes ---
const HomeIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>;
const UserIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>;
const ClipboardIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>;
const FolderIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>;
const DownloadIcon = () => <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>;
const SettingsIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>;
const LogoutIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>;
const UsersIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>;
const PlusIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>;
const CheckIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>;

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
  const canvasRef = React.useRef(null);
  const [isDrawing, setIsDrawing] = React.useState(false);

  React.useEffect(() => {
    if (isOpen && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0f172a';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

const LoginView = ({ handleLogin }) => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
    <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100 animate-fade-in">
      <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6 shadow-lg shadow-rose-500/30">VB</div>
      <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Connexion à VB ERP</h1>
      <p className="text-gray-500 mb-8">Choisissez votre profil de démonstration pour basculer de vue.</p>
      
      <div className="space-y-4 text-left">
        <button onClick={() => handleLogin('admin')} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-gray-900 hover:shadow-md transition-all group">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center mr-3 group-hover:bg-gray-900 group-hover:text-white transition-colors"><SettingsIcon /></div>
            <div><p className="font-bold text-gray-900">Administrateur</p><p className="text-xs text-gray-500">Gestion globale</p></div>
          </div>
          <span className="text-gray-300 group-hover:text-gray-900">→</span>
        </button>
        <button onClick={() => handleLogin('formateur')} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-rose-500 hover:shadow-md transition-all group">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mr-3 group-hover:bg-rose-500 group-hover:text-white transition-colors"><UsersIcon /></div>
            <div><p className="font-bold text-gray-900">Formateur / Coach</p><p className="text-xs text-gray-500">Suivi des clients</p></div>
          </div>
          <span className="text-gray-300 group-hover:text-rose-500">→</span>
        </button>
        <button onClick={() => handleLogin('client')} className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all group">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mr-3 group-hover:bg-indigo-500 group-hover:text-white transition-colors"><UserIcon /></div>
            <div><p className="font-bold text-gray-900">Client / Bénéficiaire</p><p className="text-xs text-gray-500">Espace personnel</p></div>
          </div>
          <span className="text-gray-300 group-hover:text-indigo-500">→</span>
        </button>
      </div>
    </div>
  </div>
);

const AdminView = ({ 
  handleAddUser, newUserName, setNewUserName, 
  newUserEmail, setNewUserEmail, 
  newUserRole, setNewUserRole, isAddingUser, 
  clients, formateurs, assignFormateur, assignModule, documents,
  modules, moduleDocuments, handleAddModule, handleLinkDocument,
  newModuleName, setNewModuleName, newModuleSeances, setNewModuleSeances,
  newModDocName, setNewModDocName, newModDocType, setNewModDocType,
  newModDocFile, setNewModDocFile,
  addingToModuleId, setAddingToModuleId
}) => (
  <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
    <div>
       <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Dashboard Administrateur</h1>
       <p className="text-gray-500 text-lg mt-1">Gérez les formateurs, les clients et les assignations depuis la base de données.</p>
    </div>

    {/* Formulaire Ajouter Utilisateur */}
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-full -z-10"></div>
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
         <span className="w-2 h-6 bg-green-500 rounded-full mr-3"></span> Ajouter un Utilisateur
      </h2>
      <form onSubmit={handleAddUser} className="flex flex-col lg:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
          <input 
            type="text" 
            required
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder="Ex: Jean Dupont" 
            className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-green-500 focus:border-green-500 block w-full p-3 outline-none transition-all"
          />
        </div>
        <div className="flex-1 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input 
            type="email" 
            required
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="Ex: jean.dupont@email.com" 
            className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-green-500 focus:border-green-500 block w-full p-3 outline-none transition-all"
          />
        </div>
        <div className="w-full lg:w-48">
          <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
          <select 
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value)}
            className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-green-500 focus:border-green-500 block w-full p-3 outline-none"
          >
            <option value="client">Client</option>
            <option value="formateur">Formateur</option>
          </select>
        </div>
        <button 
          type="submit" 
          disabled={isAddingUser}
          className="w-full lg:w-auto bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl px-6 py-3 flex items-center justify-center transition-colors shadow-sm disabled:opacity-50"
        >
          <span className="mr-2"><PlusIcon /></span>
          {isAddingUser ? "Ajout..." : "Créer"}
        </button>
      </form>
    </div>

    {/* Table Clients */}
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
         <span className="w-2 h-6 bg-gray-900 rounded-full mr-3"></span> Gestion des Clients
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-sm text-gray-500">
              <th className="pb-3 font-medium">ID</th>
              <th className="pb-3 font-medium">Nom du Client</th>
              <th className="pb-3 font-medium">Statut</th>
              <th className="pb-3 font-medium">Module Assigné</th>
              <th className="pb-3 font-medium">Formateur Assigné</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(client => (
              <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-4 text-xs text-gray-400 font-bold">#{client.id}</td>
                <td className="py-4 font-bold text-gray-900 flex flex-col">
                  <span>{client.nom}</span>
                  <span className="text-xs text-gray-400 font-normal">{client.email}</span>
                </td>
                <td className="py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    client.status === 'Nouveau' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}>{client.status || 'Actif'}</span>
                </td>
                <td className="py-4">
                  <select 
                    value={client.module_id || ''} 
                    onChange={(e) => assignModule(client.id, e.target.value)}
                    className="bg-purple-50 border border-purple-100 text-purple-900 text-xs font-bold rounded-lg focus:ring-purple-500 focus:border-purple-500 block w-full p-2.5 outline-none"
                  >
                    <option value="">Aucun module</option>
                    {modules.map(m => (
                      <option key={m.id} value={m.id}>{m.nom}</option>
                    ))}
                  </select>
                </td>
                <td className="py-4">
                  <select 
                    value={client.formateur_id || ''} 
                    onChange={(e) => assignFormateur(client.id, e.target.value)}
                    className="bg-gray-50 border border-gray-200 text-gray-900 text-xs rounded-lg focus:ring-gray-500 focus:border-gray-500 block w-full p-2.5 outline-none"
                  >
                    <option value="">Non assigné</option>
                    {formateurs.map(f => (
                      <option key={f.id} value={f.id}>{f.nom}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan="4" className="py-8 text-center text-gray-500">Aucun client trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    {/* Liste Formateurs */}
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
         <span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span> Liste des Formateurs
      </h2>
      <ul className="space-y-6">
        {formateurs.map(f => {
          const sesClients = clients.filter(c => c.formateur_id === f.id);
          return (
          <li key={f.id} className="p-6 border border-gray-100 rounded-2xl bg-gray-50">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
               <div className="flex items-center">
                 <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mr-4 font-bold text-xl">{f.nom ? f.nom.charAt(0) : '?'}</div>
                 <div className="flex flex-col">
                   <span className="font-bold text-gray-900 text-lg">{f.nom}</span>
                   <span className="text-sm text-gray-500">{f.email}</span>
                 </div>
               </div>
               <span className="mt-2 md:mt-0 text-sm font-bold text-rose-700 bg-rose-100 px-4 py-1.5 rounded-full">
                 {sesClients.length} client(s)
               </span>
            </div>
            {sesClients.length > 0 && (
              <div className="mt-4 bg-white p-4 rounded-xl border border-gray-100 space-y-3">
                 <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Suivi Qualiopi des clients</h4>
                 {sesClients.map(c => {
                   const progress = Math.min(100, Math.round(((c.seances_effectuees || 0) / (c.seances_totales || 10)) * 100));
                   const docs = documents.filter(d => d.user_id === c.id);
                   const isSigned = (t) => docs.some(d => d.type_document === t && d.signe_par_client && d.signe_par_formateur);
                   return (
                     <div key={c.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 bg-gray-50 rounded-lg">
                       <div className="mb-3 md:mb-0">
                          <span className="font-bold text-sm text-gray-900 block">{c.nom}</span>
                          <div className="flex items-center mt-1">
                            <div className="w-24 h-1.5 bg-gray-200 rounded-full mr-2 overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${progress}%` }}></div></div>
                            <span className="text-xs font-bold text-gray-500">{progress}% ({c.seances_effectuees || 0}/{c.seances_totales || 10})</span>
                          </div>
                       </div>
                       <div className="flex flex-wrap gap-2">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded border ${isSigned('Contrat') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-500 border-red-200'}`}>Contrat</span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded border ${isSigned('Émargement') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-500 border-red-200'}`}>Émargement</span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded border ${isSigned('Évaluation') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-500 border-red-200'}`}>Évaluation</span>
                       </div>
                     </div>
                   );
                 })}
              </div>
            )}
          </li>
        )})}
        {formateurs.length === 0 && <li className="p-4 text-center text-gray-500">Aucun formateur trouvé.</li>}
      </ul>
    </div>

    {/* Configuration Modules */}
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
      <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
         <span className="w-2 h-6 bg-purple-500 rounded-full mr-3"></span> Ingénierie des Modules
      </h2>
      <form onSubmit={handleAddModule} className="flex flex-col md:flex-row gap-4 items-end mb-8 bg-gray-50 p-4 rounded-xl border border-gray-200">
         <div className="flex-1">
           <label className="block text-sm font-medium text-gray-700 mb-1">Nom du nouveau module</label>
           <input required type="text" value={newModuleName} onChange={e=>setNewModuleName(e.target.value)} placeholder="Ex: Bilan 24h" className="w-full p-2.5 rounded-lg border outline-none text-sm"/>
         </div>
         <div className="w-32">
           <label className="block text-sm font-medium text-gray-700 mb-1">Séances prévues</label>
           <input required type="number" min="1" value={newModuleSeances} onChange={e=>setNewModuleSeances(e.target.value)} className="w-full p-2.5 rounded-lg border outline-none text-sm"/>
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
                     <input required type="text" placeholder="Nom du document (Ex: Contrat)" value={newModDocName} onChange={e=>setNewModDocName(e.target.value)} className="w-full text-sm p-2 border border-gray-200 rounded-lg outline-none focus:border-purple-500" />
                     <input type="file" onChange={(e) => setNewModDocFile(e.target.files[0] || null)} className="w-full text-sm p-2 border border-gray-200 rounded-lg outline-none focus:border-purple-500 bg-gray-50 text-gray-700" accept=".pdf,image/*" />
                     <div className="flex gap-2">
                       <select value={newModDocType} onChange={e=>setNewModDocType(e.target.value)} className="flex-1 text-sm p-2 border border-gray-200 rounded-lg outline-none focus:border-purple-500">
                         <option value="Autre">Autre</option><option value="Contrat">Contrat</option><option value="Évaluation">Évaluation</option>
                       </select>
                       <button type="submit" className="bg-gray-900 text-white px-4 rounded-lg text-sm shrink-0 font-medium hover:bg-gray-800">Lier</button>
                       <button type="button" onClick={() => setAddingToModuleId(null)} className="text-gray-400 hover:text-gray-600 px-2 shrink-0">✕</button>
                     </div>
                  </form>
                ) : (
                  <button onClick={() => { setAddingToModuleId(mod.id); setNewModDocName(''); setNewModDocType('Contrat'); setNewModDocFile?.(null); }} className="text-xs font-bold text-purple-600 hover:text-white hover:bg-purple-600 flex items-center bg-white border border-purple-200 px-4 py-2 rounded-lg w-fit transition-all">+ Ajouter Doc. Type</button>
                )}
             </div>
           );
         })}
         {modules.length === 0 && <div className="text-gray-500 italic col-span-2">Créez votre premier module depuis le formulaire ci-dessus.</div>}
      </div>
    </div>
  </div>
);

const FormateurView = ({ 
  clients, formateurs, sessions, generateSessions, 
  updateSessionDate, signSession, modules 
}) => {
  const currentFormateurId = formateurs.length > 0 ? formateurs[0].id : null; 
  const assignedClients = clients.filter(c => c.formateur_id === currentFormateurId);
  const [expandedClientId, setExpandedClientId] = React.useState(null);

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
                  <div className="flex justify-between items-center mb-6">
                     <h4 className="font-bold text-gray-800 flex items-center">
                        <span className="w-2 h-5 bg-indigo-500 rounded-full mr-2"></span>
                        Planning des Séances - {assignedModule?.nom || 'Sans module'}
                     </h4>
                     {clientSessions.length === 0 && client.module_id && (
                        <button 
                          onClick={() => generateSessions(client)}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors"
                        >
                          Générer les 8 séances
                        </button>
                     )}
                  </div>

                  {clientSessions.length > 0 ? (
                    <div className="overflow-hidden rounded-2xl border border-gray-100">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest">
                          <tr>
                            <th className="px-4 py-3">Séance</th>
                            <th className="px-4 py-3">Date prévue</th>
                            <th className="px-4 py-3">Statut</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {clientSessions.sort((a,b) => a.numero_seance - b.numero_seance).map(session => (
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
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                                  session.statut === 'Signé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                                }`}>{session.statut}</span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                {session.statut !== 'Signé' ? (
                                  <button 
                                    onClick={() => signSession(session)}
                                    className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                                  >
                                    Émarger (Signer)
                                  </button>
                                ) : (
                                  <span className="text-green-500"><CheckIcon /></span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                       <p className="text-gray-400 text-sm italic">Aucune séance n'est encore enregistrée pour ce client.</p>
                       {!client.module_id && <p className="text-xs text-rose-500 mt-2 font-bold">⚠️ Assignez un module à ce client pour générer ses séances.</p>}
                    </div>
                  )}
               </div>
            )}
          </div>
        )}) : (
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
  newDocVisFormateur, setNewDocVisFormateur, isAddingDoc
}) => {
  const [selectedClientForDocs, setSelectedClientForDocs] = useState('');
  const [signingDocId, setSigningDocId] = useState(null);
  const [viewingDocId, setViewingDocId] = useState(null);

  const currentClientId = clients.length > 0 ? clients[0].id : null; 
  const isAdmin = userRole === 'admin';
  const isClient = userRole === 'client';
  const isFormateur = userRole === 'formateur';

  // Pour la démo, on simule que le visiteur client a l'ID du premier client (currentClientId).
  // S'il est client, il ne voit que ses docs ET ceux qui sont explicitement visible_client=true
  let displayedDocs = isAdmin ? documents : 
             isClient ? documents.filter(d => d.user_id === currentClientId && d.visible_client) :
             isFormateur ? documents.filter(d => d.visible_formateur) : [];

  if (isFormateur && selectedClientForDocs) {
     displayedDocs = displayedDocs.filter(d => d.user_id === selectedClientForDocs);
  }

  const handleSignatureSave = async (dataUrl) => {
     if (!signingDocId) return;
     await handleSignDocument(signingDocId, isClient ? 'client' : 'formateur', dataUrl);
     setSigningDocId(null);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
        {isClient ? "Mes Documents" : "Gestion Documentaire"}
      </h1>
      <p className="text-gray-500 text-lg">Consultez et {isClient ? 'signez vos' : 'vérifiez les'} fichiers légaux ou de synthèse.</p>

      {/* Formulaire Administrateur d'ajout de document */}
      {isAdmin && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden">
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
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 mt-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center">
             <span className="w-2 h-6 bg-gray-900 rounded-full mr-3"></span> Liste des Documents
          </h2>
          {isFormateur && (
            <div className="flex items-center gap-3">
               <span className="text-sm font-bold text-gray-500">Filtrer par client :</span>
               <select value={selectedClientForDocs} onChange={e=>setSelectedClientForDocs(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-gray-500 focus:border-gray-500 p-2 outline-none">
                  <option value="">Tous mes clients</option>
                  {clients.filter(c => c.formateur_id === (formateurs.length > 0 ? formateurs[0].id : null)).map(c => (
                     <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
               </select>
            </div>
          )}
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
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center mr-3 text-gray-500 shrink-0"><ClipboardIcon /></div>
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
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold w-max border ${
                            doc.signe_par_client ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'
                          }`}>
                            Client: {doc.signe_par_client ? '✓ Signé' : 'À signer'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold w-max border ${
                            doc.signe_par_formateur ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'
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

      {/* Modals */}
      <SignatureModal 
         isOpen={signingDocId !== null} 
         onClose={() => setSigningDocId(null)} 
         onSave={handleSignatureSave} 
      />
      
      <DocumentViewerModal 
         isOpen={viewingDocId !== null} 
         document={documents.find(d => d.id === viewingDocId)} 
         onClose={() => setViewingDocId(null)} 
      />
    </div>
  );
};

const AccueilView = ({ setActiveTab, clientProgress }) => (
  <div className="flex flex-col items-center justify-center pt-10 md:pt-20 animate-fade-in">
      <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg text-rose-500 mb-6 border border-gray-100">
          <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
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
          <p className="text-[10px] text-gray-400 mt-2 italic text-right">Mise à jour automatique après chaque émargement de séance.</p>
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

const SessionsView = ({ sessions, signSession, clients }) => {
  const currentClientId = clients.length > 0 ? clients[0].id : null;
  const mySessions = sessions.filter(s => s.client_id === currentClientId).sort((a, b) => a.numero_seance - b.numero_seance);

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Mes Séances d'Accompagnement</h1>
      <p className="text-gray-500 text-lg">Retrouvez le calendrier de vos 8 séances et signez vos émargements.</p>

      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-sm text-gray-500 uppercase tracking-widest font-bold">
                <th className="pb-4">Séance</th>
                <th className="pb-4">Date prévue</th>
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
                    {session.date ? new Date(session.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'À définir par le coach'}
                  </td>
                  <td className="py-5 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${
                      session.statut === 'Signé' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {session.statut === 'Signé' ? 'Signé ✓' : 'À signer'}
                    </span>
                  </td>
                  <td className="py-5 text-right">
                    {session.statut !== 'Signé' ? (
                      <button 
                        onClick={() => signSession(session)}
                        disabled={!session.date}
                        className={`px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition-all ${
                          session.date ? 'bg-rose-500 text-white hover:bg-rose-600 hover:shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Signer (Emarger)
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
            <div className="w-12 h-12 bg-indigo-500 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 shadow-sm transition-transform"><UserIcon/></div>
            <h3 className="font-bold text-indigo-900 text-lg">Conventionnel</h3>
            <p className="text-xs text-indigo-700 mt-1">Profil respectueux des normes.</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 hover:bg-emerald-100 transition-colors group">
            <div className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 shadow-sm transition-transform"><SettingsIcon/></div>
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

// ==========================================
// COMPOSANT PRINCIPAL
// ==========================================

export default function App() {
  // --- États Session et Navigation ---
  const [userRole, setUserRole] = useState(null); // 'admin' | 'formateur' | 'client' | null
  const [activeTab, setActiveTab] = useState('accueil');
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  // --- Supabase Database (États locaux mis à jour via DB) ---
  const [formateurs, setFormateurs] = useState([]);
  const [clients, setClients] = useState([]);
  const [documents, setDocuments] = useState([]);
  
  // États Modules Supabase
  const [modules, setModules] = useState([]);
  const [moduleDocuments, setModuleDocuments] = useState([]);
  
  // États formulaire "Ajouter un compte"
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('client');
  const [isAddingUser, setIsAddingUser] = useState(false);

  // États formulaire "Ingénierie Modules" (Admin)
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleSeances, setNewModuleSeances] = useState(1);
  const [newModDocName, setNewModDocName] = useState('');
  const [newModDocType, setNewModDocType] = useState('Contrat');
  const [sessions, setSessions] = useState([]);
  const [newModDocFile, setNewModDocFile] = useState(null);
  const [addingToModuleId, setAddingToModuleId] = useState(null);

  // États formulaire "Ajouter un document"
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState('Autre');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [newDocFile, setNewDocFile] = useState(null);
  const [newDocClientId, setNewDocClientId] = useState('');
  const [newDocVisClient, setNewDocVisClient] = useState(true);
  const [newDocVisFormateur, setNewDocVisFormateur] = useState(true);
  const [isAddingDoc, setIsAddingDoc] = useState(false);

  // --- Chargement des données au lancement (Supabase) ---
  useEffect(() => {
    fetchUtilisateurs();
    fetchDocuments();
    fetchModules();
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-génération de secours pour les clients sans sessions (ex: importations ou erreurs passées)
  useEffect(() => {
    // On ne lance l'auto-génération que si on a chargé les données et qu'on détecte un manque
    if (clients.length > 0 && modules.length > 0 && sessions.length > 0) {
      clients.forEach(client => {
        if (client.module_id && !sessions.some(s => s.client_id === client.id)) {
          console.log(`Auto-repair: Génération sessions pour ${client.nom}`);
          generateSessions(client);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, modules]);
 // On surveille clients et modules, sessions en lecture seule

  const fetchModules = async () => {
    const { data: mData, error: mErr } = await supabase.from('modules').select('*');
    if (!mErr && mData) setModules(mData);
    
    const { data: mdData, error: mdErr } = await supabase.from('module_documents').select('*');
    if (!mdErr && mdData) setModuleDocuments(mdData);
  };

  const fetchSessions = async () => {
    const { data, error } = await supabase.from('sessions').select('*');
    if (!error && data) setSessions(data);
  };

  const fetchUtilisateurs = async () => {
    const { data: usersData, error } = await supabase
      .from('utilisateurs')
      .select('id, nom, email, role, formateur_id, seances_effectuees, seances_totales, module_id');
      
    if (!error && usersData) {
      setClients(usersData.filter(u => u.role === 'client'));
      setFormateurs(usersData.filter(u => u.role === 'formateur'));
    } else if (error) {
      console.error("Erreur utilisateurs:", error);
    }
  };

  const fetchDocuments = async () => {
    // Récupérer les clés du nouveau schéma
    const { data: docsData, error } = await supabase
      .from('documents')
      .select('*');
    if (!error && docsData) setDocuments(docsData);
    else if (error) console.error("Erreur documents:", error);
  };

  // --- Actions Navigation ---
  const handleLogin = (role) => {
    setUserRole(role);
    if (role === 'admin') setActiveTab('dashboard_admin');
    if (role === 'formateur') setActiveTab('mes_clients');
    if (role === 'client') setActiveTab('accueil');
  };

  const handleLogout = () => {
    setUserRole(null);
    setActiveTab('accueil');
    setMobileMenuOpen(false);
  };

  // --- Actions Supabase : Utilisateurs ---
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    setIsAddingUser(true);
    
    const { data, error } = await supabase
      .from('utilisateurs')
      .insert([{ nom: newUserName, email: newUserEmail, role: newUserRole }])
      .select();
      
    if (!error && data && data[0]) {
      await fetchUtilisateurs(); 
      await fetchDocuments();
      setNewUserName('');
      setNewUserEmail('');
    } else {
      console.error("Erreur ajout user", error);
      alert('Erreur : ' + error?.message);
    }
    setIsAddingUser(false);
  };

  const assignModule = async (clientId, moduleId) => {
    const finalModuleId = moduleId ? Number(moduleId) : null;
    
    // Update module_id in database
    const { error: updateError } = await supabase
      .from('utilisateurs')
      .update({ module_id: finalModuleId })
      .eq('id', clientId);

    if (updateError) {
      console.error("Erreur assignation module:", updateError);
      return;
    }

    const client = clients.find(c => c.id === clientId);
    if (client && finalModuleId) {
      const assignedModule = modules.find(m => m.id === finalModuleId);
      
      if (assignedModule) {
        // 1. GÉNÉRATION DES SESSIONS
        await generateSessions(client);

        // 2. GÉNÉRATION DES DOCUMENTS TYPES
        const autoDocs = [];
        
        // Feuilles d'émargement selon seances_prevues
        for (let i = 1; i <= assignedModule.seances_prevues; i++) {
          autoDocs.push({
            nom: `${assignedModule.nom} - Feuille de présence (Séance ${i})`,
            type_document: 'Présence',
            user_id: client.id,
            visible_client: true, visible_formateur: true,
            signe_par_client: false, signe_par_formateur: false
          });
        }

        // Documents types du module (ex: Contrats, Bilans)
        const mDocs = moduleDocuments.filter(md => md.module_id === assignedModule.id);
        for (const mDoc of mDocs) {
          autoDocs.push({
            nom: `${assignedModule.nom} - ${mDoc.nom}`,
            type_document: mDoc.type_document,
            url: mDoc.url || null,
            user_id: client.id,
            visible_client: true, visible_formateur: true,
            signe_par_client: false, signe_par_formateur: false
          });
        }

        // Batch insert des documents générés
        if (autoDocs.length > 0) {
          const { error: autoError } = await supabase.from('documents').insert(autoDocs);
          if (autoError) console.error("Erreur gèn. auto docs:", autoError);
        }
      }
    }

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
    
    const newSessions = [];
    for (let i = 1; i <= module.seances_prevues; i++) {
       newSessions.push({
          client_id: client.id,
          module_id: module.id,
          numero_seance: i,
          nom: `${module.nom} - Séance ${i}`,
          statut: 'À venir'
       });
    }
    
    // On utilise insert direct car on n'a pas encore de RPC pour les sessions
    const { error } = await supabase.from('sessions').insert(newSessions);
    if (!error) {
       await fetchSessions();
       alert(`${module.seances_prevues} séances générées pour ${client.nom}.`);
    } else {
       console.error("Erreur génération séances :", error);
       alert("Erreur lors de la génération des séances : " + error.message);
    }
  };

  const updateSessionDate = async (sessionId, newDate) => {
    const { error } = await supabase.from('sessions').update({ date: newDate }).eq('id', sessionId);
    if (!error) await fetchSessions();
  };

  const signSession = async (session) => {
    const { error } = await supabase.from('sessions').update({ statut: 'Signé', date_signature: new Date().toISOString() }).eq('id', session.id);
    if (!error) {
       // On incrémente aussi les séances effectuées du client dans la table utilisateurs
       const client = clients.find(c => c.id === session.client_id);
       if (client) {
          const newEffectuees = (client.seances_effectuees || 0) + 1;
          const { error: updErr } = await supabase.from('utilisateurs').update({ seances_effectuees: newEffectuees }).eq('id', client.id);
          if (updErr) console.error("Erreur mise à jour séances_effectuees :", updErr);
          await fetchUtilisateurs();
       }
       await fetchSessions();
       alert(`Séance ${session.numero_seance} signée !`);
    }
  };

  const assignFormateur = async (userId, formateurId) => {
    const userIdParsed = userId;
    const formateurIdParsed = formateurId || null;
    
    // Validation simple pour UUID (string non vide)
    if (!userIdParsed) return;
    
    const { error } = await supabase
      .from('utilisateurs')
      .update({ formateur_id: formateurIdParsed })
      .eq('id', userIdParsed);

    if (!error) {
      setClients(clients.map(c => c.id === userIdParsed ? { ...c, formateur_id: formateurIdParsed } : c));
    } else {
      console.error("Erreur assignation", error);
      alert("Erreur: " + error.message);
    }
  };

  // --- Actions Supabase : Documents ---
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

  // Affichage du simulateur de connexion
  if (!userRole) {
    return <LoginView handleLogin={handleLogin} />;
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
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        
        <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
          {userRole === 'admin' && (
            <button onClick={() => { setActiveTab('dashboard_admin'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'dashboard_admin' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
              <SettingsIcon /> Dashboard Admin
            </button>
          )}

          {userRole === 'formateur' && (
            <button onClick={() => { setActiveTab('mes_clients'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'mes_clients' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
              <UsersIcon /> Mes Clients
            </button>
          )}

          {userRole === 'client' && (
            <>
              <button onClick={() => { setActiveTab('accueil'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'accueil' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><HomeIcon /> Accueil</button>
              <button onClick={() => { setActiveTab('mes_seances'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'mes_seances' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><ClipboardIcon /> Mes Séances</button>
              <button onClick={() => { setActiveTab('bilan'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'bilan' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><UserIcon /> Mon bilan</button>
              <button onClick={() => { setActiveTab('exercices'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'exercices' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}><PlusIcon /> Exercices</button>
            </>
          )}

          {(userRole === 'admin' || userRole === 'formateur' || userRole === 'client') && (
             <button onClick={() => { setActiveTab('documents'); setMobileMenuOpen(false); }} className={`w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 ${activeTab === 'documents' ? 'bg-rose-500 text-white shadow-lg' : 'hover:bg-gray-800 hover:text-white font-medium'}`}>
              <FolderIcon /> Documents
             </button>
          )}
        </nav>
        
        <div className="p-4 bg-gray-950 border-t border-gray-800">
           <button onClick={handleLogout} className="w-full flex items-center px-4 py-3.5 rounded-xl transition-all duration-200 hover:bg-red-500/10 hover:text-red-400 text-gray-400 font-medium">
             <LogoutIcon /> Déconnexion
           </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="md:hidden bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between z-10 w-full shrink-0">
          <button onClick={() => setMobileMenuOpen(true)} className="text-gray-500">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
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
                   {userRole === 'formateur' && "Connecté (Simulation)"}
                   {userRole === 'client' && "Connecté (Simulation)"}
                 </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center font-bold text-sm text-gray-600 shadow-sm">
                 {userRole === 'admin' ? "AD" : "DB"}
              </div>
           </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50/50 p-6 md:p-10 w-full h-full">
             {activeTab === 'dashboard_admin' && <AdminView 
                handleAddUser={handleAddUser} 
                newUserName={newUserName} 
                setNewUserName={setNewUserName} 
                newUserEmail={newUserEmail}
                setNewUserEmail={setNewUserEmail}
                newUserRole={newUserRole} 
                setNewUserRole={setNewUserRole} 
                isAddingUser={isAddingUser} 
                clients={clients} 
                formateurs={formateurs} 
                assignFormateur={assignFormateur} 
                assignModule={assignModule}
                documents={documents}
                modules={modules} moduleDocuments={moduleDocuments} handleAddModule={handleAddModule} handleLinkDocument={handleLinkDocument}
                newModuleName={newModuleName} setNewModuleName={setNewModuleName} newModuleSeances={newModuleSeances} setNewModuleSeances={setNewModuleSeances}
                newModDocName={newModDocName} setNewModDocName={setNewModDocName} newModDocType={newModDocType} setNewModDocType={setNewModDocType}
                newModDocFile={newModDocFile} setNewModDocFile={setNewModDocFile}
                addingToModuleId={addingToModuleId} setAddingToModuleId={setAddingToModuleId}
             />}
              {activeTab === 'mes_clients' && <FormateurView 
                clients={clients} 
                formateurs={formateurs} 
                sessions={sessions} 
                generateSessions={generateSessions} 
                updateSessionDate={updateSessionDate} 
                signSession={signSession} 
                modules={modules}
              />}
              {activeTab === 'accueil' && <AccueilView setActiveTab={setActiveTab} clientProgress={clients.length > 0 ? Math.min(100, Math.round(((clients[0].seances_effectuees || 0) / (clients[0].seances_totales || 10)) * 100)) : 0} />}
              {activeTab === 'mes_seances' && <SessionsView sessions={sessions} signSession={signSession} clients={clients} />}
              {activeTab === 'bilan' && <BilanView handleDownloadPDF={handleDownloadPDF} />}
              {activeTab === 'exercices' && <ExercicesView setActiveTab={setActiveTab} />}
             {activeTab === 'documents' && <DocumentsView 
                documents={documents} 
                clients={clients} 
                formateurs={formateurs}
                userRole={userRole} 
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
             />}
        </main>
      </div>
    </div>
  );
}
