// ============================================================
// Edge Function Supabase : delete-user — version 2 (22/10/2026)
// Mise en ligne : Supabase > Edge Functions > delete-user > Code > tout remplacer par ce fichier > Deploy.
//
// Ce que fait cette version :
//  - la personne qui supprime est retrouvée par son identifiant de connexion (puis par email) et doit
//    être admin ; la personne supprimée doit appartenir au MÊME organisme ;
//  - FORMATEUR : ses clients, groupes et séances de groupe sont libérés, sa fiche est supprimée (tout est
//    remis comme avant si ça échoue), puis son compte de connexion (le bon identifiant : auth_uid) ;
//  - CLIENT : s'il a déjà signé un document ou un émargement, son dossier est ARCHIVÉ (rien n'est
//    effacé, son compte de connexion est supprimé, aucun email ne lui est plus envoyé) ; sinon tout est
//    supprimé comme avant ;
//  - chaque étape est vérifiée : en cas d'erreur, on s'arrête et on le dit.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const repondre = (corps, status = 200) => new Response(JSON.stringify({ version: 2, ...corps }), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

// Table ou colonne absente dans cette base : on l'ignore (comme l'ancienne version) au lieu de tout bloquer.
const estAbsent = (e) => !!e && ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(e.code)
const pasTrouve = (e) => !!e && /not.?found|introuvable/i.test(e.message || '')

const lireMeta = (m) => {
  if (typeof m === 'string') { try { return JSON.parse(m) || {} } catch (_) { return {} } }
  return m || {}
}
// Mêmes règles que l'application (documentEstSigne / elementSeanceEstSigne).
const documentEstSigne = (d) => !!(d && (d.signe_par_client || d.signe_par_formateur || d.signe_par_organisme
  || d.statut === 'Signé' || d.signed_pdf_url))
