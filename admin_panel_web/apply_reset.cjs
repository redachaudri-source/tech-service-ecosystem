const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; // Try both
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; // Prefer service role if available for admin tasks

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: DATABASE_URL keys not found in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runReset() {
    try {
        const sqlPath = path.join(__dirname, '..', 'reset_mortify_data.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Clearing Mortify Assessments...');
        // Execute raw SQL using rpc if available, or just use the JS client to delete if no direct SQL access.
        // Since we don't have a generic "exec_sql" RPC function exposed usually, we'll try to delete via standard query first.

        // Option A: If we can't run raw SQL easily without a helper, we can just delete all rows.
        const { error } = await supabase
            .from('mortify_assessments')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything

        if (error) throw error;

        console.log('✅ Mortify Assessments cleared successfully.');
    } catch (err) {
        console.error('❌ Error clearing data:', err.message);
    }
}

runReset();
