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

const SetupOrganisationPage = () => {
  const [session, setSession] = useState(null);
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [alreadySetup, setAlreadySetup] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();

      if (!s) {
        // Pas encore authentifié — attendre la session (après clic sur lien email)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (newSession) {
            subscription.unsubscribe();
            await setupFromSession(newSession);
          }
        });
        setIsLoading(false);
        return;
      }

      await setupFromSession(s);
    };

    init();
  }, []);

  const setupFromSession = async (s) => {
    setSession(s);

    // Vérifier si l'utilisateur a déjà un profil dans utilisateurs
    const { data: existing } = await supabaseAdmin
      .from('utilisateurs')
      .select('id')
      .eq('email', s.user.email)
      .maybeSingle();

    if (existing) {
      setAlreadySetup(true);
      setIsLoading(false);
      return;
    }

    // Pré-remplir depuis les métadonnées Supabase Auth
    const meta = s.user.user_metadata || {};
    setOrgName(meta.org_name || '');
    setAdminName(meta.admin_name || s.user.email);
    setIsLoading(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      // Créer l'organisation
      const { data: org, error: orgError } = await supabaseAdmin
        .from('organisations')
        .insert([{ nom: orgName.trim() }])
        .select()
        .single();
      if (orgError) throw orgError;

      // Créer le profil admin
      const { error: userError } = await supabaseAdmin.from('utilisateurs').insert([{
        nom: adminName.trim(),
        email: session.user.email,
        role: 'admin',
        organisation_id: org.id
      }]);
      if (userError) throw userError;

      // Templates par défaut
      await initDefaultTemplatesForOrg(org.id);

      window.location.replace('/');
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-4 animate-pulse">VB</div>
          <p className="text-gray-500 text-sm">Chargement de votre espace...</p>
        </div>
      </div>
    );
  }

  if (alreadySetup) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100">
          <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6">VB</div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3">Espace déjà configuré</h1>
          <p className="text-gray-500 mb-6">Votre compte est déjà actif.</p>
          <button
            onClick={() => window.location.replace('/')}
            className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl"
          >
            Accéder à mon espace
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100">
          <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6">VB</div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3">Lien invalide ou expiré</h1>
          <p className="text-gray-500 mb-6">Veuillez vous inscrire à nouveau ou contacter le support.</p>
          <button
            onClick={() => window.location.replace('/signup')}
            className="w-full bg-rose-500 text-white font-bold py-4 rounded-2xl"
          >
            Retour à l'inscription
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md border border-gray-100">
        <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6 shadow-lg shadow-rose-500/30">VB</div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1 text-center">Finaliser votre espace</h1>
        <p className="text-gray-500 mb-8 text-center text-sm">Email confirmé. Créez maintenant votre organisme.</p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Nom de l'organisme</label>
            <input
              type="text" required value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="ex : Mon Organisme Formation"
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Votre nom complet</label>
            <input
              type="text" required value={adminName}
              onChange={e => setAdminName(e.target.value)}
              placeholder="ex : Marie Dupont"
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
            />
          </div>

          {error && <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{error}</p>}

          <button
            type="submit" disabled={isSaving}
            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all disabled:opacity-50"
          >
            {isSaving ? 'Création en cours...' : 'Créer mon espace'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupOrganisationPage;
