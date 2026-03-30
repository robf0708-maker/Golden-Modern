-- Migration: Funil de Reativação — Campos de controle em notification_settings
-- Data: 18/03/2026
-- Descrição: Adiciona switches e templates para mensagens do funil

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS reactivation_20days_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reactivation_20days_template TEXT,
  ADD COLUMN IF NOT EXISTS reactivation_30days_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reactivation_30days_template TEXT,
  ADD COLUMN IF NOT EXISTS reactivation_45days_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reactivation_45days_template TEXT,
  ADD COLUMN IF NOT EXISTS predicted_return_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS predicted_return_template TEXT;
