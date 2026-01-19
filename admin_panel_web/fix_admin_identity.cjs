
const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to DB.");

        const EMAIL = 'amorbuba@fixarr.es';

        // 1. Get User ID
        const res = await client.query(`SELECT id FROM auth.users WHERE email = $1`, [EMAIL]);
        if (res.rows.length === 0) throw new Error("User not found!");

        const userId = res.rows[0].id;
        console.log("Found User ID:", userId);

        // 2. Insert Identity
        // We use the same userId as identity ID for simplicity, or genereate new
        // Supabase usually generates a new one. We'll use gen_random_uuid().
        const identityData = JSON.stringify({
            sub: userId,
            email: EMAIL,
            email_verified: true,
            phone_verified: false
        });

        await client.query(`
            INSERT INTO auth.identities (
                id,
                user_id,
                identity_data,
                provider,
                provider_id,
                last_sign_in_at,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(), -- Identity ID
                $1::uuid,          -- User ID
                $2,                -- Identity Data
                'email',           -- Provider
                $1::text,          -- Provider ID
                NOW(),
                NOW(),
                NOW()
            )
        `, [userId, identityData]);

        console.log("Identity inserted successfully.");

    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        await client.end();
    }
}

run();
