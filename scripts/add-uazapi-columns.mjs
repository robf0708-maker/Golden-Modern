/**
 * Adiciona colunas UazAPI à tabela chatbot_settings se não existirem.
 * Execute: node scripts/add-uazapi-columns.mjs
 */
import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : undefined,
});

const columns = [
  { name: 'uazapi_instance_token', type: 'TEXT' },
  { name: 'uazapi_instance_name', type: 'TEXT' },
  { name: 'whatsapp_connected', type: 'BOOLEAN DEFAULT false' },
  { name: 'whatsapp_phone', type: 'TEXT' },
];

async function main() {
  await client.connect();
  for (const col of columns) {
    try {
      await client.query(`
        ALTER TABLE chatbot_settings 
        ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}
      `);
      console.log(`Coluna ${col.name} verificada/adicionada.`);
    } catch (err) {
      console.error(`Erro em ${col.name}:`, err.message);
    }
  }
  await client.end();
  console.log('Pronto.');
}

main();
