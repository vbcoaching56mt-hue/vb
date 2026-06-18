const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '..', '.env.local');
dotenv.config({ path: envPath });

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('document_groups').insert([{ nom: 'Test Group' }]).select();
  if (error) {
    console.error("Insert error:", error);
  } else {
    console.log("Insert success! Created record:", data);
    if (data && data.length > 0) {
      await supabase.from('document_groups').delete().eq('id', data[0].id);
      console.log("Deleted test record.");
    }
  }
}
run();
