import React, { useState } from 'react';
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

const SignupPage = () => {
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
      // 1. Créer l'organisation en premier (service role → bypass RLS)
      const { data: org, error: orgError } = await supabaseAdmin
        .from('organisations')
        .insert([{ nom: orgName.trim() }])
        .select()
        .single();
      if (orgError) throw orgError;

      // 2. Créer le compte Auth (emailRedirectTo → redirige vers l'app après confirmation)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin + '/'
        }
      });
      if (authError) {
        // Rollback : supprimer l'org créée si l'auth échoue
        await supabaseAdmin.from('organisations').delete().eq('id', org.id);
        throw authError;
      }

      // 3. Créer l'admin dans utilisateurs (service role → bypass RLS)
      const { error: userError } = await supabaseAdmin.from('utilisateurs').insert([{
        nom: adminName.trim(),
        email: email.trim(),
        role: 'admin',
        organisation_id: org.id
      }]);
      if (userError) throw userError;

      // 4. Injecter les templates par défaut
      await initDefaultTemplatesForOrg(org.id);

      if (authData.session) {
        window.location.replace('/');
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
          <p className="text-gray-500 mb-6">
            Un lien de confirmation a été envoyé à <strong>{email}</strong>.
            Cliquez dessus pour activer votre compte et accéder à votre espace.
          </p>
          <button
            onClick={() => window.location.replace('/')}
            className="text-sm font-bold text-rose-500 hover:text-rose-600"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md border border-gray-100">
        <div className="w-20 h-20 bg-rose-500 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-6 shadow-lg shadow-rose-500/30">VB</div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1 text-center">Créer votre espace</h1>
        <p className="text-gray-500 mb-8 text-center text-sm">Votre organisme de formation en quelques secondes.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Adresse email</label>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com"
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Mot de passe</label>
            <input
              type="password" required value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Confirmer le mot de passe</label>
            <input
              type="password" required value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Répéter le mot de passe"
              className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition-all"
            />
          </div>

          {error && <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{error}</p>}

          <button
            type="submit" disabled={isLoading}
            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? 'Création en cours...' : 'Créer mon espace'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Déjà inscrit ?{' '}
          <button
            onClick={() => window.location.replace('/')}
            className="font-bold text-rose-500 hover:text-rose-600"
          >
            Se connecter
          </button>
        </p>
      </div>
    </div>
  );
};

export default SignupPage;
