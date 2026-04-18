import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, desc, gte, lte, sql, inArray, isNotNull, isNull } from "drizzle-orm";
import * as schema from "@shared/schema";
import { getNowAsUtcLocal } from "./utils/timezone";
import type {
  User, InsertUser,
  Barbershop, InsertBarbershop,
  Barber, InsertBarber,
  Client, InsertClient,
  Service, InsertService,
  Product, InsertProduct,
  Package, InsertPackage,
  ClientPackage, InsertClientPackage,
  Appointment, InsertAppointment,
  AppointmentService, InsertAppointmentService,
  Comanda, InsertComanda,
  ComandaItem, InsertComandaItem,
  CashRegister, InsertCashRegister,
  CashTransaction, InsertCashTransaction,
  Commission, InsertCommission,
  CommissionPayment, InsertCommissionPayment,
  NotificationSettings, InsertNotificationSettings,
  ScheduledMessage, InsertScheduledMessage,
  ChatbotSettings, InsertChatbotSettings,
  ChatConversation, InsertChatConversation,
  Subscription, InsertSubscription,
  SubscriptionPayment, InsertSubscriptionPayment,
  FixedExpense, InsertFixedExpense,
  RefundNotification, InsertRefundNotification,
  Campaign, InsertCampaign,
  CampaignRecipient, InsertCampaignRecipient,
  BarberService, InsertBarberService,
} from "@shared/schema";

const isRemoteDb = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
  max: isRemoteDb ? 5 : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const db = drizzle(pool, { schema });

// Tipos para o funil de clientes
export interface ClientsFunnelStats {
  counts: {
    novo_cliente: number;
    cliente_ativo: number;
    cliente_recorrente: number;
    cliente_plano: number;
    cliente_inativo: number;
  };
  planEligible: Array<{ id: string; name: string; phone: string; totalVisits: number; averageVisitIntervalDays: number | null }>;
  returningSoon: Array<{ id: string; name: string; phone: string; predictedNextVisit: Date | null; daysUntilReturn: number }>;
  toReactivate: Array<{ id: string; name: string; phone: string; lastVisitAt: Date | null; daysSinceVisit: number }>;
  returnRate: number;
}

export interface ClientForFunnelJob {
  id: string;
  name: string;
  phone: string;
  barbershopId: string;
  lastVisitAt: Date | null;
  predictedNextVisit: Date | null;
  lastReactivationMessageAt: Date | null;
  clientStatus: string;
  preferredBarberId: string | null;
  daysSinceVisit: number;
  daysUntilPredictedVisit: number | null;
}

export interface ClientCampaignFilter {
  mode: 'all' | 'funnel' | 'inactive' | 'manual';
  funnelStatuses?: string[];
  inactiveDays?: number;
  clientIds?: string[];
}

export interface FunnelClient {
  id: string;
  name: string;
  phone: string;
  lastVisitAt: Date | null;
  clientStatus: string | null;
  totalSpent: string | null;
  daysSinceLastVisit: number | null;
}

export interface FunnelGroup {
  count: number;
  clients: FunnelClient[];
}

export interface ClientsFunnelDashboard {
  ativos: FunnelGroup;
  recorrentes: FunnelGroup;
  comPlano: FunnelGroup;
  devemVoltar: FunnelGroup;
  emRisco: FunnelGroup;
  elegiveisPlano: FunnelGroup;
  inativos30d: FunnelGroup;
  inativos45d: FunnelGroup;
  pacotesExpirados: FunnelGroup;
}

export interface IStorage {
  // Users & Auth
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByBarbershop(barbershopId: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<Pick<InsertUser, 'name' | 'role' | 'phone'>>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  
  // Barbershops
  getBarbershop(id: string): Promise<Barbershop | undefined>;
  createBarbershop(barbershop: InsertBarbershop): Promise<Barbershop>;
  updateBarbershop(id: string, barbershop: Partial<InsertBarbershop>): Promise<Barbershop | undefined>;
  
  // Barbers
  getBarbers(barbershopId: string): Promise<Barber[]>;
  getBarber(id: string): Promise<Barber | undefined>;
  getBarberByPhone(phone: string): Promise<Barber | undefined>;
  createBarber(barber: InsertBarber): Promise<Barber>;
  updateBarber(id: string, barber: Partial<InsertBarber>): Promise<Barber | undefined>;
  deleteBarber(id: string): Promise<void>;
  
  // Clients
  getClients(barbershopId: string): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<void>;
  // Funil de Clientes
  updateClientFunnelData(clientId: string, barbershopId: string): Promise<void>;
  recalculateAllClientsStats(barbershopId: string): Promise<{ updated: number; errors: number }>;
  getClientsFunnelStats(barbershopId: string): Promise<ClientsFunnelStats>;
  getClientsFunnelDashboard(barbershopId: string): Promise<ClientsFunnelDashboard>;
  getClientsForFunnelJob(barbershopId: string): Promise<ClientForFunnelJob[]>;
  getAllClientsForFunnelJob(): Promise<ClientForFunnelJob[]>;
  backfillClientsWithoutFunnelData(): Promise<void>;
  
  // Barber Services
  getBarberServices(barberId: string): Promise<BarberService[]>;
  setBarberServices(barberId: string, services: { serviceId: string; customPrice?: string | null }[]): Promise<void>;

  // Services
  getServices(barbershopId: string): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined>;
  deleteService(id: string): Promise<void>;
  
  // Products
  getProducts(barbershopId: string): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<void>;
  
  // Packages
  getPackages(barbershopId: string): Promise<Package[]>;
  getPackage(id: string): Promise<Package | undefined>;
  createPackage(pkg: InsertPackage): Promise<Package>;
  updatePackage(id: string, pkg: Partial<InsertPackage>): Promise<Package | undefined>;
  deletePackage(id: string): Promise<void>;
  
  // Client Packages
  getClientPackages(clientId: string): Promise<ClientPackage[]>;
  getAllClientPackages(barbershopId: string): Promise<ClientPackage[]>;
  getActiveClientPackages(clientId: string): Promise<ClientPackage[]>;
  createClientPackage(clientPackage: InsertClientPackage): Promise<ClientPackage>;
  updateClientPackage(id: string, data: Partial<InsertClientPackage>): Promise<ClientPackage | undefined>;
  updateClientPackageQuantity(id: string, quantity: number): Promise<void>;
  decrementClientPackageAtomic(id: string, quantity: number): Promise<ClientPackage | null>;

  // Advisory Lock (PostgreSQL) — trava global para jobs de background
  withAdvisoryLock<T>(lockKey: number, fn: () => Promise<T>): Promise<T | null>;

  // Appointments
  getAppointments(barbershopId: string, startDate: Date, endDate: Date): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, appointment: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: string): Promise<void>;
  
  // Appointment Services (multiple services per appointment)
  getAppointmentServices(appointmentId: string): Promise<AppointmentService[]>;
  getAppointmentServicesBatch(appointmentIds: string[]): Promise<AppointmentService[]>;
  createAppointmentService(service: InsertAppointmentService): Promise<AppointmentService>;
  deleteAppointmentServices(appointmentId: string): Promise<void>;
  
  // Comandas
  getComandas(barbershopId: string, status?: string): Promise<Comanda[]>;
  getComanda(id: string): Promise<Comanda | undefined>;
  getOpenComandaByClient(barbershopId: string, clientId: string): Promise<Comanda | undefined>;
  createComanda(comanda: InsertComanda): Promise<Comanda>;
  updateComanda(id: string, comanda: Partial<InsertComanda>): Promise<Comanda | undefined>;
  
  // Comanda Items
  getComandaItems(comandaId: string): Promise<ComandaItem[]>;
  getComandaItemsByComandaIds(comandaIds: string[]): Promise<ComandaItem[]>;
  createComandaItem(item: InsertComandaItem): Promise<ComandaItem>;
  updateComandaItem(id: string, data: Partial<InsertComandaItem>): Promise<ComandaItem | undefined>;
  deleteComandaItem(id: string): Promise<void>;
  
  // Cash Register
  getOpenCashRegister(barbershopId: string): Promise<CashRegister | undefined>;
  getCashRegister(id: string): Promise<CashRegister | undefined>;
  getCashRegisterHistory(barbershopId: string): Promise<CashRegister[]>;
  createCashRegister(cashRegister: InsertCashRegister): Promise<CashRegister>;
  updateCashRegister(id: string, cashRegister: Partial<InsertCashRegister>): Promise<CashRegister | undefined>;
  
  getComndasForCashRegisterPeriod(barbershopId: string, openedAt: Date, closedAt: Date | null): Promise<Comanda[]>;

  // Cash Transactions
  getCashTransactions(cashRegisterId: string): Promise<CashTransaction[]>;
  createCashTransaction(transaction: InsertCashTransaction): Promise<CashTransaction>;
  
  // Commissions
  getCommissions(barbershopId: string, barberId?: string, startDate?: Date, endDate?: Date): Promise<Commission[]>;
  getCommissionsWithDetails(barbershopId: string, barberId?: string, startDate?: Date, endDate?: Date): Promise<any[]>;
  getCommissionsByComanda(comandaId: string): Promise<Commission[]>;
  createCommission(commission: InsertCommission): Promise<Commission>;
  markCommissionPaid(id: string): Promise<void>;
  markCommissionsPaidBatch(commissionIds: string[], barbershopId: string, paymentId?: string): Promise<void>;
  
  // Commission Payments (fechamentos)
  getCommissionPayments(barbershopId: string, barberId?: string): Promise<CommissionPayment[]>;
  createCommissionPayment(payment: InsertCommissionPayment): Promise<CommissionPayment>;
  deleteCommissionPayment(id: string): Promise<void>;
  updateCommissionPayment(id: string, data: Partial<InsertCommissionPayment>): Promise<void>;
  
  // Barber Purchases (compras do barbeiro que serão descontadas da comissão)
  getBarberPurchases(barbershopId: string, barberId?: string, startDate?: Date, endDate?: Date): Promise<any[]>;
  
  // Barber Appointments
  getBarberAppointments(barberId: string, date: Date): Promise<Appointment[]>;
  
  // Notification Settings
  getNotificationSettings(barbershopId: string): Promise<NotificationSettings | undefined>;
  upsertNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings>;
  
  // Scheduled Messages
  getScheduledMessages(barbershopId: string, status?: string): Promise<ScheduledMessage[]>;
  getPendingMessages(): Promise<ScheduledMessage[]>;
  createScheduledMessage(message: InsertScheduledMessage): Promise<ScheduledMessage>;
  updateScheduledMessage(id: string, updates: Partial<InsertScheduledMessage>): Promise<ScheduledMessage | undefined>;
  deleteScheduledMessagesByAppointment(appointmentId: string): Promise<void>;
  resetFailedMessages(barbershopId: string): Promise<number>;
  
  // Chatbot Settings
  getChatbotSettings(barbershopId: string): Promise<ChatbotSettings | undefined>;
  upsertChatbotSettings(settings: InsertChatbotSettings): Promise<ChatbotSettings>;
  updateChatbotWhatsappFields(barbershopId: string, fields: Partial<Pick<ChatbotSettings, 'uazapiInstanceToken' | 'uazapiInstanceName' | 'whatsappConnected' | 'whatsappPhone'>>): Promise<ChatbotSettings | undefined>;
  
  // Chat Conversations
  getChatConversation(barbershopId: string, phone: string): Promise<ChatConversation | undefined>;
  getChatConversationById(id: string): Promise<ChatConversation | undefined>;
  getChatConversationsByBarbershop(barbershopId: string): Promise<ChatConversation[]>;
  createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>;
  updateChatConversation(id: string, updates: Partial<InsertChatConversation>): Promise<ChatConversation | undefined>;
  getClientByPhone(barbershopId: string, phone: string): Promise<Client | undefined>;

  // Password Reset Tokens
  createPasswordResetToken(token: schema.InsertPasswordResetToken): Promise<schema.PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<schema.PasswordResetToken | undefined>;
  markTokenUsed(id: string): Promise<void>;
  
  // User Password Update
  updateUserPassword(userId: string, hashedPassword: string): Promise<void>;
  
  // Subscriptions (Assinaturas recorrentes)
  getSubscriptions(barbershopId: string): Promise<Subscription[]>;
  getSubscription(id: string): Promise<Subscription | undefined>;
  getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined>;
  getClientSubscriptions(clientId: string): Promise<Subscription[]>;
  getActiveSubscription(clientId: string, packageId: string): Promise<Subscription | undefined>;
  getExpiringSubscriptions(daysAhead: number): Promise<Subscription[]>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, updates: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  cancelSubscription(id: string): Promise<void>;
  deleteSubscription(id: string): Promise<void>;
  
  // Subscription Payments
  getSubscriptionPayments(subscriptionId: string): Promise<SubscriptionPayment[]>;
  createSubscriptionPayment(payment: InsertSubscriptionPayment): Promise<SubscriptionPayment>;
  updateSubscriptionPayment(id: string, updates: Partial<InsertSubscriptionPayment>): Promise<SubscriptionPayment | undefined>;
  
  // Fixed Expenses (Despesas Fixas)
  getFixedExpenses(barbershopId: string): Promise<FixedExpense[]>;
  getFixedExpense(id: string): Promise<FixedExpense | undefined>;
  createFixedExpense(expense: InsertFixedExpense): Promise<FixedExpense>;
  updateFixedExpense(id: string, expense: Partial<InsertFixedExpense>): Promise<FixedExpense | undefined>;
  deleteFixedExpense(id: string): Promise<void>;

