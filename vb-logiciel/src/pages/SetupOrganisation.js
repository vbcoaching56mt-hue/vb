import React, { useState, useEffect } from 'react';
import { supabase, supabaseAdmin } from '../supabaseClientConfig';

const initDefaultTemplatesForOrg = async (orgId) => {
  const { data: module } = await supabaseAdmin.from('modules')
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
    const { data: tpl } = await supabaseAdmin.from('module_session_templates')
      .insert([{ module_id: module.id, titre: templates[i], ordre: i + 1 }])
      .select().single();
    if (tpl) {
      await supabaseAdmin.from('module_step_resources').insert([{
        template_id: tpl.id, titre: 'Émargement de présence', type: 'signature', ordre: 1,
        metadata: { requiresClientSignature: true, requiresTrainerSignature: false }
      }]);
    }
  }
};

const createOrgAndProfile = async (session, orgName, adminName) => {
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organisations')
    .insert([{ nom: orgName }])
    .select()
    .single();
  if (orgError) throw orgError;

  const { error: userError } = await supabaseAdmin.from('utilisateurs').insert([{
    nom: adminName,
    email: session.user.email,
    role: 'admin',
    organisation_id: org.id
  }]);
  if (userError) throw userError;

  await initDefaultTemplatesForOrg(org.id);
};

const SetupOrganisationPage = () => {
  const [status, setStatus] = useState('loading'); // loading | creating | error | noMeta
  const [error, setError] = useState('');
  // Fallback form state (si métadonnées absentes)
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [sessionRef, setSessionRef] = useState(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await handleSession(session);
      } else {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_, newSession) => {
          if (newSession) {
            subscription.unsubscribe();
            await handleSession(newSession);
          }
        });
      }
    };
    init();
  }, []);

  const handleSession = async (session) => {
    // Vérifier si profil déjà existant
    const { data: existing } = await supabaseAdmin
      .from('utilisateurs').select('id').eq('email', session.user.email).maybeSingle();
    if (existing) {
      window.location.replace('/');
      return;
    }

    const meta = session.user.user_metadata || {};
    const orgName = (meta.org_name || '').trim();
    const adminName = (meta.admin_name || '').trim();

    if (orgName && adminName) {
      // Métadonnées disponibles → création automatique silencieuse
      setStatus('creating');
      try {
        await createOrgAndProfile(session, orgName, adminName);
        window.location.replace('/');
      } catch (err) {
        setError(err.message || 'Une erreur est survenue.');
        setStatus('error');
      }
    } else {
      // Métadonnées absentes (ancien compte) → afficher formulaire minimal
      setSessionRef(session);
      setStatus('noMeta');
    }
  };

  const handleManualCreate = async (e) => {
    e.preventDefault();
    setStatus('creating');
    try {
      await createOrgAndProfile(sessionRef, orgName.trim(), adminName.trim());
      window.location.replace('/');
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
      setStatus('error');
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-4 animate-pulse">VB</div>
          <p className="text-gray-500 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (status === 'creating') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-4 animate-pulse">VB</div>
          <p className="text-gray-900 font-bold text-lg mb-1">Création de votre espace...</p>
          <p className="text-gray-400 text-sm">Quelques secondes</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100">
          <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6">VB</div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-3">Une erreur est survenue</h1>
          <p className="text-red-500 text-sm bg-red-50 p-3 rounded-xl mb-6">{error}</p>
          <button onClick={() => window.location.reload()} className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // Fallback : métadonnées absentes, formulaire minimal
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md border border-gray-100">
        <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6 shadow-lg shadow-rose-500/30">VB</div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1 text-center">Finaliser votre espace</h1>
        <p className="text-gray-500 mb-8 text-center text-sm">Renseignez votre organisme pour activer votre compte.</p>
        <form onSubmit={handleManualCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Nom de l'organisme</label>
            <input type="text" required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="ex : Mon Organisme Formation" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Votre nom complet</label>
            <input type="text" required value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="ex : Marie Dupont" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all" />
          </div>
          {error && <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{error}</p>}
          <button type="submit" className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all">
            Créer mon espace
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupOrganisationPage;
