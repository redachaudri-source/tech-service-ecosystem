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
        console.log('Connected to database.');

        const sql = fs.readFileSync(path.join(__dirname, 'create_signatures_bucket.sql'), 'utf8');
        console.log('Executing SQL checking for signatures bucket...');

        await client.query(sql);

        console.log('SQL executed successfully.');
    } catch (err) {
        console.error('Error executing SQL:', err);
    } finally {
        await client.end();
    }
}

run();
