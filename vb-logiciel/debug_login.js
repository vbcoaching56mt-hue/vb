
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('clients').select('*').eq('email_contact', 'contact@vbformation.fr');
  
  if (error) {
    console.error("Error fetching client:", error);
  } else {
    console.log("Client data:", data);
    fs.writeFileSync('debug_client.json', JSON.stringify(data, null, 2));
  }
}

check();
