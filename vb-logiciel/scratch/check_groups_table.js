const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '..', '.env.local');
dotenv.config({ path: envPath });

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('document_groups').select('*').limit(1);
  if (error) {
    console.log("document_groups table does not exist or error:", error.message);
  } else {
    console.log("document_groups table exists! Columns:", data.length > 0 ? Object.keys(data[0]) : "No records");
  }

  const { data: dgm, error: dgmErr } = await supabase.from('document_group_members').select('*').limit(1);
  if (dgmErr) {
    console.log("document_group_members table does not exist or error:", dgmErr.message);
  } else {
    console.log("document_group_members table exists! Columns:", dgm.length > 0 ? Object.keys(dgm[0]) : "No records");
  }
}
run();
