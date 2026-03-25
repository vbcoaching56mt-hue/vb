
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('utilisateurs').select('*').limit(1);
  if (error) {
    console.error("Error fetching utilisateurs:", error);
  } else {
    console.log("UTILISATEURS_COLUMNS_START");
    if (data && data.length > 0) {
      console.log(Object.keys(data[0]).join('\n'));
    } else {
      console.log("No data found in utilisateurs");
    }
    console.log("UTILISATEURS_COLUMNS_END");
  }

  const { data: modData, error: modError } = await supabase.from('modules').select('*').limit(1);
  if (modError) {
    console.error("Error fetching modules:", modError);
  } else {
    console.log("MODULES_COLUMNS_START");
    if (modData && modData.length > 0) {
      console.log(Object.keys(modData[0]).join('\n'));
    } else {
      console.log("No data found in modules");
    }
    console.log("MODULES_COLUMNS_END");
  }
}

check();
