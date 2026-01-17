require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const run = async () => {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to DB');

        const sqlPath = path.join(__dirname, '../add_status_to_profiles.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing SQL...');
        await client.query(sql);
        console.log('Migration completed successfully!');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
};

run();
