import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Client } = pg;
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
    try {
        await client.connect();
        console.log("SUCCESS: Connected to Supabase via Postgres!");
        const res = await client.query('SELECT NOW()');
        console.log('Database Time:', res.rows[0].now);
        await client.end();
    } catch (err) {
        console.error("CONNECTION FAILED:", err);
        process.exit(1);
    }
}

testConnection();
