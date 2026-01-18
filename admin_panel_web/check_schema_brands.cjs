const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();

        console.log("--- CLIENT APPLIANCES COLUMNS ---");
        const res1 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'client_appliances';");
        console.table(res1.rows);

        console.log("--- MORTIFY BRAND SCORES COLUMNS ---");
        const res2 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'mortify_brand_scores';");
        console.table(res2.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
