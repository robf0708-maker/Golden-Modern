-- Migration: Avisos para Profissional
-- Data: 03/04/2026
-- Descrição: Adiciona switches para envio de mensagens automáticas ao profissional quando cliente agenda ou cancela

ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS professional_booking_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS professional_cancellation_enabled BOOLEAN NOT NULL DEFAULT false;
