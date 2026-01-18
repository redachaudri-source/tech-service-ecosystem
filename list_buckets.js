const { Client } = require('pg');
const connectionString = 'postgresql://postgres.zapjbtgnmxkhpfykxmnh:Fixarrweb1427@aws-1-eu-west-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString });

async function run() {
    try {
        await client.connect();
        const res = await client.query("select id, name, public from storage.buckets");
        console.log('Buckets:', res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
