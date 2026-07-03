// api/rome/proxy.js
// Proxy sécurisé pour l'API France Travail ROME 4.0
// Gère l'auth OAuth2 côté serveur (le client_secret n'est jamais exposé au navigateur)

// Cache token en mémoire (par instance Vercel)
let cachedToken = null;
let tokenExpiry = 0;

async function getFranceTravailToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const clientId = process.env.FT_CLIENT_ID;
  const clientSecret = process.env.FT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Variables FT_CLIENT_ID ou FT_CLIENT_SECRET non configurées dans Vercel');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'api_rome-metiersv1 api_rome-fiches-metiersv1 api_rome-competencesv1',
  });

  const res = await fetch(
    'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erreur auth France Travail (${res.status}): ${errText}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Pas de token dans la réponse France Travail: ' + JSON.stringify(data));
  }

  cachedToken = data.access_token;
  // Expire 60s avant l'expiration réelle pour éviter les tokens expirés en transit
  tokenExpiry = Date.now() + ((data.expires_in || 1500) - 60) * 1000;

  return cachedToken;
}

module.exports = async (req, res) => {
  // CORS — accessible depuis l'app React déployée
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { action, q, code, domaine } = req.query;

  const BASE_METIERS = 'https://api.francetravail.io/partenaire/rome-metiers/v1';
  const BASE_FICHES  = 'https://api.francetravail.io/partenaire/rome-fiches-metiers/v1';

  try {
    const token = await getFranceTravailToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    let apiUrl;

    switch (action) {
      case 'grands-domaines':
        apiUrl = `${BASE_METIERS}/grandDomaine`;
        break;

      case 'search':
        if (!q || !q.trim()) return res.status(400).json({ error: 'Paramètre q requis' });
        apiUrl = `${BASE_METIERS}/metier?libelle=${encodeURIComponent(q.trim())}`;
        break;

      case 'metiers-par-domaine':
        if (!domaine) return res.status(400).json({ error: 'Paramètre domaine requis' });
        apiUrl = `${BASE_METIERS}/metier?grandDomaine=${encodeURIComponent(domaine)}`;
        break;

      case 'fiche':
        if (!code) return res.status(400).json({ error: 'Paramètre code requis' });
        // L'API Fiches Métiers prend le code ROME (ex: A1101)
        apiUrl = `${BASE_FICHES}/ficheMetier/${encodeURIComponent(code)}`;
        break;

      default:
        return res.status(400).json({
          error: 'Action non reconnue',
          actions: ['grands-domaines', 'search', 'metiers-par-domaine', 'fiche'],
        });
    }

    const apiRes = await fetch(apiUrl, { headers });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error(`[rome-proxy] Erreur API FT (${apiRes.status}) pour ${apiUrl}: ${errText}`);
      return res.status(apiRes.status).json({
        error: `Erreur API France Travail: ${apiRes.status}`,
        detail: errText.substring(0, 500),
      });
    }

    const data = await apiRes.json();
    // Cache côté client : 5 minutes pour grands-domaines, 2 min pour search
    const cacheAge = action === 'grands-domaines' ? 300 : 120;
    res.setHeader('Cache-Control', `public, max-age=${cacheAge}`);
    return res.status(200).json(data);

  } catch (err) {
    console.error('[rome-proxy] Erreur serveur:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
