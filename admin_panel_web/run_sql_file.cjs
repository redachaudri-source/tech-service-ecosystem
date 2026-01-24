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
        const filePath = process.argv[2];
        if (!filePath) throw new Error("Please provide SQL file path");

        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`Executing SQL from ${filePath}...`);

        const res = await client.query(sql);
        console.log("Success! Operation completed.");
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
