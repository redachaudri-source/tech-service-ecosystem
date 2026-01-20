const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env' });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const sqlFile = process.argv[2];

if (!sqlFile) {
    console.error("Please provide an SQL file path as argument.");
    process.exit(1);
}

async function run() {
    try {
        await client.connect();
        const sql = fs.readFileSync(sqlFile, 'utf8');
        console.log(`Executing ${sqlFile}...`);

        // Split by semicolon to handle multiple statements if simple query fails
        // But pg driver supports multiple statements usually.
        // Let's rely on standard query behavior first.
        const res = await client.query(sql);

        if (Array.isArray(res)) {
            res.forEach((r, i) => {
                console.log(`--- Result ${i + 1} (${r.command}) ---`);
                console.log(JSON.stringify(r.rows, null, 2));
            });
        } else {
            console.log(`--- Result (${res.command}) ---`);
            console.log(JSON.stringify(res.rows, null, 2));
        }
    } catch (e) {
        console.error("SQL Error:", e);
    } finally {
        await client.end();
    }
}
run();
