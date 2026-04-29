import React, { useState } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

// --- Icônes simulées (remplaçables par lucide-react ou heroicons) ---
const HomeIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>;
const UserIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>;
const ClipboardIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>;
const FolderIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>;
const ChatIcon = () => <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>;

// --- Données du Graphique Ancres de Carrière (Profil Expert Stabilité) ---
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

export default function VBCoachingApp() {
  const [activeTab, setActiveTab] = useState('bilan'); // Par défaut sur "Mon bilan"
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  // --- COMPOSANTS DE L'INTERFACE PRINCIPALE ---

  // Sidebar (Menu latéral Gris Anthracite)
  const Sidebar = () => (
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-gray-300 transition-transform transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static md:flex-shrink-0 flex flex-col`}>
      {/* Header Logo */}
      <div className="flex items-center justify-between h-20 px-6 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center mr-3 font-bold text-white shadow-lg">VB</div>
          <span className="text-xl font-bold text-white tracking-wide">Coaching</span>
        </div>
        <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-gray-400 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
        <button onClick={() => setActiveTab('accueil')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'accueil' ? 'bg-rose-500 text-white shadow-md' : 'hover:bg-gray-800 hover:text-white'}`}>
          <HomeIcon /> <span className="font-medium">Accueil</span>
        </button>
        <button onClick={() => setActiveTab('bilan')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'bilan' ? 'bg-rose-500 text-white shadow-md' : 'hover:bg-gray-800 hover:text-white'}`}>
          <UserIcon /> <span className="font-medium">Mon bilan</span>
        </button>
        <button onClick={() => setActiveTab('exercices')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 cursor-not-allowed opacity-75`}>
          <ClipboardIcon /> <span className="font-medium">Exercices</span>
        </button>
        <button onClick={() => setActiveTab('documents')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 cursor-not-allowed opacity-75`}>
          <FolderIcon /> <span className="font-medium">Documents</span>
        </button>
        <button onClick={() => setActiveTab('messagerie')} className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 cursor-not-allowed opacity-75`}>
          <ChatIcon /> <span className="font-medium">Messagerie</span>
        </button>
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center bg-gray-800 rounded-xl p-3">
          <div className="w-10 h-10 rounded-full bg-gray-600 border-2 border-gray-500 overflow-hidden">
            {/* Placeholder avatar */}
            <svg className="w-full h-full text-gray-400 mt-1" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">John Client</p>
            <p className="text-xs text-gray-400">Bénéficiaire</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Vue : Mon Bilan (Page principale demandée)
  const BilanView = () => (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Espace Connaissance de soi</h1>
      <p className="text-gray-500 text-lg">Retrouvez ici la synthèse de vos évaluations et l'avancement de votre réflexion professionnelle.</p>

      {/* Row 1 : Intérêts (RIASEC ou équivalent) & Graphique Ancres */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        
        {/* Module : Mes Intérêts (Cartes cliquables) */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
             <span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span>
             Mes Intérêts Dominants
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Card 1 */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 cursor-pointer hover:bg-indigo-100 transition-colors group">
              <div className="w-12 h-12 bg-indigo-500 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              </div>
              <h3 className="font-bold text-indigo-900 text-lg">Conventionnel</h3>
              <p className="text-xs text-indigo-700 mt-1">Organisation, traitement de données, précision.</p>
            </div>
            {/* Card 2 */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 cursor-pointer hover:bg-emerald-100 transition-colors group">
              <div className="w-12 h-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
              </div>
              <h3 className="font-bold text-emerald-900 text-lg">Investigateur</h3>
              <p className="text-xs text-emerald-700 mt-1">Analyse, résolution de problèmes complexes.</p>
            </div>
          </div>
          <button className="mt-6 w-full py-3 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-100 transition-colors text-sm">
            Voir le détail du test RIASEC
          </button>
        </div>

        {/* Module : Ancres de Carrière (Radar Chart) */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col items-center">
           <div className="w-full flex justify-between items-start mb-2">
            <h2 className="text-xl font-bold text-gray-800 flex items-center">
               <span className="w-2 h-6 bg-rose-500 rounded-full mr-3"></span>
               Mes Ancres de Carrière
            </h2>
            <span className="bg-rose-100 text-rose-800 text-xs font-semibold px-2.5 py-1 rounded-full">Testé</span>
          </div>
          
          <div className="w-full flex-1 min-h-[250px] relative -ml-4">
             {/* Utilisation de Recharts avec couleur Rose inspirée du design Canva */}
             <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
                <PolarGrid stroke="#f3f4f6" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 500 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Radar
                  name="Score"
                  dataKey="A"
                  stroke="#f43f5e" // Rose-500
                  strokeWidth={3}
                  fill="#fb7185" // Rose-400
                  fillOpacity={0.4}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full">
            <p className="text-sm text-gray-600 text-center bg-gray-50 py-2 rounded-lg">Dominantes : <strong className="text-gray-900">Sécurité (5.8)</strong> et <strong className="text-gray-900">Expertise (5.5)</strong></p>
          </div>
        </div>
        
      </div>

      {/* Row 2 : Mon Projet Pro (Synthèse) */}
      <div className="mt-8 bg-white rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-8 py-5">
           <h2 className="text-xl font-bold text-white flex items-center">
             <svg className="w-6 h-6 mr-3 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
             Synthèse de mon Projet Professionnel
            </h2>
        </div>
        
        <div className="p-8">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-lg flex">
             <svg className="w-6 h-6 text-yellow-500 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
             <p className="text-sm text-yellow-800">Votre projet est actuellement en cours de définition avec votre consultant. Vous pouvez utiliser cet espace pour noter vos idées principales.</p>
          </div>

          <div className="relative">
            <textarea 
              className="w-full h-48 p-5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none text-gray-700 leading-relaxed font-serif"
              placeholder="Exemple : Je souhaite m'orienter vers un poste d'Expert Technique, de préférence en contrat à durée indéterminée dans un grand groupe. Je ne souhaite pas forcément manager une équipe humaine, mais j'aurais besoin d'autonomie dans la réalisation de mes tâches..."
              defaultValue="Suite à mes résultats, mon objectif principal est de trouver un rôle d'Expert (Tech Lead / Référent) qui garantit la stabilité de l'emploi (CDI, Grande structure)."
            />
            <button className="absolute bottom-4 right-4 bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl font-medium shadow-md transition-colors text-sm flex items-center">
              Sauvegarder
            </button>
          </div>
        </div>
      </div>

    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Mobile Header (Visible uniquement sur petits écrans) */}
        <header className="md:hidden bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between z-10">
          <button onClick={() => setMobileMenuOpen(true)} className="text-gray-500 hover:text-gray-700">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div className="text-lg font-bold text-gray-900">VB Coaching</div>
          <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-sm">JC</div>
        </header>

        {/* Header Desktop (Bandeau de bienvenue inspiré des maquettes) */}
        <header className="hidden md:flex bg-white px-10 py-6 border-b border-gray-100 justify-between items-center z-10 shadow-sm">
           <div>
             <h2 className="text-2xl font-bold text-gray-800">Bonjour John,</h2>
             <p className="text-sm text-gray-500 mt-1">Vous êtes en <span className="text-rose-600 font-semibold border border-rose-200 bg-rose-50 px-2 py-0.5 rounded ml-1">Phase 2 : Sélection structurée</span></p>
           </div>
           
           <div className="flex items-center space-x-6">
              <button className="relative text-gray-400 hover:text-gray-600 transition-colors">
                 <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                 <span className="absolute top-0 right-0 block w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
              </button>
           </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50/50 p-6 md:p-10">
          <div className="max-w-6xl mx-auto">
             {activeTab === 'bilan' ? <BilanView /> : (
               <div className="flex flex-col items-center justify-center h-full pt-32 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-600">Cette page est en cours de construction</h2>
                  <p className="text-gray-500 mt-2 max-w-md">L'onglet {activeTab} sera développé dans la prochaine itération. Veuillez cliquer sur "Mon Bilan".</p>
               </div>
             )}
          </div>
        </main>
      </div>
    </div>
  );
}
