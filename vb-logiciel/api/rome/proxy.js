// api/rome/proxy.js
// Proxy sécurisé pour l'API France Travail ROME 4.0

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
    throw new Error(`Auth FT (${res.status}): ${errText}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Pas de token dans la réponse: ' + JSON.stringify(data));
  }

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + ((data.expires_in || 1500) - 60) * 1000;
  return cachedToken;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { action, q, code, domaine } = req.query;

  // ── ENDPOINT DE DIAGNOSTIC ─────────────────────────────────────────
  if (action === 'test') {
    const report = { steps: [] };

    // Étape 1 : variables d'env
    const clientId = process.env.FT_CLIENT_ID;
    const clientSecret = process.env.FT_CLIENT_SECRET;
    report.steps.push({
      step: '1 - Variables env',
      FT_CLIENT_ID: clientId ? `OK (${clientId.substring(0, 20)}...)` : 'MANQUANT',
      FT_CLIENT_SECRET: clientSecret ? `OK (${clientSecret.length} chars)` : 'MANQUANT',
    });

    if (!clientId || !clientSecret) {
      report.verdict = 'ÉCHEC: variables manquantes';
      return res.status(200).json(report);
    }

    // Étape 2 : token OAuth
    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'api_rome-metiersv1 api_rome-fiches-metiersv1 api_rome-competencesv1',
      });
      const tokenRes = await fetch(
        'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire',
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }
      );
      const tokenBody = await tokenRes.text();
      report.steps.push({
        step: '2 - Token OAuth',
        status: tokenRes.status,
        ok: tokenRes.ok,
        response_preview: tokenBody.substring(0, 300),
      });

      if (!tokenRes.ok) {
        report.verdict = 'ÉCHEC: token OAuth refusé';
        return res.status(200).json(report);
      }

      const tokenData = JSON.parse(tokenBody);
      const token = tokenData.access_token;

      // Étape 3 : appel API grands domaines
      const apiUrl = 'https://api.francetravail.io/partenaire/rome-metiers/v1/grandDomaine';
      const apiRes = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
      });
      const apiBody = await apiRes.text();
      report.steps.push({
        step: '3 - API grandDomaine',
        url: apiUrl,
        status: apiRes.status,
        ok: apiRes.ok,
        response_preview: apiBody.substring(0, 500),
      });

      report.verdict = apiRes.ok ? 'SUCCÈS' : 'ÉCHEC: API grandDomaine refusée';
      return res.status(200).json(report);

    } catch (err) {
      report.steps.push({ step: 'ERREUR', message: err.message });
      report.verdict = 'EXCEPTION: ' + err.message;
      return res.status(200).json(report);
    }
  }

  // ── ACTIONS NORMALES ───────────────────────────────────────────────
  const BASE_METIERS = 'https://api.francetravail.io/partenaire/rome-metiers/v1';
  const BASE_FICHES  = 'https://api.francetravail.io/partenaire/rome-fiches-metiers/v1';

  try {
    const token = await getFranceTravailToken();
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

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
        apiUrl = `${BASE_FICHES}/ficheMetier/${encodeURIComponent(code)}`;
        break;
      default:
        return res.status(400).json({ error: 'Action non reconnue', actions: ['test', 'grands-domaines', 'search', 'metiers-par-domaine', 'fiche'] });
    }

    const apiRes = await fetch(apiUrl, { headers });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error(`[rome-proxy] ${apiRes.status} ${apiUrl}: ${errText}`);
      return res.status(apiRes.status).json({ error: `FT API ${apiRes.status}`, detail: errText.substring(0, 500), url: apiUrl });
    }

    const data = await apiRes.json();
    res.setHeader('Cache-Control', `public, max-age=${action === 'grands-domaines' ? 300 : 120}`);
    return res.status(200).json(data);

  } catch (err) {
    console.error('[rome-proxy]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
