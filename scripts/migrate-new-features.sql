-- Migração: adicionar colunas e tabelas novas do Golden Modern
-- Seguro: todas as alterações usam IF NOT EXISTS ou têm defaults

-- ============================================================
-- 1. users: adicionar coluna phone
-- ============================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone text;

-- ============================================================
-- 2. barbers: adicionar allow_auto_assign
-- ============================================================
ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS allow_auto_assign boolean NOT NULL DEFAULT true;

-- ============================================================
-- 3. clients: colunas do funil de clientes
-- ============================================================
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS first_visit_at timestamp without time zone;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_visit_at timestamp without time zone;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_visits integer NOT NULL DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_spent numeric(10,2);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS average_ticket numeric(10,2);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS average_visit_interval_days real;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_status text NOT NULL DEFAULT 'novo_cliente';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS plan_offer_eligible boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_reactivation_message_at timestamp without time zone;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS preferred_barber_id character varying;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS predicted_next_visit timestamp without time zone;

-- ============================================================
-- 4. notification_settings: colunas de funil e automações
-- ============================================================
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS funnel_automation_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS reactivation_20days_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS reactivation_20days_template text;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS reactivation_30days_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS reactivation_30days_template text;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS reactivation_45days_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS reactivation_45days_template text;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS predicted_return_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS predicted_return_template text;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS professional_booking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS professional_cancellation_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS cash_closing_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS cash_closing_phone text;

-- unique constraint (já pode existir, ignora erro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_settings_barbershop_id_unique'
  ) THEN
    ALTER TABLE public.notification_settings ADD CONSTRAINT notification_settings_barbershop_id_unique UNIQUE (barbershop_id);
  END IF;
END $$;

-- ============================================================
-- 5. chatbot_settings: colunas UazAPI multi-instância
-- ============================================================
ALTER TABLE public.chatbot_settings ADD COLUMN IF NOT EXISTS uazapi_instance_token text;
ALTER TABLE public.chatbot_settings ADD COLUMN IF NOT EXISTS uazapi_instance_name text;
ALTER TABLE public.chatbot_settings ADD COLUMN IF NOT EXISTS whatsapp_connected boolean DEFAULT false;
ALTER TABLE public.chatbot_settings ADD COLUMN IF NOT EXISTS whatsapp_phone text;

-- unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chatbot_settings_barbershop_id_unique'
  ) THEN
    ALTER TABLE public.chatbot_settings ADD CONSTRAINT chatbot_settings_barbershop_id_unique UNIQUE (barbershop_id);
  END IF;
END $$;

-- ============================================================
-- 6. NOVA TABELA: campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id character varying DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  barbershop_id character varying NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  name text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sending',
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delay_min_seconds integer NOT NULL DEFAULT 15,
  delay_max_seconds integer NOT NULL DEFAULT 45,
  daily_limit integer NOT NULL DEFAULT 100,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  completed_at timestamp without time zone
);

-- ============================================================
-- 7. NOVA TABELA: campaign_recipients
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id character varying DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  campaign_id character varying NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  barbershop_id character varying NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  client_id character varying REFERENCES public.clients(id) ON DELETE SET NULL,
  phone text NOT NULL,
  client_name text NOT NULL,
  rendered_message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  sent_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

-- ============================================================
-- 8. NOVA TABELA: barber_services
-- ============================================================
CREATE TABLE IF NOT EXISTS public.barber_services (
  id character varying DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  barber_id character varying NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  service_id character varying NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price numeric(10,2)
);

-- ============================================================
-- Confirmação
-- ============================================================
SELECT 'Migração concluída com sucesso!' AS resultado;
