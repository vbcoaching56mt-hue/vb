import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY

// Client principal pour les utilisateurs (avec persistance de session)
const supabase = createClient(supabaseUrl, supabaseKey)

// Client Admin (Service Role) - DESAVERTISSEMENT : Pas de persistance pour eviter les conflits d'instances
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
})

export { supabase, supabaseAdmin }
