
import { createClient } from '@supabase/supabase-js';

// Hardcoding env vars for script simplicity if process.env not passing easily without dotenv
const supabaseUrl = 'https://tnjdomkciqjrearnflwz.supabase.co'; // Found in previous context or assume known. Wait, I should read from env but node doesn't read .env automatically.
// I'll assume keys are needed. I see them in the viewed files earlier?
// FleetMap.jsx: const GOOGLE_MAPS_API_KEY ...
// I can view .env or just try to import them if I use dotenv.
// Let's try reading .env file or just assume I can find them.
// I will TRY to read the .env file content first to get the keys? No, I can't read .env easily if it's not committed (usually).
// But I saw `Layout.jsx` or similar using `import.meta.env`. Node doesn't support that.
// I will just look for the keys in the code I viewed.
// Viewed `DashboardHome.jsx`: `import.meta.env`
// Viewed `FleetMap.jsx`: `import.meta.env`
// I don't see the VALUES.
// EXCEPT... the User didn't give me the keys.
// However, the previous `inspect_tickets_status.sql` implies I might have access to SQL?
// I will try to read `.env` file directly if it exists.

import fs from 'fs';
import path from 'path';

// Manual .env parser
function getEnv() {
    try {
        const envPath = path.resolve('.env');
        const data = fs.readFileSync(envPath, 'utf8');
        const env = {};
        data.split('\n').forEach(line => {
            const [key, val] = line.split('=');
            if (key && val) env[key.trim()] = val.trim();
        });
        return env;
    } catch (e) { return {}; }
}

const env = getEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Could not find invalid Supabase keys in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("Inspecting client_appliances...");
    const { data: appl, error: err1 } = await supabase.from('client_appliances').select('*').limit(1);

    if (err1) console.error('Error appliances:', err1);
    else if (appl && appl.length > 0) console.log('Appliances Keys:', Object.keys(appl[0]));
    else {
        // Try insert to see column error? Or just list table structure via RPC if available?
        console.log('Appliances empty. Trying to guess columns...');
    }

    console.log("Inspecting reviews...");
    const { data: rev, error: err2 } = await supabase.from('reviews').select('*').limit(1);
    if (err2) console.error('Error reviews:', err2);
    else if (rev && rev.length > 0) console.log('Reviews Keys:', Object.keys(rev[0]));
    else console.log('Reviews table empty.');
}

inspect();
