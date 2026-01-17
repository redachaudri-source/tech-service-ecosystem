import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;

// Explicit config to bypass URI encoding issues with '#'
const client = new Client({
    host: 'aws-1-eu-west-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.zapjbtgnmxkhpfykxmnh',
    password: '#RedaYNayke1427', // Raw password
    database: 'postgres',
    ssl: { rejectUnauthorized: false } // Required for Supabase usually
});

async function testConnection() {
    try {
        console.log("Connecting...");
        await client.connect();
        console.log("SUCCESS: Connected to Supabase via Postgres!");
        const res = await client.query('SELECT NOW()');
        console.log('Database Time:', res.rows[0].now);
        await client.end();
    } catch (err) {
        console.error("CONNECTION FAILED:", err.message);
        process.exit(1);
    }
}

testConnection();
