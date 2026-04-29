
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
  const { data, error } = await supabase.from('module_step_resources').select('*').limit(1);
  if (error) {
    console.error('Error fetching module_step_resources:', error);
  } else {
    console.log('Sample record from module_step_resources:', data);
  }
}

checkSchema();
