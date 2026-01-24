const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchedule() {
    const { data, error } = await supabase
        .from('business_config')
        .select('*');

    if (error) console.error(error);
    else console.log('Keys found:', data.map(r => r.key));
    if (data) console.log('Full Data:', JSON.stringify(data, null, 2));
}

checkSchedule();
