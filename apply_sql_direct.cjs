const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'admin_panel_web', '.env') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
    console.error("Missing DATABASE_URL in .env");
    process.exit(1);
}

async function applySql() {
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Usage: node apply_sql_direct.cjs <filename.sql>");
        process.exit(1);
    }

    const sqlPath = path.join(__dirname, targetFile);
    if (!fs.existsSync(sqlPath)) {
        console.error(`File not found: ${sqlPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const client = new Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false } // Required for Supabase/AWS
    });

    try {
        await client.connect();
        console.log(`Connected to DB. Applying ${targetFile}...`);
        const res = await client.query(sql);
        console.log("Success!");
        
        let results = Array.isArray(res) ? res : [res];
        
        results.forEach((r, idx) => {
            console.log(`--- Result ${idx + 1} (${r.command}) ---`);
            if (r.rows && r.rows.length > 0) {
                 console.table(r.rows);
            } else {
                console.log(`(No rows, RowCount: ${r.rowCount})`);
            }
        });
    } catch (err) {
        console.error("SQL Error:", err);
    } finally {
        await client.end();
    }
}

applySql();
