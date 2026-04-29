
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function check() {
  const result = {};
  
  const { data: userData, error: userError } = await supabase.from('utilisateurs').select('*').limit(1);
  if (userError) {
    result.utilisateurs_error = userError;
  } else {
    result.utilisateurs_columns = userData && userData.length > 0 ? Object.keys(userData[0]).sort() : "No data";
  }

  const { data: modData, error: modError } = await supabase.from('modules').select('*').limit(1);
  if (modError) {
    result.modules_error = modError;
  } else {
    result.modules_columns = modData && modData.length > 0 ? Object.keys(modData[0]).sort() : "No data";
  }

  fs.writeFileSync('schema_info.json', JSON.stringify(result, null, 2));
  console.log("Schema info written to schema_info.json");
}

check();
