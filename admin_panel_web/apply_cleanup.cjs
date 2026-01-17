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
        const sql = fs.readFileSync('../delete_orphan_assessments.sql', 'utf8');
        await client.query(sql);
        console.log("Cleanup applied: Orphan Assessments Deleted.");
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
