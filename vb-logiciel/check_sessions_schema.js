
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('sessions').select('*').limit(1);
  
  if (error) {
    console.error("Error fetching sessions:", error);
  } else {
    console.log("Session columns:", data && data.length > 0 ? Object.keys(data[0]) : "No data");
    // Also try to get one with client_id to see the type
    if (data && data.length > 0) {
        console.log("Sample session data:", data[0]);
    }
  }
}

check();
