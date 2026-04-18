// Script de aplicação controlada das migrações do DRE.
// Revisa a estrutura existente, aplica índices e cria a tabela fixed_expense_payments.
// Não-destrutivo: todas as operações usam IF NOT EXISTS / ON CONFLICT DO NOTHING.
//
// Uso:
//   node script/apply-dre-migrations.mjs
//
// Comportamento:
// - Conecta via DATABASE_URL (Transaction Pooler do Supabase).
// - Valida que as tabelas dependentes existem antes de criar índices.
// - Reporta contagem de linhas por tabela.
// - Aplica cada statement individualmente e imprime o resultado.

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.couorjcxnwxvymffdmcj:Estayle0708*@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";

const REQUIRED_TABLES = [
  "barbershops",
  "comandas",
  "comanda_items",
  "commissions",
  "client_packages",
  "cash_transactions",
  "fixed_expenses",
  "appointments",
];

// Índices (sem CONCURRENTLY — transaction pooler não permite)
const INDEXES = [
  ["idx_comandas_barbershop_status_paid_at", "comandas", "(barbershop_id, status, paid_at DESC)"],
  ["idx_comandas_barbershop_created", "comandas", "(barbershop_id, created_at DESC)"],
  ["idx_commissions_barbershop_created", "commissions", "(barbershop_id, created_at DESC)"],
  ["idx_comanda_items_comanda", "comanda_items", "(comanda_id)"],
  ["idx_client_packages_client", "client_packages", "(client_id)"],
  // cash_transactions não tem barbershop_id (acessa via cash_register_id → cash_register.barbershop_id)
  ["idx_cash_transactions_register_created", "cash_transactions", "(cash_register_id, created_at DESC)"],
  ["idx_fixed_expenses_barbershop_active", "fixed_expenses", "(barbershop_id, active)"],
  ["idx_appointments_barbershop_start", "appointments", "(barbershop_id, start_time)"],
  ["idx_appointments_barbershop_status", "appointments", "(barbershop_id, status)"],
];

const CREATE_PAYMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS fixed_expense_payments (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    fixed_expense_id VARCHAR NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
    barbershop_id VARCHAR NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    paid_at TIMESTAMP NOT NULL,
    reference_period TEXT NOT NULL,
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
`;

const PAYMENT_INDEXES = [
  [
    "idx_fixed_expense_payments_barbershop_paid",
    "fixed_expense_payments",
    "(barbershop_id, paid_at DESC)",
    false,
  ],
  [
    "idx_fixed_expense_payments_expense",
    "fixed_expense_payments",
    "(fixed_expense_id, paid_at DESC)",
    false,
  ],
  [
    "uq_fixed_expense_payments_expense_period",
    "fixed_expense_payments",
    "(fixed_expense_id, reference_period)",
    true,
  ],
];

const BACKFILL_SQL = `
  INSERT INTO fixed_expense_payments (fixed_expense_id, barbershop_id, amount, paid_at, reference_period, notes)
  SELECT
    fe.id,
    fe.barbershop_id,
    fe.amount,
    fe.last_paid_at,
    TO_CHAR(fe.last_paid_at, 'YYYY-MM'),
    'Importado automaticamente do last_paid_at'
  FROM fixed_expenses fe
  WHERE fe.last_paid_at IS NOT NULL
  ON CONFLICT (fixed_expense_id, reference_period) DO NOTHING
  RETURNING id;
`;

function log(step, message) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${step.padEnd(10)} ${message}`);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  log("CONNECT", "Conectado ao Supabase (Transaction Pooler)");

  try {
    // 1. Verificar existência das tabelas dependentes
    log("CHECK", "Verificando tabelas existentes...");
    const tablesResult = await client.query(
      `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES]
    );
    const existing = new Set(tablesResult.rows.map((r) => r.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
    if (missing.length > 0) {
      throw new Error(`Tabelas faltando: ${missing.join(", ")}. Abortando sem alterações.`);
    }
    log("CHECK", `Todas as ${REQUIRED_TABLES.length} tabelas estão presentes`);

    // 2. Contagem de linhas (impacto dos índices)
    log("COUNT", "Contagens de linhas nas tabelas alvo:");
    for (const table of REQUIRED_TABLES) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
      log("COUNT", `  ${table}: ${r.rows[0].n} linhas`);
    }

    // 3. Criar índices principais
    log("INDEX", "Criando índices de performance do DRE...");
    for (const [name, table, cols] of INDEXES) {
      const sql = `CREATE INDEX IF NOT EXISTS ${name} ON ${table} ${cols}`;
      try {
        await client.query(sql);
        log("INDEX", `  OK  ${name}`);
      } catch (err) {
        log("INDEX", `  ERR ${name}: ${err.message}`);
        throw err;
      }
    }

    // 4. Criar tabela fixed_expense_payments
    log("TABLE", "Criando tabela fixed_expense_payments (se não existir)...");
    await client.query(CREATE_PAYMENTS_TABLE);
    log("TABLE", "  OK fixed_expense_payments");

    // 5. Índices da nova tabela
    log("INDEX", "Criando índices da tabela fixed_expense_payments...");
    for (const [name, table, cols, isUnique] of PAYMENT_INDEXES) {
      const unique = isUnique ? "UNIQUE " : "";
      const sql = `CREATE ${unique}INDEX IF NOT EXISTS ${name} ON ${table} ${cols}`;
      try {
        await client.query(sql);
        log("INDEX", `  OK  ${name}`);
      } catch (err) {
        log("INDEX", `  ERR ${name}: ${err.message}`);
        throw err;
      }
    }

    // 6. Backfill: importar last_paid_at existente para o novo histórico
    log("BACKFILL", "Importando last_paid_at existentes...");
    const backfillResult = await client.query(BACKFILL_SQL);
    log("BACKFILL", `  ${backfillResult.rows.length} registro(s) inserido(s)`);

    // 7. ANALYZE para o planner reconhecer os novos índices
    log("ANALYZE", "Atualizando estatísticas do planner...");
    await client.query("ANALYZE comandas, comanda_items, commissions, client_packages, cash_transactions, fixed_expenses, fixed_expense_payments, appointments");
    log("ANALYZE", "  OK");

    // 8. Verificação final: listar os índices criados
    log("VERIFY", "Índices presentes após migração:");
    const indexList = await client.query(
      `SELECT tablename, indexname FROM pg_indexes
         WHERE schemaname = 'public'
           AND (indexname LIKE 'idx_%' OR indexname LIKE 'uq_%')
         ORDER BY tablename, indexname`
    );
    for (const row of indexList.rows) {
      log("VERIFY", `  ${row.tablename}.${row.indexname}`);
    }

    log("DONE", "Migração concluída com sucesso");
  } catch (err) {
    log("FATAL", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
