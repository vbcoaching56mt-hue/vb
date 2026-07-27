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

// Map plan+billing → Stripe Price ID (direct, pas de lookup produit)
const PRICE_IDS: Record<string, string> = {
  essentiel_monthly: 'price_1Tqr7S2KdCq3v8pEmk4ffymj',
  essentiel_annual:  'price_1Tqr9B2KdCq3v8pEMeZR46Q1',
  pro_monthly:       'price_1Tqr7t2KdCq3v8pEaHqgwqEW',
  pro_annual:        'price_1TqrAn2KdCq3v8pEgdJS1rcQ',
  illimite_monthly:  'price_1Tqr8N2KdCq3v8pEcrWd9L7A',
  illimite_annual:   'price_1TqrBG2KdCq3v8pETMG0KeOc',
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
    const priceId = PRICE_IDS[priceKey]
    if (!priceId) throw new Error(`Plan inconnu : ${priceKey}`)

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

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
