
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('clients').select('*').limit(1);
  
  if (error) {
    console.error("Error fetching clients:", error);
  } else {
    console.log("Client columns:", data && data.length > 0 ? Object.keys(data[0]) : "No data");
    if (data && data.length > 0) {
        console.log("Sample client data:", data[0]);
    }
  }
}

check();
