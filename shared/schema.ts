import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Users / Authentication (multi-tenant by barbershop)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  phone: text("phone"), // WhatsApp do admin (para notificações)
  barbershopId: varchar("barbershop_id").notNull(),
  role: text("role").notNull().default("owner"), // owner = dono da conta, manager = gerente convidado
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Barbershops (multi-tenant)
export const barbershops = pgTable("barbershops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  logo: text("logo"),
  // Working hours: JSON with days and open/close times
  workingHours: json("working_hours").$type<{
    monday: { open: string; close: string; enabled: boolean };
    tuesday: { open: string; close: string; enabled: boolean };
    wednesday: { open: string; close: string; enabled: boolean };
    thursday: { open: string; close: string; enabled: boolean };
    friday: { open: string; close: string; enabled: boolean };
    saturday: { open: string; close: string; enabled: boolean };
    sunday: { open: string; close: string; enabled: boolean };
  }>(),
  // Booking settings
  bookingIntervalMinutes: integer("booking_interval_minutes").notNull().default(30), // 15, 30, 60 min slots
  bookingAdvanceHours: real("booking_advance_hours").notNull().default(2), // min hours before appointment (0.5 = 30min)
  bookingMaxDaysAhead: integer("booking_max_days_ahead").notNull().default(30), // max days to book in advance
  // Payment fees (taxas de pagamento)
  feeCredit: decimal("fee_credit", { precision: 5, scale: 2 }).default("0"), // Taxa cartão crédito %
  feeDebit: decimal("fee_debit", { precision: 5, scale: 2 }).default("0"), // Taxa cartão débito %
  feePix: decimal("fee_pix", { precision: 5, scale: 2 }).default("0"), // Taxa PIX %
  // Taxa do Stripe para assinaturas (porcentagem + valor fixo)
  feeStripePercent: decimal("fee_stripe_percent", { precision: 5, scale: 2 }).default("3.99"), // Taxa Stripe %
  feeStripeFixed: decimal("fee_stripe_fixed", { precision: 10, scale: 2 }).default("0.39"), // Taxa fixa Stripe R$
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBarbershopSchema = createInsertSchema(barbershops).omit({ id: true, createdAt: true });
export type InsertBarbershop = z.infer<typeof insertBarbershopSchema>;
export type Barbershop = typeof barbershops.$inferSelect;

// Tipo para intervalo por dia da semana
export type BreakSchedule = {
  monday: { start: string | null; end: string | null; enabled: boolean };
  tuesday: { start: string | null; end: string | null; enabled: boolean };
  wednesday: { start: string | null; end: string | null; enabled: boolean };
  thursday: { start: string | null; end: string | null; enabled: boolean };
  friday: { start: string | null; end: string | null; enabled: boolean };
  saturday: { start: string | null; end: string | null; enabled: boolean };
  sunday: { start: string | null; end: string | null; enabled: boolean };
};

// Barbeiros (Barbers)
export const barbers = pgTable("barbers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"), // WhatsApp do barbeiro para login no painel
  password: text("password"), // Senha para acesso ao painel do barbeiro
  avatar: text("avatar"),
  role: text("role"), // Master Barber, Barber, etc
  commissionType: text("commission_type").notNull().default("percentage"), // percentage or fixed
  commissionValue: decimal("commission_value", { precision: 10, scale: 2 }).notNull().default("50"), // 50% or R$50
  lunchStart: text("lunch_start"), // DEPRECATED: use breakSchedule - mantido para migração
  lunchEnd: text("lunch_end"), // DEPRECATED: use breakSchedule - mantido para migração
  breakSchedule: json("break_schedule").$type<BreakSchedule>(), // Intervalo configurável por dia da semana
  active: boolean("active").notNull().default(true),
  allowAutoAssign: boolean("allow_auto_assign").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBarberSchema = createInsertSchema(barbers).omit({ id: true, createdAt: true });
export type InsertBarber = z.infer<typeof insertBarberSchema>;
export type Barber = typeof barbers.$inferSelect;

// Clients
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // === FUNIL DE CLIENTES ===
  firstVisitAt: timestamp("first_visit_at"),
  lastVisitAt: timestamp("last_visit_at"),
  totalVisits: integer("total_visits").notNull().default(0),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }),
  averageTicket: decimal("average_ticket", { precision: 10, scale: 2 }),
  averageVisitIntervalDays: real("average_visit_interval_days"),
  clientStatus: text("client_status").notNull().default("novo_cliente"),
  planOfferEligible: boolean("plan_offer_eligible").notNull().default(false),
  lastReactivationMessageAt: timestamp("last_reactivation_message_at"),
  preferredBarberId: varchar("preferred_barber_id").references(() => barbers.id, { onDelete: "set null" }),
  predictedNextVisit: timestamp("predicted_next_visit"),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// Services
