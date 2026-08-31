// ============================================================
// Edge Function: create-checkout-session
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
      .select('nom, stripe_customer_id')
      .eq('id', orgId)
      .single()

    if (orgError || !org) throw new Error('Organisation introuvable.')

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
    const origin = req.headers.get('origin') || 'https://app.skorup.fr'
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}?checkout=success`,
      cancel_url:  `${origin}?checkout=cancel`,
      allow_promotion_codes: true,
      metadata: { org_id: orgId, plan, billing },
      subscription_data: {
        metadata: { org_id: orgId, plan, billing },
      },
    })

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
