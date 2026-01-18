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
        const sqlPath = path.join(__dirname, '..', 'cleanup_mortify_duplicates.sql');
        console.log(`Reading Cleanup SQL from: ${sqlPath}`);
        const sql = fs.readFileSync(sqlPath, 'utf8');
        const res = await client.query(sql);
        console.log(`SUCCESS: Cleaned up duplicates. Rows affected: ${res.rowCount}`);
    } catch (e) {
        console.error("ERROR Cleaning Up:", e);
    } finally {
        await client.end();
    }
}
run();
