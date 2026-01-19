
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

        const OLD_EMAIL = 'admin@techservice.com';
        const NEW_EMAIL = 'amorbuba@fixarr.es';
        const NEW_PASS = 'RedaYNayke1427';

        // 1. Find the User ID (Old Email)
        const res = await client.query(`SELECT id FROM auth.users WHERE email = $1`, [OLD_EMAIL]);

        if (res.rows.length === 0) {
            console.error(`User ${OLD_EMAIL} not found! searching by role...`);
            // Fallback: Find ANY super admin
            const res2 = await client.query(`SELECT id FROM public.profiles WHERE is_super_admin = true LIMIT 1`);
            if (res2.rows.length === 0) {
                throw new Error("No Super Admin found to update.");
            }
            console.log("Found Super Admin via Profile:", res2.rows[0].id);
            await updateCreds(res2.rows[0].id, NEW_EMAIL, NEW_PASS);
        } else {
            console.log("Found Super Admin via Email:", res.rows[0].id);
            await updateCreds(res.rows[0].id, NEW_EMAIL, NEW_PASS);
        }

    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        await client.end();
    }
}

async function updateCreds(userId, email, password) {
    const hash = await bcrypt.hash(password, 10);

    // Update Auth
    await client.query(`
        UPDATE auth.users 
        SET email = $1, encrypted_password = $2, updated_at = NOW(), email_confirmed_at = NOW()
        WHERE id = $3
    `, [email, hash, userId]);
    console.log("Auth Updated.");

    // Update Profile
    await client.query(`
        UPDATE public.profiles
        SET email = $1
        WHERE id = $2
    `, [email, userId]);
    console.log("Profile Updated.");
}

run();
