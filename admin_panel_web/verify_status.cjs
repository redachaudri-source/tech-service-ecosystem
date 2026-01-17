require('dotenv').config();
const { Client } = require('pg');

const run = async () => {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected. Verifying "status" column...');

        // This will throw if column doesn't exist
        const res = await client.query('SELECT status FROM profiles LIMIT 1');
        console.log('Verification Success! Column exists.');
        console.log('Sample data:', res.rows[0]);

    } catch (err) {
        console.error('Verification Failed:', err.message);
    } finally {
        await client.end();
    }
};

run();
