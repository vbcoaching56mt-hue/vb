// ============================================================
// Edge Function: customer-portal
// Génère un lien vers le Stripe Customer Portal pour qu'un
// admin puisse gérer son abonnement en self-service.
// Body: { orgId: string }
// ============================================================

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orgId } = await req.json()
    if (!orgId) throw new Error('orgId manquant.')

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: org, error } = await supabase
      .from('organisations')
      .select('stripe_customer_id')
      .eq('id', orgId)
      .single()

    if (error || !org) throw new Error('Organisation introuvable.')
    if (!org.stripe_customer_id) {
      throw new Error('Aucun abonnement Stripe actif pour cette organisation. Souscrivez d\'abord un plan.')
    }

    const origin = req.headers.get('origin') || 'https://app.skorup.fr'
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: origin,
    })

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[customer-portal]', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
