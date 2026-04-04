import pg from 'pg';
import { config } from 'dotenv';
config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  // 1. Colunas novas em notification_settings
  `ALTER TABLE notification_settings
     ADD COLUMN IF NOT EXISTS funnel_automation_enabled BOOLEAN NOT NULL DEFAULT false,
     ADD COLUMN IF NOT EXISTS professional_booking_enabled BOOLEAN NOT NULL DEFAULT false,
     ADD COLUMN IF NOT EXISTS professional_cancellation_enabled BOOLEAN NOT NULL DEFAULT false`,

  // 2. Unique constraint em notification_settings (barbershop_id)
  `DO $$ BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'notification_settings_barbershop_id_unique'
     ) THEN
       ALTER TABLE notification_settings ADD CONSTRAINT notification_settings_barbershop_id_unique UNIQUE (barbershop_id);
     END IF;
   END $$`,

  // 3. Tabela campaigns
  `CREATE TABLE IF NOT EXISTS campaigns (
     id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
     barbershop_id VARCHAR NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
     name TEXT,
     message TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'sending',
     total_recipients INTEGER NOT NULL DEFAULT 0,
     sent_count INTEGER NOT NULL DEFAULT 0,
     failed_count INTEGER NOT NULL DEFAULT 0,
     delay_min_seconds INTEGER NOT NULL DEFAULT 15,
     delay_max_seconds INTEGER NOT NULL DEFAULT 45,
     daily_limit INTEGER NOT NULL DEFAULT 100,
     created_at TIMESTAMP NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMP
   )`,

  // 4. Tabela campaign_recipients
  `CREATE TABLE IF NOT EXISTS campaign_recipients (
     id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
     campaign_id VARCHAR NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
     barbershop_id VARCHAR NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
     client_id VARCHAR REFERENCES clients(id) ON DELETE SET NULL,
     phone TEXT NOT NULL,
     client_name TEXT NOT NULL,
     rendered_message TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     error TEXT,
     sent_at TIMESTAMP,
     created_at TIMESTAMP NOT NULL DEFAULT NOW()
   )`,

  // 5. Tabela barber_services
  `CREATE TABLE IF NOT EXISTS barber_services (
     id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
     barber_id VARCHAR NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
     service_id VARCHAR NOT NULL REFERENCES services(id) ON DELETE CASCADE,
     custom_price DECIMAL(10,2)
   )`,
];

async function run() {
  const client = await pool.connect();
  try {
    for (const sql of migrations) {
      const label = sql.trim().split('\n')[0].substring(0, 60);
      process.stdout.write(`Executando: ${label}... `);
      await client.query(sql);
      console.log('OK');
    }
    console.log('\nMigration concluida com sucesso!');
  } catch (err) {
    console.error('\nERRO:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