export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(), // in minutes
  category: text("category"),
  commissionType: text("commission_type"), // null = use barber default, percentage or fixed
  commissionValue: decimal("commission_value", { precision: 10, scale: 2 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertServiceSchema = createInsertSchema(services).omit({ id: true, createdAt: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof services.$inferSelect;

// Products
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  professionalPrice: decimal("professional_price", { precision: 10, scale: 2 }), // Preço especial para venda ao profissional
  cost: decimal("cost", { precision: 10, scale: 2 }),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(5),
  hasCommission: boolean("has_commission").notNull().default(false),
  commissionPercentage: decimal("commission_percentage", { precision: 5, scale: 2 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Packages
export const packages = pgTable("packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(), // number of uses
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  validityDays: integer("validity_days").notNull(), // expiration in days
  isRecurring: boolean("is_recurring").notNull().default(false), // se é plano recorrente
  recurringInterval: text("recurring_interval"), // monthly, weekly, biweekly
  stripePriceId: text("stripe_price_id"), // Stripe Price ID para assinaturas
  stripeProductId: text("stripe_product_id"), // Stripe Product ID
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPackageSchema = createInsertSchema(packages).omit({ id: true, createdAt: true });
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packages.$inferSelect;

// Client Packages (purchased packages)
export const clientPackages = pgTable("client_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  packageId: varchar("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
  subscriptionId: varchar("subscription_id"),
  quantityRemaining: integer("quantity_remaining").notNull(),
  quantityOriginal: integer("quantity_original").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  // Valor líquido do pacote (após taxas do Stripe) para cálculo correto de comissões
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }), // Valor líquido recebido
  paymentMethod: text("payment_method"), // card, pix, cash - método de pagamento usado
});

export const insertClientPackageSchema = createInsertSchema(clientPackages).omit({ id: true, purchasedAt: true });
export type InsertClientPackage = z.infer<typeof insertClientPackageSchema>;
export type ClientPackage = typeof clientPackages.$inferSelect;

// Appointments
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  barberId: varchar("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, completed, cancelled
  notes: text("notes"),
  usedPackage: boolean("used_package").notNull().default(false),
  clientPackageId: varchar("client_package_id").references(() => clientPackages.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointments.$inferSelect;

// Appointment Services (multiple services per appointment)
export const appointmentServices = pgTable("appointment_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(),
  usedPackage: boolean("used_package").notNull().default(false),
  clientPackageId: varchar("client_package_id").references(() => clientPackages.id, { onDelete: "set null" }),
});

export const insertAppointmentServiceSchema = createInsertSchema(appointmentServices).omit({ id: true });
export type InsertAppointmentService = z.infer<typeof insertAppointmentServiceSchema>;
export type AppointmentService = typeof appointmentServices.$inferSelect;

// Comandas (Orders/Tickets)
export const comandas = pgTable("comandas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  barberId: varchar("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "set null" }),
  appointmentId: varchar("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
  status: text("status").notNull().default("open"), // open, closed, cancelled
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 10, scale: 2 }).default("0"),
  surcharge: decimal("surcharge", { precision: 10, scale: 2 }).default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method"), // dinheiro, pix, credito, debito, split
  paymentDetails: json("payment_details"), // For split payments and change calculation
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertComandaSchema = createInsertSchema(comandas).omit({ id: true, createdAt: true });
export type InsertComanda = z.infer<typeof insertComandaSchema>;
export type Comanda = typeof comandas.$inferSelect;

// Comanda Items
export const comandaItems = pgTable("comanda_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  comandaId: varchar("comanda_id").notNull().references(() => comandas.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // service, product, package_sale, package_use, subscription_sale
  serviceId: varchar("service_id").references(() => services.id, { onDelete: "set null" }),
  productId: varchar("product_id").references(() => products.id, { onDelete: "set null" }),
  packageId: varchar("package_id").references(() => packages.id, { onDelete: "set null" }),
  clientPackageId: varchar("client_package_id").references(() => clientPackages.id, { onDelete: "set null" }),
  subscriptionId: varchar("subscription_id"), // ID da assinatura criada quando fechar a comanda
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }), // preço original quando é compra do barbeiro (unitPrice fica 0)
  usedPackage: boolean("used_package").notNull().default(false), // if service used a package
  isBarberPurchase: boolean("is_barber_purchase").notNull().default(false), // true = produto comprado pelo barbeiro, não gera comissão e desconta
  // Campos de desconto
  discountType: text("discount_type"), // 'percentage' ou 'fixed' - null significa sem desconto
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }), // valor ou percentual do desconto
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }), // valor calculado do desconto em reais
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertComandaItemSchema = createInsertSchema(comandaItems).omit({ id: true, createdAt: true });
export type InsertComandaItem = z.infer<typeof insertComandaItemSchema>;
export type ComandaItem = typeof comandaItems.$inferSelect;

