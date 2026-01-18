
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'admin_panel_web', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing ENV vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    // Check profiles columns on one random row
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    if (error) console.error(error);
    else console.log("Profile keys:", Object.keys(data[0] || {}));
}

check();
