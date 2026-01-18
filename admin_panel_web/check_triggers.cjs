const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        const res = await client.query(`
            SELECT 
                event_object_table AS table_name, 
                trigger_name 
            FROM information_schema.triggers 
            WHERE event_object_table = 'tickets';
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
