const { Client } = require('pg');
const connectionString = 'postgresql://postgres.zapjbtgnmxkhpfykxmnh:Fixarrweb1427@aws-1-eu-west-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString });

async function run() {
    try {
        await client.connect();
        // Fetch ticket 159 and its client's has_webapp status
        const res = await client.query(`
      SELECT 
        t.ticket_number, 
        t.origin_source, 
        t.created_via, 
        p.has_webapp,
        p.full_name
      FROM tickets t
      LEFT JOIN profiles p ON t.client_id = p.id
      WHERE t.ticket_number = 159
    `);
        console.log('Ticket 159 Data:', res.rows[0]);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
