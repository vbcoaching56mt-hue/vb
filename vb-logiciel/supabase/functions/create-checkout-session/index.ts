// ============================================================
// Edge Function: create-checkout-session — version 2 (23/10/2026 : acceptation des CGV au paiement)
// Mise en ligne : Supabase > Edge Functions > create-checkout-session > Code > tout remplacer > Deploy.
// Crée une Stripe Checkout Session pour un plan donné.
// Body: { orgId: string, plan: 'essentiel'|'pro'|'illimite', billing: 'monthly'|'annual' }
// ============================================================

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map plan+billing → lookup_key Stripe (identique en test et en production,
// contrairement aux Price ID qui changent d'un environnement à l'autre).
const PRICE_LOOKUP_KEYS: Record<string, string> = {
  essentiel_monthly: 'essentiel_mensuel',
  essentiel_annual:  'essentiel_annuel',
  pro_monthly:       'pro_mensuel',
  pro_annual:        'pro_annuel',
  illimite_monthly:  'illimite_mensuel',
  illimite_annual:   'illimite_annuel',
}

// ── SÉCURITÉ (2026-10-19) : seul un ADMIN de l'organisme peut gérer son abonnement ──────────────
// Avant : l'organisme venait du corps de la requête sans aucune vérification de l'appelant.
async function estAdminDeOrganisme(req: Request, supabase: any, orgId: string): Promise<boolean> {
  const jeton = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!jeton) return false
  const { data, error } = await supabase.auth.getUser(jeton)
  const user = data?.user
  if (error || !user) return false
  const { data: parUid } = await supabase
    .from('utilisateurs').select('role, organisation_id').eq('auth_uid', user.id)
  let lignes = parUid || []
  if (user.email) {
    const { data: parEmail } = await supabase
      .from('utilisateurs').select('role, organisation_id').is('auth_uid', null).eq('email', user.email)
    lignes = lignes.concat(parEmail || [])
  }
  return lignes.some((l: any) => l.role === 'admin' && String(l.organisation_id) === String(orgId))
}

// Retour vers l'application uniquement (pas vers un site choisi par l'appelant).
function origineSure(req: Request): string {
  const origine = (req.headers.get('origin') || '').replace(/\/+$/, '')
  const autorisees = ['https://app.skorup.fr', ...(Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)]
  if (autorisees.includes(origine) || /^http:\/\/localhost(:\d+)?$/.test(origine)) return origine
  return 'https://app.skorup.fr'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orgId, plan, billing } = await req.json()

    if (!orgId || !plan || !billing) {
      throw new Error('Paramètres manquants : orgId, plan, billing requis.')
    }

    const priceKey = `${plan}_${billing}`
    const lookupKey = PRICE_LOOKUP_KEYS[priceKey]
    if (!lookupKey) throw new Error(`Plan inconnu : ${priceKey}`)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    if (!(await estAdminDeOrganisme(req, supabaseAdmin, orgId))) {
      return new Response(JSON.stringify({ error: "Seul un administrateur de l'organisme peut souscrire un abonnement." }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true })
    const priceId = prices.data[0]?.id
    if (!priceId) throw new Error(`Tarif introuvable pour la clé : ${lookupKey}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Récupérer les infos de l'organisation
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('nom, stripe_customer_id, stripe_subscription_id, subscription_status')
      .eq('id', orgId)
      .single()

    if (orgError || !org) throw new Error('Organisation introuvable.')

    // 2026-10-19 : pas de second abonnement si l'organisme en a déjà un (actif ou impayé) —
    // on passe par « Gérer mon abonnement » (portail Stripe) pour changer de formule ou de carte.
    if (org.stripe_subscription_id && ['active', 'past_due', 'unpaid', 'paused', 'incomplete'].includes(org.subscription_status)) {
      return new Response(JSON.stringify({ error: "Votre organisme a déjà un abonnement : utilisez « Gérer mon abonnement » pour changer de formule ou mettre à jour votre carte." }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Trouver ou créer le client Stripe
    let customerId = org.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.nom,
        metadata: { org_id: orgId },
      })
      customerId = customer.id
      await supabase
        .from('organisations')
        .update({ stripe_customer_id: customerId })
        .eq('id', orgId)
    }

    // Créer la Checkout Session directement avec le Price ID
    const origin = origineSure(req)
    const parametres: any = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}?checkout=success`,
      cancel_url:  `${origin}?checkout=cancel`,
      allow_promotion_codes: true,
      metadata: { org_id: orgId, plan, billing, conditions_version: '2026-10-23' },
      subscription_data: {
        metadata: { org_id: orgId, plan, billing, conditions_version: '2026-10-23' },
      },
    }
    // 2026-10-23 : case « J'accepte les CGV » sur la page de paiement Stripe (preuve conservée par Stripe).
    // Nécessite l'adresse des CGV dans Stripe (Paramètres > Détails publics > Conditions d'utilisation).
    const avecAcceptation = {
      ...parametres,
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: {
          message: "J'accepte les [conditions générales de vente](https://www.skorup.fr/cgv/) et l'[accord de traitement des données](https://www.skorup.fr/accord-traitement-donnees/) de SkorUp.",
        },
      },
    }
    let session
    try {
      session = await stripe.checkout.sessions.create(avecAcceptation)
    } catch (e: any) {
      // Adresse des CGV absente dans Stripe (ou option refusée) : on ne bloque jamais le paiement.
      console.error('[create-checkout-session] acceptation des CGV indisponible, paiement sans la case :', e?.message)
      session = await stripe.checkout.sessions.create(parametres)
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[create-checkout-session]', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
