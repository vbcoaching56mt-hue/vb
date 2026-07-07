import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Client unique — toutes les opérations admin passent par les Edge Functions Supabase
const supabase = createClient(supabaseUrl, supabaseKey)

export { supabase }
