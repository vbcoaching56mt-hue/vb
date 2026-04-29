import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanModels() {
  console.log("Cleaning modeles_documents...");
  const { data, error } = await supabase.from('modeles_documents').delete().neq('id', 0);
  if (error) {
    console.error("Error cleaning modeles_documents:", error);
  } else {
    console.log("Cleaned modeles_documents.");
  }

  console.log("Cleaning 'Modèle Référence' from documents...");
  const { error: err2 } = await supabase.from('documents').delete().eq('type_document', 'Modèle Référence');
  if (err2) {
    console.error("Error cleaning documents:", err2);
  } else {
    console.log("Cleaned 'Modèle Référence' from documents.");
  }
}

cleanModels();