// Cash Register (Caixa)
export const cashRegister = pgTable("cash_register", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  openingAmount: decimal("opening_amount", { precision: 10, scale: 2 }).notNull(),
  closingAmount: decimal("closing_amount", { precision: 10, scale: 2 }),
  expectedAmount: decimal("expected_amount", { precision: 10, scale: 2 }),
  difference: decimal("difference", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("open"), // open, closed
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const insertCashRegisterSchema = createInsertSchema(cashRegister).omit({ id: true, openedAt: true });
export type InsertCashRegister = z.infer<typeof insertCashRegisterSchema>;
export type CashRegister = typeof cashRegister.$inferSelect;

// Cash Transactions (sangrias, reforços, estornos)
export const cashTransactions = pgTable("cash_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cashRegisterId: varchar("cash_register_id").notNull().references(() => cashRegister.id, { onDelete: "cascade" }),
  comandaId: varchar("comanda_id").references(() => comandas.id, { onDelete: "set null" }),
  type: text("type").notNull(), // sangria, reforco, estorno
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCashTransactionSchema = createInsertSchema(cashTransactions).omit({ id: true, createdAt: true });
export type InsertCashTransaction = z.infer<typeof insertCashTransactionSchema>;
export type CashTransaction = typeof cashTransactions.$inferSelect;

// Commissions
export const commissions = pgTable("commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  barberId: varchar("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
  comandaItemId: varchar("comanda_item_id").notNull().references(() => comandaItems.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull(), // service, product, package, deduction
  paid: boolean("paid").notNull().default(false),
  paidAt: timestamp("paid_at"),
  paymentId: varchar("payment_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCommissionSchema = createInsertSchema(commissions).omit({ id: true, createdAt: true });
export type InsertCommission = z.infer<typeof insertCommissionSchema>;
export type Commission = typeof commissions.$inferSelect;

// Commission Payments (fechamentos de comissão)
export const commissionPayments = pgTable("commission_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  barberId: varchar("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  totalCommissions: decimal("total_commissions", { precision: 10, scale: 2 }).notNull(),
  totalDeductions: decimal("total_deductions", { precision: 10, scale: 2 }).notNull().default("0"),
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(),
  cashTransactionId: varchar("cash_transaction_id").references(() => cashTransactions.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
});

export const insertCommissionPaymentSchema = createInsertSchema(commissionPayments).omit({ id: true, paidAt: true });
export type InsertCommissionPayment = z.infer<typeof insertCommissionPaymentSchema>;
export type CommissionPayment = typeof commissionPayments.$inferSelect;

// Notification Settings (configurações de notificação por barbearia)
export const notificationSettings = pgTable("notification_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }).unique(),
  provider: text("provider").notNull().default("uazapi"),
  welcomeEnabled: boolean("welcome_enabled").notNull().default(true),
  reminder1DayEnabled: boolean("reminder_1day_enabled").notNull().default(true),
  reminder1HourEnabled: boolean("reminder_1hour_enabled").notNull().default(true),
  confirmationEnabled: boolean("confirmation_enabled").notNull().default(true),
  cancellationEnabled: boolean("cancellation_enabled").notNull().default(true),
  welcomeTemplate: text("welcome_template"),
  reminder1DayTemplate: text("reminder_1day_template"),
  reminder1HourTemplate: text("reminder_1hour_template"),
  confirmationTemplate: text("confirmation_template"),
  cancellationTemplate: text("cancellation_template"),
  subscriptionExpiryEnabled: boolean("subscription_expiry_enabled").notNull().default(true),
  subscriptionExpiryTemplate: text("subscription_expiry_template"),
  // Funil de Reativação
  funnelAutomationEnabled: boolean("funnel_automation_enabled").notNull().default(false),
  reactivation20daysEnabled: boolean("reactivation_20days_enabled").notNull().default(true),
  reactivation20daysTemplate: text("reactivation_20days_template"),
  reactivation30daysEnabled: boolean("reactivation_30days_enabled").notNull().default(true),
  reactivation30daysTemplate: text("reactivation_30days_template"),
  reactivation45daysEnabled: boolean("reactivation_45days_enabled").notNull().default(true),
  reactivation45daysTemplate: text("reactivation_45days_template"),
  predictedReturnEnabled: boolean("predicted_return_enabled").notNull().default(true),
  predictedReturnTemplate: text("predicted_return_template"),
  // Avisos para o Profissional
  professionalBookingEnabled: boolean("professional_booking_enabled").notNull().default(false),
  professionalCancellationEnabled: boolean("professional_cancellation_enabled").notNull().default(false),
  // Aviso de fechamento de caixa para o admin
  cashClosingEnabled: boolean("cash_closing_enabled").notNull().default(false),
  cashClosingPhone: text("cash_closing_phone"), // WhatsApp do admin para receber o aviso
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertNotificationSettingsSchema = createInsertSchema(notificationSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationSettings = z.infer<typeof insertNotificationSettingsSchema>;
export type NotificationSettings = typeof notificationSettings.$inferSelect;

// Scheduled Messages (mensagens agendadas para envio)
export const scheduledMessages = pgTable("scheduled_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  appointmentId: varchar("appointment_id").references(() => appointments.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages).omit({ id: true, createdAt: true, retryCount: true });
export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;

// Chatbot Settings (configurações do chatbot IA por barbearia)
export const chatbotSettings = pgTable("chatbot_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }).unique(),
  enabled: boolean("enabled").notNull().default(false),
  // Prompts e regras configuráveis
  systemPrompt: text("system_prompt"), // Prompt base do comportamento da IA
  greetingNewClient: text("greeting_new_client"), // Saudação para cliente novo
  greetingReturningClient: text("greeting_returning_client"), // Saudação para cliente que volta
  askServicePrompt: text("ask_service_prompt"), // Pergunta sobre serviço
  askBarberPrompt: text("ask_barber_prompt"), // Pergunta sobre profissional
  askDatePrompt: text("ask_date_prompt"), // Pergunta sobre data
  askTimePrompt: text("ask_time_prompt"), // Pergunta sobre horário
  confirmationPrompt: text("confirmation_prompt"), // Confirmação do agendamento
  cancellationPrompt: text("cancellation_prompt"), // Mensagem de cancelamento
  noAvailabilityPrompt: text("no_availability_prompt"), // Sem horários disponíveis
  waitingOptionEnabled: boolean("waiting_option_enabled").notNull().default(true), // Permitir opção de espera
  waitingPrompt: text("waiting_prompt"), // Perguntar se quer esperar
  // Regras de negócio
  minAdvanceMinutes: integer("min_advance_minutes").notNull().default(60), // Mínimo de antecedência
  maxDaysAhead: integer("max_days_ahead").notNull().default(30), // Máximo de dias para agendar
  // Segurança do webhook
  webhookToken: varchar("webhook_token", { length: 64 }), // Token para verificar chamadas do webhook
  // WhatsApp multi-instância (UazAPI)
  uazapiInstanceToken: text("uazapi_instance_token"),   // token da instância desta barbearia
  uazapiInstanceName: text("uazapi_instance_name"),      // nome da instância no UazAPI
  whatsappConnected: boolean("whatsapp_connected").default(false),
  whatsappPhone: text("whatsapp_phone"),                // número conectado ex: +5511999991111
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChatbotSettingsSchema = createInsertSchema(chatbotSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChatbotSettings = z.infer<typeof insertChatbotSettingsSchema>;
export type ChatbotSettings = typeof chatbotSettings.$inferSelect;

// Chat Conversations (conversas ativas do chatbot)
export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  // Estado da conversa
  state: text("state").notNull().default("idle"), // idle, selecting_service, selecting_barber, selecting_date, selecting_time, confirming, cancelling
  // Dados temporários do agendamento em construção
  pendingServiceId: varchar("pending_service_id"),
  pendingBarberId: varchar("pending_barber_id"),
  pendingDate: text("pending_date"), // YYYY-MM-DD
  pendingTime: text("pending_time"), // HH:MM
  // Histórico de mensagens (últimas N mensagens para contexto)
  messageHistory: json("message_history").$type<Array<{ role: string; content: string; timestamp: string }>>(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  // Human takeover: quando admin assume a conversa, IA fica pausada até esse horário
  humanTakeoverUntil: timestamp("human_takeover_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({ id: true, createdAt: true });
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;

// Password Reset Tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({ id: true, createdAt: true });
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Subscriptions (Assinaturas recorrentes de pacotes)
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  packageId: varchar("package_id").notNull().references(() => packages.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"), // active, paused, cancelled, expired
  paymentMethod: text("payment_method").notNull(), // card, cash, pix
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID
  stripeSubscriptionId: text("stripe_subscription_id"), // Stripe subscription ID
  currentPeriodStart: timestamp("current_period_start").notNull(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  nextBillingDate: timestamp("next_billing_date").notNull(),
  lastPaymentDate: timestamp("last_payment_date"),
  lastPaymentAmount: decimal("last_payment_amount", { precision: 10, scale: 2 }),
  clientPackageId: varchar("client_package_id").references(() => clientPackages.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Subscription Payments (Histórico de pagamentos de assinatura)
export const subscriptionPayments = pgTable("subscription_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  comandaId: varchar("comanda_id").references(() => comandas.id, { onDelete: "set null" }), // Comanda onde foi pago
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(), // card, cash, pix
  status: text("status").notNull().default("pending"), // pending, paid, failed
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  receivedByUserId: varchar("received_by_user_id").references(() => users.id, { onDelete: "set null" }), // Quem recebeu o pagamento
  receivedByBarberId: varchar("received_by_barber_id").references(() => barbers.id, { onDelete: "set null" }), // Barbeiro que recebeu (se for login de barbeiro)
  cashRegisterId: varchar("cash_register_id").references(() => cashRegister.id, { onDelete: "set null" }), // Caixa onde foi registrado
  paidAt: timestamp("paid_at"),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubscriptionPaymentSchema = createInsertSchema(subscriptionPayments).omit({ id: true, createdAt: true });
export type InsertSubscriptionPayment = z.infer<typeof insertSubscriptionPaymentSchema>;
export type SubscriptionPayment = typeof subscriptionPayments.$inferSelect;

// Fixed Expenses (Despesas Fixas)
export const fixedExpenses = pgTable("fixed_expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(), // aluguel, agua, luz, internet, salarios, etc
  recurrence: text("recurrence").notNull().default("monthly"), // monthly, weekly, daily
  dueDay: integer("due_day"), // dia do mês para pagamento (1-31)
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFixedExpenseSchema = createInsertSchema(fixedExpenses).omit({ id: true, createdAt: true });
export type InsertFixedExpense = z.infer<typeof insertFixedExpenseSchema>;
export type FixedExpense = typeof fixedExpenses.$inferSelect;

// Refund Notifications (notificações de estorno para barbeiros)
export const refundNotifications = pgTable("refund_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id").notNull().references(() => barbershops.id, { onDelete: "cascade" }),
  barberId: varchar("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
  clientName: text("client_name"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  itemsDescription: text("items_description"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRefundNotificationSchema = createInsertSchema(refundNotifications).omit({ id: true, createdAt: true });
export type InsertRefundNotification = z.infer<typeof insertRefundNotificationSchema>;
export type RefundNotification = typeof refundNotifications.$inferSelect;

// ============ CAMPANHAS ============

export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barbershopId: varchar("barbershop_id")
    .notNull()
    .references(() => barbershops.id, { onDelete: "cascade" }),
  name: text("name"),
  message: text("message").notNull(),
  status: text("status").notNull().default("sending"), // sending | done | stopped
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  delayMinSeconds: integer("delay_min_seconds").notNull().default(15),
  delayMaxSeconds: integer("delay_max_seconds").notNull().default(45),
  dailyLimit: integer("daily_limit").notNull().default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const campaignRecipients = pgTable("campaign_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  barbershopId: varchar("barbershop_id")
    .notNull()
    .references(() => barbershops.id, { onDelete: "cascade" }),
  clientId: varchar("client_id")
    .references(() => clients.id, { onDelete: "set null" }),
  phone: text("phone").notNull(),
  clientName: text("client_name").notNull(),
  renderedMessage: text("rendered_message").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | failed
  error: text("error"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = typeof campaigns.$inferInsert;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type InsertCampaignRecipient = typeof campaignRecipients.$inferInsert;

// Barber Services (serviços que cada profissional oferece, com preço opcional)
export const barberServices = pgTable("barber_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  barberId: varchar("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  customPrice: decimal("custom_price", { precision: 10, scale: 2 }), // null = usa preço padrão do serviço
});

export const insertBarberServiceSchema = createInsertSchema(barberServices).omit({ id: true });
export type InsertBarberService = z.infer<typeof insertBarberServiceSchema>;
export type BarberService = typeof barberServices.$inferSelect;

// Controle de idempotência de webhooks Stripe: evita processar o mesmo event.id duas vezes.
export const stripeEventsProcessed = pgTable("stripe_events_processed", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

export type StripeEventProcessed = typeof stripeEventsProcessed.$inferSelect;
export type InsertStripeEventProcessed = typeof stripeEventsProcessed.$inferInsert;
