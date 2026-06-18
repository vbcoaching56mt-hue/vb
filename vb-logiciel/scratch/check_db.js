const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '..', '.env.local');
dotenv.config({ path: envPath });

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: "select column_name, data_type from information_schema.columns where table_name = 'module_step_resources'" });
  if (error) {
    // If exec_sql RPC doesn't exist, try querying a view or system catalog if accessible, or just query information_schema columns using standard SELECT if we can (wait, information_schema is in postgres, we might not have a direct table mapping unless we use a query, but wait! We can't query information_schema directly via .from() because it's not in the public schema by default)
    console.log("exec_sql RPC failed, trying direct select (which might fail if schema isn't exposed):");
    const { data: cols, error: err2 } = await supabase.from('module_step_resources').select('*').limit(1);
    if (err2) {
      console.error(err2);
    } else {
      console.log("Direct query columns:", Object.keys(cols[0]));
    }
  } else {
    console.log("Columns with types:", data);
  }
}
run();
