process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:Estayle0708*@db.couorjcxnwxvymffdmcj.supabase.co:5432/postgres?sslmode=require' });

const sql = `
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS first_visit_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS total_visits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS average_ticket DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS average_visit_interval_days REAL,
  ADD COLUMN IF NOT EXISTS client_status TEXT NOT NULL DEFAULT 'novo_cliente',
  ADD COLUMN IF NOT EXISTS plan_offer_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reactivation_message_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS preferred_barber_id VARCHAR REFERENCES barbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS predicted_next_visit TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_clients_last_visit_at ON clients(last_visit_at);
CREATE INDEX IF NOT EXISTS idx_clients_predicted_next_visit ON clients(predicted_next_visit);
CREATE INDEX IF NOT EXISTS idx_clients_client_status ON clients(client_status);
`;

pool.query(sql)
  .then(() => { console.log('Migration funil aplicada com sucesso!'); pool.end(); })
  .catch(e => { console.error('Erro:', e.message); pool.end(); process.exit(1); });
