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
        const sql = fs.readFileSync('check_client_row.sql', 'utf8');
        const res = await client.query(sql);
        console.log("Rows:", res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
