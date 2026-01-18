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
        const sql = fs.readFileSync('../drop_mortify_trigger.sql', 'utf8');
        await client.query(sql);
        console.log("SQL Executed Successfully");
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
