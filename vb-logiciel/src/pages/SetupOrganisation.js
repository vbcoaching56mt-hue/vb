import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClientConfig';
import { BENEFICIAIRE_MSG } from './Signup';

const SetupOrganisationPage = () => {
  const [status, setStatus] = useState('loading'); // loading | creating | error | noMeta
  const [error, setError] = useState('');
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [sessionRef, setSessionRef] = useState(null);
  const [estOrganisme, setEstOrganisme] = useState(false);
  const [beneficiaireEmail, setBeneficiaireEmail] = useState('');

  const callSetupEdgeFunction = async (session, orgName, adminName) => {
    const res = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/setup-organisation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ orgName, adminName })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Erreur lors de la création');
    return result;
  };

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
    // AJOUT (2026-10-01) : un bénéficiaire ne doit jamais devenir administrateur d'un nouvel organisme
    // (voir Signup.js) — cas d'un compte créé avant ce correctif, qui confirmerait son email maintenant.
    const { data: isBeneficiaire } = await supabase.rpc('email_est_beneficiaire', { p_email: session.user.email || '' });
    if (isBeneficiaire === true) {
      setError(BENEFICIAIRE_MSG);
      setBeneficiaireEmail(session.user.email || '');
      setStatus('beneficiaire');
      return;
    }
    const meta = session.user.user_metadata || {};
    const orgNameMeta = (meta.org_name || '').trim();
    const adminNameMeta = (meta.admin_name || '').trim();

    if (orgNameMeta && adminNameMeta) {
      setStatus('creating');
      try {
        const result = await callSetupEdgeFunction(session, orgNameMeta, adminNameMeta);
        if (result.alreadyExists || result.success) {
          window.location.replace('/');
        }
      } catch (err) {
        setError(err.message || 'Une erreur est survenue.');
        setStatus('error');
      }
    } else {
      setSessionRef(session);
      setStatus('noMeta');
    }
  };

  const handleManualCreate = async (e) => {
    e.preventDefault();
    if (!estOrganisme) { setError("Cochez la case confirmant que vous créez l'espace d'un organisme de formation."); return; }
    setStatus('creating');
    try {
      await callSetupEdgeFunction(sessionRef, orgName.trim(), adminName.trim());
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
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse" style={{background:'#100524'}}><img src="/logo-mark.png" alt="SkorUp" className="w-9 h-9 object-contain" /></div>
          <p className="text-gray-500 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (status === 'creating') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse" style={{background:'#100524'}}><img src="/logo-mark.png" alt="SkorUp" className="w-9 h-9 object-contain" /></div>
          <p className="text-gray-900 font-bold text-lg mb-1">Création de votre espace...</p>
          <p className="text-gray-400 text-sm">Quelques secondes</p>
        </div>
      </div>
    );
  }

  // AJOUT (2026-10-12) : un bénéficiaire connecté qui arrive ici (compte de connexion pas encore relié à
  // sa fiche) voit un écran clair — jamais le formulaire de création d'organisme ni une « erreur ».
  if (status === 'beneficiaire') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{background:'#100524'}}><img src="/logo-mark.png" alt="SkorUp" className="w-12 h-12 object-contain" /></div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-3">Votre accès doit être réactivé</h1>
          <p className="text-gray-600 text-sm mb-4">
            L'adresse <strong>{beneficiaireEmail}</strong> est bien enregistrée comme bénéficiaire : vous n'avez pas besoin de créer d'espace.
          </p>
          <p className="text-gray-600 text-sm mb-6 bg-violet-50 border border-violet-100 rounded-xl p-3 text-left">
            Demandez à votre organisme de formation de cliquer sur <strong>« Renvoyer le lien »</strong> depuis votre fiche.
            Vous recevrez un email : cliquez sur le lien pour créer votre mot de passe et accéder à votre espace.
          </p>
          <button
            onClick={async () => {
              try { await supabase.auth.signOut(); } catch (e) { /* session déjà invalide, on ignore */ }
              window.location.replace('/');
            }}
            className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-md text-center border border-gray-100">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{background:'#100524'}}><img src="/logo-mark.png" alt="SkorUp" className="w-12 h-12 object-contain" /></div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-3">Une erreur est survenue</h1>
          <p className="text-red-500 text-sm bg-red-50 p-3 rounded-xl mb-6">{error}</p>
          <button onClick={() => window.location.reload()} className="w-full bg-gray-900 text-white font-bold py-4 rounded-2xl mb-3">
            Réessayer
          </button>
          <button
            onClick={async () => {
              try { await supabase.auth.signOut(); } catch (e) { /* session déjà invalide, on ignore */ }
              window.location.replace('/');
            }}
            className="w-full text-sm font-bold text-violet-600 hover:text-violet-700 py-2"
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
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg" style={{background:'#100524'}}><img src="/logo-mark.png" alt="SkorUp" className="w-12 h-12 object-contain" /></div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-1 text-center">Finaliser l'espace de votre organisme</h1>
        <p className="text-gray-500 mb-4 text-center text-sm">Renseignez votre organisme de formation pour activer votre compte.</p>
        <div className="mb-6 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <strong>Vous êtes bénéficiaire ou formateur ?</strong> Ne remplissez pas ce formulaire : demandez à votre organisme de
          formation de vous renvoyer votre lien de connexion.
          <button
            type="button"
            onClick={async () => { try { await supabase.auth.signOut(); } catch (err) { /* ignore */ } window.location.replace('/?premiere-connexion=1'); }}
            className="block mt-2 font-bold underline"
          >
            Je suis bénéficiaire : retour à la connexion
          </button>
        </div>
        <form onSubmit={handleManualCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Nom de l'organisme</label>
            <input type="text" required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="ex : Mon Organisme Formation" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-600 transition-all" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1.5">Votre nom complet</label>
            <input type="text" required value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="ex : Marie Dupont" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-600 transition-all" />
          </div>
          <label className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 cursor-pointer">
            <input type="checkbox" checked={estOrganisme} onChange={e => setEstOrganisme(e.target.checked)} className="mt-0.5 w-4 h-4 accent-violet-600" />
            <span className="text-xs text-gray-700">Je crée l'espace <strong>d'un organisme de formation</strong> (je ne suis pas bénéficiaire d'un accompagnement).</span>
          </label>
          {error && <p className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{error}</p>}
          <button type="submit" disabled={!estOrganisme} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg transition-all disabled:opacity-50">
            Créer l'espace de mon organisme
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupOrganisationPage;
