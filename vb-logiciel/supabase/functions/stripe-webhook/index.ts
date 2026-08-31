// ============================================================
// Edge Function: stripe-webhook
// Reçoit les événements Stripe et met à jour la table organisations.
//
// Événements gérés :
//   checkout.session.completed       → active l'abonnement
//   customer.subscription.updated    → met à jour le statut
//   customer.subscription.deleted    → marque comme annulé
//   invoice.payment_failed           → marque comme past_due
// ============================================================

import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Correspondance Price ID Stripe → plan/facturation (doit rester synchronisée
// avec la table PRICE_IDS de la fonction create-checkout-session).
// Utilisée pour déterminer le plan RÉEL et ACTUEL de l'abonnement à partir de
// son item de facturation, plutôt que de se fier aux metadata de l'abonnement
// (voir correction du 2026-07-28 ci-dessous).
const LOOKUP_KEY_TO_PLAN: Record<string, { plan: string; billing: string }> = {
  essentiel_mensuel: { plan: 'essentiel', billing: 'monthly' },
  essentiel_annuel:  { plan: 'essentiel', billing: 'annual' },
  pro_mensuel:       { plan: 'pro', billing: 'monthly' },
  pro_annuel:        { plan: 'pro', billing: 'annual' },
  illimite_mensuel:  { plan: 'illimite', billing: 'monthly' },
  illimite_annuel:   { plan: 'illimite', billing: 'annual' },
}

// CORRECTION (2026-07-28) : quand un client change de formule depuis le portail
// client Stripe (self-service), Stripe met à jour l'item de facturation de
// l'abonnement (le vrai Price ID actif) mais NE MET PAS à jour les metadata de
// l'abonnement — celles-ci restent figées aux valeurs saisies lors de la toute
// première souscription. L'ancien code lisait sub.metadata.plan/billing pour
// déterminer subscribed_plan, ce qui réécrivait systématiquement l'ANCIEN plan
// à chaque renouvellement/changement, au lieu du plan réellement actif.
// On détermine désormais le plan à partir du Price ID réellement facturé
// (sub.items.data[0].price.id), avec un repli sur les metadata seulement si
// le Price ID est introuvable dans la table de correspondance.
function resolvePlanFromSubscription(sub: Stripe.Subscription): string | null {
  const lookupKey = sub.items?.data?.[0]?.price?.lookup_key
  const match = lookupKey ? LOOKUP_KEY_TO_PLAN[lookupKey] : undefined
  if (match) return `${match.plan}_${match.billing}`

  const plan = sub.metadata?.plan
  const billing = sub.metadata?.billing
  return plan && billing ? `${plan}_${billing}` : null
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature')
  const body = await req.text()

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('[stripe-webhook] Signature invalide:', err.message)
    return new Response(`Webhook error: ${err.message}`, { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  console.log(`[stripe-webhook] Événement reçu: ${event.type}`)

  try {
    switch (event.type) {

      // ── Paiement initial réussi ───────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.metadata?.org_id
        const plan    = session.metadata?.plan
        const billing = session.metadata?.billing

        if (!orgId) {
          console.warn('[stripe-webhook] checkout.session.completed sans org_id dans metadata')
          break
        }

        await supabase.from('organisations').update({
          subscription_status:     'active',
          stripe_customer_id:      session.customer as string,
          stripe_subscription_id:  session.subscription as string,
          subscribed_plan:         plan && billing ? `${plan}_${billing}` : null,
        }).eq('id', orgId)

        console.log(`[stripe-webhook] Org ${orgId} activée (${plan}_${billing})`)
        break
      }

      // ── Mise à jour d'un abonnement (renouvellement, changement de plan) ──
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.org_id
        const resolvedPlan = resolvePlanFromSubscription(sub)

        if (!orgId) {
          // Fallback : retrouver l'org via stripe_customer_id
          const { data: org } = await supabase
            .from('organisations')
            .select('id')
            .eq('stripe_customer_id', sub.customer as string)
            .single()

          if (org) {
            await supabase.from('organisations').update({
              subscription_status: sub.status === 'active' ? 'active' : sub.status,
              stripe_subscription_id: sub.id,
              subscribed_plan: resolvedPlan,
            }).eq('id', org.id)
          }
          break
        }

        await supabase.from('organisations').update({
          subscription_status: sub.status === 'active' ? 'active' : sub.status,
          stripe_subscription_id: sub.id,
          subscribed_plan: resolvedPlan,
        }).eq('id', orgId)

        console.log(`[stripe-webhook] Org ${orgId} mise à jour → ${sub.status} (${resolvedPlan})`)
        break
      }

      // ── Annulation d'abonnement ───────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.org_id

        const updatePayload = {
          subscription_status:     'canceled',
          stripe_subscription_id:  null,
          subscribed_plan:         null,
        }

        if (orgId) {
          await supabase.from('organisations').update(updatePayload).eq('id', orgId)
        } else {
          // Retrouver l'org via customer ID
          const { data: org } = await supabase
            .from('organisations')
            .select('id')
            .eq('stripe_customer_id', sub.customer as string)
            .single()
          if (org) {
            await supabase.from('organisations').update(updatePayload).eq('id', org.id)
          }
        }

        console.log(`[stripe-webhook] Abonnement annulé — org ${orgId || 'inconnu'}`)
        break
      }

      // ── Échec de paiement ─────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { data: org } = await supabase
          .from('organisations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (org) {
          await supabase.from('organisations').update({
            subscription_status: 'past_due',
          }).eq('id', org.id)
          console.log(`[stripe-webhook] Paiement échoué — org ${org.id}`)
        }
        break
      }

      default:
        console.log(`[stripe-webhook] Événement non géré: ${event.type}`)
    }
  } catch (err: any) {
    console.error('[stripe-webhook] Erreur traitement:', err.message)
    // On retourne 200 quand même pour éviter que Stripe ne réessaie indéfiniment
    // (l'erreur est loggée pour debug)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
