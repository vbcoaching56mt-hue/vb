
const { createClient } = require('./node_modules/@supabase/supabase-js');
const dotenv = require('./node_modules/dotenv');

dotenv.config({ path: './.env' });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data: mData, error: mError } = await supabase.from('modules').select('*').limit(1);
  if (mError) {
    console.error("mError:", mError);
  } else if (mData && mData.length > 0) {
    console.log("MODULES_COLUMNS_START");
    Object.keys(mData[0]).forEach(k => console.log(k));
    console.log("MODULES_COLUMNS_END");
  }
}

checkSchema();
