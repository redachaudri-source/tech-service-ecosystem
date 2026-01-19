
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env' });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to DB.");

        // 1. DELETE reda@example.com
        console.log("Deleting reda@example.com...");
        // Deleting from auth.users cascades to public.profiles usually
        await client.query(`DELETE FROM auth.users WHERE email = 'reda@example.com'`);
        await client.query(`DELETE FROM public.profiles WHERE email = 'reda@example.com'`);
        console.log("Deleted reda.");

        // 2. CHECK if admin exists
        const email = 'admin@techservice.com';
        const checkRes = await client.query(`SELECT id FROM auth.users WHERE email = $1`, [email]);

        let userId;

        if (checkRes.rows.length > 0) {
            userId = checkRes.rows[0].id;
            console.log("Admin exists, resetting password...");
            const hash = await bcrypt.hash('password123', 10);
            await client.query(`UPDATE auth.users SET encrypted_password = $1 WHERE id = $2`, [hash, userId]);
        } else {
            console.log("Creating new Admin in auth.users...");
            const hash = await bcrypt.hash('password123', 10);
            // Generate a UUID (requires pgcrypto or we let DB do it if default, but auth.users.id is usually uuid)
            // We can assume gen_random_uuid() exists in postgres
            const insertRes = await client.query(`
                INSERT INTO auth.users (
                    instance_id,
                    id,
                    aud,
                    role,
                    email,
                    encrypted_password,
                    email_confirmed_at,
                    raw_app_meta_data,
                    raw_user_meta_data,
                    created_at,
                    updated_at,
                    confirmation_token,
                    recovery_token
                ) VALUES (
                    '00000000-0000-0000-0000-000000000000',
                    gen_random_uuid(),
                    'authenticated',
                    'authenticated',
                    $1,
                    $2,
                    NOW(),
                    '{"provider": "email", "providers": ["email"]}',
                    '{"full_name": "Super Admin", "role": "admin", "is_super_admin": true}',
                    NOW(),
                    NOW(),
                    '',
                    ''
                ) RETURNING id
            `, [email, hash]);
            userId = insertRes.rows[0].id;
        }

        console.log("User ID:", userId);

        // 3. UPSERT into public.profiles
        console.log("Upserting into profiles...");
        await client.query(`
            INSERT INTO public.profiles (
                id, user_id, email, full_name, role, is_super_admin, is_active, status, permissions, created_via
            ) VALUES (
                $1, $1, $2, 'Super Admin', 'admin', true, true, 'active', 
                '{"can_manage_team": true, "can_delete_tickets": true, "can_manage_inventory": true, "can_view_all_clients": true, "can_view_all_tickets": true}',
                'restore_script_pg'
            )
            ON CONFLICT (id) DO UPDATE SET
                role = 'admin',
                is_super_admin = true,
                is_active = true,
                status = 'active',
                full_name = 'Super Admin';
        `, [userId, email]);

        console.log("DONE. Super Admin Restored.");

    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        await client.end();
    }
}

run();
