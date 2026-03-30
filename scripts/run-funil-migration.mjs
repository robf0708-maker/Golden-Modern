import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, '..', 'docs', 'migrations', 'funil_clientes.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(sql);
  console.log('✓ Migration funil_clientes executada com sucesso!');
} catch (err) {
  console.error('Erro na migration:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
