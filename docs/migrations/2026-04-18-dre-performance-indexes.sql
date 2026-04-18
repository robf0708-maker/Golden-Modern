-- Migration: Índices de Performance para DRE
-- Data: 18/04/2026
-- Descrição: Cria índices compostos para acelerar o relatório financeiro (DRE).
--
-- Todos os índices usam CREATE INDEX CONCURRENTLY (não trava a tabela em produção)
-- e IF NOT EXISTS (idempotente — pode rodar várias vezes sem erro).
--
-- IMPORTANTE: CONCURRENTLY não pode rodar dentro de uma transação.
-- No Supabase SQL Editor, execute cada comando individualmente OU
-- use psql com --single-transaction=off. Cada índice é independente.
--
-- Rollback: cada índice pode ser removido com `DROP INDEX CONCURRENTLY nome_do_indice;`
-- sem afetar dados nem outras queries.

-- ============================================================================
-- Índice principal para o DRE: filtro por barbearia + status + data de pagamento.
-- Cobre o caso mais comum (status='closed' + paidAt BETWEEN start AND end).
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comandas_barbershop_status_paid_at
  ON comandas(barbershop_id, status, paid_at DESC);

-- ============================================================================
-- Índice auxiliar para queries que filtram só por barbershop + createdAt
-- (ex: dashboards de visão geral, alertas baseados em período)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comandas_barbershop_created
  ON comandas(barbershop_id, created_at DESC);

-- ============================================================================
-- Comissões — filtro por barbearia + período em createdAt usado pelo DRE,
-- painel de comissões, histórico por barbeiro.
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commissions_barbershop_created
  ON commissions(barbershop_id, created_at DESC);

-- ============================================================================
-- Comanda items — lookup por comanda_id (batch fetch no DRE, PDV, histórico)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comanda_items_comanda
  ON comanda_items(comanda_id);

-- ============================================================================
-- Client packages — busca por cliente (ativo em múltiplas queries)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_packages_client
  ON client_packages(client_id);

-- ============================================================================
-- Cash transactions — filtro por caixa + data (barbershop_id é acessado via cash_register)
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cash_transactions_register_created
  ON cash_transactions(cash_register_id, created_at DESC);

-- ============================================================================
-- Fixed expenses — pequena, mas DRE filtra sempre por barbershop + active
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fixed_expenses_barbershop_active
  ON fixed_expenses(barbershop_id, active);

-- ============================================================================
-- Appointments — dashboards e chatbot consultam por barbearia + data/status
-- ============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_barbershop_start
  ON appointments(barbershop_id, start_time);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_barbershop_status
  ON appointments(barbershop_id, status);

-- ============================================================================
-- Verificação pós-execução (opcional): listar os índices criados
-- ============================================================================
-- SELECT tablename, indexname
--   FROM pg_indexes
--  WHERE schemaname = 'public'
--    AND indexname LIKE 'idx_%'
--  ORDER BY tablename, indexname;
