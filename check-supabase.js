const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local. Please create it and add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const envText = fs.readFileSync(envPath, 'utf8');
const env = {};

envText.split(/\r?\n/).forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const [key, ...rest] = trimmed.split('=');
  env[key] = rest.join('=').trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

(async () => {
  console.log('Checking Supabase setup with .env.local values...');

  const forms = await supabase.from('inventory_forms').select('id').limit(1);
  const plus = await supabase.from('plus_items').select('id').limit(1);
  const minus = await supabase.from('minus_items').select('id').limit(1);
  const buckets = await supabase.storage.listBuckets();

  console.log('inventory_forms:', forms.error ? `ERROR - ${forms.error.message}` : 'exists');
  console.log('plus_items:', plus.error ? `ERROR - ${plus.error.message}` : 'exists');
  console.log('minus_items:', minus.error ? `ERROR - ${minus.error.message}` : 'exists');
  console.log('storage buckets:', buckets.error ? `ERROR - ${buckets.error.message}` : 'ok');

  if (!buckets.error && Array.isArray(buckets.data)) {
    const hasBucket = buckets.data.some((bucket) => bucket.name === 'inventory_images');
    console.log('inventory_images bucket:', hasBucket ? 'exists' : 'missing');
  }
})();
