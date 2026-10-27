// Filet de sécurité de SkorUp.
// 1) Si une page plante pendant l'affichage, on montre un écran de secours
//    (au lieu d'une page blanche) avec « Recharger » / « Revenir à l'accueil ».
// 2) L'erreur est enregistrée dans la table Supabase « erreurs_app »
//    (écriture seule : personne ne peut la relire depuis l'application).
// Rien ici ne doit jamais faire planter l'application : tout est protégé.
import React from 'react';
import { supabase } from './supabaseClientConfig';

const VERSION_APP = '2026-10-27';
const MAX_PAR_CHARGEMENT = 5;
const dejaEnvoyees = new Set();
let nbEnvoyees = 0;

const couper = (texte, max) => {
  if (texte === null || texte === undefined) return null;
  const s = String(texte);
  return s.length > max ? s.slice(0, max) : s;
};

// Messages sans intérêt (bruit du navigateur ou d'extensions).
const estBruit = (message) => {
  const m = String(message || '');
  return !m
    || m.includes('ResizeObserver loop')
    || m === 'Script error.'
    || m.includes('chrome-extension://')
    || m.includes('moz-extension://');
};

export async function signalerErreur(erreur, infos = {}) {
  try {
    const message = couper((erreur && (erreur.message || erreur.toString && erreur.toString())) || 'Erreur inconnue', 1000);
    if (estBruit(message)) return;
    const page = couper(window.location.pathname + window.location.search.replace(/([?&](t|token|code|access_token)=)[^&]*/gi, '$1…'), 300);
    const cle = message + '|' + page;
    if (dejaEnvoyees.has(cle) || nbEnvoyees >= MAX_PAR_CHARGEMENT) return;
    dejaEnvoyees.add(cle);
    nbEnvoyees += 1;

    const ctx = (typeof window !== 'undefined' && window.__skorupContexte) || {};
    let userId = null;
    try {
      const { data } = await supabase.auth.getSession();
      userId = data?.session?.user?.id || null;
    } catch (_) { /* pas de session : envoi anonyme */ }

    const pile = [erreur && erreur.stack, infos.componentStack ? 'Composants :' + infos.componentStack : null, infos.origine ? 'Origine : ' + infos.origine : null]
      .filter(Boolean).join('\n');

    await supabase.from('erreurs_app').insert({
      user_id: userId,
      role: couper(ctx.role, 30),
      organisation_id: couper(ctx.organisation, 60),
      page: couper((ctx.onglet ? '[' + ctx.onglet + '] ' : '') + page, 300),
      message,
      pile: couper(pile, 6000),
      navigateur: couper(navigator.userAgent, 400),
      version: VERSION_APP,
    });
  } catch (_) {
    // On ne fait jamais planter l'application à cause du signalement.
  }
}

// Erreurs hors affichage (ex. un script qui casse) : enregistrées aussi.
export function ecouterErreursGlobales() {
  try {
    window.addEventListener('error', (e) => {
      if (e && e.error) signalerErreur(e.error, { origine: 'window.error' });
    });
  } catch (_) { /* rien */ }
}

const estNouvelleVersion = (erreur) => {
  const m = String((erreur && (erreur.name + ' ' + erreur.message)) || '');
  return m.includes('ChunkLoadError') || m.includes('Loading chunk') || m.includes('Loading CSS chunk');
};

const sDeco = { padding: '12px 18px', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer', border: 'none' };

export class FiletDeSecurite extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null, detail: false };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    signalerErreur(erreur, { componentStack: info && info.componentStack, origine: 'affichage' });
    // Nouvelle version mise en ligne pendant que la page était ouverte : on recharge une seule fois.
    if (estNouvelleVersion(erreur)) {
      try {
        if (!sessionStorage.getItem('skorup_recharge_version')) {
          sessionStorage.setItem('skorup_recharge_version', '1');
          window.location.reload();
        }
      } catch (_) { /* rien */ }
    }
  }

  recharger = () => { window.location.reload(); };
  accueil = () => { window.location.assign('/'); };
  deconnecter = async () => {
    try { await supabase.auth.signOut(); } catch (_) { /* rien */ }
    window.location.assign('/');
  };

  render() {
    const { erreur, detail } = this.state;
    if (!erreur) return this.props.children;
    const nouvelleVersion = estNouvelleVersion(erreur);
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#F7F5FC', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#17102B', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 460, width: '100%', background: '#fff', border: '1px solid #E7E1F2', borderRadius: 16, padding: 28, boxShadow: '0 8px 30px rgba(23,16,43,0.06)' }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 22 }}>
            {nouvelleVersion ? 'Une nouvelle version de SkorUp est en ligne' : 'Un problème est survenu'}
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.6, color: '#5C5378' }}>
            {nouvelleVersion
              ? 'Rechargez la page pour utiliser la dernière version.'
              : "Cette page n'a pas pu s'afficher. Vos données ne sont pas perdues. Le problème nous a été signalé automatiquement ; rechargez la page pour continuer."}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button type="button" onClick={this.recharger} style={{ ...sDeco, background: '#7C3AED', color: '#fff' }}>Recharger la page</button>
            <button type="button" onClick={this.accueil} style={{ ...sDeco, background: '#F2ECFF', color: '#4C1D95' }}>Revenir à l'accueil</button>
          </div>
          {!nouvelleVersion && (
            <p style={{ margin: '18px 0 0', fontSize: 13.5, color: '#5C5378' }}>
              Le problème revient ?{' '}
              <button type="button" onClick={this.deconnecter} style={{ background: 'none', border: 'none', padding: 0, color: '#7C3AED', textDecoration: 'underline', cursor: 'pointer', fontSize: 13.5 }}>Se déconnecter puis se reconnecter</button>
            </p>
          )}
          <button type="button" onClick={() => this.setState({ detail: !detail })} style={{ marginTop: 14, background: 'none', border: 'none', padding: 0, color: '#9C93B5', cursor: 'pointer', fontSize: 12.5 }}>
            {detail ? 'Masquer le détail technique' : 'Détail technique'}
          </button>
          {detail && (
            <pre style={{ marginTop: 8, padding: 10, background: '#F7F5FC', borderRadius: 8, fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflow: 'auto', color: '#3B3355' }}>
              {String(erreur && erreur.message ? erreur.message : erreur)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
