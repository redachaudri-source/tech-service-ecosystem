const { Client } = require('pg');
const connectionString = 'postgresql://postgres.zapjbtgnmxkhpfykxmnh:Fixarrweb1427@aws-1-eu-west-1.pooler.supabase.com:6543/postgres';
const client = new Client({ connectionString });

async function run() {
    try {
        await client.connect();
        // Fetch ticket 160 and its client's user_id
        const res = await client.query(`
      SELECT 
        t.ticket_number, 
        t.origin_source, 
        t.created_via, 
        p.user_id,
        p.full_name
      FROM tickets t
      LEFT JOIN profiles p ON t.client_id = p.id
      WHERE t.ticket_number = 160
    `);
        console.log('Ticket 160 Data:', res.rows[0]);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
