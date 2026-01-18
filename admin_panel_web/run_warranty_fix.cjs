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
        // Path relative to admin_panel_web
        const sql = fs.readFileSync('../add_warranty_dates.sql', 'utf8');
        await client.query(sql);
        console.log("Warranty Schema Applied Successfully");
    } catch (e) {
        console.error("Error applying schema:", e);
    } finally {
        await client.end();
    }
}
run();
