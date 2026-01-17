const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env' });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        const sql = fs.readFileSync('../add_status_reason_to_profiles.sql', 'utf8');
        await client.query(sql);
        console.log("Migration applied: status_reason added.");
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
