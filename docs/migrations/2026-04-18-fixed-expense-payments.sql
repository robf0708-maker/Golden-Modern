-- Migration: Histórico de Pagamentos de Despesas Fixas
-- Data: 18/04/2026
-- Descrição: Cria tabela fixed_expense_payments para guardar o histórico completo
-- de pagamentos de despesas fixas, resolvendo a limitação do campo `last_paid_at`
-- (que só preserva o último pagamento — impede consultar DRE de meses passados corretamente).
--
-- ADITIVA: não altera fixed_expenses. Campo last_paid_at continua existindo e sendo mantido
-- pelo backend para retrocompatibilidade. Nenhum código existente é quebrado por esta migração.
--
-- Rollback: `DROP TABLE fixed_expense_payments;` é seguro (tabela isolada, sem FKs de terceiros).

CREATE TABLE IF NOT EXISTS fixed_expense_payments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_expense_id VARCHAR NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
  barbershop_id VARCHAR NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  paid_at TIMESTAMP NOT NULL,
  reference_period TEXT NOT NULL, -- "YYYY-MM" (mensal) ou "YYYY-MM-DD" (semanal/diário)
  payment_method TEXT,            -- cash, pix, card, transfer (livre)
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices para acelerar as consultas do DRE:
-- 1) Listar pagamentos de uma barbearia em um intervalo
CREATE INDEX IF NOT EXISTS idx_fixed_expense_payments_barbershop_paid
  ON fixed_expense_payments(barbershop_id, paid_at DESC);

-- 2) Histórico por despesa específica
CREATE INDEX IF NOT EXISTS idx_fixed_expense_payments_expense
  ON fixed_expense_payments(fixed_expense_id, paid_at DESC);

-- 3) Evita duplicata: mesma despesa + mesmo período só pode ter um pagamento.
--    Se o usuário marcar pago duas vezes o mesmo mês, o segundo insert falha — frontend pode tratar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_expense_payments_expense_period
  ON fixed_expense_payments(fixed_expense_id, reference_period);

-- ============================================================================
-- BACKFILL (opcional): popular histórico com o `last_paid_at` atual
-- ============================================================================
-- Isso preserva o último pagamento conhecido de cada despesa já cadastrada.
-- Usa reference_period em formato YYYY-MM (assumindo recorrência mensal — ajuste se necessário).
-- Seguro: o UNIQUE INDEX acima garante que rodar esta query 2x não duplica registros.

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
ON CONFLICT (fixed_expense_id, reference_period) DO NOTHING;
