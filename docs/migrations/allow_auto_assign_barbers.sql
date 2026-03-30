-- Produção: coluna para "primeiro horário disponível" (public booking + admin).
-- Rode no Postgres de produção se ainda não existir (ex.: psql ou Supabase SQL editor).
-- Alternativa: na pasta do app, com DATABASE_URL de produção: npm run db:push

ALTER TABLE barbers
  ADD COLUMN IF NOT EXISTS allow_auto_assign BOOLEAN NOT NULL DEFAULT true;
