const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpload() {
  console.log("Testing Supabase connection...");
  
  // 1. Check if 'documents' bucket exists
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.error("Error listing buckets:", bucketsError);
  } else {
    console.log("Buckets found:", buckets.map(b => b.name));
    const docsBucket = buckets.find(b => b.name === 'documents');
    if (!docsBucket) {
      console.error("Bucket 'documents' DOES NOT EXIST.");
    } else {
      console.log("Bucket 'documents' exists.");
    }
  }

  // 2. Try to upload a dummy file
  console.log("Attempting to upload a dummy file to 'documents' bucket...");
  const dummyContent = "Hello World";
  const { data, error } = await supabase.storage.from('documents').upload('test_dummy.txt', dummyContent, { upsert: true });
  
  if (error) {
    console.error("Upload failed with error:", error);
  } else {
    console.log("Upload succeeded! Data:", data);
  }
}

testUpload();
