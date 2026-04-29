
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('utilisateurs').select('*').limit(1);
  
  if (error) {
    console.error("Error fetching utilisateurs:", error);
  } else {
    console.log("Utilisateurs columns:", data && data.length > 0 ? Object.keys(data[0]) : "No data");
    if (data && data.length > 0) {
        console.log("Sample utilisateur data:", data[0]);
    }
  }
}

check();
