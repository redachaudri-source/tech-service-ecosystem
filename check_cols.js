const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.zapjbtgnmxkhpfykxmnh:Fixarrweb1427@aws-1-eu-west-1.pooler.supabase.com:6543/postgres';

const client = new Client({
    connectionString: connectionString,
});

async function run() {
    try {
        await client.connect();
        const sql = "select column_name from information_schema.columns where table_name = 'tickets'";
        const res = await client.query(sql);
        console.log('Columns:', res.rows.map(r => r.column_name));
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

run();
