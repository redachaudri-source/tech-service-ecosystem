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
        const sql = process.argv[2]; // Read from command line arg
        if (!sql) throw new Error("Please provide SQL query as argument");
        console.log("Executing SQL:", sql);
        const res = await client.query(sql);
        console.log("Rows:", res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
