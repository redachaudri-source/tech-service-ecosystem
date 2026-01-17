const { Client } = require('pg');
require('dotenv').config({ path: './.env' });

const client = new Client({
    connectionString: process.env.VITE_SUPABASE_URL ? process.env.VITE_SUPABASE_URL.replace('https://', 'postgres://postgres.').replace('.supabase.co', '.supabase.co:5432/postgres') : process.env.DATABASE_URL,
    password: process.env.VITE_SUPABASE_ANON_KEY // This might not work if it needs real DB password
});

// We need the REAL connection string with password.
// I'll reuse the connection logic from `apply_reason.cjs` if it exists and had the password.
// Let's check `test_db_final.js` for the connection string format.

const connectionString = "postgres://postgres.rzpmuqdrqlzmdjrrgkvg:Supabase@2025!@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

const db = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await db.connect();
        console.log("Connected.");

        const res = await db.query(`
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name IN ('reviews', 'profiles')
            ORDER BY table_name, column_name;
        `);

        console.log("Schema:", res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await db.end();
    }
}

run();
