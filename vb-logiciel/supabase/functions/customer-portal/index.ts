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

    if (!(await estAdminDeOrganisme(req, supabase, orgId))) {
      return new Response(JSON.stringify({ error: "Seul un administrateur de l'organisme peut gérer l'abonnement." }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: org, error } = await supabase
      .from('organisations')
      .select('stripe_customer_id')
      .eq('id', orgId)
      .single()

    if (error || !org) throw new Error('Organisation introuvable.')
    if (!org.stripe_customer_id) {
      throw new Error('Aucun abonnement Stripe actif pour cette organisation. Souscrivez d\'abord un plan.')
    }

    const origin = origineSure(req)
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      // Marqueur "billing=return" détecté côté app pour rafraîchir automatiquement
      // l'abonnement affiché (changement/annulation de plan fait depuis le portail).
      return_url: `${origin}?billing=return`,
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