const elementSeanceEstSigne = (s) => {
  if (!s) return false
  const m = lireMeta(s.metadata)
  return !!(s.statut_client === 'Signé' || s.statut_formateur === 'Signé' || s.statut === 'Signé'
    || s.signed_pdf_url || s.signature_client || s.signature_formateur || m.file_url_signed)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Qui appelle ?
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return repondre({ error: 'Non autorisé' }, 401)

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) return repondre({ error: 'Utilisateur introuvable' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Par identifiant de connexion d'abord (ne change jamais), puis par email (anciens comptes).
    let appelant = null
    {
      const { data } = await admin.from('utilisateurs').select('id, role, organisation_id')
        .eq('auth_uid', user.id).order('id', { ascending: true }).limit(1)
      if (data && data[0]) appelant = data[0]
    }
    if (!appelant && user.email) {
      const email = String(user.email).trim().replace(/[\\%_]/g, (m) => '\\' + m)
      const { data } = await admin.from('utilisateurs').select('id, role, organisation_id')
        .ilike('email', email).order('id', { ascending: true }).limit(1)
      if (data && data[0]) appelant = data[0]
    }
    if (!appelant || appelant.role !== 'admin' || !appelant.organisation_id) {
      return repondre({ error: 'Accès refusé - rôle admin requis' }, 403)
    }
    const org = appelant.organisation_id

    // 2. Qui supprimer ?
    const { userId, userType } = await req.json()
    if (!userId) return repondre({ error: 'userId requis' }, 400)

    // ════════ CLIENT ════════
    if (userType === 'client') {
      const { data: client, error: eClient } = await admin.from('clients').select('id, organisation_id')
        .eq('id', userId).maybeSingle()
      if (eClient) return repondre({ error: 'Lecture du dossier impossible : ' + eClient.message }, 500)
      if (!client) return repondre({ error: 'Client introuvable' }, 404)
      if (String(client.organisation_id) !== String(org)) {
        return repondre({ error: 'Accès refusé - utilisateur hors de votre organisation' }, 403)
      }

      // A-t-il déjà signé quelque chose ? (en cas de doute : on ne supprime rien)
      const { data: seances, error: eS } = await admin.from('sessions').select('*').eq('client_id', userId)
      if (eS && !estAbsent(eS)) return repondre({ error: 'Vérification des séances impossible : ' + eS.message }, 500)
      const { data: docs, error: eD } = await admin.from('documents').select('*').eq('user_id', userId)
      if (eD && !estAbsent(eD)) return repondre({ error: 'Vérification des documents impossible : ' + eD.message }, 500)
      const aSigne = (seances || []).some(elementSeanceEstSigne) || (docs || []).some(documentEstSigne)

      if (aSigne) {
        // ARCHIVAGE : tout est conservé ; plus d'accès, plus d'emails.
        const { data: maj, error: eA } = await admin.from('clients')
          .update({ archive_le: new Date().toISOString(), acces_differe: true })
          .eq('id', userId).eq('organisation_id', org).select('id')
        if (eA || !maj || maj.length === 0) {
          return repondre({
            error: estAbsent(eA)
              ? "Ce client a des documents signés : il doit être archivé, mais la base n'est pas encore prête (lancer le SQL « archives_clients »). Rien n'a été supprimé."
              : "Archivage impossible" + (eA ? ' : ' + eA.message : '') + ". Rien n'a été supprimé.",
          }, 409)
        }
        let compteSupprime = true
        const { error: eAuth } = await admin.auth.admin.deleteUser(userId)
        if (eAuth && !pasTrouve(eAuth)) compteSupprime = false
        return repondre({ success: true, archive: true, compteSupprime })
      }

      // SUPPRESSION COMPLÈTE (rien de signé) — même liste que l'ancienne version, chaque étape vérifiée.
      for (const [table, colonne] of [['sessions', 'client_id'], ['documents', 'user_id'], ['client_documents', 'client_id'], ['questionnaire_responses', 'client_id']]) {
        const { error } = await admin.from(table).delete().eq(colonne, userId)
        if (error && !estAbsent(error)) {
          return repondre({ error: `Suppression interrompue (${table} : ${error.message}). Le dossier est toujours là.` }, 500)
        }
      }
      const { data: supprime, error: eDel } = await admin.from('clients').delete()
        .eq('id', userId).eq('organisation_id', org).select('id')
      if (eDel || !supprime || supprime.length === 0) {
        return repondre({ error: 'Le dossier client n\'a pas pu être supprimé' + (eDel ? ' : ' + eDel.message : '') }, 500)
      }
      let compteSupprime = true
      const { error: eAuth } = await admin.auth.admin.deleteUser(userId)
      if (eAuth && !pasTrouve(eAuth)) compteSupprime = false
      return repondre({ success: true, archive: false, compteSupprime })
    }

    // ════════ FORMATEUR ════════
    const { data: fiche, error: eF } = await admin.from('utilisateurs')
      .select('id, role, organisation_id, auth_uid').eq('id', userId).maybeSingle()
    if (eF) return repondre({ error: 'Lecture de la fiche impossible : ' + eF.message }, 500)
    if (!fiche) return repondre({ error: 'Formateur introuvable' }, 404)
    if (String(fiche.organisation_id) !== String(org)) {
      return repondre({ error: 'Accès refusé - utilisateur hors de votre organisation' }, 403)
    }
    if (fiche.role === 'admin' || String(fiche.id) === String(appelant.id)) {
      return repondre({ error: 'Un compte administrateur ne peut pas être supprimé ici' }, 403)
    }

    // Libérer ses clients, groupes et séances de groupe (en notant lesquels, pour tout remettre si besoin).
    const liberes = []
    const retablir = async () => {
      for (const [table, ids] of liberes) {
        await admin.from(table).update({ formateur_id: fiche.id }).in('id', ids)
      }
    }
    for (const table of ['clients', 'groupes', 'groupe_seances']) {
      const { data: lignes, error: eL } = await admin.from(table).select('id')
        .eq('formateur_id', fiche.id).eq('organisation_id', org)
      if (eL) {
        if (estAbsent(eL)) continue
        await retablir()
        return repondre({ error: `Suppression annulée (${table} : ${eL.message}). Rien n'a été modifié.` }, 500)
      }
      const ids = (lignes || []).map(l => l.id)
      if (!ids.length) continue
      const { error: eU } = await admin.from(table).update({ formateur_id: null }).in('id', ids)
      if (eU) {
        await retablir()
        return repondre({ error: `Suppression annulée (${table} : ${eU.message}). Rien n'a été modifié.` }, 500)
      }
      liberes.push([table, ids])
    }

    const { data: supprimes, error: eDelF } = await admin.from('utilisateurs').delete()
      .eq('id', fiche.id).eq('organisation_id', org).select('id')
    if (eDelF || !supprimes || supprimes.length === 0) {
      await retablir()
      return repondre({ error: 'La fiche du formateur n\'a pas pu être supprimée' + (eDelF ? ' : ' + eDelF.message : '') + '. Tout a été remis comme avant.' }, 500)
    }

    // Compte de connexion : seulement s'il n'est plus utilisé par aucune autre fiche.
    let compteSupprime = false
    const nbClientsLiberes = (liberes.find(([t]) => t === 'clients') || [null, []])[1].length
    if (fiche.auth_uid) {
      const { data: autresFiches } = await admin.from('utilisateurs').select('id').eq('auth_uid', fiche.auth_uid).limit(1)
      const { data: autresDossiers } = await admin.from('clients').select('id').eq('id', fiche.auth_uid).limit(1)
      if ((autresFiches || []).length === 0 && (autresDossiers || []).length === 0) {
        const { error: eAuth } = await admin.auth.admin.deleteUser(fiche.auth_uid)
        compteSupprime = !eAuth || pasTrouve(eAuth)
      }
    }
    return repondre({ success: true, compteSupprime, clientsLiberes: nbClientsLiberes })

  } catch (err) {
    return repondre({ error: err.message }, 500)
  }
})
