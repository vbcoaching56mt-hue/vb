
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('clients').select('*').limit(10);
  
  if (error) {
    console.error("Error fetching clients:", error);
  } else {
    console.log("Recent clients:", data);
  }
}

check();
