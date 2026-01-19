
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

// 1. Setup Supabase Client (Anon)
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// 2. Setup Postgres Client (Admin)
const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("Starting Hybrid Recovery...");

        // Connect PG
        await pgClient.connect();

        // A. DELETE BROKEN USER
        const EMAIL = 'amorbuba@fixarr.es';
        const PASSWORD = 'RedaYNayke1427';

        console.log(`Cleaning up ${EMAIL}...`);
        await pgClient.query("DELETE FROM auth.users WHERE email = $1", [EMAIL]);
        await pgClient.query("DELETE FROM public.profiles WHERE email = $1", [EMAIL]);
        console.log("Cleanup complete.");

        // B. SIGN UP via Supabase API (Guarantee correct Auth Schema)
        console.log("Signing up via API...");
        const { data, error } = await supabase.auth.signUp({
            email: EMAIL,
            password: PASSWORD,
            options: {
                data: {
                    full_name: 'Super Admin',
                    role: 'admin'
                }
            }
        });

        if (error) throw error;

        const userId = data.user?.id;
        if (!userId) throw new Error("SignUp succesful but no User ID returned? " + JSON.stringify(data));

        console.log("User Created via API:", userId);

        // C. ELEVATE PRIVILEGES via SQL
        console.log("Elevating privileges...");

        // 1. Confirm Email & Update Role in Auth
        await pgClient.query(`
            UPDATE auth.users 
            SET email_confirmed_at = NOW(), 
                role = 'authenticated',
                raw_app_meta_data = '{"provider": "email", "providers": ["email"]}',
                raw_user_meta_data = '{"full_name": "Super Admin", "role": "admin", "is_super_admin": true}'
            WHERE id = $1
        `, [userId]);

        // 2. Create/Update Profile (Super Admin)
        await pgClient.query(`
            INSERT INTO public.profiles (
                id, user_id, email, full_name, role, is_super_admin, is_active, status, permissions, created_via
            ) VALUES (
                $1, $1, $2, 'Super Admin', 'admin', true, true, 'active', 
                '{"can_manage_team": true, "can_delete_tickets": true, "can_manage_inventory": true, "can_view_all_clients": true, "can_view_all_tickets": true}',
                'hybrid_recovery'
            )
            ON CONFLICT (id) DO UPDATE SET
                role = 'admin',
                is_super_admin = true,
                is_active = true,
                status = 'active';
        `, [userId, EMAIL]);

        console.log("SUCCESS: Account fully restored and elevated.");

    } catch (e) {
        console.error("CRITICAL ERROR:", e);
    } finally {
        await pgClient.end();
    }
}

run();
