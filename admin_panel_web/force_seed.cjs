const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function forceSeed() {
    console.log('Attempting to seed configuration...');
    const { error } = await supabase
        .from('business_config')
        .upsert({
            key: 'working_hours',
            value: {
                "monday": { "start": "09:00", "end": "19:00" },
                "tuesday": { "start": "09:00", "end": "19:00" },
                "wednesday": { "start": "09:00", "end": "19:00" },
                "thursday": { "start": "09:00", "end": "19:00" },
                "friday": { "start": "09:00", "end": "15:00" },
                "saturday": null,
                "sunday": null
            }
        });

    if (error) console.error('Seed Error:', error);
    else console.log('Seed Success!');

    // Verify
    const { data } = await supabase.from('business_config').select('*');
    console.log('Final Keys:', data.map(r => r.key));
}

forceSeed();
