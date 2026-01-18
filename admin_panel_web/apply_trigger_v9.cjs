const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        const sqlPath = path.join(__dirname, '..', 'fix_mortify_trigger_v9_reliable.sql');
        console.log(`Reading SQL from: ${sqlPath}`);
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await client.query(sql);
        console.log("SUCCESS: Trigger V9 applied.");
    } catch (e) {
        console.error("ERROR Applying SQL:", e);
        process.exit(1);
    } finally {
        await client.end();
    }
}
run();
