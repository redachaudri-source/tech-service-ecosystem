
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'admin_panel_web', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Prefer service role for triggers if available, else anon might fail on permissions

// Fallback to anon if service key not found (though usually needed for DDL)
const targetKey = supabaseServiceKey || supabaseKey;

if (!supabaseUrl || !targetKey) {
    console.error("Missing ENV vars (URL or Key)");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, targetKey);

async function applySql() {
    // Get filename from args or fallback
    const targetFile = process.argv[2] || 'fix_mortify_trigger_v9_reliable.sql';
    const sqlPath = path.join(__dirname, targetFile);
    console.log(`Applying SQL file: ${targetFile}`);

    if (!fs.existsSync(sqlPath)) {
        console.error(`File not found: ${sqlPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Supabase JS client doesn't support raw SQL execution directly on client usually unless via rpc or special endpoint.
    // HOWEVER, many users have a 'exec_sql' or similar RPC function set up.
    // OR we can use the 'psql' command line if available.
    // Given previous context, I'll try to find if there is a known way.
    // Checking previous scripts... 'apply_reason.cjs' used direct update instructions.
    // 'test_db_connection_v2.js' used simple select.

    // If no direct SQL execution is available via JS, we might have to guide the user or hope they have an 'exec_sql' function.
    // Let's check for 'exec_sql' RPC.

    const { data, error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
        // If RPC fails (maybe doesn't exist), we will output the SQL and ask user to run it, 
        // OR we can try to assume the user has psql installed if we were strictly in a terminal env, 
        // but here we are in a hybrid. 
        // ACTUALLY, I see 'run_command' is available. I should probably just use the tool to run psql IF I knew credentials.
        // But I don't have the password for psql usually.

        console.error("RPC 'exec_sql' failed or missing:", error);
        console.log("---------------------------------------------------");
        console.log("MANUAL ACTION REQUIRED: Run this SQL in Supabase SQL Editor:");
        console.log(sql);
    } else {
        console.log("SQL Applied Successfully via RPC!");
    }
}

applySql();
