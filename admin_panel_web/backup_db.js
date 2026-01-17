import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const { Client } = pg;

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function backupDatabase() {
    try {
        console.log("🔌 Connecting to Database...");
        await client.connect();
        console.log("✅ Connected!");

        // 1. Create Backup Directory
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, 'backups', timestamp);
        fs.mkdirSync(backupDir, { recursive: true });
        console.log(`ue4 Creado directorio: ${backupDir}`);

        // 2. Get All Tables
        const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE';
    `);

        const tables = res.rows.map(r => r.table_name);
        console.log(`📋 Tablas encontradas: ${tables.length}`);

        // 3. Dump Each Table
        for (const table of tables) {
            console.log(`   ⬇️ Descargando: ${table}...`);
            try {
                const dataRes = await client.query(`SELECT * FROM "${table}"`); // Quote table name for safety
                const filePath = path.join(backupDir, `${table}.json`);
                fs.writeFileSync(filePath, JSON.stringify(dataRes.rows, null, 2));
            } catch (err) {
                console.error(`   ❌ Error descargando ${table}: ${err.message}`);
            }
        }

        console.log("\n🎉 ¡Copia de Seguridad Completada!");
        console.log(`📁 Ubicación: ${backupDir}`);

        await client.end();

    } catch (err) {
        console.error("❌ Error Fatal:", err);
        process.exit(1);
    }
}

backupDatabase();