  // Refund Operations
  deleteComanda(id: string): Promise<void>;
  deleteCashTransactionsByComanda(comandaId: string): Promise<void>;
  deleteClientPackage(id: string): Promise<void>;
  deleteSubscriptionPaymentsBySubscription(subscriptionId: string): Promise<void>;
  refundComandaTransaction(comandaId: string, comanda: Comanda, items: ComandaItem[], commissions: Commission[], barbershopId: string): Promise<void>;
  closeComandaTransaction(comandaId: string, barbershopId: string, updateData: Partial<InsertComanda>): Promise<Comanda>;
  createComandaTransaction(
    barbershopId: string,
    comandaData: InsertComanda,
    items: Array<Record<string, any>>,
    session: { userId?: string | null; barberId?: string | null }
  ): Promise<Comanda>;

  // Refund Notifications
  getRefundNotifications(barbershopId: string, barberId: string): Promise<RefundNotification[]>;
  createRefundNotification(notification: InsertRefundNotification): Promise<RefundNotification>;
  markRefundNotificationRead(id: string): Promise<void>;

  // Campaigns
  getCampaigns(barbershopId: string): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  getCampaignsSending(): Promise<Campaign[]>;
  createCampaign(data: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, updates: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  incrementCampaignSentCount(id: string): Promise<void>;
  incrementCampaignFailedCount(id: string): Promise<void>;

  // Campaign Recipients
  createCampaignRecipients(recipients: InsertCampaignRecipient[]): Promise<void>;
  getCampaignRecipients(campaignId: string): Promise<CampaignRecipient[]>;
  getPendingCampaignRecipient(campaignId: string): Promise<CampaignRecipient | undefined>;
  updateCampaignRecipient(id: string, updates: Partial<InsertCampaignRecipient>): Promise<void>;
  getCampaignSentTodayCount(barbershopId: string): Promise<number>;

  // Client filtering for campaigns
  getClientsFiltered(barbershopId: string, filter: ClientCampaignFilter): Promise<Client[]>;
}

export class DbStorage implements IStorage {
  // ... (rest of the class)
  // I need to find where to insert the new methods in the class
  // Users & Auth
  async getUserById(id: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(schema.users).values(user).returning();
    return result[0];
  }

  // Barbershops
  async getBarbershop(id: string): Promise<Barbershop | undefined> {
    const result = await db.select().from(schema.barbershops).where(eq(schema.barbershops.id, id));
    return result[0];
  }

  async createBarbershop(barbershop: InsertBarbershop): Promise<Barbershop> {
    const result = await db.insert(schema.barbershops).values(barbershop).returning();
    return result[0];
  }

  async updateBarbershop(id: string, barbershop: Partial<InsertBarbershop>): Promise<Barbershop | undefined> {
    const result = await db.update(schema.barbershops).set(barbershop).where(eq(schema.barbershops.id, id)).returning();
    return result[0];
  }

  // Barbers
  async getBarbers(barbershopId: string): Promise<Barber[]> {
    return db.select().from(schema.barbers).where(eq(schema.barbers.barbershopId, barbershopId));
  }

  async getBarber(id: string): Promise<Barber | undefined> {
    const result = await db.select().from(schema.barbers).where(eq(schema.barbers.id, id));
    return result[0];
  }

  async getBarberByPhone(phone: string): Promise<Barber | undefined> {
    const result = await db.select().from(schema.barbers).where(eq(schema.barbers.phone, phone));
    return result[0];
  }

  async createBarber(barber: InsertBarber): Promise<Barber> {
    const result = await db.insert(schema.barbers).values(barber).returning();
    return result[0];
  }

  async updateBarber(id: string, barber: Partial<InsertBarber>): Promise<Barber | undefined> {
    const result = await db.update(schema.barbers).set(barber).where(eq(schema.barbers.id, id)).returning();
    return result[0];
  }

  async deleteBarber(id: string): Promise<void> {
    await db.delete(schema.barbers).where(eq(schema.barbers.id, id));
  }

  // Clients
  async getClients(barbershopId: string): Promise<Client[]> {
    return db.select().from(schema.clients).where(eq(schema.clients.barbershopId, barbershopId));
  }

  async getClient(id: string): Promise<Client | undefined> {
    const result = await db.select().from(schema.clients).where(eq(schema.clients.id, id));
    return result[0];
  }

  async createClient(client: InsertClient): Promise<Client> {
    const result = await db.insert(schema.clients).values(client).returning();
    return result[0];
  }

  async updateClient(id: string, client: Partial<InsertClient>): Promise<Client | undefined> {
    const result = await db.update(schema.clients).set(client).where(eq(schema.clients.id, id)).returning();
    return result[0];
  }

  async deleteClient(id: string): Promise<void> {
    await db.delete(schema.clients).where(eq(schema.clients.id, id));
  }

