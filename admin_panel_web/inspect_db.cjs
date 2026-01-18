const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDB() {
    try {
        console.log('--- TRIGGERS ---');
        // We can't query information_schema directly with standard client usually, unless we have RPC or special view.
        // Assuming we might fail, but let's try RPC if I created one? No.
        // I will try to use the raw query if I have a helper? 
        // No helper. 
        // Plan B: I can't easily list triggers via JS client without a stored procedure.
        // BUT I CAN GUESS based on previous files.
        // However, I CAN check columns.

        console.log('\n--- COLUMNS of client_appliances ---');
        // This usually works via Postgrest if schema is exposed, but information_schema is separate.
        // We'll try to select ONE row from client_appliances and look at keys.
        const { data: rows, error } = await supabase.from('client_appliances').select('*').limit(1);
        if (error) console.error(error);
        if (rows && rows.length > 0) {
            console.log('Keys:', Object.keys(rows[0]));
            // Check formatted keys
            const row = rows[0];
            if (row.housing_type) console.log('Found housing_type:', row.housing_type);
            if (row.installation_condition) console.log('Found installation_condition:', row.installation_condition);
            if (row.floor_level) console.log('Found floor_level:', row.floor_level);
            if (row.has_elevator) console.log('Found has_elevator:', row.has_elevator);
        } else {
            console.log("No rows in client_appliances.");
        }

    } catch (err) {
        console.error(err);
    }
}

inspectDB();
