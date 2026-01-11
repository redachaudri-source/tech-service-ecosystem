
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("Inspecting client_appliances...");
    const { data: appl, error: err1 } = await supabase.from('client_appliances').select('*').limit(1);
    if (err1) console.error('Error appliances:', err1);
    else if (appl.length > 0) console.log('Appliances Keys:', Object.keys(appl[0]));
    else console.log('Appliances table empty or no access. Trying to insert dummy to fail and see cols?');

    console.log("Inspecting reviews...");
    const { data: rev, error: err2 } = await supabase.from('reviews').select('*').limit(1);
    if (err2) console.error('Error reviews:', err2);
    else if (rev.length > 0) console.log('Reviews Keys:', Object.keys(rev[0]));
    else console.log('Reviews table empty.');
}

inspect();