  // Funil de Clientes
  async updateClientFunnelData(clientId: string, barbershopId: string): Promise<void> {
    const completedAppointments = await db.select()
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.clientId, clientId),
          eq(schema.appointments.barbershopId, barbershopId),
          eq(schema.appointments.status, 'completed')
        )
      )
      .orderBy(schema.appointments.startTime);

    const totalVisits = completedAppointments.length;

    // Sem agendamentos completed: ainda assim refletir walk-in / só comanda (comandas fechadas).
    // totalVisits no cliente continua sendo só a contagem de agendamentos completed (pode ser 0).
    if (totalVisits === 0) {
      const clientComandasOnly = await db.select()
        .from(schema.comandas)
        .where(
          and(
            eq(schema.comandas.clientId, clientId),
            eq(schema.comandas.barbershopId, barbershopId),
            eq(schema.comandas.status, 'closed')
          )
        );

      if (clientComandasOnly.length === 0) {
        const activePackagesCheck = await this.getActiveClientPackages(clientId);
        const hasActivePlanCheck = activePackagesCheck.length > 0;
        await db.update(schema.clients)
          .set({
            clientStatus: hasActivePlanCheck ? 'cliente_plano' : 'novo_cliente',
            totalVisits: 0,
            planOfferEligible: false,
          })
          .where(eq(schema.clients.id, clientId));
        return;
      }

      const sortedComandas = [...clientComandasOnly].sort((a, b) => {
        const ta = new Date(a.paidAt ?? a.createdAt).getTime();
        const tb = new Date(b.paidAt ?? b.createdAt).getTime();
        return ta - tb;
      });

      const firstAt = sortedComandas[0].paidAt ?? sortedComandas[0].createdAt;
      const lastAt = sortedComandas[sortedComandas.length - 1].paidAt ?? sortedComandas[sortedComandas.length - 1].createdAt;
      const comandaCount = sortedComandas.length;

      const totalSpentOnly = sortedComandas.reduce((sum, c) => sum + parseFloat(c.total || '0'), 0);
      const averageTicketOnly = comandaCount > 0 ? totalSpentOnly / comandaCount : 0;

      let averageVisitIntervalDaysOnly: number | null = null;
      if (comandaCount >= 2) {
        let totalIntervalDays = 0;
        for (let i = 1; i < sortedComandas.length; i++) {
          const prev = new Date(sortedComandas[i - 1].paidAt ?? sortedComandas[i - 1].createdAt).getTime();
          const curr = new Date(sortedComandas[i].paidAt ?? sortedComandas[i].createdAt).getTime();
          totalIntervalDays += (curr - prev) / (1000 * 60 * 60 * 24);
        }
        averageVisitIntervalDaysOnly = totalIntervalDays / (comandaCount - 1);
      }

      const activePackagesOnly = await this.getActiveClientPackages(clientId);
      const hasActivePlanOnly = activePackagesOnly.length > 0;

      const nowOnly = getNowAsUtcLocal();
      const lastVisitDateOnly = new Date(lastAt);
      const daysSinceVisitOnly = (nowOnly.getTime() - lastVisitDateOnly.getTime()) / (1000 * 60 * 60 * 24);

      let clientStatusOnly: string;
      if (hasActivePlanOnly) {
        clientStatusOnly = 'cliente_plano';
      } else if (daysSinceVisitOnly > 30) {
        clientStatusOnly = 'cliente_inativo';
      } else if (comandaCount >= 3) {
        clientStatusOnly = 'cliente_recorrente';
      } else if (comandaCount === 2) {
        clientStatusOnly = 'cliente_ativo';
      } else {
        clientStatusOnly = 'novo_cliente';
      }

      const planOfferEligibleOnly = (
        !hasActivePlanOnly &&
        comandaCount >= 3 &&
        averageVisitIntervalDaysOnly !== null &&
        averageVisitIntervalDaysOnly < 30
      );

      let predictedNextVisitOnly: Date | null = null;
      if (averageVisitIntervalDaysOnly !== null && lastAt) {
        predictedNextVisitOnly = new Date(
          lastVisitDateOnly.getTime() + averageVisitIntervalDaysOnly * 24 * 60 * 60 * 1000
        );
      }

      await db.update(schema.clients)
        .set({
          firstVisitAt: new Date(firstAt),
          lastVisitAt: lastVisitDateOnly,
          totalVisits: 0,
          totalSpent: totalSpentOnly.toFixed(2),
          averageTicket: averageTicketOnly.toFixed(2),
          averageVisitIntervalDays: averageVisitIntervalDaysOnly,
          clientStatus: clientStatusOnly,
          planOfferEligible: planOfferEligibleOnly,
          predictedNextVisit: predictedNextVisitOnly,
        })
        .where(eq(schema.clients.id, clientId));
      return;
    }

    const firstVisitAt = completedAppointments[0].startTime;
    const lastVisitAt = completedAppointments[completedAppointments.length - 1].startTime;

    let averageVisitIntervalDays: number | null = null;
    if (totalVisits >= 2) {
      let totalIntervalDays = 0;
      for (let i = 1; i < completedAppointments.length; i++) {
        const prev = new Date(completedAppointments[i - 1].startTime).getTime();
        const curr = new Date(completedAppointments[i].startTime).getTime();
        totalIntervalDays += (curr - prev) / (1000 * 60 * 60 * 24);
      }
      averageVisitIntervalDays = totalIntervalDays / (totalVisits - 1);
    }

    let predictedNextVisit: Date | null = null;
    if (averageVisitIntervalDays !== null && lastVisitAt) {
      predictedNextVisit = new Date(
        new Date(lastVisitAt).getTime() + averageVisitIntervalDays * 24 * 60 * 60 * 1000
      );
    }

    const clientComandas = await db.select()
      .from(schema.comandas)
      .where(
        and(
          eq(schema.comandas.clientId, clientId),
          eq(schema.comandas.barbershopId, barbershopId),
          eq(schema.comandas.status, 'closed')
        )
      );

    const totalSpent = clientComandas.reduce((sum, c) => sum + parseFloat(c.total || '0'), 0);
    const averageTicket = totalVisits > 0 ? totalSpent / totalVisits : 0;

    const activePackages = await this.getActiveClientPackages(clientId);
    const hasActivePlan = activePackages.length > 0;

    const now = getNowAsUtcLocal();
    const daysSinceVisit = lastVisitAt
      ? (now.getTime() - new Date(lastVisitAt).getTime()) / (1000 * 60 * 60 * 24)
      : 9999;

    let clientStatus: string;
    if (hasActivePlan) {
      clientStatus = 'cliente_plano';
    } else if (daysSinceVisit > 30) {
      clientStatus = 'cliente_inativo';
    } else if (totalVisits >= 3) {
      clientStatus = 'cliente_recorrente';
    } else if (totalVisits === 2) {
      clientStatus = 'cliente_ativo';
    } else {
      clientStatus = 'novo_cliente';
    }

    const planOfferEligible = (
      !hasActivePlan &&
      totalVisits >= 3 &&
      averageVisitIntervalDays !== null &&
      averageVisitIntervalDays < 30
    );

    await db.update(schema.clients)
      .set({
        firstVisitAt: new Date(firstVisitAt),
        lastVisitAt: new Date(lastVisitAt),
        totalVisits,
        totalSpent: totalSpent.toFixed(2),
        averageTicket: averageTicket.toFixed(2),
        averageVisitIntervalDays,
        clientStatus,
        planOfferEligible,
        predictedNextVisit,
      })
      .where(eq(schema.clients.id, clientId));
  }

  async recalculateAllClientsStats(barbershopId: string): Promise<{ updated: number; errors: number }> {
    const clients = await this.getClients(barbershopId);
    let updated = 0;
    let errors = 0;

    for (const client of clients) {
      try {
        await this.updateClientFunnelData(client.id, barbershopId);
        updated++;
      } catch (err) {
        console.error(`[Funil] Erro ao recalcular cliente ${client.id}:`, err);
        errors++;
      }
    }

    console.log(`[Funil] Recálculo concluído: ${updated} atualizados, ${errors} erros`);
    return { updated, errors };
  }

  async backfillClientsWithoutFunnelData(): Promise<void> {
    const unprocessed = await db.select()
      .from(schema.clients)
      .where(isNull(schema.clients.lastVisitAt));

    if (unprocessed.length === 0) return;

    console.log(`[Funil] Backfill: ${unprocessed.length} clientes sem dados do funil, processando...`);
    let ok = 0;
    for (const client of unprocessed) {
      try {
        await this.updateClientFunnelData(client.id, client.barbershopId);
        ok++;
      } catch (err) {
        console.error(`[Funil] Backfill erro cliente ${client.id}:`, err);
      }
    }
    console.log(`[Funil] Backfill concluído: ${ok}/${unprocessed.length} clientes atualizados`);
  }

  async getClientsFunnelStats(barbershopId: string): Promise<ClientsFunnelStats> {
    const clients = await this.getClients(barbershopId);
    const now = getNowAsUtcLocal();

    const counts = {
      novo_cliente: 0,
      cliente_ativo: 0,
      cliente_recorrente: 0,
      cliente_plano: 0,
      cliente_inativo: 0,
    };

    const planEligible: ClientsFunnelStats['planEligible'] = [];
    const returningSoon: ClientsFunnelStats['returningSoon'] = [];
    const toReactivate: ClientsFunnelStats['toReactivate'] = [];

    for (const client of clients) {
      const status = (client.clientStatus || 'novo_cliente') as keyof typeof counts;
      if (status in counts) counts[status]++;

      if (client.planOfferEligible) {
        planEligible.push({
          id: client.id,
          name: client.name,
          phone: client.phone,
          totalVisits: client.totalVisits || 0,
          averageVisitIntervalDays: client.averageVisitIntervalDays ? parseFloat(String(client.averageVisitIntervalDays)) : null,
        });
      }

      if (client.predictedNextVisit) {
        const daysUntilReturn = (new Date(client.predictedNextVisit).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntilReturn >= 0 && daysUntilReturn <= 7) {
          returningSoon.push({
            id: client.id,
            name: client.name,
            phone: client.phone,
            predictedNextVisit: new Date(client.predictedNextVisit),
            daysUntilReturn: Math.ceil(daysUntilReturn),
          });
        }
      }

      if (client.clientStatus === 'cliente_inativo' && client.lastVisitAt) {
        const daysSinceVisit = (now.getTime() - new Date(client.lastVisitAt).getTime()) / (1000 * 60 * 60 * 24);
        toReactivate.push({
          id: client.id,
          name: client.name,
          phone: client.phone,
          lastVisitAt: new Date(client.lastVisitAt),
          daysSinceVisit: Math.floor(daysSinceVisit),
        });
      }
    }

    const clientsWithVisits = clients.filter(c => (c.totalVisits || 0) >= 1).length;
    const returningClients = clients.filter(c => (c.totalVisits || 0) >= 2).length;
    const returnRate = clientsWithVisits > 0 ? Math.round((returningClients / clientsWithVisits) * 100) : 0;

    return { counts, planEligible, returningSoon, toReactivate, returnRate };
  }

  async getClientsFunnelDashboard(barbershopId: string): Promise<ClientsFunnelDashboard> {
    const clients = await this.getClients(barbershopId);
    const allPackages = await this.getAllClientPackages(barbershopId);
    const now = getNowAsUtcLocal();

    // --- Dados ao vivo de visitas ---

    // Comandas fechadas com clientId vinculado
    const closedComandas = await db.select({
      clientId: schema.comandas.clientId,
      visitDate: schema.comandas.paidAt,
      createdAt: schema.comandas.createdAt,
    })
      .from(schema.comandas)
      .where(
        and(
          eq(schema.comandas.barbershopId, barbershopId),
          eq(schema.comandas.status, 'closed'),
          isNotNull(schema.comandas.clientId)
        )
      );

    // Agendamentos concluídos com clientId vinculado
    const completedAppts = await db.select({
      clientId: schema.appointments.clientId,
      visitDate: schema.appointments.startTime,
    })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.barbershopId, barbershopId),
          eq(schema.appointments.status, 'completed'),
          isNotNull(schema.appointments.clientId)
        )
      );

    // Mapa: clientId → datas de visita (ordenadas ascendente)
    const visitMap = new Map<string, Date[]>();
    for (const c of closedComandas) {
      if (!c.clientId) continue;
      const date = new Date(c.visitDate ?? c.createdAt);
      if (!visitMap.has(c.clientId)) visitMap.set(c.clientId, []);
      visitMap.get(c.clientId)!.push(date);
    }
    for (const a of completedAppts) {
      if (!a.clientId) continue;
      const date = new Date(a.visitDate);
      if (!visitMap.has(a.clientId)) visitMap.set(a.clientId, []);
      visitMap.get(a.clientId)!.push(date);
    }
    for (const dates of visitMap.values()) {
      dates.sort((a, b) => a.getTime() - b.getTime());
    }

    // Helpers ao vivo
    const getLiveLastVisit = (clientId: string, storedLastVisit: Date | string | null): Date | null => {
      const dates = visitMap.get(clientId);
      if (dates && dates.length > 0) return dates[dates.length - 1];
      return storedLastVisit ? new Date(storedLastVisit) : null;
    };

    const getLiveVisitCount = (clientId: string): number =>
      visitMap.get(clientId)?.length ?? 0;

    const daysSince = (date: Date | null): number => {
      if (!date) return 9999;
      return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    };

    // IDs de clientes com pacotes ativos
    const activeClientIds = new Set(
      allPackages
        .filter(p => (p.quantityRemaining ?? 0) >= 1 && p.expiresAt && new Date(p.expiresAt) > now)
        .map(p => p.clientId)
        .filter((id): id is string => id !== null)
    );

    const toFunnelClient = (c: Client): FunnelClient => {
      const lastVisit = getLiveLastVisit(c.id, c.lastVisitAt);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        lastVisitAt: lastVisit,
        clientStatus: c.clientStatus,
        totalSpent: c.totalSpent,
        daysSinceLastVisit: lastVisit ? Math.floor(daysSince(lastVisit)) : null,
      };
    };

    const makeGroup = (filtered: Client[]): FunnelGroup => ({
      count: filtered.length,
      clients: filtered.map(toFunnelClient),
    });

    // Blue zone — base saudável (ao vivo)
    const ativos = clients.filter(c => {
      const lv = getLiveLastVisit(c.id, c.lastVisitAt);
      return lv !== null && daysSince(lv) <= 30;
    });

    const recorrentes = clients.filter(c =>
      getLiveVisitCount(c.id) >= 3 || c.clientStatus === 'cliente_recorrente'
    );

    const comPlano = clients.filter(c =>
      activeClientIds.has(c.id) || c.clientStatus === 'cliente_plano'
    );

    // Yellow zone — oportunidade (ordenar por mais urgente)
    const devemVoltar = clients
      .filter(c => {
        const lv = getLiveLastVisit(c.id, c.lastVisitAt);
        const d = daysSince(lv);
        return lv !== null && d >= 15 && d < 25;
      })
      .sort((a, b) =>
        daysSince(getLiveLastVisit(b.id, b.lastVisitAt)) -
        daysSince(getLiveLastVisit(a.id, a.lastVisitAt))
      );

    const emRisco = clients
      .filter(c => {
        const lv = getLiveLastVisit(c.id, c.lastVisitAt);
        const d = daysSince(lv);
        return lv !== null && d >= 25 && d < 35;
      })
      .sort((a, b) =>
        daysSince(getLiveLastVisit(b.id, b.lastVisitAt)) -
        daysSince(getLiveLastVisit(a.id, a.lastVisitAt))
      );

    const elegiveisPlano = clients.filter(c =>
      c.planOfferEligible ||
      (!activeClientIds.has(c.id) && getLiveVisitCount(c.id) >= 3)
    );

    // Red zone — problema (ordenar por mais ausente)
    const inativos30d = clients
      .filter(c => {
        const lv = getLiveLastVisit(c.id, c.lastVisitAt);
        return lv !== null && daysSince(lv) > 30;
      })
      .sort((a, b) =>
        daysSince(getLiveLastVisit(b.id, b.lastVisitAt)) -
        daysSince(getLiveLastVisit(a.id, a.lastVisitAt))
      );

    const inativos45d = clients
      .filter(c => {
        const lv = getLiveLastVisit(c.id, c.lastVisitAt);
        return lv !== null && daysSince(lv) > 45;
      })
      .sort((a, b) =>
        daysSince(getLiveLastVisit(b.id, b.lastVisitAt)) -
        daysSince(getLiveLastVisit(a.id, a.lastVisitAt))
      );

    // Pacotes expirados (sem mudança — já funcionava)
    const expiredClientIds = new Set(
      allPackages
        .filter(p => p.expiresAt && new Date(p.expiresAt) < now)
        .map(p => p.clientId)
        .filter((id): id is string => id !== null)
    );
    const pacotesExpirados = clients.filter(c => expiredClientIds.has(c.id));

    return {
      ativos: makeGroup(ativos),
      recorrentes: makeGroup(recorrentes),
      comPlano: makeGroup(comPlano),
      devemVoltar: makeGroup(devemVoltar),
      emRisco: makeGroup(emRisco),
      elegiveisPlano: makeGroup(elegiveisPlano),
      inativos30d: makeGroup(inativos30d),
      inativos45d: makeGroup(inativos45d),
      pacotesExpirados: makeGroup(pacotesExpirados),
    };
  }

  async getClientsForFunnelJob(barbershopId: string): Promise<ClientForFunnelJob[]> {
    const clients = await this.getClients(barbershopId);
    const now = getNowAsUtcLocal();

    return clients
      .filter(c => c.lastVisitAt || c.predictedNextVisit)
      .map(c => {
        const daysSinceVisit = c.lastVisitAt
          ? (now.getTime() - new Date(c.lastVisitAt).getTime()) / (1000 * 60 * 60 * 24)
          : 9999;

        const daysUntilPredictedVisit = c.predictedNextVisit
          ? (new Date(c.predictedNextVisit).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          : null;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          barbershopId: c.barbershopId,
          lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt) : null,
          predictedNextVisit: c.predictedNextVisit ? new Date(c.predictedNextVisit) : null,
          lastReactivationMessageAt: c.lastReactivationMessageAt ? new Date(c.lastReactivationMessageAt) : null,
          clientStatus: c.clientStatus || 'novo_cliente',
          preferredBarberId: c.preferredBarberId || null,
          daysSinceVisit,
          daysUntilPredictedVisit,
        };
      });
  }

  async getAllClientsForFunnelJob(): Promise<ClientForFunnelJob[]> {
    const allClients = await db.select().from(schema.clients);
    const now = getNowAsUtcLocal();

    return allClients
      .filter(c => c.lastVisitAt || c.predictedNextVisit)
      .map(c => {
        const daysSinceVisit = c.lastVisitAt
          ? (now.getTime() - new Date(c.lastVisitAt).getTime()) / (1000 * 60 * 60 * 24)
          : 9999;

        const daysUntilPredictedVisit = c.predictedNextVisit
          ? (new Date(c.predictedNextVisit).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          : null;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          barbershopId: c.barbershopId,
          lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt) : null,
          predictedNextVisit: c.predictedNextVisit ? new Date(c.predictedNextVisit) : null,
          lastReactivationMessageAt: c.lastReactivationMessageAt ? new Date(c.lastReactivationMessageAt) : null,
          clientStatus: c.clientStatus || 'novo_cliente',
          preferredBarberId: c.preferredBarberId || null,
          daysSinceVisit,
          daysUntilPredictedVisit,
        };
      });
  }

  // Barber Services
  async getBarberServices(barberId: string): Promise<BarberService[]> {
    return db.select().from(schema.barberServices).where(eq(schema.barberServices.barberId, barberId));
  }

  async setBarberServices(barberId: string, services: { serviceId: string; customPrice?: string | null }[]): Promise<void> {
    await db.delete(schema.barberServices).where(eq(schema.barberServices.barberId, barberId));
    if (services.length > 0) {
      await db.insert(schema.barberServices).values(
        services.map(s => ({ barberId, serviceId: s.serviceId, customPrice: s.customPrice || null }))
      );
    }
  }

  // Services
  async getServices(barbershopId: string): Promise<Service[]> {
    return db.select().from(schema.services).where(eq(schema.services.barbershopId, barbershopId));
  }

  async getService(id: string): Promise<Service | undefined> {
    const result = await db.select().from(schema.services).where(eq(schema.services.id, id));
    return result[0];
  }

  async createService(service: InsertService): Promise<Service> {
    const result = await db.insert(schema.services).values(service).returning();
    return result[0];
  }

  async updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined> {
    const result = await db.update(schema.services).set(service).where(eq(schema.services.id, id)).returning();
    return result[0];
  }

  async deleteService(id: string): Promise<void> {
    await db.delete(schema.services).where(eq(schema.services.id, id));
  }

  // Products
  async getProducts(barbershopId: string): Promise<Product[]> {
    return db.select().from(schema.products).where(eq(schema.products.barbershopId, barbershopId));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const result = await db.select().from(schema.products).where(eq(schema.products.id, id));
    return result[0];
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const result = await db.insert(schema.products).values(product).returning();
    return result[0];
  }

  async updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product | undefined> {
    const result = await db.update(schema.products).set(product).where(eq(schema.products.id, id)).returning();
    return result[0];
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(schema.products).where(eq(schema.products.id, id));
  }

  // Packages
  async getPackages(barbershopId: string): Promise<Package[]> {
    return db.select().from(schema.packages).where(eq(schema.packages.barbershopId, barbershopId));
  }

  async getPackage(id: string): Promise<Package | undefined> {
    const result = await db.select().from(schema.packages).where(eq(schema.packages.id, id));
    return result[0];
  }

  async createPackage(pkg: InsertPackage): Promise<Package> {
    const result = await db.insert(schema.packages).values(pkg).returning();
    return result[0];
  }

  async updatePackage(id: string, pkg: Partial<InsertPackage>): Promise<Package | undefined> {
    const result = await db.update(schema.packages).set(pkg).where(eq(schema.packages.id, id)).returning();
    return result[0];
  }

  async deletePackage(id: string): Promise<void> {
    await db.delete(schema.packages).where(eq(schema.packages.id, id));
  }

  // Client Packages
  async getClientPackages(clientId: string): Promise<ClientPackage[]> {
    return db.select().from(schema.clientPackages).where(eq(schema.clientPackages.clientId, clientId));
  }

  async getAllClientPackages(barbershopId: string): Promise<ClientPackage[]> {
    // Get all clients for the barbershop first
    const clients = await this.getClients(barbershopId);
    const clientIds = clients.map(c => c.id);
    if (clientIds.length === 0) return [];
    
    return db.select().from(schema.clientPackages).where(
      inArray(schema.clientPackages.clientId, clientIds)
    );
  }

  async getActiveClientPackages(clientId: string): Promise<ClientPackage[]> {
    const nowBrazil = getNowAsUtcLocal();
    const packages = await db.select().from(schema.clientPackages).where(
      and(
        eq(schema.clientPackages.clientId, clientId),
        gte(schema.clientPackages.quantityRemaining, 1),
        gte(schema.clientPackages.expiresAt, nowBrazil)
      )
    );
    
    // Se não há pacotes, retorna vazio
    if (packages.length === 0) {
      return [];
    }
    
    // Buscar IDs de assinaturas dos pacotes que têm subscriptionId
    const subscriptionIds = packages
      .filter(pkg => pkg.subscriptionId)
      .map(pkg => pkg.subscriptionId as string);
    
    // Se há assinaturas, buscar todas de uma vez
    let activeSubscriptionIds: Set<string> = new Set();
    
    if (subscriptionIds.length > 0) {
      const subscriptions = await db.select()
        .from(schema.subscriptions)
        .where(
          and(
            inArray(schema.subscriptions.id, subscriptionIds),
            eq(schema.subscriptions.status, 'active')
          )
        );
      
      activeSubscriptionIds = new Set(subscriptions.map(s => s.id));
    }
    
    // Filtra pacotes: avulsos sempre disponíveis, assinaturas só se ativas
    return packages.filter(pkg => {
      if (pkg.subscriptionId) {
        // Pacote de assinatura - só disponível se assinatura está ativa
        return activeSubscriptionIds.has(pkg.subscriptionId);
      }
      // Pacote avulso - sempre disponível
      return true;
    });
  }

  async createClientPackage(clientPackage: InsertClientPackage): Promise<ClientPackage> {
    const result = await db.insert(schema.clientPackages).values(clientPackage).returning();
    return result[0];
  }

  async updateClientPackage(id: string, data: Partial<InsertClientPackage>): Promise<ClientPackage | undefined> {
    const result = await db.update(schema.clientPackages).set(data).where(eq(schema.clientPackages.id, id)).returning();
    return result[0];
  }

  async updateClientPackageQuantity(id: string, quantity: number): Promise<void> {
    await db.update(schema.clientPackages).set({ quantityRemaining: quantity }).where(eq(schema.clientPackages.id, id));
  }

  // Decremento atômico de créditos: só efetiva se o saldo atual for suficiente.
  // Retorna o pacote atualizado, ou null quando a operação foi abortada (saldo insuficiente / concorrência).
  async decrementClientPackageAtomic(id: string, quantity: number): Promise<ClientPackage | null> {
    const result = await db.update(schema.clientPackages)
      .set({
        quantityRemaining: sql`${schema.clientPackages.quantityRemaining} - ${quantity}`,
      })
      .where(and(
        eq(schema.clientPackages.id, id),
        gte(schema.clientPackages.quantityRemaining, quantity),
      ))
      .returning();
    return result[0] ?? null;
  }

  // Appointments
  async getAppointments(barbershopId: string, startDate: Date, endDate: Date): Promise<Appointment[]> {
    return db.select().from(schema.appointments).where(
      and(
        eq(schema.appointments.barbershopId, barbershopId),
        gte(schema.appointments.startTime, startDate),
        lte(schema.appointments.startTime, endDate)
      )
    ).orderBy(schema.appointments.startTime);
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const result = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id));
    return result[0];
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const result = await db.insert(schema.appointments).values(appointment).returning();
    return result[0];
  }

  async updateAppointment(id: string, appointment: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const result = await db.update(schema.appointments).set(appointment).where(eq(schema.appointments.id, id)).returning();
    return result[0];
  }

  async deleteAppointment(id: string): Promise<void> {
    await db.delete(schema.appointments).where(eq(schema.appointments.id, id));
  }

  // Appointment Services (multiple services per appointment)
  async getAppointmentServices(appointmentId: string): Promise<AppointmentService[]> {
    return db.select().from(schema.appointmentServices).where(eq(schema.appointmentServices.appointmentId, appointmentId));
  }

  async getAppointmentServicesBatch(appointmentIds: string[]): Promise<AppointmentService[]> {
    if (appointmentIds.length === 0) return [];
    return db.select().from(schema.appointmentServices).where(inArray(schema.appointmentServices.appointmentId, appointmentIds));
  }

  async createAppointmentService(service: InsertAppointmentService): Promise<AppointmentService> {
    const result = await db.insert(schema.appointmentServices).values(service).returning();
    return result[0];
  }

  async deleteAppointmentServices(appointmentId: string): Promise<void> {
    await db.delete(schema.appointmentServices).where(eq(schema.appointmentServices.appointmentId, appointmentId));
  }

  // Comandas
  async getComandas(barbershopId: string, status?: string): Promise<Comanda[]> {
    const conditions = [eq(schema.comandas.barbershopId, barbershopId)];
    if (status) {
      conditions.push(eq(schema.comandas.status, status));
    }
    return db.select().from(schema.comandas).where(and(...conditions)).orderBy(desc(schema.comandas.createdAt));
  }

  async getComanda(id: string): Promise<Comanda | undefined> {
    const result = await db.select().from(schema.comandas).where(eq(schema.comandas.id, id));
    return result[0];
  }

  async getOpenComandaByClient(barbershopId: string, clientId: string): Promise<Comanda | undefined> {
    const result = await db.select().from(schema.comandas).where(
      and(
        eq(schema.comandas.barbershopId, barbershopId),
        eq(schema.comandas.clientId, clientId),
        eq(schema.comandas.status, "open")
      )
    ).orderBy(desc(schema.comandas.createdAt));
    return result[0];
  }

  async createComanda(comanda: InsertComanda): Promise<Comanda> {
    const result = await db.insert(schema.comandas).values(comanda).returning();
    return result[0];
  }

  async updateComanda(id: string, comanda: Partial<InsertComanda>): Promise<Comanda | undefined> {
    const result = await db.update(schema.comandas).set(comanda).where(eq(schema.comandas.id, id)).returning();
    return result[0];
  }

  // Comanda Items
  async getComandaItems(comandaId: string): Promise<ComandaItem[]> {
    return db.select().from(schema.comandaItems).where(eq(schema.comandaItems.comandaId, comandaId));
  }

  async getComandaItemsByComandaIds(comandaIds: string[]): Promise<ComandaItem[]> {
    if (comandaIds.length === 0) return [];
    return db.select().from(schema.comandaItems).where(inArray(schema.comandaItems.comandaId, comandaIds));
  }

  async createComandaItem(item: InsertComandaItem): Promise<ComandaItem> {
    const result = await db.insert(schema.comandaItems).values(item).returning();
    return result[0];
  }

  async updateComandaItem(id: string, data: Partial<InsertComandaItem>): Promise<ComandaItem | undefined> {
    const result = await db.update(schema.comandaItems).set(data).where(eq(schema.comandaItems.id, id)).returning();
    return result[0];
  }

  async deleteComandaItem(id: string): Promise<void> {
    await db.delete(schema.comandaItems).where(eq(schema.comandaItems.id, id));
  }

  // Cash Register
  async getOpenCashRegister(barbershopId: string): Promise<CashRegister | undefined> {
    const result = await db.select().from(schema.cashRegister).where(
      and(
        eq(schema.cashRegister.barbershopId, barbershopId),
        eq(schema.cashRegister.status, "open")
      )
    ).orderBy(desc(schema.cashRegister.openedAt));
    return result[0];
  }

  async getCashRegister(id: string): Promise<CashRegister | undefined> {
    const result = await db.select().from(schema.cashRegister).where(eq(schema.cashRegister.id, id));
    return result[0];
  }

  async getCashRegisterHistory(barbershopId: string): Promise<CashRegister[]> {
    return db.select().from(schema.cashRegister).where(
      and(
        eq(schema.cashRegister.barbershopId, barbershopId),
        eq(schema.cashRegister.status, "closed")
      )
    ).orderBy(desc(schema.cashRegister.closedAt));
  }

  async createCashRegister(cashRegister: InsertCashRegister): Promise<CashRegister> {
    const result = await db.insert(schema.cashRegister).values(cashRegister).returning();
    return result[0];
  }

  async updateCashRegister(id: string, cashRegister: Partial<InsertCashRegister>): Promise<CashRegister | undefined> {
    const result = await db.update(schema.cashRegister).set(cashRegister).where(eq(schema.cashRegister.id, id)).returning();
    return result[0];
  }

  async getComndasForCashRegisterPeriod(barbershopId: string, openedAt: Date, closedAt: Date | null): Promise<Comanda[]> {
    const endTime = closedAt || new Date();

    // "Início do dia" do caixa atual — garante que vendas de dias anteriores nunca vazam para este caixa
    const startOfDay = new Date(openedAt);
    startOfDay.setHours(0, 0, 0, 0);

    // Buscar o caixa anterior fechado do mesmo tenant — permite absorver comandas "flutuantes"
    // fechadas entre o último caixa e este (ex.: atendente esqueceu de abrir o caixa de manhã)
    const previousRegister = await db.select().from(schema.cashRegister)
      .where(and(
        eq(schema.cashRegister.barbershopId, barbershopId),
        eq(schema.cashRegister.status, 'closed'),
        lte(schema.cashRegister.closedAt, openedAt)
      ))
      .orderBy(desc(schema.cashRegister.closedAt))
      .limit(1);

    const previousClosedAt = previousRegister[0]?.closedAt ? new Date(previousRegister[0].closedAt) : null;
    // periodStart = MAX(fechamento do caixa anterior, início do dia atual).
    // Caixa anterior do mesmo dia → absorve gap. Caixa anterior de dias passados → descartado.
    const periodStart = previousClosedAt && previousClosedAt > startOfDay
      ? previousClosedAt
      : startOfDay;

    return db.select().from(schema.comandas).where(
      and(
        eq(schema.comandas.barbershopId, barbershopId),
        eq(schema.comandas.status, 'closed'),
        gte(schema.comandas.paidAt, periodStart),
        lte(schema.comandas.paidAt, endTime)
      )
    ).orderBy(desc(schema.comandas.paidAt));
  }

  // Cash Transactions
  async getCashTransactions(cashRegisterId: string): Promise<CashTransaction[]> {
    return db.select().from(schema.cashTransactions).where(eq(schema.cashTransactions.cashRegisterId, cashRegisterId));
  }

  async createCashTransaction(transaction: InsertCashTransaction): Promise<CashTransaction> {
    const result = await db.insert(schema.cashTransactions).values(transaction).returning();
    return result[0];
  }

  // Commissions
  async getCommissions(barbershopId: string, barberId?: string, startDate?: Date, endDate?: Date): Promise<Commission[]> {
    const conditions = [eq(schema.commissions.barbershopId, barbershopId)];
    if (barberId) {
      conditions.push(eq(schema.commissions.barberId, barberId));
    }
    if (startDate) {
      conditions.push(gte(schema.commissions.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(schema.commissions.createdAt, endDate));
    }
    return db.select().from(schema.commissions).where(and(...conditions));
  }

  async getCommissionsByComanda(comandaId: string): Promise<Commission[]> {
    // Buscar os IDs dos itens da comanda
    const comandaItems = await db.select().from(schema.comandaItems).where(eq(schema.comandaItems.comandaId, comandaId));
    if (comandaItems.length === 0) return [];
    
    const itemIds = comandaItems.map(item => item.id);
    return db.select().from(schema.commissions).where(inArray(schema.commissions.comandaItemId, itemIds));
  }

  async createCommission(commission: InsertCommission): Promise<Commission> {
    const result = await db.insert(schema.commissions).values(commission).returning();
    return result[0];
  }

  async markCommissionPaid(id: string): Promise<void> {
    await db.update(schema.commissions).set({ paid: true, paidAt: new Date() }).where(eq(schema.commissions.id, id));
  }

  async markCommissionsPaidBatch(commissionIds: string[], barbershopId: string, paymentId?: string): Promise<void> {
    if (commissionIds.length === 0) return;
    await db.update(schema.commissions)
      .set({ paid: true, paidAt: new Date(), paymentId: paymentId || null })
      .where(and(
        inArray(schema.commissions.id, commissionIds),
        eq(schema.commissions.barbershopId, barbershopId)
      ));
  }

  // Commission Payments (fechamentos)
  async getCommissionPayments(barbershopId: string, barberId?: string): Promise<CommissionPayment[]> {
    const conditions = [eq(schema.commissionPayments.barbershopId, barbershopId)];
    if (barberId) {
      conditions.push(eq(schema.commissionPayments.barberId, barberId));
    }
    return db.select().from(schema.commissionPayments).where(and(...conditions)).orderBy(desc(schema.commissionPayments.paidAt));
  }

  async createCommissionPayment(payment: InsertCommissionPayment): Promise<CommissionPayment> {
    const result = await db.insert(schema.commissionPayments).values(payment).returning();
    return result[0];
  }

  async deleteCommissionPayment(id: string): Promise<void> {
    await db.delete(schema.commissionPayments).where(eq(schema.commissionPayments.id, id));
  }

  async updateCommissionPayment(id: string, data: Partial<InsertCommissionPayment>): Promise<void> {
    await db.update(schema.commissionPayments).set(data).where(eq(schema.commissionPayments.id, id));
  }

  // Barber Purchases (compras do barbeiro - isBarberPurchase = true)
  // Só conta após a comanda ser fechada (igual pacotes)
  async getBarberPurchases(barbershopId: string, barberId?: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    // Buscar apenas comandas FECHADAS do barbershop (igual lógica de pacotes)
    const allComandas = await db.select().from(schema.comandas).where(
      and(
        eq(schema.comandas.barbershopId, barbershopId),
        eq(schema.comandas.status, 'closed') // Só comandas fechadas
      )
    );
    
    // Filtrar por data (usando paidAt para alinhar com comissões)
    let filteredComandas = allComandas;
    if (startDate) {
      filteredComandas = filteredComandas.filter(c => c.paidAt && new Date(c.paidAt) >= startDate);
    }
    if (endDate) {
      filteredComandas = filteredComandas.filter(c => c.paidAt && new Date(c.paidAt) <= endDate);
    }
    
    // Filtrar por barbeiro se especificado
    if (barberId) {
      filteredComandas = filteredComandas.filter(c => c.barberId === barberId);
    }
    
    const comandaIds = filteredComandas.map(c => c.id);
    if (comandaIds.length === 0) return [];
    
    // Buscar todos os itens de comanda com isBarberPurchase = true
    const allItems = await db.select().from(schema.comandaItems).where(eq(schema.comandaItems.isBarberPurchase, true));
    const filteredItems = allItems.filter(item => comandaIds.includes(item.comandaId));
    
    // Enriquecer com dados do produto e da comanda
    const products = await db.select().from(schema.products).where(eq(schema.products.barbershopId, barbershopId));
    const barbers = await db.select().from(schema.barbers).where(eq(schema.barbers.barbershopId, barbershopId));
    
    return filteredItems.map(item => {
      const comanda = filteredComandas.find(c => c.id === item.comandaId);
      const product = products.find(p => p.id === item.productId);
      const barber = barbers.find(b => b.id === comanda?.barberId);
      
      // Usar originalPrice se disponível (preço real), senão unitPrice
      const realPrice = item.originalPrice || item.unitPrice;
      const realTotal = parseFloat(realPrice) * item.quantity;
      
      return {
        id: item.id,
        productId: item.productId,
        productName: product?.name || 'Produto',
        quantity: item.quantity,
        unitPrice: realPrice, // Preço real do produto
        total: realTotal.toString(), // Total baseado no preço real
        barberId: comanda?.barberId,
        barberName: barber?.name || 'Barbeiro',
        date: comanda?.paidAt || comanda?.createdAt // Data do fechamento
      };
    });
  }

  // Commissions with details (service/product/package names)
  async getCommissionsWithDetails(barbershopId: string, barberId?: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    const commissions = await this.getCommissions(barbershopId, barberId, startDate, endDate);
    if (commissions.length === 0) return [];
    
    // Buscar todos os itens de comanda relacionados
    const comandaItemIds = commissions.map(c => c.comandaItemId);
    const allItems = await db.select().from(schema.comandaItems);
    const items = allItems.filter(item => comandaItemIds.includes(item.id));
    
    // Buscar serviços, produtos e pacotes
    const services = await db.select().from(schema.services).where(eq(schema.services.barbershopId, barbershopId));
    const products = await db.select().from(schema.products).where(eq(schema.products.barbershopId, barbershopId));
    const packages = await db.select().from(schema.packages).where(eq(schema.packages.barbershopId, barbershopId));
    
    // Buscar comandas para pegar clientId
    const comandaIds = Array.from(new Set(items.map(i => i.comandaId)));
    const allComandas = await db.select().from(schema.comandas).where(eq(schema.comandas.barbershopId, barbershopId));
    const comandas = allComandas.filter(c => comandaIds.includes(c.id));
    
    // Buscar clientes
    const clients = await db.select().from(schema.clients).where(eq(schema.clients.barbershopId, barbershopId));
    
    return commissions.map(commission => {
      const item = items.find(i => i.id === commission.comandaItemId);
      const comanda = comandas.find(c => c.id === item?.comandaId);
      const client = clients.find(cl => cl.id === comanda?.clientId);
      
      let itemName = '';
      let itemType = commission.type;
      
      if (item) {
        if (item.serviceId) {
          const service = services.find(s => s.id === item.serviceId);
          itemName = service?.name || 'Serviço';
          if (itemType !== 'package_use' && itemType !== 'package_sale') {
            itemType = 'service';
          }
        } else if (item.productId) {
          const product = products.find(p => p.id === item.productId);
          itemName = product?.name || 'Produto';
          if (itemType !== 'package_use' && itemType !== 'package_sale') {
            itemType = 'product';
          }
        } else if (item.packageId) {
          const pkg = packages.find(p => p.id === item.packageId);
          itemName = pkg?.name || 'Pacote';
          if (itemType !== 'package_use') {
            itemType = 'package';
          }
        } else if (item.clientPackageId) {
          itemName = 'Uso de Pacote';
          itemType = 'package_use';
        }
      }
      
      // Se ainda não tem nome, usar tipo como fallback
      if (!itemName) {
        if (itemType === 'service') itemName = 'Serviço';
        else if (itemType === 'product') itemName = 'Produto';
        else if (itemType === 'package') itemName = 'Pacote';
        else if (itemType === 'package_use') itemName = 'Uso de Pacote';
        else itemName = 'Comissão';
      }
      
      return {
        id: commission.id,
        comandaItemId: commission.comandaItemId,
        barberId: commission.barberId,
        amount: commission.amount,
        type: itemType,
        originalType: commission.type,
        itemName,
        clientName: client?.name || null,
        createdAt: commission.createdAt,
        comandaDate: comanda?.createdAt || commission.createdAt,
        paid: commission.paid,
        paidAt: commission.paidAt,
        paymentId: commission.paymentId,
        isBarberPurchase: item?.isBarberPurchase || false
      };
    });
  }

  // Barber Appointments for a specific date
  async getBarberAppointments(barberId: string, date: Date): Promise<Appointment[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return db.select().from(schema.appointments).where(
      and(
        eq(schema.appointments.barberId, barberId),
        gte(schema.appointments.startTime, startOfDay),
        lte(schema.appointments.startTime, endOfDay)
      )
    ).orderBy(schema.appointments.startTime);
  }

  // Notification Settings
  async getNotificationSettings(barbershopId: string): Promise<NotificationSettings | undefined> {
    const result = await db.select().from(schema.notificationSettings)
      .where(eq(schema.notificationSettings.barbershopId, barbershopId));
    return result[0];
  }

  async upsertNotificationSettings(settings: InsertNotificationSettings): Promise<NotificationSettings> {
    const existing = await this.getNotificationSettings(settings.barbershopId);
    if (existing) {
      const result = await db.update(schema.notificationSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(schema.notificationSettings.barbershopId, settings.barbershopId))
        .returning();
      return result[0];
    }
    const result = await db.insert(schema.notificationSettings).values(settings).returning();
    return result[0];
  }

  // Scheduled Messages
  async getScheduledMessages(barbershopId: string, status?: string): Promise<ScheduledMessage[]> {
    if (status) {
      return db.select().from(schema.scheduledMessages).where(
        and(
          eq(schema.scheduledMessages.barbershopId, barbershopId),
          eq(schema.scheduledMessages.status, status)
        )
      ).orderBy(desc(schema.scheduledMessages.scheduledFor));
    }
    return db.select().from(schema.scheduledMessages)
      .where(eq(schema.scheduledMessages.barbershopId, barbershopId))
      .orderBy(desc(schema.scheduledMessages.scheduledFor));
  }

  async getPendingMessages(): Promise<ScheduledMessage[]> {
    const { getNowAsUtcLocal } = await import('./utils/timezone');
    const now = getNowAsUtcLocal();
    return db.select().from(schema.scheduledMessages).where(
      and(
        eq(schema.scheduledMessages.status, 'pending'),
        lte(schema.scheduledMessages.scheduledFor, now)
      )
    ).orderBy(schema.scheduledMessages.scheduledFor);
  }

  async createScheduledMessage(message: InsertScheduledMessage): Promise<ScheduledMessage> {
    const result = await db.insert(schema.scheduledMessages).values(message).returning();
    return result[0];
  }

  async updateScheduledMessage(id: string, updates: Partial<InsertScheduledMessage>): Promise<ScheduledMessage | undefined> {
    const result = await db.update(schema.scheduledMessages)
      .set(updates)
      .where(eq(schema.scheduledMessages.id, id))
      .returning();
    return result[0];
  }

  async deleteScheduledMessagesByAppointment(appointmentId: string): Promise<void> {
    await db.delete(schema.scheduledMessages)
      .where(eq(schema.scheduledMessages.appointmentId, appointmentId));
  }

  async resetFailedMessages(barbershopId: string): Promise<number> {
    const result = await db.update(schema.scheduledMessages)
      .set({ status: 'pending', retryCount: 0, error: null } as any)
      .where(
        and(
          eq(schema.scheduledMessages.barbershopId, barbershopId),
          eq(schema.scheduledMessages.status, 'failed')
        )
      )
      .returning();
    return result.length;
  }

  // Chatbot Settings
  async getChatbotSettings(barbershopId: string): Promise<ChatbotSettings | undefined> {
    const result = await db.select().from(schema.chatbotSettings).where(eq(schema.chatbotSettings.barbershopId, barbershopId));
    return result[0];
  }

  async upsertChatbotSettings(settings: InsertChatbotSettings): Promise<ChatbotSettings> {
    const existing = await this.getChatbotSettings(settings.barbershopId);
    if (existing) {
      const result = await db.update(schema.chatbotSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(schema.chatbotSettings.barbershopId, settings.barbershopId))
        .returning();
      return result[0];
    }
    const result = await db.insert(schema.chatbotSettings).values(settings).returning();
    return result[0];
  }

  async updateChatbotWhatsappFields(barbershopId: string, fields: Partial<Pick<ChatbotSettings, 'uazapiInstanceToken' | 'uazapiInstanceName' | 'whatsappConnected' | 'whatsappPhone'>>): Promise<ChatbotSettings | undefined> {
    const cleanFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined)
    ) as Partial<Pick<ChatbotSettings, 'uazapiInstanceToken' | 'uazapiInstanceName' | 'whatsappConnected' | 'whatsappPhone'>>;
    if (Object.keys(cleanFields).length === 0) return this.getChatbotSettings(barbershopId);
    const existing = await this.getChatbotSettings(barbershopId);
    if (!existing) {
      await db.insert(schema.chatbotSettings).values({
        barbershopId,
        ...cleanFields,
      });
      return this.getChatbotSettings(barbershopId);
    }
    const result = await db.update(schema.chatbotSettings)
      .set({ ...cleanFields, updatedAt: new Date() })
      .where(eq(schema.chatbotSettings.barbershopId, barbershopId))
      .returning();
    return result[0];
  }

  // Chat Conversations
  async getChatConversation(barbershopId: string, phone: string): Promise<ChatConversation | undefined> {
    const result = await db.select().from(schema.chatConversations).where(
      and(
        eq(schema.chatConversations.barbershopId, barbershopId),
        eq(schema.chatConversations.phone, phone)
      )
    );
    if (result[0]) return result[0];

    const digits = phone.replace(/\D/g, '');
    const last11 = digits.length >= 11 ? digits.slice(-11) : digits;
    const suffixPattern = `%${last11}`;
    console.log(`[Storage] getChatConversation: busca exata falhou para phone=${phone}, tentando sufixo ${last11}`);
    const fallback = await db.select().from(schema.chatConversations).where(
      and(
        eq(schema.chatConversations.barbershopId, barbershopId),
        sql`${schema.chatConversations.phone} LIKE ${suffixPattern}`
      )
    );
    if (fallback.length === 1) {
      console.log(`[Storage] getChatConversation: ENCONTRADO via sufixo phone_db=${fallback[0].phone}`);
      return fallback[0];
    }
    if (fallback.length > 1) {
      console.log(`[Storage] getChatConversation: ${fallback.length} resultados via sufixo - AMBÍGUO, ignorando`);
    }
    return undefined;
  }

  async getChatConversationsByBarbershop(barbershopId: string): Promise<ChatConversation[]> {
    return await db.select().from(schema.chatConversations).where(
      eq(schema.chatConversations.barbershopId, barbershopId)
    );
  }

  async getChatConversationById(id: string): Promise<ChatConversation | undefined> {
    const result = await db.select().from(schema.chatConversations).where(
      eq(schema.chatConversations.id, id)
    );
    return result[0];
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    const result = await db.insert(schema.chatConversations).values({
      ...conversation,
      messageHistory: conversation.messageHistory || [],
    }).returning();
    return result[0];
  }

  async updateChatConversation(id: string, updates: Partial<InsertChatConversation>): Promise<ChatConversation | undefined> {
    const updateData: any = { ...updates, lastMessageAt: new Date() };
    const result = await db.update(schema.chatConversations)
      .set(updateData)
      .where(eq(schema.chatConversations.id, id))
      .returning();
    return result[0];
  }

  async getClientByPhone(barbershopId: string, phone: string): Promise<Client | undefined> {
    const isPhoneName = (name: string | null) => /^[\d\s+()-]+$/.test((name || '').trim());

    console.log(`[Storage] getClientByPhone: INÍCIO barbershopId=${barbershopId} phone=${phone}`);

    const result = await db.select().from(schema.clients).where(
      and(
        eq(schema.clients.barbershopId, barbershopId),
        eq(schema.clients.phone, phone)
      )
    );

    console.log(`[Storage] getClientByPhone: busca EXATA retornou ${result.length} resultado(s)`);
    result.forEach((c, i) => {
      console.log(`[Storage]   exato[${i}]: id=${c.id} name="${c.name}" phone="${c.phone}" isPhoneName=${isPhoneName(c.name)}`);
    });

    if (result.length === 1 && !isPhoneName(result[0].name)) {
      console.log(`[Storage] getClientByPhone: DECISÃO → exato único com nome real: "${result[0].name}"`);
      return result[0];
    }

    if (result.length >= 1) {
      const realClients = result.filter(c => !isPhoneName(c.name));
      if (realClients.length === 1) {
        console.log(`[Storage] getClientByPhone: DECISÃO → ${result.length} exatos, 1 com nome real: "${realClients[0].name}"`);
        return realClients[0];
      }
    }

    const digits = phone.replace(/\D/g, '');
    const last11 = digits.length >= 11 ? digits.slice(-11) : digits;
    const suffixPattern = `%${last11}`;
    console.log(`[Storage] getClientByPhone: busca exata insuficiente, tentando SUFIXO pattern=%${last11}`);
    const fallback = await db.select().from(schema.clients).where(
      and(
        eq(schema.clients.barbershopId, barbershopId),
        sql`${schema.clients.phone} LIKE ${suffixPattern}`
      )
    );

    console.log(`[Storage] getClientByPhone: busca SUFIXO retornou ${fallback.length} resultado(s)`);
    fallback.forEach((c, i) => {
      console.log(`[Storage]   sufixo[${i}]: id=${c.id} name="${c.name}" phone="${c.phone}" isPhoneName=${isPhoneName(c.name)}`);
    });

    const realFallback = fallback.filter(c => !isPhoneName(c.name));
    if (realFallback.length === 1) {
      console.log(`[Storage] getClientByPhone: DECISÃO → sufixo único com nome real: "${realFallback[0].name}" (phone_db=${realFallback[0].phone})`);
      return realFallback[0];
    }

    if (fallback.length === 1) {
      console.log(`[Storage] getClientByPhone: DECISÃO → sufixo único (nome=telefone): "${fallback[0].name}"`);
      return fallback[0];
    }

    if (result.length >= 1) {
      console.log(`[Storage] getClientByPhone: DECISÃO → fallback exato (nome=telefone): "${result[0].name}"`);
      return result[0];
    }

    console.log(`[Storage] getClientByPhone: DECISÃO → NÃO encontrado`);
    return undefined;
  }

  // Password Reset Tokens
  async createPasswordResetToken(token: schema.InsertPasswordResetToken): Promise<schema.PasswordResetToken> {
    const result = await db.insert(schema.passwordResetTokens).values(token).returning();
    return result[0];
  }

  async getPasswordResetToken(token: string): Promise<schema.PasswordResetToken | undefined> {
    const result = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, token));
    return result[0];
  }

  async markTokenUsed(id: string): Promise<void> {
    await db.update(schema.passwordResetTokens).set({ usedAt: new Date() }).where(eq(schema.passwordResetTokens.id, id));
  }

  async updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
    await db.update(schema.users).set({ password: hashedPassword }).where(eq(schema.users.id, userId));
  }

  async getUsersByBarbershop(barbershopId: string): Promise<User[]> {
    return await db.select().from(schema.users).where(eq(schema.users.barbershopId, barbershopId));
  }

  async updateUser(id: string, data: Partial<Pick<InsertUser, 'name' | 'role' | 'phone'>>): Promise<User | undefined> {
    const result = await db.update(schema.users).set(data).where(eq(schema.users.id, id)).returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(schema.users).where(eq(schema.users.id, id));
  }

  // Subscriptions (Assinaturas recorrentes)
  async getSubscriptions(barbershopId: string): Promise<Subscription[]> {
    return await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.barbershopId, barbershopId))
      .orderBy(desc(schema.subscriptions.createdAt));
  }

  async getSubscription(id: string): Promise<Subscription | undefined> {
    const result = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, id));
    return result[0];
  }

  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | undefined> {
    const result = await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return result[0];
  }

  async getClientSubscriptions(clientId: string): Promise<Subscription[]> {
    return await db.select().from(schema.subscriptions)
      .where(eq(schema.subscriptions.clientId, clientId))
      .orderBy(desc(schema.subscriptions.createdAt));
  }

  async getActiveSubscription(clientId: string, packageId: string): Promise<Subscription | undefined> {
    const result = await db.select().from(schema.subscriptions).where(
      and(
        eq(schema.subscriptions.clientId, clientId),
        eq(schema.subscriptions.packageId, packageId),
        eq(schema.subscriptions.status, "active")
      )
    );
    return result[0];
  }

  async getExpiringSubscriptions(daysAhead: number): Promise<Subscription[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const today = new Date();
    
    return await db.select().from(schema.subscriptions).where(
      and(
        eq(schema.subscriptions.status, "active"),
        gte(schema.subscriptions.nextBillingDate, today),
        lte(schema.subscriptions.nextBillingDate, futureDate)
      )
    );
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(schema.subscriptions).values(subscription).returning();
    return result[0];
  }

  async updateSubscription(id: string, updates: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const result = await db.update(schema.subscriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, id))
      .returning();
    return result[0];
  }

  async cancelSubscription(id: string): Promise<void> {
    await db.update(schema.subscriptions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, id));
  }

  async deleteSubscription(id: string): Promise<void> {
    await db.delete(schema.subscriptionPayments)
      .where(eq(schema.subscriptionPayments.subscriptionId, id));
    await db.delete(schema.subscriptions)
      .where(eq(schema.subscriptions.id, id));
  }

  // Subscription Payments
  async getSubscriptionPayments(subscriptionId: string): Promise<SubscriptionPayment[]> {
    return await db.select().from(schema.subscriptionPayments)
      .where(eq(schema.subscriptionPayments.subscriptionId, subscriptionId))
      .orderBy(desc(schema.subscriptionPayments.createdAt));
  }

  async createSubscriptionPayment(payment: InsertSubscriptionPayment): Promise<SubscriptionPayment> {
    const result = await db.insert(schema.subscriptionPayments).values(payment).returning();
    return result[0];
  }

  async updateSubscriptionPayment(id: string, updates: Partial<InsertSubscriptionPayment>): Promise<SubscriptionPayment | undefined> {
    const result = await db.update(schema.subscriptionPayments)
      .set(updates)
      .where(eq(schema.subscriptionPayments.id, id))
      .returning();
    return result[0];
  }

  // Fixed Expenses (Despesas Fixas)
  async getFixedExpenses(barbershopId: string): Promise<FixedExpense[]> {
    return await db.select().from(schema.fixedExpenses)
      .where(eq(schema.fixedExpenses.barbershopId, barbershopId))
      .orderBy(schema.fixedExpenses.name);
  }

  async getFixedExpense(id: string): Promise<FixedExpense | undefined> {
    const result = await db.select().from(schema.fixedExpenses)
      .where(eq(schema.fixedExpenses.id, id));
    return result[0];
  }

  async createFixedExpense(expense: InsertFixedExpense): Promise<FixedExpense> {
    const result = await db.insert(schema.fixedExpenses).values(expense).returning();
    return result[0];
  }

  async updateFixedExpense(id: string, expense: Partial<InsertFixedExpense>): Promise<FixedExpense | undefined> {
    const result = await db.update(schema.fixedExpenses)
      .set(expense)
      .where(eq(schema.fixedExpenses.id, id))
      .returning();
    return result[0];
  }

  async deleteFixedExpense(id: string): Promise<void> {
    await db.delete(schema.fixedExpenses).where(eq(schema.fixedExpenses.id, id));
  }

  // Refund Operations
  async deleteComanda(id: string): Promise<void> {
    await db.delete(schema.comandas).where(eq(schema.comandas.id, id));
  }

  async deleteCashTransactionsByComanda(comandaId: string): Promise<void> {
    await db.delete(schema.cashTransactions).where(eq(schema.cashTransactions.comandaId, comandaId));
  }

  async deleteClientPackage(id: string): Promise<void> {
    await db.delete(schema.clientPackages).where(eq(schema.clientPackages.id, id));
  }

  async deleteSubscriptionPaymentsBySubscription(subscriptionId: string): Promise<void> {
    await db.delete(schema.subscriptionPayments).where(eq(schema.subscriptionPayments.subscriptionId, subscriptionId));
  }

  // Refund Notifications
  async getRefundNotifications(barbershopId: string, barberId: string): Promise<RefundNotification[]> {
    return await db.select().from(schema.refundNotifications)
      .where(and(
        eq(schema.refundNotifications.barbershopId, barbershopId),
        eq(schema.refundNotifications.barberId, barberId),
        sql`${schema.refundNotifications.readAt} IS NULL`
      ))
      .orderBy(desc(schema.refundNotifications.createdAt));
  }

  async createRefundNotification(notification: InsertRefundNotification): Promise<RefundNotification> {
    const result = await db.insert(schema.refundNotifications).values(notification).returning();
    return result[0];
  }

  async markRefundNotificationRead(id: string): Promise<void> {
    await db.update(schema.refundNotifications)
      .set({ readAt: new Date() })
      .where(eq(schema.refundNotifications.id, id));
  }

  async refundComandaTransaction(
    comandaId: string,
    comanda: Comanda,
    items: ComandaItem[],
    commissions: Commission[],
    barbershopId: string
  ): Promise<void> {
    await db.transaction(async (tx) => {
      for (const item of items) {
        if (item.productId) {
          const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
          if (product) {
            await tx.update(schema.products)
              .set({ stock: product.stock + (item.quantity || 1) })
              .where(eq(schema.products.id, item.productId));
          }
        }

        if (item.type === 'package_use' && item.clientPackageId) {
          const [cp] = await tx.select().from(schema.clientPackages).where(eq(schema.clientPackages.id, item.clientPackageId));
          if (cp) {
            await tx.update(schema.clientPackages)
              .set({ quantityRemaining: cp.quantityRemaining + (item.quantity || 1) })
              .where(eq(schema.clientPackages.id, cp.id));
          }
        }

        if (item.type === 'package' && comanda.clientId && item.packageId) {
          const allClientPackages = await tx.select().from(schema.clientPackages)
            .where(and(
              eq(schema.clientPackages.packageId, item.packageId),
              eq(schema.clientPackages.clientId, comanda.clientId)
            ));
          const comandaDate = new Date(comanda.createdAt);
          for (const cp of allClientPackages) {
            const cpDate = new Date(cp.purchasedAt);
            const timeDiff = Math.abs(cpDate.getTime() - comandaDate.getTime());
            if (timeDiff < 24 * 60 * 60 * 1000) {
              await tx.delete(schema.clientPackages).where(eq(schema.clientPackages.id, cp.id));
            }
          }
        }

        if (item.type === 'subscription_sale' && item.subscriptionId) {
          const [subscription] = await tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, item.subscriptionId));
          if (subscription) {
            await tx.delete(schema.subscriptionPayments).where(eq(schema.subscriptionPayments.subscriptionId, subscription.id));
            if (subscription.clientPackageId) {
              await tx.delete(schema.clientPackages).where(eq(schema.clientPackages.id, subscription.clientPackageId));
            }
            await tx.delete(schema.subscriptions).where(eq(schema.subscriptions.id, subscription.id));
          }
        }
      }

      await tx.delete(schema.cashTransactions).where(eq(schema.cashTransactions.comandaId, comandaId));

      const paidCommissions = commissions.filter(c => c.paid && c.paymentId);
      if (paidCommissions.length > 0) {
        const paymentIdsSet = new Set(paidCommissions.map(c => c.paymentId).filter(Boolean) as string[]);
        const allPayments = await tx.select().from(schema.commissionPayments)
          .where(eq(schema.commissionPayments.barbershopId, barbershopId));

        for (const paymentId of Array.from(paymentIdsSet)) {
          const payment = allPayments.find(p => p.id === paymentId);
          if (!payment) continue;

          const affectedCommissions = paidCommissions.filter(c => c.paymentId === paymentId);
          const positiveRefunded = affectedCommissions
            .filter(c => parseFloat(c.amount) > 0)
            .reduce((s, c) => s + parseFloat(c.amount), 0);
          const negativeRefunded = affectedCommissions
            .filter(c => parseFloat(c.amount) < 0)
            .reduce((s, c) => s + Math.abs(parseFloat(c.amount)), 0);

          const newTotalCommissions = parseFloat(payment.totalCommissions) - positiveRefunded;
          const newTotalDeductions = parseFloat(payment.totalDeductions) - negativeRefunded;
          const newNetAmount = newTotalCommissions - newTotalDeductions;

          if (newNetAmount <= 0 || newTotalCommissions <= 0) {
            if (payment.cashTransactionId) {
              await tx.delete(schema.cashTransactions).where(eq(schema.cashTransactions.id, payment.cashTransactionId));
            }
            await tx.delete(schema.commissionPayments).where(eq(schema.commissionPayments.id, paymentId));
          } else {
            await tx.update(schema.commissionPayments)
              .set({
                totalCommissions: newTotalCommissions.toFixed(2),
                totalDeductions: newTotalDeductions.toFixed(2),
                netAmount: newNetAmount.toFixed(2),
              })
              .where(eq(schema.commissionPayments.id, paymentId));
            if (payment.cashTransactionId) {
              await tx.update(schema.cashTransactions)
                .set({ amount: newNetAmount.toFixed(2) })
                .where(eq(schema.cashTransactions.id, payment.cashTransactionId));
            }
          }
        }
      }

      const itemIds = items.map(i => i.id);
      if (itemIds.length > 0) {
        await tx.delete(schema.commissions).where(inArray(schema.commissions.comandaItemId, itemIds));
      }

      if (comanda.appointmentId) {
        const [appointment] = await tx.select().from(schema.appointments).where(eq(schema.appointments.id, comanda.appointmentId));
        if (appointment && appointment.barbershopId === barbershopId) {
          await tx.update(schema.appointments)
            .set({ status: 'confirmed' })
            .where(eq(schema.appointments.id, comanda.appointmentId));
        }
      }

      await tx.delete(schema.comandaItems).where(eq(schema.comandaItems.comandaId, comandaId));
      await tx.delete(schema.comandas).where(eq(schema.comandas.id, comandaId));
    });
  }

  // Helper interno: para cada comissão positiva (não-package_use) da comanda, cria uma
  // fee_deduction proporcional a feePercentage. Usado pelas transações de criação e
  // fechamento de comanda para evitar duplicação da lógica.
  private async applyFeeDeductionsToCommissions(
    tx: any,
    barbershopId: string,
    comandaId: string,
    feePercentage: number
  ): Promise<void> {
    if (feePercentage <= 0) return;

    const items = await tx.select().from(schema.comandaItems)
      .where(eq(schema.comandaItems.comandaId, comandaId));
    const itemIds = items.map((i: any) => i.id);
    if (itemIds.length === 0) return;

    const commissions = await tx.select().from(schema.commissions)
      .where(inArray(schema.commissions.comandaItemId, itemIds));
    const positiveCommissions = commissions.filter((c: any) =>
      parseFloat(c.amount) > 0 && c.type !== 'package_use'
    );

    for (const commission of positiveCommissions) {
      const commissionAmount = parseFloat(commission.amount);
      const feeDeduction = (commissionAmount * feePercentage) / 100;
      if (feeDeduction > 0) {
        await tx.insert(schema.commissions).values({
          barbershopId,
          barberId: commission.barberId,
          comandaItemId: commission.comandaItemId,
          amount: `-${feeDeduction.toFixed(2)}`,
          type: 'fee_deduction',
          paid: false,
        });
      }
    }
  }

  // Fecha uma comanda atomicamente: atualiza status, marca agendamento como concluído,
  // baixa estoque dos produtos vendidos e gera as deduções de taxa de cartão/PIX nas comissões.
  // Preserva o comportamento atual: se não houver caixa aberto, deduções não são criadas.
  // updateClientFunnelData fica FORA desta função (é tolerante a erro e roda por último).
  async closeComandaTransaction(
    comandaId: string,
    barbershopId: string,
    updateData: Partial<InsertComanda>
  ): Promise<Comanda> {
    return db.transaction(async (tx) => {
      // 1. Atualiza a comanda
      const [comanda] = await tx.update(schema.comandas)
        .set(updateData)
        .where(eq(schema.comandas.id, comandaId))
        .returning();

      if (!comanda) {
        throw new Error(`Comanda ${comandaId} não encontrada para fechamento`);
      }

      // 2. Marca agendamento como concluído (se houver)
      if (comanda.appointmentId) {
        const [appt] = await tx.select().from(schema.appointments)
          .where(eq(schema.appointments.id, comanda.appointmentId));
        if (appt && appt.barbershopId === barbershopId) {
          await tx.update(schema.appointments)
            .set({ status: 'completed' })
            .where(eq(schema.appointments.id, comanda.appointmentId));
        }
      }

      // 3. Baixa de estoque para produtos vendidos
      const items = await tx.select().from(schema.comandaItems)
        .where(eq(schema.comandaItems.comandaId, comandaId));
      for (const item of items) {
        if (item.productId) {
          const [product] = await tx.select().from(schema.products)
            .where(eq(schema.products.id, item.productId));
          if (product) {
            const newStock = Math.max(0, product.stock - (item.quantity || 1));
            await tx.update(schema.products)
              .set({ stock: newStock })
              .where(eq(schema.products.id, item.productId));
          }
        }
      }

      // 4. Deduções de taxa de pagamento (fee_deduction) — apenas se houver paymentMethod + caixa aberto
      if (comanda.paymentMethod) {
        const [barbershop] = await tx.select().from(schema.barbershops)
          .where(eq(schema.barbershops.id, barbershopId));
        const [openCashRegister] = await tx.select().from(schema.cashRegister)
          .where(and(
            eq(schema.cashRegister.barbershopId, barbershopId),
            eq(schema.cashRegister.status, 'open')
          ))
          .limit(1);

        if (barbershop && openCashRegister) {
          let feePercentage = 0;

          if (comanda.paymentMethod === 'card' || comanda.paymentMethod === 'credito') {
            feePercentage = parseFloat(barbershop.feeCredit || '0');
          } else if (comanda.paymentMethod === 'debito') {
            feePercentage = parseFloat(barbershop.feeDebit || '0');
          } else if (comanda.paymentMethod === 'pix') {
            feePercentage = parseFloat(barbershop.feePix || '0');
          } else if (comanda.paymentMethod === 'split' && comanda.paymentDetails) {
            const paymentDetails = comanda.paymentDetails as any;
            const splitPayments = paymentDetails.split || [];
            const comandaTotal = parseFloat(comanda.total || '0');
            let totalFeeAmount = 0;
            for (const payment of splitPayments) {
              let splitFee = 0;
              if (payment.method === 'card') {
                splitFee = parseFloat(barbershop.feeCredit || '0');
              } else if (payment.method === 'pix') {
                splitFee = parseFloat(barbershop.feePix || '0');
              }
              if (splitFee > 0 && payment.amount > 0) {
                totalFeeAmount += (payment.amount * splitFee) / 100;
              }
            }

            if (totalFeeAmount > 0 && comandaTotal > 0) {
              const effectiveFeePercentage = (totalFeeAmount / comandaTotal) * 100;
              await this.applyFeeDeductionsToCommissions(tx, barbershopId, comanda.id, effectiveFeePercentage);
            }
          }

          if (feePercentage > 0 && comanda.paymentMethod !== 'split') {
            await this.applyFeeDeductionsToCommissions(tx, barbershopId, comanda.id, feePercentage);
          }
        }
      }

      return comanda;
    });
  }

  // Cria uma comanda atomicamente com todos os seus efeitos (itens, comissões, pacotes,
  // assinaturas, estoque, deduções de taxa). Se qualquer passo falhar, nada é gravado.
  // Preserva o comportamento atual do POST /api/comandas — apenas envolve em transação.
  // A atualização do funil do cliente fica FORA desta função (tolerante a erro).
  async createComandaTransaction(
    barbershopId: string,
    comandaData: InsertComanda,
    items: Array<Record<string, any>>,
    session: { userId?: string | null; barberId?: string | null }
  ): Promise<Comanda> {
    return db.transaction(async (tx) => {
      // Leituras de contexto carregadas uma única vez
      const [barbershop] = await tx.select().from(schema.barbershops)
        .where(eq(schema.barbershops.id, barbershopId));
      const [openCashRegister] = await tx.select().from(schema.cashRegister)
        .where(and(
          eq(schema.cashRegister.barbershopId, barbershopId),
          eq(schema.cashRegister.status, 'open')
        ))
        .limit(1);

      // 1. Criar comanda
      const [comanda] = await tx.insert(schema.comandas).values(comandaData).returning();
      if (!comanda) {
        throw new Error('Falha ao criar comanda');
      }

      // 2. Criar itens + comissões + efeitos por tipo
      for (const item of items) {
        // Validação de desconto: backend recomputa discountAmount a partir de discountType/discountValue
        const itemGrossTotal = item.unitPrice * item.quantity;
        let validatedDiscountType: string | null = null;
        let validatedDiscountValue: string | null = null;
        let validatedDiscountAmount = 0;

        if (item.discountType && item.discountValue) {
          const discountValue = parseFloat(item.discountValue);
          if (discountValue > 0) {
            validatedDiscountType = item.discountType;
            validatedDiscountValue = item.discountValue;
            if (item.discountType === 'percentage') {
              const clampedPercentage = Math.min(discountValue, 100);
              validatedDiscountAmount = (itemGrossTotal * clampedPercentage) / 100;
            } else {
              validatedDiscountAmount = Math.min(discountValue, itemGrossTotal);
            }
          }
        }

        const itemTotal = (itemGrossTotal - validatedDiscountAmount).toString();

        const itemData: any = {
          comandaId: comanda.id,
          type: item.type,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          total: itemTotal,
          isBarberPurchase: item.isBarberPurchase || false,
          originalPrice: item.originalPrice ? item.originalPrice.toString() : null,
          discountType: validatedDiscountType,
          discountValue: validatedDiscountValue,
          discountAmount: validatedDiscountAmount > 0 ? validatedDiscountAmount.toString() : null,
        };

        if (item.type === 'service' || item.type === 'package_use') {
          itemData.serviceId = item.itemId;
          if (item.type === 'package_use' && item.clientPackageId) {
            itemData.clientPackageId = item.clientPackageId;
          }
        } else if (item.type === 'product') {
          itemData.productId = item.itemId;
        } else if (item.type === 'package' || item.type === 'subscription_sale') {
          itemData.packageId = item.itemId;
        }

        const [createdItem] = await tx.insert(schema.comandaItems).values(itemData).returning();

        // Comissão positiva (só para itens com barbeiro, não para venda de pacote/assinatura)
        if (item.barberId && item.commission > 0 && !item.isBarberPurchase && item.type !== 'package' && item.type !== 'subscription_sale') {
          const finalItemTotal = parseFloat(itemTotal);
          let validatedCommission: number;
          if (item.type === 'package_use') {
            validatedCommission = item.commission;
          } else {
            validatedCommission = Math.min(item.commission, finalItemTotal);
          }
          await tx.insert(schema.commissions).values({
            barbershopId,
            barberId: item.barberId,
            comandaItemId: createdItem.id,
            amount: validatedCommission.toString(),
            type: item.type,
            paid: false,
          });
        }

        // Dedução negativa para compras do próprio barbeiro
        if (item.isBarberPurchase && item.barberId && item.originalPrice > 0) {
          const deductionAmount = (parseFloat(item.originalPrice) * item.quantity).toString();
          await tx.insert(schema.commissions).values({
            barbershopId,
            barberId: item.barberId,
            comandaItemId: createdItem.id,
            amount: `-${deductionAmount}`,
            type: 'deduction',
            paid: false,
          });
        }

        // Venda de pacote: cria N clientPackages com créditos líquidos
        if (item.type === 'package' && comandaData.clientId) {
          const [pkg] = await tx.select().from(schema.packages)
            .where(and(
              eq(schema.packages.barbershopId, barbershopId),
              eq(schema.packages.id, item.itemId)
            ));
          if (pkg) {
            const grossAmount = parseFloat(pkg.price);
            let netAmount = grossAmount;
            const paymentMethod = comandaData.paymentMethod || 'cash';

            if (paymentMethod === 'card' || paymentMethod === 'credito') {
              const feePercent = parseFloat(barbershop?.feeCredit || '0');
              netAmount = grossAmount - (grossAmount * feePercent / 100);
            } else if (paymentMethod === 'debito') {
              const feePercent = parseFloat(barbershop?.feeDebit || '0');
              netAmount = grossAmount - (grossAmount * feePercent / 100);
            } else if (paymentMethod === 'pix') {
              const feePercent = parseFloat(barbershop?.feePix || '0');
              netAmount = grossAmount - (grossAmount * feePercent / 100);
            }

            for (let i = 0; i < item.quantity; i++) {
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
              await tx.insert(schema.clientPackages).values({
                clientId: comandaData.clientId,
                packageId: pkg.id,
                quantityRemaining: pkg.quantity,
                quantityOriginal: pkg.quantity,
                expiresAt,
                netAmount: netAmount.toFixed(2),
                paymentMethod,
              } as any);
            }
          }
        }

        // Uso de pacote: decremento atômico dentro da transação
        if (item.type === 'package_use' && item.clientPackageId) {
          const [cp] = await tx.select().from(schema.clientPackages)
            .where(eq(schema.clientPackages.id, item.clientPackageId));
          if (cp) {
            if (cp.subscriptionId) {
              const [subscription] = await tx.select().from(schema.subscriptions)
                .where(eq(schema.subscriptions.id, cp.subscriptionId));
              if (subscription && subscription.status !== 'active') {
                throw new Error(`Assinatura expirada para pacote ${item.clientPackageId} - renove para usar os créditos`);
              }
            }
            const [updated] = await tx.update(schema.clientPackages)
              .set({
                quantityRemaining: sql`${schema.clientPackages.quantityRemaining} - ${item.quantity}`,
              })
              .where(and(
                eq(schema.clientPackages.id, cp.id),
                gte(schema.clientPackages.quantityRemaining, item.quantity),
              ))
              .returning();
            if (!updated) {
              throw new Error(`Saldo insuficiente no pacote ${item.clientPackageId} — outra operação usou estes créditos primeiro. Atualize e tente novamente.`);
            }
          }
        }

        // Venda de assinatura: só quando comanda é criada fechada
        if (item.type === 'subscription_sale' && comandaData.clientId && comandaData.status === 'closed') {
          const [pkg] = await tx.select().from(schema.packages)
            .where(and(
              eq(schema.packages.barbershopId, barbershopId),
              eq(schema.packages.id, item.itemId)
            ));
          if (pkg && pkg.isRecurring) {
            const now = new Date();
            const paymentMethod = comandaData.paymentMethod || 'cash';

            const periodEnd = new Date(now);
            const nextBilling = new Date(now);
            if (pkg.recurringInterval === 'weekly') {
              periodEnd.setDate(periodEnd.getDate() + 7);
              nextBilling.setDate(nextBilling.getDate() + 7);
            } else if (pkg.recurringInterval === 'biweekly') {
              periodEnd.setDate(periodEnd.getDate() + 14);
              nextBilling.setDate(nextBilling.getDate() + 14);
            } else {
              periodEnd.setMonth(periodEnd.getMonth() + 1);
              nextBilling.setMonth(nextBilling.getMonth() + 1);
            }

            const grossAmount = parseFloat(pkg.price);
            let netAmount = grossAmount;
            if (paymentMethod === 'card' || paymentMethod === 'credito') {
              const feePercent = parseFloat(barbershop?.feeCredit || '0');
              netAmount = grossAmount - (grossAmount * feePercent / 100);
            } else if (paymentMethod === 'debito') {
              const feePercent = parseFloat(barbershop?.feeDebit || '0');
              netAmount = grossAmount - (grossAmount * feePercent / 100);
            } else if (paymentMethod === 'pix') {
              const feePercent = parseFloat(barbershop?.feePix || '0');
              netAmount = grossAmount - (grossAmount * feePercent / 100);
            }

            const expiresAt = new Date(periodEnd);
            expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);

            const [clientPackage] = await tx.insert(schema.clientPackages).values({
              clientId: comandaData.clientId,
              packageId: pkg.id,
              quantityRemaining: pkg.quantity,
              quantityOriginal: pkg.quantity,
              expiresAt,
              netAmount: netAmount.toFixed(2),
              paymentMethod,
            } as any).returning();

            const [subscription] = await tx.insert(schema.subscriptions).values({
              barbershopId,
              clientId: comandaData.clientId,
              packageId: pkg.id,
              status: 'active',
              paymentMethod,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              nextBillingDate: nextBilling,
              lastPaymentDate: now,
              lastPaymentAmount: grossAmount.toString(),
              clientPackageId: clientPackage.id,
              notes: `Vendido pelo PDV - Comanda #${comanda.id.slice(-6)}`,
            } as any).returning();

            await tx.update(schema.clientPackages)
              .set({ subscriptionId: subscription.id })
              .where(eq(schema.clientPackages.id, clientPackage.id));

            await tx.update(schema.comandaItems)
              .set({ subscriptionId: subscription.id })
              .where(eq(schema.comandaItems.id, createdItem.id));

            await tx.insert(schema.subscriptionPayments).values({
              subscriptionId: subscription.id,
              comandaId: comanda.id,
              amount: grossAmount.toString(),
              paymentMethod,
              status: 'paid',
              paidAt: now,
              periodStart: now,
              periodEnd,
              receivedByUserId: session.userId || null,
              receivedByBarberId: session.barberId || null,
              cashRegisterId: openCashRegister?.id || null,
              notes: `Primeiro pagamento via PDV`,
            } as any);
          }
        }
      }

      // 3. Marcar agendamento como concluído (se comanda já foi criada fechada)
      if (comandaData.status === 'closed' && comandaData.appointmentId) {
        const [appointment] = await tx.select().from(schema.appointments)
          .where(eq(schema.appointments.id, comandaData.appointmentId));
        if (appointment && appointment.barbershopId === barbershopId) {
          await tx.update(schema.appointments)
            .set({ status: 'completed' })
            .where(eq(schema.appointments.id, comandaData.appointmentId));
        }
      }

      // 4. Baixa de estoque (só se fechada)
      if (comandaData.status === 'closed') {
        for (const item of items) {
          if (item.type === 'product' && item.itemId) {
            const [product] = await tx.select().from(schema.products)
              .where(eq(schema.products.id, item.itemId));
            if (product) {
              const newStock = Math.max(0, product.stock - (item.quantity || 1));
              await tx.update(schema.products)
                .set({ stock: newStock })
                .where(eq(schema.products.id, item.itemId));
            }
          }
        }
      }

      // 5. Fee deductions (só se fechada + paymentMethod + caixa aberto)
      if (comandaData.status === 'closed' && comandaData.paymentMethod && barbershop && openCashRegister) {
        let feePercentage = 0;
        const paymentMethod = comandaData.paymentMethod;

        if (paymentMethod === 'card' || paymentMethod === 'credito') {
          feePercentage = parseFloat(barbershop.feeCredit || '0');
        } else if (paymentMethod === 'debito') {
          feePercentage = parseFloat(barbershop.feeDebit || '0');
        } else if (paymentMethod === 'pix') {
          feePercentage = parseFloat(barbershop.feePix || '0');
        } else if (paymentMethod === 'split' && comandaData.paymentDetails) {
          const paymentDetails = comandaData.paymentDetails as any;
          const splitPayments = paymentDetails.split || [];
          const comandaTotal = parseFloat(comandaData.total || '0');
          let totalFeeAmount = 0;
          for (const payment of splitPayments) {
            let splitFee = 0;
            if (payment.method === 'card') {
              splitFee = parseFloat(barbershop.feeCredit || '0');
            } else if (payment.method === 'pix') {
              splitFee = parseFloat(barbershop.feePix || '0');
            }
            if (splitFee > 0 && payment.amount > 0) {
              totalFeeAmount += (payment.amount * splitFee) / 100;
            }
          }

          if (totalFeeAmount > 0 && comandaTotal > 0) {
            const effectiveFeePercentage = (totalFeeAmount / comandaTotal) * 100;
            await this.applyFeeDeductionsToCommissions(tx, barbershopId, comanda.id, effectiveFeePercentage);
          }
        }

        if (feePercentage > 0 && paymentMethod !== 'split') {
          await this.applyFeeDeductionsToCommissions(tx, barbershopId, comanda.id, feePercentage);
        }
      }

      return comanda;
    });
  }

  // ============ CAMPAIGNS ============

  async getCampaigns(barbershopId: string): Promise<Campaign[]> {
    return db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.barbershopId, barbershopId))
      .orderBy(desc(schema.campaigns.createdAt));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const result = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.id, id));
    return result[0];
  }

  async getCampaignsSending(): Promise<Campaign[]> {
    return db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.status, 'sending'))
      .orderBy(schema.campaigns.createdAt);
  }

  async createCampaign(data: InsertCampaign): Promise<Campaign> {
    const result = await db.insert(schema.campaigns).values(data).returning();
    return result[0];
  }

  async updateCampaign(id: string, updates: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const result = await db.update(schema.campaigns)
      .set(updates)
      .where(eq(schema.campaigns.id, id))
      .returning();
    return result[0];
  }

  async incrementCampaignSentCount(id: string): Promise<void> {
    await db.update(schema.campaigns)
      .set({ sentCount: sql`${schema.campaigns.sentCount} + 1` })
      .where(eq(schema.campaigns.id, id));
  }

  async incrementCampaignFailedCount(id: string): Promise<void> {
    await db.update(schema.campaigns)
      .set({ failedCount: sql`${schema.campaigns.failedCount} + 1` })
      .where(eq(schema.campaigns.id, id));
  }

  // ============ CAMPAIGN RECIPIENTS ============

  async createCampaignRecipients(recipients: InsertCampaignRecipient[]): Promise<void> {
    if (recipients.length === 0) return;
    for (let i = 0; i < recipients.length; i += 500) {
      await db.insert(schema.campaignRecipients).values(recipients.slice(i, i + 500));
    }
  }

  async getCampaignRecipients(campaignId: string): Promise<CampaignRecipient[]> {
    return db.select().from(schema.campaignRecipients)
      .where(eq(schema.campaignRecipients.campaignId, campaignId))
      .orderBy(schema.campaignRecipients.createdAt);
  }

  async getPendingCampaignRecipient(campaignId: string): Promise<CampaignRecipient | undefined> {
    const result = await db.select().from(schema.campaignRecipients)
      .where(and(
        eq(schema.campaignRecipients.campaignId, campaignId),
        eq(schema.campaignRecipients.status, 'pending')
      ))
      .limit(1);
    return result[0];
  }

  async updateCampaignRecipient(id: string, updates: Partial<InsertCampaignRecipient>): Promise<void> {
    await db.update(schema.campaignRecipients)
      .set(updates)
      .where(eq(schema.campaignRecipients.id, id));
  }

  async getCampaignSentTodayCount(barbershopId: string): Promise<number> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.campaignRecipients)
      .where(and(
        eq(schema.campaignRecipients.barbershopId, barbershopId),
        eq(schema.campaignRecipients.status, 'sent'),
        gte(schema.campaignRecipients.sentAt, startOfDay)
      ));
    return Number(result[0]?.count ?? 0);
  }

  // ============ CLIENT FILTER ============

  async getClientsFiltered(barbershopId: string, filter: ClientCampaignFilter): Promise<Client[]> {
    if (filter.mode === 'all') {
      return db.select().from(schema.clients)
        .where(eq(schema.clients.barbershopId, barbershopId));
    }

    if (filter.mode === 'manual' && filter.clientIds?.length) {
      return db.select().from(schema.clients)
        .where(and(
          eq(schema.clients.barbershopId, barbershopId),
          inArray(schema.clients.id, filter.clientIds)
        ));
    }

    if (filter.mode === 'funnel' && filter.funnelStatuses?.length) {
      return db.select().from(schema.clients)
        .where(and(
          eq(schema.clients.barbershopId, barbershopId),
          inArray(schema.clients.clientStatus, filter.funnelStatuses)
        ));
    }

    if (filter.mode === 'inactive' && filter.inactiveDays) {
      const cutoff = new Date(Date.now() - filter.inactiveDays * 24 * 60 * 60 * 1000);
      return db.select().from(schema.clients)
        .where(and(
          eq(schema.clients.barbershopId, barbershopId),
          lte(schema.clients.lastVisitAt, cutoff)
        ));
    }

    return [];
  }

  // ============ STRIPE WEBHOOK IDEMPOTENCY ============

  // Retorna true se o evento é novo (deve ser processado). Retorna false se já foi processado antes.
  // Em caso de erro de infraestrutura (tabela ausente, etc), retorna true (fail-open) para não bloquear o webhook.
  async tryRecordStripeEvent(eventId: string, eventType: string): Promise<boolean> {
    try {
      const inserted = await db.insert(schema.stripeEventsProcessed)
        .values({ id: eventId, eventType })
        .onConflictDoNothing()
        .returning();
      return inserted.length > 0;
    } catch (err) {
      console.error('[Stripe Idempotency] Falha ao registrar evento, processando sem proteção:', err);
      return true;
    }
  }

  // ============ ADVISORY LOCK (jobs de background) ============

  // Tenta adquirir um lock global no Postgres (pg_try_advisory_lock). Se conseguir, executa `fn`
  // e libera o lock ao final. Se o lock já estiver em uso por outra instância/processo, retorna
  // null sem executar — o próximo ciclo do job tentará de novo.
  async withAdvisoryLock<T>(lockKey: number, fn: () => Promise<T>): Promise<T | null> {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT pg_try_advisory_lock($1)::boolean AS acquired',
        [lockKey]
      );
      const acquired = rows[0]?.acquired === true;
      if (!acquired) return null;
      try {
        return await fn();
      } finally {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
        } catch (unlockErr) {
          console.error('[AdvisoryLock] Falha ao liberar lock (será liberado ao fechar conexão):', unlockErr);
        }
      }
    } finally {
      client.release();
    }
  }
}

export const storage = new DbStorage();
