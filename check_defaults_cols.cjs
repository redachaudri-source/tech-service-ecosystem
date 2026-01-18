
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'admin_panel_web', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('appliance_category_defaults').select('*').limit(1);
    if (error) {
        console.log('Error:', error);
    } else {
        console.log('Columns:', Object.keys(data[0] || {}));
        console.log('Sample Data:', data[0]);
    }
}

check();
