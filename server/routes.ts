import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { 
  insertUserSchema, 
  insertBarbershopSchema,
  insertBarberSchema, 
  insertClientSchema,
  insertServiceSchema,
  insertProductSchema,
  insertPackageSchema,
  insertAppointmentSchema,
  insertComandaSchema,
  insertComandaItemSchema,
  insertCashRegisterSchema,
  insertCashTransactionSchema,
  insertFixedExpenseSchema
} from "@shared/schema";
import { scheduleAppointmentNotifications, scheduleCancellationMessage, scheduleWelcomeMessage } from "./messaging";
import { renderCampaignMessage } from './messaging/campaign-renderer';
import { handleIncomingMessage } from "./chatbot";
import { getAvailabilitySummaryForBarbers, checkBarberAvailabilityWithDuration } from "./chatbot/availability-service";
import { getProvider } from "./messaging/provider-interface";
import { sendPasswordResetEmail } from "./email";
import { normalizePhone, isValidBrazilianPhone } from "./utils/phone";
import { brazilDateToUTCStart, brazilDateToUTCEnd, getBrazilDateString } from "./utils/timezone";
import { getComandaGrossBreakdown, sumGrossFromBreakdown } from "./reports/dre-payment-gross";
import { utcInstantToBrazilDateKey, buildChartPoints } from "./reports/dre-chart-utils";

// Helper function to calculate net amount after Stripe fees
function calculateNetAmount(grossAmount: number, feeStripePercent: number, feeStripeFixed: number): number {
  // Net = Gross - (Gross * percent/100) - fixed
  const percentFee = (grossAmount * feeStripePercent) / 100;
  const netAmount = grossAmount - percentFee - feeStripeFixed;
  return Math.max(0, parseFloat(netAmount.toFixed(2)));
}

// Extend Express Request to include session user
declare module "express-session" {
  interface SessionData {
    userId: string;
    barbershopId: string;
    barberId?: string;
    isBarber?: boolean;
  }
}

// Middleware to check auth
function requireAuth(req: Request, res: Response, next: any) {
  if (!req.session?.userId || !req.session?.barbershopId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

async function requireOwner(req: Request, res: Response, next: any) {
  if (!req.session?.userId || !req.session?.barbershopId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = await storage.getUserById(req.session.userId);
  if (!user || user.role !== "owner") {
    return res.status(403).json({ error: "Apenas o dono da conta pode realizar esta ação" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============ AUTH ROUTES ============
  
  // Signup (creates barbershop + first user)
  app.post("/api/auth/signup", async (req, res) => {
    try {
      console.log('[Auth] Tentativa de signup recebida');
      const signupSchema = z.object({
        barbershopName: z.string().min(1),
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
      });

      const data = signupSchema.parse(req.body);
      console.log(`[Auth] Dados validados para signup: ${data.email}`);
      
      // Check if user exists
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        console.log(`[Auth] Email já registrado: ${data.email}`);
        return res.status(400).json({ error: "Email already registered" });
      }

      console.log('[Auth] Criando barbearia...');
      // Create barbershop
      const barbershop = await storage.createBarbershop({
        name: data.barbershopName,
      });
      console.log(`[Auth] Barbearia criada: ${barbershop.id}`);

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(data.password, 10);
      console.log('[Auth] Criando usuário...');
      const user = await storage.createUser({
        name: data.name,
        email: data.email,
        password: hashedPassword,
        barbershopId: barbershop.id,
        role: "owner",
      });
      console.log(`[Auth] Usuário criado: ${user.id}`);

      // Set session
      req.session.userId = user.id;
      req.session.barbershopId = user.barbershopId;

      console.log(`[Auth] Signup bem-sucedido: ${data.email}`);
      res.json({ user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, barbershopId: user.barbershopId } });
    } catch (error: any) {
      console.error('[Auth] Erro no signup:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const loginSchema = z.object({
        email: z.string().email(),
        password: z.string(),
      });

      const data = loginSchema.parse(req.body);
      
      console.log(`[Auth] Tentativa de login para: ${data.email}`);
      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        console.log(`[Auth] Usuário não encontrado: ${data.email}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      console.log(`[Auth] Usuário encontrado. Comparando senhas...`);
      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        console.log(`[Auth] Senha inválida para: ${data.email}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      console.log(`[Auth] Login bem-sucedido: ${data.email}`);
      req.session.userId = user.id;
      req.session.barbershopId = user.barbershopId;

      res.json({ user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, barbershopId: user.barbershopId } });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // Get current user
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUserById(req.session.userId!);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, barbershopId: user.barbershopId } });
  });

  // Forgot Password
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const forgotSchema = z.object({
        email: z.string().email(),
      });
      const { email } = forgotSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      
      // Always return same message for security
      const successMessage = "Se o e-mail estiver cadastrado, você receberá um link de recuperação.";
      
      if (!user) {
        return res.json({ message: successMessage });
      }

      // Generate token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
      });

      // Build reset link
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co`
        : 'http://localhost:5000';
      const resetLink = `${baseUrl}/reset-password?token=${token}`;

      // Send email
      const emailSent = await sendPasswordResetEmail(user.email, user.name, resetLink);
      if (!emailSent) {
        console.log(`[Auth] Link de reset (Resend não configurado): ${resetLink}`);
      }
      
      res.json({ message: successMessage });
    } catch (error: any) {
      console.error('[Auth] Erro no forgot-password:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Reset Password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ error: "Token e nova senha são obrigatórios" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
      }

      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.status(400).json({ error: "Token inválido ou expirado" });
      }

      if (resetToken.usedAt) {
        return res.status(400).json({ error: "Este link já foi utilizado" });
      }

      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ error: "Token expirado. Solicite uma nova recuperação." });
      }

      // Update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Update user password using storage layer
      await storage.updateUserPassword(resetToken.userId, hashedPassword);

      // Mark token as used
      await storage.markTokenUsed(resetToken.id);

      res.json({ message: "Senha redefinida com sucesso! Você já pode fazer login." });
    } catch (error: any) {
      console.error('[Auth] Erro no reset-password:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ BARBER AUTH (Painel do Barbeiro) ============
  
  app.post("/api/barber/login", async (req, res) => {
    try {
      const loginSchema = z.object({
        phone: z.string().min(1),
        password: z.string().min(1),
      });

      const data = loginSchema.parse(req.body);
      
      const normalizedBarberPhone = normalizePhone(data.phone);
      if (!isValidBrazilianPhone(normalizedBarberPhone)) {
        return res.status(400).json({ error: "Telefone inválido." });
      }
      const barber = await storage.getBarberByPhone(normalizedBarberPhone);
      if (!barber || !barber.password) {
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      if (!barber.active) {
        return res.status(401).json({ error: "Barbeiro desativado" });
      }

      const validPassword = await bcrypt.compare(data.password, barber.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Credenciais inválidas" });
      }

      req.session.barberId = barber.id;
      req.session.barbershopId = barber.barbershopId;
      req.session.isBarber = true;

      res.json({ 
        barber: { 
          id: barber.id, 
          name: barber.name, 
          avatar: barber.avatar,
          barbershopId: barber.barbershopId 
        } 
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/barber/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/barber/me", async (req, res) => {
    if (!req.session?.barberId || !req.session?.isBarber) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const barber = await storage.getBarber(req.session.barberId);
    if (!barber) {
      return res.status(404).json({ error: "Barbeiro não encontrado" });
    }
    const barbershop = await storage.getBarbershop(barber.barbershopId);
    res.json({ 
      barber: { 
        id: barber.id, 
        name: barber.name, 
        avatar: barber.avatar,
        barbershopId: barber.barbershopId,
        barbershopName: barbershop?.name || ''
      } 
    });
  });

  app.get("/api/barber/commissions", async (req, res) => {
    try {
      if (!req.session?.barberId || !req.session?.isBarber) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { startDate, endDate, paid } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      // Ajustar endDate para incluir todo o dia (23:59:59.999)
      let end: Date | undefined;
      if (endDate) {
        end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
      }

      let commissions = await storage.getCommissionsWithDetails(
        req.session.barbershopId!,
        req.session.barberId,
        start,
        end
      );

      if (paid !== undefined) {
        const isPaid = paid === 'true';
        commissions = commissions.filter(c => c.paid === isPaid);
      }

      res.json(commissions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/barber/purchases", async (req, res) => {
    if (!req.session?.barberId || !req.session?.isBarber) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    
    const purchases = await storage.getBarberPurchases(
      req.session.barbershopId!,
      req.session.barberId,
      start,
      end
    );
    
    res.json(purchases);
  });

  app.get("/api/barber/payment-history", async (req, res) => {
    if (!req.session?.barberId || !req.session?.isBarber) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const payments = await storage.getCommissionPayments(
      req.session.barbershopId!,
      req.session.barberId
    );
    
    res.json(payments);
  });

  app.get("/api/barber/appointments", async (req, res) => {
    if (!req.session?.barberId || !req.session?.isBarber) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { date } = req.query;
    const selectedDate = date ? new Date(date as string) : new Date();
    
    const appointments = await storage.getBarberAppointments(req.session.barberId, selectedDate);
    
    // Enriquecer com dados do cliente e serviço
    const clients = await storage.getClients(req.session.barbershopId!);
    const services = await storage.getServices(req.session.barbershopId!);
    
    const enriched = appointments.map(apt => {
      const client = clients.find(c => c.id === apt.clientId);
      const service = services.find(s => s.id === apt.serviceId);
      return {
        id: apt.id,
        clientName: client?.name || 'Cliente',
        clientPhone: client?.phone,
        serviceName: service?.name || 'Serviço',
        duration: service?.duration || 30,
        startTime: apt.startTime,
        endTime: apt.endTime,
        status: apt.status,
        notes: apt.notes
      };
    });
    
    res.json(enriched);
  });

  // ============ TEAM MANAGEMENT ============

  // Listar usuários da barbearia
  app.get("/api/team", requireAuth, async (req, res) => {
    try {
      const users = await storage.getUsersByBarbershop(req.session.barbershopId!);
      const safeUsers = users.map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, createdAt: u.createdAt }));
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Convidar novo usuário (somente owner)
  app.post("/api/team/invite", requireOwner, async (req, res) => {
    try {
      const inviteSchema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().optional(),
        role: z.enum(["owner", "manager"]).default("manager"),
      });
      const data = inviteSchema.parse(req.body);

      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({
        name: data.name,
        email: data.email,
        password: hashedPassword,
        phone: data.phone || null,
        barbershopId: req.session.barbershopId!,
        role: data.role,
      });

      res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Atualizar usuário da equipe (somente owner)
  app.patch("/api/team/:id", requireOwner, async (req, res) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        role: z.enum(["owner", "manager"]).optional(),
      });
      const data = updateSchema.parse(req.body);

      // Verificar que o usuário pertence à mesma barbearia
      const target = await storage.getUserById(req.params.id);
      if (!target || target.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const updated = await storage.updateUser(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Usuário não encontrado" });

      res.json({ id: updated.id, name: updated.name, email: updated.email, phone: updated.phone, role: updated.role });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Remover usuário da equipe (somente owner, não pode remover a si mesmo)
  app.delete("/api/team/:id", requireOwner, async (req, res) => {
    try {
      if (req.params.id === req.session.userId) {
        return res.status(400).json({ error: "Você não pode remover sua própria conta" });
      }

      const target = await storage.getUserById(req.params.id);
      if (!target || target.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Atualizar próprio perfil (nome, telefone, senha)
  app.patch("/api/profile", requireAuth, async (req, res) => {
    try {
      const profileSchema = z.object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(6).optional(),
      });
      const data = profileSchema.parse(req.body);

      const user = await storage.getUserById(req.session.userId!);
      if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

      // Atualizar senha se fornecida
      if (data.newPassword) {
        if (!data.currentPassword) {
          return res.status(400).json({ error: "Informe a senha atual para alterar a senha" });
        }
        const valid = await bcrypt.compare(data.currentPassword, user.password);
        if (!valid) {
          return res.status(400).json({ error: "Senha atual incorreta" });
        }
        const hashed = await bcrypt.hash(data.newPassword, 10);
        await storage.updateUserPassword(user.id, hashed);
      }

      const updated = await storage.updateUser(user.id, {
        ...(data.name && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
      });

      res.json({ id: updated!.id, name: updated!.name, email: updated!.email, phone: updated!.phone, role: updated!.role });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ BARBERSHOP SETTINGS ============
  
  app.get("/api/barbershop", requireAuth, async (req, res) => {
    const barbershop = await storage.getBarbershop(req.session.barbershopId!);
    if (!barbershop) {
      return res.status(404).json({ error: "Barbershop not found" });
    }
    res.json(barbershop);
  });

  app.patch("/api/barbershop", requireAuth, async (req, res) => {
    try {
      const barbershop = await storage.updateBarbershop(req.session.barbershopId!, req.body);
      res.json(barbershop);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ BARBERS ============
  
  app.get("/api/barbers", requireAuth, async (req, res) => {
    const barbers = await storage.getBarbers(req.session.barbershopId!);
    res.json(barbers);
  });

  app.post("/api/barbers", requireAuth, async (req, res) => {
    try {
      const bodyData = { ...req.body, barbershopId: req.session.barbershopId };
      if (bodyData.phone) {
        bodyData.phone = normalizePhone(bodyData.phone);
        if (!isValidBrazilianPhone(bodyData.phone)) {
          return res.status(400).json({ error: "Telefone inválido. Use formato brasileiro com DDD." });
        }
      }
      if (bodyData.password) {
        bodyData.password = await bcrypt.hash(bodyData.password, 10);
      }
      const data = insertBarberSchema.parse(bodyData);
      const barber = await storage.createBarber(data);
      res.json(barber);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/barbers/:id", requireAuth, async (req, res) => {
    try {
      const updateData = { ...req.body };
      if (updateData.phone) {
        updateData.phone = normalizePhone(updateData.phone);
        if (!isValidBrazilianPhone(updateData.phone)) {
          return res.status(400).json({ error: "Telefone inválido. Use formato brasileiro com DDD." });
        }
      }
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      }
      const barber = await storage.updateBarber(req.params.id, updateData);
      res.json(barber);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/barbers/:id", requireAuth, async (req, res) => {
    await storage.deleteBarber(req.params.id);
    res.json({ success: true });
  });

  // Get services configured for a barber (admin)
  app.get("/api/barbers/:id/services", requireAuth, async (req, res) => {
    try {
      const barberServices = await storage.getBarberServices(req.params.id);
      res.json(barberServices);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Set services for a barber (admin) — replaces existing list
  app.put("/api/barbers/:id/services", requireAuth, async (req, res) => {
    try {
      const { services } = req.body as { services: { serviceId: string; customPrice?: string | null }[] };
      if (!Array.isArray(services)) {
        return res.status(400).json({ error: "services deve ser um array" });
      }
      await storage.setBarberServices(req.params.id, services);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ CLIENTS ============
  
  app.get("/api/clients", requireAuth, async (req, res) => {
    const clients = await storage.getClients(req.session.barbershopId!);
    res.json(clients);
  });

  app.post("/api/clients", requireAuth, async (req, res) => {
    try {
      const bodyWithNormalizedPhone = { ...req.body };
      if (bodyWithNormalizedPhone.phone) {
        bodyWithNormalizedPhone.phone = normalizePhone(bodyWithNormalizedPhone.phone);
        if (!isValidBrazilianPhone(bodyWithNormalizedPhone.phone)) {
          return res.status(400).json({ error: "Telefone inválido. Use formato brasileiro com DDD." });
        }
      }
      const data = insertClientSchema.parse({ ...bodyWithNormalizedPhone, barbershopId: req.session.barbershopId });
      const client = await storage.createClient(data);
      
      // Schedule welcome message for new client
      try {
        console.log(`[API] Cliente criado: ${client.id}, telefone: ${client.phone}`);
        if (client.phone) {
          console.log(`[API] Chamando scheduleWelcomeMessage para ${client.name} (${client.phone})`);
          await scheduleWelcomeMessage(
            req.session.barbershopId!,
            client.id,
            client.phone,
            client.name
          );
          console.log(`[API] scheduleWelcomeMessage concluído com sucesso`);
        } else {
          console.log(`[API] Cliente sem telefone, pulando mensagem de boas-vindas`);
        }
      } catch (notifyError) {
        console.error('[Notifications] Erro ao enviar mensagem de boas-vindas:', notifyError);
      }
      
      res.json(client);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Funil de Clientes (rotas específicas devem vir antes de /:id)
  app.get("/api/clients/funnel-dashboard", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const dashboard = await storage.getClientsFunnelDashboard(barbershopId);
      res.json(dashboard);
    } catch (error: any) {
      console.error('[Funil] Erro ao buscar dashboard do funil:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clients/funnel", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const stats = await storage.getClientsFunnelStats(barbershopId);
      res.json(stats);
    } catch (error: any) {
      console.error('[Funil] Erro ao buscar stats do funil:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients/recalculate-stats", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      console.log(`[Funil] Iniciando recálculo de todos os clientes da barbearia ${barbershopId}`);
      const result = await storage.recalculateAllClientsStats(barbershopId);
      res.json({
        success: true,
        message: `Recálculo concluído: ${result.updated} clientes atualizados, ${result.errors} erros`,
        ...result,
      });
    } catch (error: any) {
      console.error('[Funil] Erro ao recalcular stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const updates = { ...req.body };
      if (updates.phone) {
        updates.phone = normalizePhone(updates.phone);
        if (!isValidBrazilianPhone(updates.phone)) {
          return res.status(400).json({ error: "Telefone inválido. Use formato brasileiro com DDD." });
        }
      }
      const client = await storage.updateClient(req.params.id, updates);
      res.json(client);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/clients/:id", requireAuth, async (req, res) => {
    await storage.deleteClient(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/clients/:id/history", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const clientId = req.params.id;
      
      const clients = await storage.getClients(barbershopId);
      if (!clients.find(c => c.id === clientId)) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      
      const comandas = await storage.getComandas(barbershopId);
      const clientComandas = comandas.filter(c => c.clientId === clientId && c.status === 'closed');
      
      const barbers = await storage.getBarbers(barbershopId);
      const services = await storage.getServices(barbershopId);
      const products = await storage.getProducts(barbershopId);
      const packages = await storage.getPackages(barbershopId);
      
      const history = await Promise.all(clientComandas.map(async (comanda) => {
        const items = await storage.getComandaItems(comanda.id);
        const enrichedItems = items.map(item => {
          let itemName = 'Item';
          let itemType = item.type || 'service';
          
          if (item.serviceId) {
            const service = services.find(s => s.id === item.serviceId);
            itemName = service?.name || 'Serviço';
            if (item.type === 'package_use') {
              itemType = 'package_use';
            } else {
              itemType = 'service';
            }
          } else if (item.productId) {
            const product = products.find(p => p.id === item.productId);
            itemName = product?.name || 'Produto';
            itemType = 'product';
          } else if (item.packageId) {
            const pkg = packages.find(p => p.id === item.packageId);
            itemName = pkg?.name || 'Pacote';
            itemType = 'package';
          }
          
          return {
            ...item,
            itemName,
            type: itemType
          };
        });
        
        const barber = barbers.find(b => b.id === comanda.barberId);
        
        return {
          id: comanda.id,
          date: comanda.createdAt,
          total: comanda.total,
          paymentMethod: comanda.paymentMethod,
          barberName: barber?.name || 'Desconhecido',
          barberId: comanda.barberId,
          items: enrichedItems
        };
      }));
      
      res.json(history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ SERVICES ============
  
  app.get("/api/services", requireAuth, async (req, res) => {
    const services = await storage.getServices(req.session.barbershopId!);
    res.json(services);
  });

  app.post("/api/services", requireAuth, async (req, res) => {
    try {
      const data = insertServiceSchema.parse({ ...req.body, barbershopId: req.session.barbershopId });
      const service = await storage.createService(data);
      res.json(service);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/services/:id", requireAuth, async (req, res) => {
    try {
      const service = await storage.updateService(req.params.id, req.body);
      res.json(service);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/services/:id", requireAuth, async (req, res) => {
    await storage.deleteService(req.params.id);
    res.json({ success: true });
  });

  // ============ PRODUCTS ============
  
  app.get("/api/products", requireAuth, async (req, res) => {
    const products = await storage.getProducts(req.session.barbershopId!);
    res.json(products);
  });

  app.post("/api/products", requireAuth, async (req, res) => {
    try {
      const data = insertProductSchema.parse({ ...req.body, barbershopId: req.session.barbershopId });
      const product = await storage.createProduct(data);
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/products/:id", requireAuth, async (req, res) => {
    try {
      const product = await storage.updateProduct(req.params.id, req.body);
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/products/:id", requireAuth, async (req, res) => {
    await storage.deleteProduct(req.params.id);
    res.json({ success: true });
  });

  // ============ PACKAGES ============
  
  app.get("/api/packages", requireAuth, async (req, res) => {
    const packages = await storage.getPackages(req.session.barbershopId!);
    res.json(packages);
  });

  app.post("/api/packages", requireAuth, async (req, res) => {
    try {
      const data = insertPackageSchema.parse({ ...req.body, barbershopId: req.session.barbershopId });
      const pkg = await storage.createPackage(data);
      res.json(pkg);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/packages/:id", requireAuth, async (req, res) => {
    try {
      const pkg = await storage.updatePackage(req.params.id, req.body);
      res.json(pkg);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/packages/:id", requireAuth, async (req, res) => {
    await storage.deletePackage(req.params.id);
    res.json({ success: true });
  });

  // ============ SUBSCRIPTIONS (Assinaturas recorrentes) ============
  
  app.get("/api/subscriptions", requireAuth, async (req, res) => {
    const subscriptions = await storage.getSubscriptions(req.session.barbershopId!);
    res.json(subscriptions);
  });

  app.get("/api/subscriptions/:id", requireAuth, async (req, res) => {
    const subscription = await storage.getSubscription(req.params.id);
    if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
      return res.status(404).json({ error: "Assinatura não encontrada" });
    }
    res.json(subscription);
  });

  app.get("/api/clients/:clientId/subscriptions", requireAuth, async (req, res) => {
    const client = await storage.getClient(req.params.clientId);
    if (!client || client.barbershopId !== req.session.barbershopId) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }
    
    const subscriptions = await storage.getClientSubscriptions(req.params.clientId);
    res.json(subscriptions);
  });

  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const { clientId, packageId, paymentMethod, notes } = req.body;
      
      // Validate client
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      
      // Validate package and check if it's recurring
      const pkg = await storage.getPackage(packageId);
      if (!pkg) {
        return res.status(404).json({ error: "Pacote não encontrado" });
      }
      if (!pkg.isRecurring) {
        return res.status(400).json({ error: "Este pacote não é um plano recorrente" });
      }
      
      // Check for existing active subscription
      const existingSubscription = await storage.getActiveSubscription(clientId, packageId);
      if (existingSubscription) {
        return res.status(400).json({ error: "Cliente já possui assinatura ativa deste plano" });
      }
      
      // Calculate dates based on recurring interval
      const now = new Date();
      const periodEnd = new Date(now);
      const nextBilling = new Date(now);
      
      switch (pkg.recurringInterval) {
        case "weekly":
          periodEnd.setDate(periodEnd.getDate() + 7);
          nextBilling.setDate(nextBilling.getDate() + 7);
          break;
        case "biweekly":
          periodEnd.setDate(periodEnd.getDate() + 14);
          nextBilling.setDate(nextBilling.getDate() + 14);
          break;
        case "monthly":
        default:
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          nextBilling.setMonth(nextBilling.getMonth() + 1);
          break;
      }
      
      // Para PIX/Dinheiro: começa como "pending" até ativar manualmente
      // Para Cartão: começa como "pending" até Stripe confirmar
      const initialStatus = "pending";
      
      // Create subscription first (datas de período são provisórias - serão atualizadas na ativação)
      const subscription = await storage.createSubscription({
        barbershopId,
        clientId,
        packageId,
        status: initialStatus,
        paymentMethod,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: nextBilling,
        notes,
      });
      
      // Para PIX/Dinheiro: NÃO criar clientPackage ainda
      // Os créditos só são liberados quando ativar (após receber pagamento)
      // Para Cartão: será criado quando Stripe confirmar o pagamento via webhook
      
      res.json(subscription);
    } catch (error: any) {
      console.error("[Subscriptions] Error creating subscription:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/subscriptions/:id", requireAuth, async (req, res) => {
    try {
      const subscription = await storage.getSubscription(req.params.id);
      if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Assinatura não encontrada" });
      }
      
      const updated = await storage.updateSubscription(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/subscriptions/:id/cancel", requireAuth, async (req, res) => {
    try {
      const subscription = await storage.getSubscription(req.params.id);
      if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Assinatura não encontrada" });
      }
      
      await storage.cancelSubscription(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/subscriptions/:id", requireAuth, async (req, res) => {
    try {
      const subscription = await storage.getSubscription(req.params.id);
      if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Assinatura não encontrada" });
      }
      
      if (subscription.status === "active") {
        return res.status(400).json({ error: "Não é possível excluir uma assinatura ativa. Cancele primeiro." });
      }
      
      await storage.deleteSubscription(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/subscriptions/:id/renew", requireAuth, async (req, res) => {
    try {
      const { paymentMethod, notes } = req.body;
      const subscription = await storage.getSubscription(req.params.id);
      
      if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Assinatura não encontrada" });
      }
      
      const pkg = await storage.getPackage(subscription.packageId);
      if (!pkg) {
        return res.status(404).json({ error: "Pacote não encontrado" });
      }
      
      const client = await storage.getClient(subscription.clientId);
      
      const now = new Date();
      const periodStart = new Date(subscription.currentPeriodEnd);
      const periodEnd = new Date(periodStart);
      const nextBilling = new Date(periodStart);
      
      switch (pkg.recurringInterval) {
        case "weekly":
          periodEnd.setDate(periodEnd.getDate() + 7);
          nextBilling.setDate(nextBilling.getDate() + 7);
          break;
        case "biweekly":
          periodEnd.setDate(periodEnd.getDate() + 14);
          nextBilling.setDate(nextBilling.getDate() + 14);
          break;
        case "monthly":
        default:
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          nextBilling.setMonth(nextBilling.getMonth() + 1);
          break;
      }
      
      // Renew or create new client package credits linked to subscription
      const expiresAt = new Date(periodEnd);
      expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
      
      const clientPackage = await storage.createClientPackage({
        clientId: subscription.clientId,
        packageId: subscription.packageId,
        subscriptionId: subscription.id,
        quantityRemaining: pkg.quantity,
        quantityOriginal: pkg.quantity,
        expiresAt,
      });
      
      // Create payment record
      const actualPaymentMethod = paymentMethod || subscription.paymentMethod;
      await storage.createSubscriptionPayment({
        subscriptionId: subscription.id,
        amount: pkg.price,
        paymentMethod: actualPaymentMethod,
        status: "paid",
        paidAt: now,
        periodStart,
        periodEnd,
        notes,
      });
      
      // Register manual payment in open cash register (ONLY CASH - PIX goes to bank account, not physical cash register)
      if (actualPaymentMethod === "cash") {
        const openCashRegister = await storage.getOpenCashRegister(subscription.barbershopId);
        if (openCashRegister && client) {
          await storage.createCashTransaction({
            cashRegisterId: openCashRegister.id,
            type: "deposit",
            amount: pkg.price,
            description: `Renovação Assinatura: ${pkg.name} - ${client.name} (Dinheiro)`,
          });
        }
      }
      // NOTA: PIX não entra no caixa físico - vai direto para a conta bancária
      
      // Update subscription
      const updatedSubscription = await storage.updateSubscription(subscription.id, {
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextBillingDate: nextBilling,
        lastPaymentDate: now,
        lastPaymentAmount: pkg.price,
        clientPackageId: clientPackage.id,
      });
      
      res.json(updatedSubscription);
    } catch (error: any) {
      console.error("[Subscriptions] Error renewing subscription:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/subscriptions/:id/payments", requireAuth, async (req, res) => {
    const subscription = await storage.getSubscription(req.params.id);
    if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
      return res.status(404).json({ error: "Assinatura não encontrada" });
    }
    
    const payments = await storage.getSubscriptionPayments(req.params.id);
    
    // Enriquecer pagamentos com nomes de quem recebeu
    const enrichedPayments = await Promise.all(payments.map(async (payment) => {
      let receivedByName = null;
      
      if (payment.receivedByBarberId) {
        const barber = await storage.getBarber(payment.receivedByBarberId);
        if (barber) receivedByName = barber.name;
      } else if (payment.receivedByUserId) {
        const user = await storage.getUserById(payment.receivedByUserId);
        if (user) receivedByName = user.name;
      }
      
      return { ...payment, receivedByName };
    }));
    
    res.json(enrichedPayments);
  });

  // Ativar assinatura pendente (primeiro pagamento PIX/Dinheiro)
  app.post("/api/subscriptions/:id/activate", requireAuth, async (req, res) => {
    try {
      const subscription = await storage.getSubscription(req.params.id);
      if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Assinatura não encontrada" });
      }
      
      if (subscription.status !== "pending") {
        return res.status(400).json({ error: "Assinatura já está ativa ou cancelada" });
      }
      
      if (subscription.paymentMethod === "card") {
        return res.status(400).json({ error: "Assinaturas com cartão são ativadas automaticamente pelo Stripe" });
      }
      
      // Verificar se já tem clientPackage (evitar duplicatas)
      if (subscription.clientPackageId) {
        return res.status(400).json({ error: "Assinatura já foi ativada anteriormente" });
      }
      
      const pkg = await storage.getPackage(subscription.packageId);
      if (!pkg) {
        return res.status(404).json({ error: "Pacote não encontrado" });
      }
      
      const client = await storage.getClient(subscription.clientId);
      const now = new Date();
      
      // Calcular período baseado no intervalo
      const periodEnd = new Date(now);
      switch (pkg.recurringInterval) {
        case "weekly":
          periodEnd.setDate(periodEnd.getDate() + 7);
          break;
        case "biweekly":
          periodEnd.setDate(periodEnd.getDate() + 14);
          break;
        case "monthly":
        default:
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          break;
      }
      
      // Criar clientPackage com créditos
      const expiresAt = new Date(periodEnd);
      expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
      
      // Para pagamento em dinheiro/PIX, não há taxa do Stripe - valor líquido = valor bruto
      const clientPackage = await storage.createClientPackage({
        clientId: subscription.clientId,
        packageId: subscription.packageId,
        subscriptionId: subscription.id,
        quantityRemaining: pkg.quantity,
        quantityOriginal: pkg.quantity,
        expiresAt,
        netAmount: pkg.price, // Sem desconto de taxas para dinheiro/PIX
        paymentMethod: subscription.paymentMethod || "cash",
      });
      
      // Criar registro de pagamento
      await storage.createSubscriptionPayment({
        subscriptionId: subscription.id,
        amount: pkg.price,
        paymentMethod: subscription.paymentMethod,
        status: "paid",
        paidAt: now,
        periodStart: now,
        periodEnd,
        notes: "Primeiro pagamento",
      });
      
      // Registrar no caixa (APENAS DINHEIRO - PIX vai para conta bancária, não para caixa físico)
      if (subscription.paymentMethod === "cash") {
        const openCashRegister = await storage.getOpenCashRegister(subscription.barbershopId);
        if (openCashRegister && client) {
          await storage.createCashTransaction({
            cashRegisterId: openCashRegister.id,
            type: "deposit",
            amount: pkg.price,
            description: `Assinatura: ${pkg.name} - ${client.name} (Dinheiro)`,
          });
        }
      }
      // NOTA: PIX não entra no caixa físico - vai direto para a conta bancária
      
      // Calcular próximo billing
      const nextBilling = new Date(periodEnd);
      
      // Atualizar assinatura para ativa
      const updatedSubscription = await storage.updateSubscription(subscription.id, {
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: nextBilling,
        lastPaymentDate: now,
        lastPaymentAmount: pkg.price,
        clientPackageId: clientPackage.id,
      });
      
      res.json(updatedSubscription);
    } catch (error: any) {
      console.error("[Subscriptions] Error activating subscription:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ STRIPE CHECKOUT ============
  
  app.get("/api/stripe/publishable-key", requireAuth, async (req, res) => {
    try {
      const { getStripePublishableKey } = await import("./stripeClient");
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error("[Stripe] Error getting publishable key:", error);
      res.status(500).json({ error: "Stripe não configurado" });
    }
  });

  app.post("/api/subscriptions/:id/setup-card", requireAuth, async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      
      const subscription = await storage.getSubscription(req.params.id);
      if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Assinatura não encontrada" });
      }
      
      const client = await storage.getClient(subscription.clientId);
      if (!client) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      
      const pkg = await storage.getPackage(subscription.packageId);
      if (!pkg) {
        return res.status(404).json({ error: "Pacote não encontrado" });
      }
      
      let customerId = subscription.stripeCustomerId;
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: client.name,
          phone: client.phone,
          email: client.email || undefined,
          metadata: {
            clientId: client.id,
            barbershopId: subscription.barbershopId,
          },
        });
        customerId = customer.id;
        
        await storage.updateSubscription(subscription.id, {
          stripeCustomerId: customerId,
        });
      }
      
      let stripePriceId = pkg.stripePriceId;
      
      if (!stripePriceId) {
        let stripeProductId = pkg.stripeProductId;
        
        if (!stripeProductId) {
          const product = await stripe.products.create({
            name: pkg.name,
            metadata: {
              packageId: pkg.id,
              barbershopId: pkg.barbershopId,
            },
          });
          stripeProductId = product.id;
        }
        
        const intervalMap: { [key: string]: 'day' | 'week' | 'month' | 'year' } = {
          weekly: 'week',
          biweekly: 'week',
          monthly: 'month',
        };
        const interval = intervalMap[pkg.recurringInterval || 'monthly'] || 'month';
        const intervalCount = pkg.recurringInterval === 'biweekly' ? 2 : 1;
        
        const price = await stripe.prices.create({
          product: stripeProductId,
          unit_amount: Math.round(parseFloat(pkg.price) * 100),
          currency: 'brl',
          recurring: {
            interval,
            interval_count: intervalCount,
          },
          metadata: {
            packageId: pkg.id,
          },
        });
        stripePriceId = price.id;
        
        await storage.updatePackage(pkg.id, {
          stripeProductId,
          stripePriceId,
        });
      }
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        payment_method_types: ['card'],
        line_items: [
          {
            price: stripePriceId,
            quantity: 1,
          },
        ],
        success_url: `${req.protocol}://${req.get("host")}/subscriptions?setup=success&subscription=${subscription.id}`,
        cancel_url: `${req.protocol}://${req.get("host")}/subscriptions?setup=cancelled`,
        metadata: {
          subscriptionId: subscription.id,
          packageId: subscription.packageId,
          clientId: subscription.clientId,
        },
        subscription_data: {
          metadata: {
            subscriptionId: subscription.id,
            packageId: subscription.packageId,
            clientId: subscription.clientId,
          },
        },
      });
      
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Stripe] Error creating subscription session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/subscriptions/:id/charge-card", requireAuth, async (req, res) => {
    try {
      const { getUncachableStripeClient } = await import("./stripeClient");
      const stripe = await getUncachableStripeClient();
      
      const subscription = await storage.getSubscription(req.params.id);
      if (!subscription || subscription.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Assinatura não encontrada" });
      }
      
      if (!subscription.stripeCustomerId) {
        return res.status(400).json({ error: "Cliente não tem cartão cadastrado" });
      }
      
      const pkg = await storage.getPackage(subscription.packageId);
      if (!pkg) {
        return res.status(404).json({ error: "Pacote não encontrado" });
      }
      
      const paymentMethods = await stripe.paymentMethods.list({
        customer: subscription.stripeCustomerId,
        type: "card",
      });
      
      if (paymentMethods.data.length === 0) {
        return res.status(400).json({ error: "Nenhum cartão cadastrado para este cliente" });
      }
      
      const defaultPaymentMethod = paymentMethods.data[0];
      const amount = Math.round(parseFloat(pkg.price) * 100);
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "brl",
        customer: subscription.stripeCustomerId,
        payment_method: defaultPaymentMethod.id,
        off_session: true,
        confirm: true,
        metadata: {
          subscriptionId: subscription.id,
          packageId: subscription.packageId,
        },
      });
      
      if (paymentIntent.status === "succeeded") {
        const now = new Date();
        const periodStart = new Date(subscription.currentPeriodEnd);
        const periodEnd = new Date(periodStart);
        const nextBilling = new Date(periodStart);
        
        switch (pkg.recurringInterval) {
          case "weekly":
            periodEnd.setDate(periodEnd.getDate() + 7);
            nextBilling.setDate(nextBilling.getDate() + 7);
            break;
          case "biweekly":
            periodEnd.setDate(periodEnd.getDate() + 14);
            nextBilling.setDate(nextBilling.getDate() + 14);
            break;
          case "monthly":
          default:
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            nextBilling.setMonth(nextBilling.getMonth() + 1);
            break;
        }
        
        const expiresAt = new Date(periodEnd);
        expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
        
        // Calculate net amount after Stripe fees
        const barbershop = await storage.getBarbershop(subscription.barbershopId);
        const grossAmount = parseFloat(pkg.price);
        const feeStripePercent = parseFloat(barbershop?.feeStripePercent || '3.99');
        const feeStripeFixed = parseFloat(barbershop?.feeStripeFixed || '0.39');
        const netAmount = calculateNetAmount(grossAmount, feeStripePercent, feeStripeFixed);
        
        const clientPackage = await storage.createClientPackage({
          clientId: subscription.clientId,
          packageId: subscription.packageId,
          subscriptionId: subscription.id,
          quantityRemaining: pkg.quantity,
          quantityOriginal: pkg.quantity,
          expiresAt,
          netAmount: netAmount.toString(),
          paymentMethod: "card",
        });
        
        await storage.createSubscriptionPayment({
          subscriptionId: subscription.id,
          amount: pkg.price,
          paymentMethod: "card",
          status: "paid",
          stripePaymentIntentId: paymentIntent.id,
          paidAt: now,
          periodStart,
          periodEnd,
          notes: "Cobrança automática via cartão",
        });
        
        await storage.updateSubscription(subscription.id, {
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextBillingDate: nextBilling,
          lastPaymentDate: now,
          lastPaymentAmount: pkg.price,
          clientPackageId: clientPackage.id,
        });
        
        res.json({ success: true, paymentIntentId: paymentIntent.id });
      } else {
        res.status(400).json({ error: "Pagamento não confirmado", status: paymentIntent.status });
      }
    } catch (error: any) {
      console.error("[Stripe] Error charging card:", error);
      
      if (error.code === "authentication_required") {
        res.status(400).json({ error: "Cartão requer autenticação. O cliente precisa aprovar a cobrança." });
      } else if (error.code === "card_declined") {
        res.status(400).json({ error: "Cartão recusado" });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  });

  // ============ STRIPE WEBHOOK ============
  app.post("/api/webhook/stripe", async (req, res) => {
    try {
      let event = req.body;
      
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (webhookSecret) {
        const { getUncachableStripeClient } = await import("./stripeClient");
        const stripe = await getUncachableStripeClient();
        const signature = req.headers['stripe-signature'] as string;
        
        if (!signature) {
          console.error("[Stripe Webhook] Missing signature header");
          return res.status(400).json({ error: "Missing signature" });
        }
        
        try {
          const rawBody = JSON.stringify(req.body);
          event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err: any) {
          console.error("[Stripe Webhook] Signature verification failed:", err.message);
          return res.status(400).json({ error: "Signature verification failed" });
        }
      } else {
        console.log("[Stripe Webhook] Warning: No STRIPE_WEBHOOK_SECRET set, skipping signature verification");
      }
      
      console.log(`[Stripe Webhook] Received event: ${event.type}`);
      
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          // Verificar se o pagamento foi realmente confirmado antes de processar
          if (session.mode === 'subscription' && session.subscription && session.payment_status === 'paid') {
            const subscriptionId = session.metadata?.subscriptionId;
            const stripeSubscriptionId = session.subscription as string;
            
            if (subscriptionId) {
              const subscription = await storage.getSubscription(subscriptionId);
              if (subscription) {
                const pkg = await storage.getPackage(subscription.packageId);
                if (pkg) {
                  const now = new Date();
                  const periodEnd = new Date(now);
                  
                  switch (pkg.recurringInterval) {
                    case "weekly":
                      periodEnd.setDate(periodEnd.getDate() + 7);
                      break;
                    case "biweekly":
                      periodEnd.setDate(periodEnd.getDate() + 14);
                      break;
                    case "monthly":
                    default:
                      periodEnd.setMonth(periodEnd.getMonth() + 1);
                      break;
                  }
                  
                  const expiresAt = new Date(periodEnd);
                  expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
                  
                  // Calculate net amount after Stripe fees
                  const barbershop = await storage.getBarbershop(subscription.barbershopId);
                  const grossAmount = parseFloat(pkg.price);
                  const feeStripePercent = parseFloat(barbershop?.feeStripePercent || '3.99');
                  const feeStripeFixed = parseFloat(barbershop?.feeStripeFixed || '0.39');
                  const netAmount = calculateNetAmount(grossAmount, feeStripePercent, feeStripeFixed);
                  
                  const clientPackage = await storage.createClientPackage({
                    clientId: subscription.clientId,
                    packageId: subscription.packageId,
                    subscriptionId: subscription.id,
                    quantityRemaining: pkg.quantity,
                    quantityOriginal: pkg.quantity,
                    expiresAt,
                    netAmount: netAmount.toString(),
                    paymentMethod: "card",
                  });
                  
                  // Registrar primeiro pagamento no caixa
                  const openCashRegister = await storage.getOpenCashRegister(subscription.barbershopId);
                  
                  await storage.createSubscriptionPayment({
                    subscriptionId: subscription.id,
                    amount: pkg.price,
                    paymentMethod: "card",
                    status: "paid",
                    stripePaymentIntentId: session.payment_intent as string || null,
                    paidAt: now,
                    periodStart: now,
                    periodEnd,
                    cashRegisterId: openCashRegister?.id || null,
                    notes: "Primeira cobrança via Stripe Checkout",
                  });
                  
                  await storage.updateSubscription(subscription.id, {
                    status: "active",
                    stripeSubscriptionId,
                    currentPeriodStart: now,
                    currentPeriodEnd: periodEnd,
                    nextBillingDate: periodEnd,
                    lastPaymentDate: now,
                    lastPaymentAmount: pkg.price,
                    clientPackageId: clientPackage.id,
                  });
                  
                  // NOTA: Pagamentos Stripe NÃO são registrados no caixa físico do operador
                  // Stripe vai direto para a conta bancária, não é dinheiro em espécie
                  // Taxas Stripe aparecem apenas no DRE (relatório financeiro do dono)
                  if (openCashRegister && barbershop) {
                    console.log(`[Stripe Webhook] Primeiro pagamento de assinatura processado (valor: R$${grossAmount.toFixed(2)}) - NÃO registrado no caixa físico`);
                  } else {
                    console.log(`[Stripe Webhook] AVISO: Pagamento Stripe confirmado mas sem caixa aberto para contabilizar. Assinatura: ${subscriptionId}, Valor: R$${grossAmount.toFixed(2)}`);
                  }
                  
                  console.log(`[Stripe Webhook] Subscription ${subscriptionId} activated with Stripe sub ${stripeSubscriptionId}`);
                }
              }
            }
          }
          break;
        }
        
        case 'invoice.paid': {
          const invoice = event.data.object;
          const stripeSubscriptionId = invoice.subscription as string;
          
          if (stripeSubscriptionId && invoice.billing_reason === 'subscription_cycle') {
            const subscription = await storage.getSubscriptionByStripeId(stripeSubscriptionId);
            
            if (subscription) {
              const pkg = await storage.getPackage(subscription.packageId);
              if (pkg) {
                const now = new Date();
                const periodStart = new Date(subscription.currentPeriodEnd);
                const periodEnd = new Date(periodStart);
                
                switch (pkg.recurringInterval) {
                  case "weekly":
                    periodEnd.setDate(periodEnd.getDate() + 7);
                    break;
                  case "biweekly":
                    periodEnd.setDate(periodEnd.getDate() + 14);
                    break;
                  case "monthly":
                  default:
                    periodEnd.setMonth(periodEnd.getMonth() + 1);
                    break;
                }
                
                const expiresAt = new Date(periodEnd);
                expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
                
                // Calculate net amount after Stripe fees
                const barbershop = await storage.getBarbershop(subscription.barbershopId);
                const grossAmount = invoice.amount_paid / 100;
                const feeStripePercent = parseFloat(barbershop?.feeStripePercent || '3.99');
                const feeStripeFixed = parseFloat(barbershop?.feeStripeFixed || '0.39');
                const netAmount = calculateNetAmount(grossAmount, feeStripePercent, feeStripeFixed);
                
                const clientPackage = await storage.createClientPackage({
                  clientId: subscription.clientId,
                  packageId: subscription.packageId,
                  subscriptionId: subscription.id,
                  quantityRemaining: pkg.quantity,
                  quantityOriginal: pkg.quantity,
                  expiresAt,
                  netAmount: netAmount.toString(),
                  paymentMethod: "card",
                });
                
                // Buscar caixa aberto antes de criar o pagamento
                const openCashRegister = await storage.getOpenCashRegister(subscription.barbershopId);
                
                await storage.createSubscriptionPayment({
                  subscriptionId: subscription.id,
                  amount: (invoice.amount_paid / 100).toFixed(2),
                  paymentMethod: "card",
                  status: "paid",
                  stripePaymentIntentId: invoice.payment_intent as string,
                  paidAt: now,
                  periodStart,
                  periodEnd,
                  cashRegisterId: openCashRegister?.id || null,
                  notes: "Renovação automática via Stripe",
                });
                
                await storage.updateSubscription(subscription.id, {
                  status: "active",
                  currentPeriodStart: periodStart,
                  currentPeriodEnd: periodEnd,
                  nextBillingDate: periodEnd,
                  lastPaymentDate: now,
                  lastPaymentAmount: (invoice.amount_paid / 100).toFixed(2),
                  clientPackageId: clientPackage.id,
                });
                
                // Registrar pagamento no caixa com dedução de taxa de cartão
                
                // NOTA: Pagamentos Stripe NÃO são registrados no caixa físico do operador
                // Stripe vai direto para a conta bancária, não é dinheiro em espécie
                // Taxas Stripe aparecem apenas no DRE (relatório financeiro do dono)
                if (barbershop && openCashRegister) {
                  const paymentAmount = invoice.amount_paid / 100;
                  console.log(`[Stripe Webhook] Renovação de assinatura processada (valor: R$${paymentAmount.toFixed(2)}) - NÃO registrado no caixa físico`);
                } else {
                  const paymentAmount = invoice.amount_paid / 100;
                  console.log(`[Stripe Webhook] AVISO: Renovação Stripe confirmada mas sem caixa aberto para contabilizar. Assinatura: ${subscription.id}, Valor: R$${paymentAmount.toFixed(2)}`);
                }
                
                console.log(`[Stripe Webhook] Subscription ${subscription.id} renewed automatically`);
              }
            }
          }
          break;
        }
        
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          const stripeSubscriptionId = invoice.subscription as string;
          
          if (stripeSubscriptionId) {
            const subscription = await storage.getSubscriptionByStripeId(stripeSubscriptionId);
            if (subscription) {
              await storage.updateSubscription(subscription.id, {
                status: "past_due",
              });
              console.log(`[Stripe Webhook] Payment failed for subscription ${subscription.id}, status changed to past_due`);
            }
          }
          break;
        }
        
        case 'customer.subscription.deleted': {
          const stripeSubscription = event.data.object;
          const stripeSubscriptionId = stripeSubscription.id;
          
          const subscription = await storage.getSubscriptionByStripeId(stripeSubscriptionId);
          if (subscription) {
            await storage.updateSubscription(subscription.id, {
              status: "cancelled",
            });
            console.log(`[Stripe Webhook] Subscription ${subscription.id} cancelled`);
          }
          break;
        }
      }
      
      res.json({ received: true });
    } catch (error: any) {
      console.error("[Stripe Webhook] Error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ CLIENT PACKAGES (Legacy endpoint for POS) ============
  
  app.get("/api/clients/:clientId/packages", requireAuth, async (req, res) => {
    // Verify the client belongs to this barbershop
    const client = await storage.getClient(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    // Get all clients for this barbershop and check if requested client belongs to it
    const clients = await storage.getClients(req.session.barbershopId!);
    const clientExists = clients.find(c => c.id === req.params.clientId);
    if (!clientExists) {
      return res.status(403).json({ error: "Client not found in this barbershop" });
    }
    
    const packages = await storage.getActiveClientPackages(req.params.clientId);
    res.json(packages);
  });

  // ============ APPOINTMENTS ============
  
  app.get("/api/appointments", requireAuth, async (req, res) => {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date();
    const end = endDate ? new Date(endDate as string) : new Date();
    
    const appointments = await storage.getAppointments(req.session.barbershopId!, start, end);

    // Enrich appointments with additional services info — single batch query instead of N queries
    const allAppointmentServices = await storage.getAppointmentServicesBatch(appointments.map(a => a.id));
    const servicesByAppointment = new Map<string, typeof allAppointmentServices>();
    for (const svc of allAppointmentServices) {
      if (!servicesByAppointment.has(svc.appointmentId)) servicesByAppointment.set(svc.appointmentId, []);
      servicesByAppointment.get(svc.appointmentId)!.push(svc);
    }
    const enrichedAppointments = appointments.map(apt => {
      const appointmentServices = servicesByAppointment.get(apt.id) ?? [];
      const additionalServices = appointmentServices.filter(as => as.serviceId !== apt.serviceId);
      return {
        ...apt,
        additionalServicesCount: additionalServices.length,
        allServiceIds: appointmentServices.map(as => as.serviceId)
      };
    });

    res.json(enrichedAppointments);
  });

  app.post("/api/appointments", requireAuth, async (req, res) => {
    try {
      // Extract additional service IDs if provided (for multiple services)
      const additionalServiceIds: string[] = req.body.additionalServiceIds || [];
      
      const body = {
        ...req.body,
        barbershopId: req.session.barbershopId,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
      };
      delete body.additionalServiceIds;
      
      const data = insertAppointmentSchema.parse(body);
      const appointment = await storage.createAppointment(data);
      
      // Get all services to add (primary + additional)
      const allServiceIds = [data.serviceId, ...additionalServiceIds];
      const barbershopId = req.session.barbershopId!;
      const services = await storage.getServices(barbershopId);
      
      // Create appointment services entries for all services
      for (const svcId of allServiceIds) {
        const service = services.find(s => s.id === svcId);
        if (service) {
          await storage.createAppointmentService({
            appointmentId: appointment.id,
            serviceId: svcId,
            price: service.price,
            duration: service.duration,
            usedPackage: false,
            clientPackageId: null
          });
        }
      }
      
      // Schedule notifications for the new appointment
      try {
        console.log(`[API-Appointments] Agendamento criado: ${appointment.id}, clientId: ${appointment.clientId}`);
        const client = appointment.clientId ? await storage.getClient(appointment.clientId) : null;
        const barber = await storage.getBarber(appointment.barberId);
        const primaryService = await storage.getService(appointment.serviceId);
        
        console.log(`[API-Appointments] Cliente: ${client?.name || 'N/A'} (${client?.phone || 'SEM TELEFONE'})`);
        console.log(`[API-Appointments] Barbeiro: ${barber?.name || 'N/A'}, Serviço: ${primaryService?.name || 'N/A'}`);
        
        // Build service name for notification (primary + count of additional)
        let serviceName = primaryService?.name || '';
        if (additionalServiceIds.length > 0) {
          serviceName += ` +${additionalServiceIds.length} serviço(s)`;
        }
        
        if (client?.phone && barber && primaryService) {
          console.log(`[API-Appointments] Chamando scheduleAppointmentNotifications...`);
          await scheduleAppointmentNotifications(
            appointment.id,
            barbershopId,
            client.phone,
            client.name,
            barber.name,
            serviceName,
            new Date(appointment.startTime),
            barber.phone || undefined
          );
          console.log(`[API-Appointments] Notificações agendadas com sucesso!`);
        } else {
          console.log(`[API-Appointments] NÃO agendou notificações - falta: phone=${!!client?.phone}, barber=${!!barber}, service=${!!primaryService}`);
        }
      } catch (notifyError) {
        console.error('[Notifications] Erro ao agendar notificações:', notifyError);
      }
      
      res.json(appointment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/appointments/:id", requireAuth, async (req, res) => {
    try {
      const body = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
      };
      const appointment = await storage.updateAppointment(req.params.id, body);

      // Atualizar funil quando agendamento for concluído diretamente
      if (body.status === 'completed' && appointment?.clientId) {
        try {
          await storage.updateClientFunnelData(appointment.clientId, req.session.barbershopId!);
          console.log(`[Funil] Dados do cliente ${appointment.clientId} atualizados após conclusão de agendamento`);
        } catch (funnelError) {
          console.error('[Funil] Erro ao atualizar dados do cliente:', funnelError);
        }
      }

      res.json(appointment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/appointments/:id", requireAuth, async (req, res) => {
    await storage.deleteAppointment(req.params.id);
    res.json({ success: true });
  });

  // Get services for a specific appointment
  app.get("/api/appointments/:id/services", requireAuth, async (req, res) => {
    try {
      const appointmentServices = await storage.getAppointmentServices(req.params.id);
      const barbershopId = req.session.barbershopId!;
      const services = await storage.getServices(barbershopId);
      
      // Enrich with service details
      const enriched = appointmentServices.map(as => {
        const service = services.find(s => s.id === as.serviceId);
        return {
          ...as,
          serviceName: service?.name || 'Serviço',
          servicePrice: service?.price || as.price,
          serviceDuration: service?.duration || as.duration
        };
      });
      
      res.json(enriched);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ COMANDAS ============
  
  app.get("/api/comandas", requireAuth, async (req, res) => {
    const { status } = req.query;
    const barbershopId = req.session.barbershopId!;
    const comandas = await storage.getComandas(barbershopId, status as string);
    
    // Enriquecer comandas com itens e nomes de barbeiros
    const barbers = await storage.getBarbers(barbershopId);
    const services = await storage.getServices(barbershopId);
    const products = await storage.getProducts(barbershopId);
    
    // Buscar todas as comissões para obter o barberId de cada item
    const allCommissions = await storage.getCommissions(barbershopId);
    
    const enrichedComandas = await Promise.all(comandas.map(async (comanda) => {
      const items = await storage.getComandaItems(comanda.id);
      const enrichedItems = items.map(item => {
        let itemName = 'Item';
        if (item.type === 'service' || item.type === 'package_use') {
          const service = services.find(s => s.id === item.serviceId);
          itemName = service?.name || 'Serviço';
        } else if (item.type === 'product') {
          const product = products.find(p => p.id === item.productId);
          itemName = product?.name || 'Produto';
        }
        // Buscar barbeiro pela comissão associada ao item
        const commission = allCommissions.find(c => c.comandaItemId === item.id);
        const barber = commission ? barbers.find(b => b.id === commission.barberId) : null;
        return {
          ...item,
          name: itemName,
          barberId: barber?.id || null,
          barberName: barber?.name || null
        };
      });
      return {
        ...comanda,
        items: enrichedItems
      };
    }));
    
    res.json(enrichedComandas);
  });

  app.get("/api/comandas/client/:clientId/open", requireAuth, async (req, res) => {
    try {
      const { clientId } = req.params;
      const barbershopId = req.session.barbershopId!;
      const openComanda = await storage.getOpenComandaByClient(barbershopId, clientId);
      
      if (openComanda) {
        const items = await storage.getComandaItems(openComanda.id);
        const barbers = await storage.getBarbers(barbershopId);
        const services = await storage.getServices(barbershopId);
        const products = await storage.getProducts(barbershopId);
        const barber = barbers.find(b => b.id === openComanda.barberId);
        
        // Buscar comissões para obter barberId de cada item
        const allCommissions = await storage.getCommissions(barbershopId);
        
        const enrichedItems = items.map(item => {
          let itemName = 'Item';
          if (item.serviceId) {
            const service = services.find(s => s.id === item.serviceId);
            itemName = service?.name || 'Serviço';
          } else if (item.productId) {
            const product = products.find(p => p.id === item.productId);
            itemName = product?.name || 'Produto';
          }
          
          // Buscar barbeiro pela comissão associada ao item
          const commission = allCommissions.find(c => c.comandaItemId === item.id);
          const itemBarber = commission ? barbers.find(b => b.id === commission.barberId) : null;
          
          return { 
            ...item, 
            name: itemName,
            barberId: itemBarber?.id || null,
            barberName: itemBarber?.name || null
          };
        });
        
        res.json({
          ...openComanda,
          barberName: barber?.name || 'Profissional',
          items: enrichedItems
        });
      } else {
        res.json(null);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/comandas", requireAuth, async (req, res) => {
    try {
      const { items, subtotal, discount, ...comandaBody } = req.body;
      const data = insertComandaSchema.parse({ ...comandaBody, barbershopId: req.session.barbershopId });
      
      // FASE 0: Verificar se cliente já tem comanda aberta (não duplicar)
      if (data.clientId) {
        const existingOpenComanda = await storage.getOpenComandaByClient(req.session.barbershopId!, data.clientId);
        if (existingOpenComanda) {
          return res.status(409).json({ 
            error: 'Cliente já possui uma comanda aberta',
            existingComandaId: existingOpenComanda.id
          });
        }
      }
      
      // FASE 1: Validar todos os package_use ANTES de criar qualquer coisa
      if (items && Array.isArray(items)) {
        const packageUseItems = items.filter((i: any) => i.type === 'package_use' && i.clientPackageId);
        if (packageUseItems.length > 0) {
          const allClientPackages = await storage.getAllClientPackages(req.session.barbershopId!);
          const now = new Date();
          
          // Agrupar usos por clientPackageId para verificar total necessário
          const usageByPackage: Record<string, number> = {};
          for (const item of packageUseItems) {
            usageByPackage[item.clientPackageId] = (usageByPackage[item.clientPackageId] || 0) + item.quantity;
          }
          
          // Validar cada pacote antes de criar a comanda
          for (const [clientPackageId, neededQuantity] of Object.entries(usageByPackage)) {
            const cp = allClientPackages.find(p => p.id === clientPackageId);
            
            if (!cp) {
              throw new Error(`Pacote do cliente não encontrado`);
            }
            
            if (new Date(cp.expiresAt) < now) {
              throw new Error(`Pacote expirado`);
            }
            
            if (cp.quantityRemaining < neededQuantity) {
              throw new Error(`Pacote não tem usos suficientes. Disponível: ${cp.quantityRemaining}, Solicitado: ${neededQuantity}`);
            }
          }
        }
      }
      
      // FASE 2: Criar comanda e itens (validações já passaram)
      // Gravar paidAt automaticamente quando comanda já é criada como fechada
      if (data.status === 'closed') {
        (data as any).paidAt = new Date();
      }
      const comanda = await storage.createComanda(data);
      
      if (items && Array.isArray(items)) {
        for (const item of items) {
          // Calcular o total considerando desconto por item
          // Backend recomputa discountAmount a partir de discountType e discountValue para garantir integridade
          const itemGrossTotal = item.unitPrice * item.quantity;
          let validatedDiscountType: string | null = null;
          let validatedDiscountValue: string | null = null;
          let validatedDiscountAmount: number = 0;
          
          if (item.discountType && item.discountValue) {
            const discountValue = parseFloat(item.discountValue);
            if (discountValue > 0) {
              validatedDiscountType = item.discountType;
              validatedDiscountValue = item.discountValue;
              
              if (item.discountType === 'percentage') {
                // Limita a 100%
                const clampedPercentage = Math.min(discountValue, 100);
                validatedDiscountAmount = (itemGrossTotal * clampedPercentage) / 100;
              } else {
                // Valor fixo - limita ao valor do item
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
            total: itemTotal, // Total já com desconto aplicado
            isBarberPurchase: item.isBarberPurchase || false,
            originalPrice: item.originalPrice ? item.originalPrice.toString() : null, // Preço original para compras do barbeiro
            // Campos de desconto por item - valores validados pelo backend
            discountType: validatedDiscountType,
            discountValue: validatedDiscountValue,
            discountAmount: validatedDiscountAmount > 0 ? validatedDiscountAmount.toString() : null
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
          
          const createdItem = await storage.createComandaItem(itemData);
          
          // Criar comissão apenas se tem barbeiro, tem valor de comissão e NÃO é compra do barbeiro
          // IMPORTANTE: NÃO gerar comissão para venda de pacote (package/subscription_sale) - comissão é apenas sobre USO de pacote (package_use)
          if (item.barberId && item.commission > 0 && !item.isBarberPurchase && item.type !== 'package' && item.type !== 'subscription_sale') {
            const finalItemTotal = parseFloat(itemTotal);
            
            // Para package_use, o valor do item na comanda é 0 (cliente não paga)
            // mas a comissão é calculada sobre o valor proporcional do pacote (packageValue)
            // Então NÃO devemos limitar a comissão ao finalItemTotal para package_use
            let validatedCommission: number;
            if (item.type === 'package_use') {
              // Para package_use, usar comissão direta do frontend (baseada no packageValue)
              validatedCommission = item.commission;
            } else {
              // Para outros itens, limitar ao valor do item
              validatedCommission = Math.min(item.commission, finalItemTotal);
            }
            
            await storage.createCommission({
              barbershopId: req.session.barbershopId!,
              barberId: item.barberId,
              comandaItemId: createdItem.id,
              amount: validatedCommission.toString(),
              type: item.type,
              paid: false
            });
          }
          
          // Criar DEDUÇÃO (comissão negativa) para compras do profissional
          if (item.isBarberPurchase && item.barberId && item.originalPrice > 0) {
            const deductionAmount = (parseFloat(item.originalPrice) * item.quantity).toString();
            await storage.createCommission({
              barbershopId: req.session.barbershopId!,
              barberId: item.barberId,
              comandaItemId: createdItem.id,
              amount: `-${deductionAmount}`, // Valor negativo = dedução
              type: 'deduction', // Tipo dedução para identificar
              paid: false
            });
          }

          if (item.type === 'package' && comandaBody.clientId) {
            const packages = await storage.getPackages(req.session.barbershopId!);
            const pkg = packages.find(p => p.id === item.itemId);
            if (pkg) {
              // Calcular valor líquido baseado no método de pagamento da comanda
              const grossAmount = parseFloat(pkg.price);
              let netAmount = grossAmount;
              const paymentMethod = comandaBody.paymentMethod || 'cash';
              
              // Se pagamento for cartão, aplicar taxas da maquininha (não Stripe)
              if (paymentMethod === 'card' || paymentMethod === 'credito') {
                const barbershop = await storage.getBarbershop(req.session.barbershopId!);
                const feePercent = parseFloat(barbershop?.feeCredit || '0');
                netAmount = grossAmount - (grossAmount * feePercent / 100);
              } else if (paymentMethod === 'debito') {
                const barbershop = await storage.getBarbershop(req.session.barbershopId!);
                const feePercent = parseFloat(barbershop?.feeDebit || '0');
                netAmount = grossAmount - (grossAmount * feePercent / 100);
              } else if (paymentMethod === 'pix') {
                const barbershop = await storage.getBarbershop(req.session.barbershopId!);
                const feePercent = parseFloat(barbershop?.feePix || '0');
                netAmount = grossAmount - (grossAmount * feePercent / 100);
              }
              // Para cash, netAmount = grossAmount (sem taxas)
              
              for (let i = 0; i < item.quantity; i++) {
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
                
                await storage.createClientPackage({
                  clientId: comandaBody.clientId,
                  packageId: pkg.id,
                  quantityRemaining: pkg.quantity,
                  quantityOriginal: pkg.quantity,
                  expiresAt,
                  netAmount: netAmount.toFixed(2),
                  paymentMethod,
                });
              }
            }
          }
          
          // Descontar uso do pacote (já validado na fase 1)
          if (item.type === 'package_use' && item.clientPackageId) {
            const clientPackages = await storage.getAllClientPackages(req.session.barbershopId!);
            const cp = clientPackages.find(p => p.id === item.clientPackageId);
            if (cp) {
              if (cp.subscriptionId) {
                const subscription = await storage.getSubscription(cp.subscriptionId);
                if (subscription && subscription.status !== 'active') {
                  throw new Error(`Assinatura expirada para pacote ${item.clientPackageId} - renove para usar os créditos`);
                }
              }
              await storage.updateClientPackageQuantity(cp.id, cp.quantityRemaining - item.quantity);
            }
          }
          
          // Processar venda de assinatura (subscription_sale) - SÓ quando comanda é FECHADA
          if (item.type === 'subscription_sale' && comandaBody.clientId && comandaBody.status === 'closed') {
            const packages = await storage.getPackages(req.session.barbershopId!);
            const pkg = packages.find(p => p.id === item.itemId);
            
            if (pkg && pkg.isRecurring) {
              const now = new Date();
              const paymentMethod = comandaBody.paymentMethod || 'cash';
              
              // Calcular datas do período baseado no intervalo de recorrência
              let periodEnd = new Date(now);
              let nextBilling = new Date(now);
              
              if (pkg.recurringInterval === 'weekly') {
                periodEnd.setDate(periodEnd.getDate() + 7);
                nextBilling.setDate(nextBilling.getDate() + 7);
              } else if (pkg.recurringInterval === 'biweekly') {
                periodEnd.setDate(periodEnd.getDate() + 14);
                nextBilling.setDate(nextBilling.getDate() + 14);
              } else {
                // monthly (padrão)
                periodEnd.setMonth(periodEnd.getMonth() + 1);
                nextBilling.setMonth(nextBilling.getMonth() + 1);
              }
              
              // Calcular valor líquido baseado no método de pagamento
              const grossAmount = parseFloat(pkg.price);
              let netAmount = grossAmount;
              const barbershop = await storage.getBarbershop(req.session.barbershopId!);
              
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
              
              // Criar o clientPackage com os créditos
              const expiresAt = new Date(periodEnd);
              expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
              
              const clientPackage = await storage.createClientPackage({
                clientId: comandaBody.clientId,
                packageId: pkg.id,
                quantityRemaining: pkg.quantity,
                quantityOriginal: pkg.quantity,
                expiresAt,
                netAmount: netAmount.toFixed(2),
                paymentMethod,
              });
              
              // Criar a assinatura ATIVA (já paga via comanda)
              const subscription = await storage.createSubscription({
                barbershopId: req.session.barbershopId!,
                clientId: comandaBody.clientId,
                packageId: pkg.id,
                status: 'active', // Já ativa porque o pagamento foi confirmado na comanda
                paymentMethod,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                nextBillingDate: nextBilling,
                lastPaymentDate: now,
                lastPaymentAmount: grossAmount.toString(),
                clientPackageId: clientPackage.id,
                notes: `Vendido pelo PDV - Comanda #${comanda.id.slice(-6)}`,
              });
              
              // Vincular o clientPackage à assinatura
              await storage.updateClientPackage(clientPackage.id, {
                subscriptionId: subscription.id,
              });
              
              // Atualizar o item da comanda com o ID da assinatura criada
              await storage.updateComandaItem(createdItem.id, {
                subscriptionId: subscription.id,
              });
              
              // Obter caixa aberto para registrar o pagamento
              const openCashRegister = await storage.getOpenCashRegister(req.session.barbershopId!);
              
              // Registrar pagamento da assinatura
              await storage.createSubscriptionPayment({
                subscriptionId: subscription.id,
                comandaId: comanda.id,
                amount: grossAmount.toString(),
                paymentMethod,
                status: 'paid',
                paidAt: now,
                periodStart: now,
                periodEnd: periodEnd,
                receivedByUserId: req.session.userId || null,
                receivedByBarberId: req.session.barberId || null,
                cashRegisterId: openCashRegister?.id || null,
                notes: `Primeiro pagamento via PDV`,
              });
            }
          }
        }
      }
      
      // Se a comanda está fechada e tem um agendamento vinculado, marcar como concluído
      if (comandaBody.status === 'closed' && comandaBody.appointmentId) {
        // Verificar se o agendamento pertence ao mesmo barbershop antes de atualizar
        const appointment = await storage.getAppointment(comandaBody.appointmentId);
        if (appointment && appointment.barbershopId === req.session.barbershopId) {
          await storage.updateAppointment(comandaBody.appointmentId, { status: 'completed' });
        }
      }

      // Atualizar funil do cliente após fechar comanda (POST - comanda criada já fechada)
      if (comandaBody.status === 'closed' && comandaBody.clientId) {
        try {
          await storage.updateClientFunnelData(comandaBody.clientId, req.session.barbershopId!);
          console.log(`[Funil] Dados do cliente ${comandaBody.clientId} atualizados após fechamento de comanda`);
        } catch (funnelError) {
          console.error('[Funil] Erro ao atualizar dados do cliente:', funnelError);
        }
      }
      
      // Baixa de estoque para produtos - apenas quando comanda é fechada
      if (comandaBody.status === 'closed' && items && Array.isArray(items)) {
        for (const item of items) {
          if (item.type === 'product' && item.itemId) {
            const product = await storage.getProduct(item.itemId);
            if (product) {
              const newStock = Math.max(0, product.stock - (item.quantity || 1));
              await storage.updateProduct(item.itemId, { stock: newStock });
            }
          }
        }
      }
      
      // Registrar taxa de pagamento no caixa (cartão/PIX)
      if (comandaBody.status === 'closed' && comandaBody.paymentMethod) {
        const barbershop = await storage.getBarbershop(req.session.barbershopId!);
        let openCashRegister = await storage.getOpenCashRegister(req.session.barbershopId!);
        
        // Se houver caixa aberto no momento do fechamento
        if (barbershop && openCashRegister) {
          let feePercentage = 0;
          let feeLabel = '';
          
          // Mapear métodos de pagamento do frontend para taxas
          // Frontend usa: cash, pix, card (pagamento único)
          if (comandaBody.paymentMethod === 'card' || comandaBody.paymentMethod === 'credito') {
            feePercentage = parseFloat(barbershop.feeCredit || '0');
            feeLabel = 'Cartão';
          } else if (comandaBody.paymentMethod === 'debito') {
            feePercentage = parseFloat(barbershop.feeDebit || '0');
            feeLabel = 'Cartão Débito';
          } else if (comandaBody.paymentMethod === 'pix') {
            feePercentage = parseFloat(barbershop.feePix || '0');
            feeLabel = 'PIX';
          } else if (comandaBody.paymentMethod === 'split' && comandaBody.paymentDetails) {
            // Para pagamento dividido, calcular taxa de cada método
            // Frontend usa paymentDetails.split com métodos: cash, pix, card
            const splitPayments = comandaBody.paymentDetails.split || [];
            for (const payment of splitPayments) {
              let splitFee = 0;
              let splitLabel = '';
              
              // Mapear métodos do frontend para taxas
              if (payment.method === 'card') {
                // Card = crédito (assumindo crédito como padrão para cartão)
                splitFee = parseFloat(barbershop.feeCredit || '0');
                splitLabel = 'Cartão';
              } else if (payment.method === 'pix') {
                splitFee = parseFloat(barbershop.feePix || '0');
                splitLabel = 'PIX';
              }
              // cash não tem taxa
              
            }
            
            // Para split, calcular taxa total ponderada e deduzir das comissões
            const comandaTotal = parseFloat(comandaBody.total || '0');
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
            
            // Deduzir taxa proporcional das comissões (split)
            // IMPORTANTE: Não criar fee_deduction para package_use - taxa já foi descontada na compra do pacote
            if (totalFeeAmount > 0 && comandaTotal > 0) {
              const effectiveFeePercentage = (totalFeeAmount / comandaTotal) * 100;
              const comandaCommissions = await storage.getCommissionsByComanda(comanda.id);
              // Filtrar: apenas comissões positivas E que NÃO são package_use (pacote já teve taxa descontada na compra)
              const positiveCommissions = comandaCommissions.filter(c => 
                parseFloat(c.amount) > 0 && c.type !== 'package_use'
              );
              
              for (const commission of positiveCommissions) {
                const commissionAmount = parseFloat(commission.amount);
                const feeDeduction = (commissionAmount * effectiveFeePercentage) / 100;
                
                if (feeDeduction > 0) {
                  await storage.createCommission({
                    barbershopId: req.session.barbershopId!,
                    barberId: commission.barberId,
                    comandaItemId: commission.comandaItemId,
                    amount: `-${feeDeduction.toFixed(2)}`,
                    type: 'fee_deduction',
                    paid: false
                  });
                }
              }
            }
          }
          
          // Deduzir taxas das comissões dos barbeiros (comissão sobre valor líquido)
          // NOTA: Taxas NÃO são registradas no caixa do operador - são invisíveis para ele
          // Taxas aparecem apenas no DRE (relatório financeiro do dono)
          if (feePercentage > 0 && comandaBody.paymentMethod !== 'split') {
            const comandaTotal = parseFloat(comandaBody.total || '0');
            const feeAmount = (comandaTotal * feePercentage) / 100;
            
            if (feeAmount > 0) {
              // IMPORTANTE: Não criar fee_deduction para package_use - taxa já foi descontada na compra do pacote
              const comandaCommissions = await storage.getCommissionsByComanda(comanda.id);
              // Filtrar: apenas comissões positivas E que NÃO são package_use
              const positiveCommissions = comandaCommissions.filter(c => 
                parseFloat(c.amount) > 0 && c.type !== 'package_use'
              );
              
              for (const commission of positiveCommissions) {
                const commissionAmount = parseFloat(commission.amount);
                const feeDeduction = (commissionAmount * feePercentage) / 100;
                
                if (feeDeduction > 0) {
                  await storage.createCommission({
                    barbershopId: req.session.barbershopId!,
                    barberId: commission.barberId,
                    comandaItemId: commission.comandaItemId,
                    amount: `-${feeDeduction.toFixed(2)}`,
                    type: 'fee_deduction',
                    paid: false
                  });
                }
              }
            }
          }
        }
      }
      
      res.json(comanda);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/comandas/:id", requireAuth, async (req, res) => {
    try {
      // Verificar se está fechando uma comanda que estava aberta
      const existingComanda = await storage.getComanda(req.params.id);
      const isClosing = existingComanda && existingComanda.status !== 'closed' && req.body.status === 'closed';

      // Gravar paidAt quando fechando uma comanda que estava aberta
      const updateData = isClosing ? { ...req.body, paidAt: new Date() } : req.body;
      const comanda = await storage.updateComanda(req.params.id, updateData);
      
      // Marcar agendamento como concluído e atualizar funil - quando comanda é fechada
      if (isClosing) {
        if (comanda?.appointmentId) {
          const appt = await storage.getAppointment(comanda.appointmentId);
          if (appt && appt.barbershopId === req.session.barbershopId) {
            await storage.updateAppointment(comanda.appointmentId, { status: 'completed' });
          }
        }
        if (comanda?.clientId) {
          try {
            await storage.updateClientFunnelData(comanda.clientId, req.session.barbershopId!);
            console.log(`[Funil] Dados do cliente ${comanda.clientId} atualizados após fechamento de comanda`);
          } catch (funnelError) {
            console.error('[Funil] Erro ao atualizar dados do cliente:', funnelError);
          }
        }
      }

      // Baixa de estoque para produtos - apenas quando comanda é fechada
      if (isClosing) {
        const items = await storage.getComandaItems(req.params.id);
        for (const item of items) {
          if (item.productId) {
            const product = await storage.getProduct(item.productId);
            if (product) {
              const newStock = Math.max(0, product.stock - (item.quantity || 1));
              await storage.updateProduct(item.productId, { stock: newStock });
            }
          }
        }
        
      // Registrar taxa de pagamento no caixa (cartão/PIX) ao fechar comanda
      if (comanda && comanda.paymentMethod) {
        const barbershop = await storage.getBarbershop(req.session.barbershopId!);
        let openCashRegister = await storage.getOpenCashRegister(req.session.barbershopId!);
        
        // Se for split ou tiver método de pagamento, e houver caixa aberto
        if (barbershop && openCashRegister) {
            let feePercentage = 0;
            let feeLabel = '';
            
            // Mapear métodos de pagamento do frontend para taxas
            // Frontend usa: cash, pix, card (pagamento único)
            if (comanda.paymentMethod === 'card' || comanda.paymentMethod === 'credito') {
              feePercentage = parseFloat(barbershop.feeCredit || '0');
              feeLabel = 'Cartão';
            } else if (comanda.paymentMethod === 'debito') {
              feePercentage = parseFloat(barbershop.feeDebit || '0');
              feeLabel = 'Cartão Débito';
            } else if (comanda.paymentMethod === 'pix') {
              feePercentage = parseFloat(barbershop.feePix || '0');
              feeLabel = 'PIX';
            } else if (comanda.paymentMethod === 'split' && comanda.paymentDetails) {
              // Para pagamento dividido, calcular taxa de cada método
              // Frontend usa paymentDetails.split com métodos: cash, pix, card
              const paymentDetails = comanda.paymentDetails as any;
              const splitPayments = paymentDetails.split || [];
              for (const payment of splitPayments) {
                let splitFee = 0;
                let splitLabel = '';
                
                // Mapear métodos do frontend para taxas
                if (payment.method === 'card') {
                  splitFee = parseFloat(barbershop.feeCredit || '0');
                  splitLabel = 'Cartão';
                } else if (payment.method === 'pix') {
                  splitFee = parseFloat(barbershop.feePix || '0');
                  splitLabel = 'PIX';
                }
                // cash não tem taxa
                
              }
              
              // Para split, calcular taxa total e deduzir das comissões (PATCH)
              // NOTA: Taxas NÃO são registradas no caixa do operador - são invisíveis para ele
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
              
              // Deduzir taxa proporcional das comissões (split)
              // IMPORTANTE: Não criar fee_deduction para package_use - taxa já foi descontada na compra do pacote
              if (totalFeeAmount > 0 && comandaTotal > 0) {
                const effectiveFeePercentage = (totalFeeAmount / comandaTotal) * 100;
                const comandaCommissions = await storage.getCommissionsByComanda(comanda.id);
                // Filtrar: apenas comissões positivas E que NÃO são package_use
                const positiveCommissions = comandaCommissions.filter(c => 
                  parseFloat(c.amount) > 0 && c.type !== 'package_use'
                );
                
                for (const commission of positiveCommissions) {
                  const commissionAmount = parseFloat(commission.amount);
                  const feeDeduction = (commissionAmount * effectiveFeePercentage) / 100;
                  
                  if (feeDeduction > 0) {
                    await storage.createCommission({
                      barbershopId: req.session.barbershopId!,
                      barberId: commission.barberId,
                      comandaItemId: commission.comandaItemId,
                      amount: `-${feeDeduction.toFixed(2)}`,
                      type: 'fee_deduction',
                      paid: false
                    });
                  }
                }
              }
            }
            
            // Deduzir taxas das comissões dos barbeiros (comissão sobre valor líquido)
            // NOTA: Taxas NÃO são registradas no caixa do operador - são invisíveis para ele
            // Taxas aparecem apenas no DRE (relatório financeiro do dono)
            if (feePercentage > 0 && comanda.paymentMethod !== 'split') {
              const comandaTotal = parseFloat(comanda.total || '0');
              const feeAmount = (comandaTotal * feePercentage) / 100;
              
              if (feeAmount > 0) {
                // IMPORTANTE: Não criar fee_deduction para package_use - taxa já foi descontada na compra do pacote
                const comandaCommissions = await storage.getCommissionsByComanda(comanda.id);
                // Filtrar: apenas comissões positivas E que NÃO são package_use
                const positiveCommissions = comandaCommissions.filter(c => 
                  parseFloat(c.amount) > 0 && c.type !== 'package_use'
                );
                
                for (const commission of positiveCommissions) {
                  const commissionAmount = parseFloat(commission.amount);
                  const feeDeduction = (commissionAmount * feePercentage) / 100;
                  
                  if (feeDeduction > 0) {
                    await storage.createCommission({
                      barbershopId: req.session.barbershopId!,
                      barberId: commission.barberId,
                      comandaItemId: commission.comandaItemId,
                      amount: `-${feeDeduction.toFixed(2)}`,
                      type: 'fee_deduction',
                      paid: false
                    });
                  }
                }
              }
            }
          }
        }
      }
      
      res.json(comanda);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/comandas/:id/items", requireAuth, async (req, res) => {
    try {
      const items = await storage.getComandaItems(req.params.id);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/comandas/:id/items", requireAuth, async (req, res) => {
    try {
      // Verificar se a comanda está aberta antes de adicionar itens
      const comanda = await storage.getComanda(req.params.id);
      if (!comanda) {
        return res.status(404).json({ error: "Comanda não encontrada" });
      }
      if (comanda.status !== 'open') {
        return res.status(400).json({ error: "Não é possível adicionar itens em uma comanda fechada" });
      }
      
      const data = insertComandaItemSchema.parse({ ...req.body, comandaId: req.params.id });
      const createdItem = await storage.createComandaItem(data);
      
      // Criar comissão se tem barbeiro e valor de comissão (vem do request)
      const { barberId, commission, isBarberPurchase, originalPrice, quantity = 1 } = req.body;
      
      if (barberId && commission > 0 && !isBarberPurchase) {
        await storage.createCommission({
          barbershopId: req.session.barbershopId!,
          barberId: barberId,
          comandaItemId: createdItem.id,
          amount: commission.toString(),
          type: req.body.type || 'service',
          paid: false
        });
      }
      
      // Criar DEDUÇÃO (comissão negativa) para compras do profissional
      if (isBarberPurchase && barberId && originalPrice > 0) {
        const deductionAmount = (parseFloat(originalPrice) * quantity).toString();
        await storage.createCommission({
          barbershopId: req.session.barbershopId!,
          barberId: barberId,
          comandaItemId: createdItem.id,
          amount: `-${deductionAmount}`,
          type: 'deduction',
          paid: false
        });
      }
      
      // Update comanda total
      const items = await storage.getComandaItems(req.params.id);
      const total = items.reduce((sum, i) => sum + parseFloat(i.total as any), 0);
      await storage.updateComanda(req.params.id, { total: total.toString() });
      
      res.json(createdItem);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/comandas/:comandaId/items/:itemId", requireAuth, async (req, res) => {
    try {
      // Verificar se a comanda está aberta antes de remover itens
      const comanda = await storage.getComanda(req.params.comandaId);
      if (!comanda) {
        return res.status(404).json({ error: "Comanda não encontrada" });
      }
      if (comanda.status !== 'open') {
        return res.status(400).json({ error: "Não é possível remover itens de uma comanda fechada" });
      }
      
      await storage.deleteComandaItem(req.params.itemId);
      
      // Update comanda total
      const items = await storage.getComandaItems(req.params.comandaId);
      const total = items.reduce((sum, i) => sum + parseFloat(i.total as any), 0);
      await storage.updateComanda(req.params.comandaId, { total: total.toString() });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ REFUND (ESTORNO) ============

  app.post("/api/comandas/:id/refund", requireAuth, async (req, res) => {
    try {
      const comanda = await storage.getComanda(req.params.id);
      if (!comanda) {
        return res.status(404).json({ error: "Comanda não encontrada" });
      }
      if (comanda.status !== 'closed') {
        return res.status(400).json({ error: "Apenas comandas fechadas podem ser estornadas" });
      }

      const items = await storage.getComandaItems(req.params.id);
      const barbershopId = req.session.barbershopId!;
      const commissions = await storage.getCommissionsByComanda(comanda.id);
      const services = await storage.getServices(barbershopId);
      const products = await storage.getProducts(barbershopId);
      const client = comanda.clientId ? await storage.getClient(comanda.clientId) : null;

      const barberIds = new Set<string>();
      for (const c of commissions) {
        barberIds.add(c.barberId);
      }
      if (comanda.barberId) {
        barberIds.add(comanda.barberId);
      }

      const itemsDescription = items.map(i => {
        let name = i.type;
        if (i.serviceId) {
          const svc = services.find(s => s.id === i.serviceId);
          name = svc?.name || 'Serviço';
        } else if (i.productId) {
          const prod = products.find(p => p.id === i.productId);
          name = prod?.name || 'Produto';
        }
        const qty = i.quantity || 1;
        return `${name}${qty > 1 ? ` x${qty}` : ''}`;
      }).join(', ');

      await storage.refundComandaTransaction(req.params.id, comanda, items, commissions, barbershopId);

      for (const barberId of Array.from(barberIds)) {
        await storage.createRefundNotification({
          barbershopId,
          barberId,
          clientName: client?.name || 'Cliente não identificado',
          amount: comanda.total || '0',
          itemsDescription,
        });
      }

      res.json({ success: true, message: 'Comanda estornada com sucesso' });
    } catch (error: any) {
      console.error("[Refund] Error refunding comanda:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ REFUND NOTIFICATIONS ============

  app.get("/api/refund-notifications", async (req, res) => {
    try {
      if (!req.session.barberId || !req.session.barbershopId) {
        return res.json([]);
      }
      const notifications = await storage.getRefundNotifications(req.session.barbershopId, req.session.barberId);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/refund-notifications/:id/read", async (req, res) => {
    try {
      await storage.markRefundNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ CASH REGISTER ============
  
  app.get("/api/cash-register/current", requireAuth, async (req, res) => {
    try {
      const cashRegister = await storage.getOpenCashRegister(req.session.barbershopId!);
      res.json(cashRegister || null);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cash-register/history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getCashRegisterHistory(req.session.barbershopId!);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cash-register/:id/sales", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const register = await storage.getCashRegister(req.params.id);
      if (!register || register.barbershopId !== barbershopId) {
        return res.status(404).json({ error: "Caixa não encontrado" });
      }

      const comandas = await storage.getComndasForCashRegisterPeriod(
        barbershopId,
        new Date(register.openedAt),
        register.closedAt ? new Date(register.closedAt) : null
      );

      let cash = 0, pix = 0, card = 0, other = 0;
      let count = 0;

      for (const c of comandas) {
        const total = parseFloat(c.total || "0");
        if (total <= 0) continue;
        count++;

        if (c.paymentMethod === "split" && (c.paymentDetails as any)?.split) {
          for (const p of (c.paymentDetails as any).split) {
            const amt = parseFloat(p.amount) || 0;
            if (p.method === "cash") cash += amt;
            else if (p.method === "pix") pix += amt;
            else if (p.method === "card") card += amt;
            else other += amt;
          }
        } else if (c.paymentMethod === "cash") {
          cash += total;
        } else if (c.paymentMethod === "pix") {
          pix += total;
        } else if (c.paymentMethod === "card" || c.paymentMethod === "credito" || c.paymentMethod === "debito") {
          card += total;
        } else {
          other += total;
        }
      }

      res.json({
        totalSales: cash + pix + card + other,
        cash,
        pix,
        card,
        other,
        count,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cash-register", requireAuth, async (req, res) => {
    try {
      const existingOpen = await storage.getOpenCashRegister(req.session.barbershopId!);
      if (existingOpen) {
        return res.status(400).json({ error: "Já existe um caixa aberto. Feche o caixa atual antes de abrir um novo." });
      }
      const data = insertCashRegisterSchema.parse({ 
        ...req.body, 
        barbershopId: req.session.barbershopId,
        userId: req.session.userId 
      });
      const cashRegister = await storage.createCashRegister(data);
      res.json(cashRegister);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/cash-register/open-comandas-check", requireAuth, async (req, res) => {
    try {
      const comandas = await storage.getComandas(req.session.barbershopId!, "open");
      const today = new Date();
      const todayComandas = comandas.filter((c: any) => {
        const created = new Date(c.createdAt);
        return created.toDateString() === today.toDateString();
      });
      const oldComandas = comandas.filter((c: any) => {
        const created = new Date(c.createdAt);
        return created.toDateString() !== today.toDateString();
      });
      res.json({
        hasOpenComandas: todayComandas.length > 0,
        openComandas: todayComandas,
        hasOldComandas: oldComandas.length > 0,
        oldComandas: oldComandas,
        totalOpen: comandas.length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/cash-register/:id", requireAuth, async (req, res) => {
    try {
      const updateData = { ...req.body };
      const forceClose = updateData.forceClose || false;
      delete updateData.forceClose;

      if (updateData.status === 'closed') {
        const allOpenComandas = await storage.getComandas(req.session.barbershopId!, "open");
        const today = new Date();

        const register = await storage.getCashRegister(req.params.id);
        const isOldRegister = register && new Date(register.openedAt).toDateString() !== today.toDateString();

        if (isOldRegister) {
          // Old register - close without checking comandas at all
        } else {
          const todayComandas = allOpenComandas.filter((c: any) => {
            const created = new Date(c.createdAt);
            return created.toDateString() === today.toDateString();
          });

          if (todayComandas.length > 0 && !forceClose) {
            return res.status(400).json({ 
              error: `Existem ${todayComandas.length} comanda(s) aberta(s) de hoje. Você deseja fechar o caixa mesmo assim?`,
              openComandas: todayComandas,
              canForce: true
            });
          }
        }
      }
      if (updateData.closedAt && typeof updateData.closedAt === 'string') {
        updateData.closedAt = new Date(updateData.closedAt);
      }
      const cashRegister = await storage.updateCashRegister(req.params.id, updateData);

      // Enviar aviso de fechamento de caixa para o admin via WhatsApp (se habilitado)
      if (updateData.status === 'closed' && cashRegister) {
        try {
          const notifSettings = await storage.getNotificationSettings(req.session.barbershopId!);
          if (notifSettings?.cashClosingEnabled) {
            const barbershop = await storage.getBarbershop(req.session.barbershopId!);
            // Usar número configurado nas notificações; fallback para telefone do dono
            const adminPhone = notifSettings.cashClosingPhone || (() => {
              // fallback assíncrono não funciona aqui, mas cashClosingPhone deve sempre ser preenchido
              return null;
            })();

            if (adminPhone) {
              // Buscar comandas do período do caixa para breakdown por forma de pagamento
              const allComandas = await storage.getComandas(req.session.barbershopId!, 'closed');
              const registerOpenedAt = cashRegister.openedAt ? new Date(cashRegister.openedAt) : new Date(0);
              const registerClosedAt = new Date();

              const periodComandas = allComandas.filter((c: any) => {
                if (!c.paidAt) return false;
                const paid = new Date(c.paidAt);
                return paid >= registerOpenedAt && paid <= registerClosedAt;
              });

              let totalDinheiro = 0;
              let totalPix = 0;
              let totalCredito = 0;
              let totalDebito = 0;
              let totalOutros = 0;

              for (const c of periodComandas) {
                const val = parseFloat(c.total || '0');
                const pm = c.paymentMethod || '';
                if (pm === 'dinheiro') totalDinheiro += val;
                else if (pm === 'pix') totalPix += val;
                else if (pm === 'credito') totalCredito += val;
                else if (pm === 'debito') totalDebito += val;
                else if (pm === 'split' && c.paymentDetails) {
                  const details = c.paymentDetails as any;
                  totalDinheiro += parseFloat(details.dinheiro || '0');
                  totalPix += parseFloat(details.pix || '0');
                  totalCredito += parseFloat(details.credito || '0');
                  totalDebito += parseFloat(details.debito || '0');
                } else {
                  totalOutros += val;
                }
              }

              const totalGeral = parseFloat(cashRegister.closingAmount || '0');
              const esperado = parseFloat(cashRegister.expectedAmount || '0');
              const diferenca = parseFloat(cashRegister.difference || '0');
              const now = new Date();
              const dateStr = now.toLocaleDateString('pt-BR');
              const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

              let lines = [
                `*Fechamento de Caixa* 🔐`,
                `*${barbershop?.name || 'Barbearia'}* — ${dateStr} às ${timeStr}`,
                ``,
                `*Resumo por forma de pagamento:*`,
              ];
              if (totalDinheiro > 0)  lines.push(`💵 Dinheiro: R$ ${totalDinheiro.toFixed(2)}`);
              if (totalPix > 0)       lines.push(`📲 PIX: R$ ${totalPix.toFixed(2)}`);
              if (totalCredito > 0)   lines.push(`💳 Crédito: R$ ${totalCredito.toFixed(2)}`);
              if (totalDebito > 0)    lines.push(`💳 Débito: R$ ${totalDebito.toFixed(2)}`);
              if (totalOutros > 0)    lines.push(`📦 Outros: R$ ${totalOutros.toFixed(2)}`);
              lines.push(``);
              lines.push(`*Comandas fechadas:* ${periodComandas.length}`);
              lines.push(`*Valor contado:* R$ ${totalGeral.toFixed(2)}`);
              lines.push(`*Valor esperado:* R$ ${esperado.toFixed(2)}`);
              if (Math.abs(diferenca) > 0.01) {
                const sinal = diferenca >= 0 ? '+' : '';
                lines.push(`*Diferença:* ${sinal}R$ ${diferenca.toFixed(2)} ${diferenca >= 0 ? '✅' : '⚠️'}`);
              } else {
                lines.push(`*Diferença:* R$ 0,00 ✅`);
              }

              const message = lines.join('\n');
              const provider = getProvider(notifSettings.provider);
              await provider.send({ to: adminPhone, message });
              console.log(`[CashClosing] Aviso de fechamento enviado para ${adminPhone}`);
            }
          }
        } catch (notifyError) {
          console.error('[CashClosing] Erro ao enviar aviso de fechamento:', notifyError);
          // Não bloquear o fechamento por falha no aviso
        }
      }

      res.json(cashRegister);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/cash-register/:id/transactions", requireAuth, async (req, res) => {
    try {
      const transactions = await storage.getCashTransactions(req.params.id);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cash-register/:id/transactions", requireAuth, async (req, res) => {
    try {
      let { type, amount, description } = req.body;
      
      // Validação para estornos: garantir que o valor é armazenado como negativo para auditoria
      // Estornos representam saídas do caixa, então devem ser negativos
      if (type === 'refund') {
        const absAmount = Math.abs(parseFloat(amount));
        amount = (-absAmount).toFixed(2);
      }
      
      const data = insertCashTransactionSchema.parse({ 
        type, 
        amount, 
        description, 
        cashRegisterId: req.params.id 
      });
      const transaction = await storage.createCashTransaction(data);
      res.json(transaction);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ COMMISSIONS ============
  
  app.get("/api/commissions", requireAuth, async (req, res) => {
    try {
      const { barberId, startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate as string) : undefined;
      // Ajustar endDate para incluir todo o dia (23:59:59.999)
      let end: Date | undefined;
      if (endDate) {
        end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
      }

      const commissions = await storage.getCommissionsWithDetails(
        req.session.barbershopId!,
        barberId as string,
        start,
        end
      );
      res.json(commissions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/commissions/:id/pay", requireAuth, async (req, res) => {
    try {
      await storage.markCommissionPaid(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Fechamento de comissões em lote (com integração ao caixa)
  app.post("/api/commissions/close", requireAuth, async (req, res) => {
    try {
      const { barberId, startDate, endDate, commissionIds, totalCommissions, totalDeductions, netAmount } = req.body;
      const barbershopId = req.session.barbershopId!;

      if (!barberId || !startDate || !endDate || !commissionIds || commissionIds.length === 0) {
        return res.status(400).json({ error: "Dados incompletos para fechamento" });
      }

      // Verificar se tem caixa aberto
      const openCashRegister = await storage.getOpenCashRegister(barbershopId);
      let cashTransactionId: string | null = null;

      if (openCashRegister && netAmount > 0) {
        // Criar transação de sangria (saída de caixa) para o pagamento
        const transaction = await storage.createCashTransaction({
          cashRegisterId: openCashRegister.id,
          type: 'withdrawal',
          amount: netAmount.toString(),
          description: `Pagamento de comissões - Período: ${new Date(startDate).toLocaleDateString('pt-BR')} a ${new Date(endDate).toLocaleDateString('pt-BR')}`
        });
        cashTransactionId = transaction.id;
      }

      // Criar registro de fechamento primeiro para obter o ID
      const payment = await storage.createCommissionPayment({
        barbershopId,
        barberId,
        periodStart: new Date(startDate),
        periodEnd: new Date(endDate),
        totalCommissions: totalCommissions.toString(),
        totalDeductions: totalDeductions.toString(),
        netAmount: netAmount.toString(),
        cashTransactionId
      });

      // Marcar todas as comissões como pagas com o paymentId (com scoping por barbershop)
      await storage.markCommissionsPaidBatch(commissionIds, barbershopId, payment.id);

      res.json({ 
        success: true, 
        payment,
        cashTransaction: cashTransactionId ? { id: cashTransactionId } : null
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Histórico de fechamentos de comissão
  app.get("/api/commission-payments", requireAuth, async (req, res) => {
    const { barberId } = req.query;
    const payments = await storage.getCommissionPayments(
      req.session.barbershopId!,
      barberId as string
    );
    res.json(payments);
  });

  // Barber Purchases (compras do barbeiro que serão descontadas da comissão)
  app.get("/api/barber-purchases", requireAuth, async (req, res) => {
    const { barberId, startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    
    const purchases = await storage.getBarberPurchases(
      req.session.barbershopId!, 
      barberId as string, 
      start, 
      end
    );
    res.json(purchases);
  });

  // ============ DASHBOARD ============

  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get today's closed comandas for revenue
      const allComandas = await storage.getComandas(barbershopId, 'closed');
      const todayComandas = allComandas.filter(c => {
        const comandaDate = new Date(c.createdAt);
        return comandaDate >= today && comandaDate < tomorrow;
      });

      const todayRevenue = todayComandas.reduce((sum, c) => sum + parseFloat(c.total || '0'), 0);

      // Get today's appointments
      const allAppointments = await storage.getAppointments(barbershopId, today, tomorrow);
      const todayAppointments = allAppointments.length;

      // Get active clients count
      const clients = await storage.getClients(barbershopId);
      const activeClients = clients.length;

      // Get pending commissions
      const commissions = await storage.getCommissions(barbershopId);
      const pendingCommissions = commissions
        .filter(c => !c.paid)
        .reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);

      // Get upcoming appointments for the day
      const upcomingAppointments = allAppointments
        .filter(a => a.status !== 'cancelled')
        .slice(0, 5);

      // Get barbers and services for appointment enrichment
      const barbers = await storage.getBarbers(barbershopId);
      const services = await storage.getServices(barbershopId);

      const enrichedAppointments = upcomingAppointments.map(apt => {
        const startTime = new Date(apt.startTime);
        const hours = startTime.getHours().toString().padStart(2, '0');
        const minutes = startTime.getMinutes().toString().padStart(2, '0');
        return {
          ...apt,
          time: `${hours}:${minutes}`,
          barberName: barbers.find(b => b.id === apt.barberId)?.name || 'Desconhecido',
          serviceName: services.find(s => s.id === apt.serviceId)?.name || 'Serviço',
          clientName: clients.find(c => c.id === apt.clientId)?.name || 'Cliente'
        };
      });

      res.json({
        todayRevenue,
        todayAppointments,
        activeClients,
        pendingCommissions,
        upcomingAppointments: enrichedAppointments
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ PACKAGE ALERTS ============

  app.get("/api/packages/alerts", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      
      // Get all client packages
      const clientPackages = await storage.getAllClientPackages(barbershopId);
      const clients = await storage.getClients(barbershopId);
      const packages = await storage.getPackages(barbershopId);

      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const alerts: any[] = [];

      clientPackages.forEach(cp => {
        const client = clients.find(c => c.id === cp.clientId);
        const pkg = packages.find(p => p.id === cp.packageId);
        
        if (!client || !pkg) return;

        const usesRemaining = cp.quantityRemaining;
        const expiresAt = cp.expiresAt ? new Date(cp.expiresAt) : null;

        // Alert if package is about to expire
        if (expiresAt && expiresAt <= thirtyDaysFromNow && expiresAt > now && usesRemaining > 0) {
          alerts.push({
            type: 'expiring',
            clientId: cp.clientId,
            clientName: client.name,
            packageName: pkg.name,
            usesRemaining,
            expiresAt: cp.expiresAt,
            daysLeft: Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          });
        }

        // Alert if package is expired but had remaining uses
        if (expiresAt && expiresAt <= now && usesRemaining > 0) {
          alerts.push({
            type: 'expired',
            clientId: cp.clientId,
            clientName: client.name,
            packageName: pkg.name,
            usesRemaining,
            expiresAt: cp.expiresAt,
            daysLeft: 0
          });
        }

        // Alert if package is almost used up (1-2 uses left)
        if (usesRemaining > 0 && usesRemaining <= 2 && (!expiresAt || expiresAt > now)) {
          alerts.push({
            type: 'low_uses',
            clientId: cp.clientId,
            clientName: client.name,
            packageName: pkg.name,
            usesRemaining,
            expiresAt: cp.expiresAt,
            daysLeft: expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
          });
        }
      });

      // Sort alerts by urgency
      alerts.sort((a, b) => {
        if (a.type === 'expired') return -1;
        if (b.type === 'expired') return 1;
        if (a.type === 'expiring' && b.type !== 'expiring') return -1;
        if (b.type === 'expiring' && a.type !== 'expiring') return 1;
        return (a.daysLeft || 999) - (b.daysLeft || 999);
      });

      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ CLIENT PACKAGES ============

  app.get("/api/client-packages", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const { clientId } = req.query;

      const clients = await storage.getClients(barbershopId);
      const packages = await storage.getPackages(barbershopId);
      
      let clientPackages;
      if (clientId) {
        // Verify that the client belongs to this barbershop
        const clientExists = clients.find(c => c.id === clientId);
        if (!clientExists) {
          return res.status(403).json({ error: "Client not found in this barbershop" });
        }
        clientPackages = await storage.getClientPackages(clientId as string);
      } else {
        clientPackages = await storage.getAllClientPackages(barbershopId);
      }

      const enriched = clientPackages.map(cp => {
        const client = clients.find(c => c.id === cp.clientId);
        const pkg = packages.find(p => p.id === cp.packageId);
        return {
          ...cp,
          clientName: client?.name || 'Desconhecido',
          packageName: pkg?.name || 'Pacote',
          usesRemaining: cp.quantityRemaining
        };
      });

      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/client-packages", requireAuth, async (req, res) => {
    try {
      const { clientId, packageId } = req.body;
      
      // Verify client belongs to barbershop
      const clients = await storage.getClients(req.session.barbershopId!);
      const client = clients.find(c => c.id === clientId);
      if (!client) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      
      // Get package details
      const packages = await storage.getPackages(req.session.barbershopId!);
      const pkg = packages.find(p => p.id === packageId);
      if (!pkg) {
        return res.status(404).json({ error: "Pacote não encontrado" });
      }
      
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + pkg.validityDays);
      
      // Criação manual - assumir pagamento em dinheiro (sem taxas)
      const clientPackage = await storage.createClientPackage({
        clientId,
        packageId,
        quantityRemaining: pkg.quantity,
        quantityOriginal: pkg.quantity,
        expiresAt,
        netAmount: pkg.price, // Sem desconto de taxas
        paymentMethod: "cash",
      });
      
      res.json(clientPackage);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/client-packages/:id/use", requireAuth, async (req, res) => {
    try {
      const clientPackages = await storage.getAllClientPackages(req.session.barbershopId!);
      const cp = clientPackages.find(p => p.id === req.params.id);
      
      if (!cp) {
        return res.status(404).json({ error: "Pacote do cliente não encontrado" });
      }
      
      if (cp.quantityRemaining <= 0) {
        return res.status(400).json({ error: "Pacote sem usos restantes" });
      }
      
      const now = new Date();
      if (new Date(cp.expiresAt) < now) {
        return res.status(400).json({ error: "Pacote expirado" });
      }
      
      if (cp.subscriptionId) {
        const subscription = await storage.getSubscription(cp.subscriptionId);
        if (subscription && subscription.status !== 'active') {
          return res.status(400).json({ 
            error: "Assinatura expirada - renove para continuar usando os créditos" 
          });
        }
      }
      
      await storage.updateClientPackageQuantity(cp.id, cp.quantityRemaining - 1);
      
      res.json({ success: true, remainingUses: cp.quantityRemaining - 1 });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ PUBLIC BOOKING ROUTES ============
  
  // Get barbershop info for public booking
  app.get("/api/public/:barbershopId/info", async (req, res) => {
    try {
      const barbershop = await storage.getBarbershop(req.params.barbershopId);
      if (!barbershop) {
        return res.status(404).json({ error: "Barbearia não encontrada" });
      }
      res.json({ 
        id: barbershop.id, 
        name: barbershop.name,
        phone: barbershop.phone,
        address: barbershop.address,
        logo: barbershop.logo,
        workingHours: barbershop.workingHours,
        bookingIntervalMinutes: barbershop.bookingIntervalMinutes,
        bookingAdvanceHours: barbershop.bookingAdvanceHours,
        bookingMaxDaysAhead: barbershop.bookingMaxDaysAhead
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get barbers for public booking
  app.get("/api/public/:barbershopId/barbers", async (req, res) => {
    try {
      const barbers = await storage.getBarbers(req.params.barbershopId);
      const activeBarbers = barbers.filter(b => b.active);
      res.json(activeBarbers.map(b => ({
        id: b.id,
        name: b.name,
        avatar: b.avatar,
        role: b.role,
        lunchStart: b.lunchStart,
        lunchEnd: b.lunchEnd,
        breakSchedule: b.breakSchedule
      })));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Auto-assign barber: returns first available barber + slot for given service
  app.get("/api/public/:barbershopId/auto-assign-barber", async (req, res) => {
    try {
      const { barbershopId } = req.params;
      const { serviceId } = req.query as { serviceId?: string };

      if (!serviceId) {
        return res.status(400).json({ error: "serviceId obrigatório" });
      }

      const barbershop = await storage.getBarbershop(barbershopId);
      if (!barbershop) {
        return res.status(404).json({ error: "Barbearia não encontrada" });
      }

      const service = await storage.getService(serviceId);
      if (!service) {
        return res.status(404).json({ error: "Serviço não encontrado" });
      }

      const allBarbers = await storage.getBarbers(barbershopId);
      // Filter: active + allowAutoAssign + offers this service (if barber has services configured)
      const eligibleBarbersRaw = allBarbers.filter(b => b.active && (b as any).allowAutoAssign !== false);
      const eligibleBarbers: typeof eligibleBarbersRaw = [];
      for (const b of eligibleBarbersRaw) {
        const bs = await storage.getBarberServices(b.id);
        // If no services configured, barber is eligible for all services (backwards compat)
        if (bs.length === 0 || bs.some(x => x.serviceId === serviceId)) {
          eligibleBarbers.push(b);
        }
      }

      if (eligibleBarbers.length === 0) {
        return res.status(200).json({ error: "Nenhum profissional disponível para agendamento automático" });
      }

      const minAdvanceMinutes = Math.round((barbershop.bookingAdvanceHours || 2) * 60);
      const maxDaysAhead = barbershop.bookingMaxDaysAhead || 30;

      const { summaries } = await getAvailabilitySummaryForBarbers({
        barbershopId,
        barbers: eligibleBarbers,
        serviceDuration: service.duration,
        minAdvanceMinutes,
        maxDaysAhead,
      });

      const withSlots = summaries.filter(s => s.firstSlotTime !== null);

      if (withSlots.length === 0) {
        return res.status(200).json({ error: "Nenhum profissional disponível no momento" });
      }

      // Sort: earliest date → earliest time → fewest upcoming appointments
      const appointmentCounts: Record<string, number> = {};
      const now = new Date();
      const farFuture = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const allAppts = await storage.getAppointments(barbershopId, now, farFuture);
      for (const s of withSlots) {
        appointmentCounts[s.barberId] = allAppts.filter(a =>
          a.barberId === s.barberId &&
          (a.status === 'scheduled' || a.status === 'confirmed')
        ).length;
      }

      withSlots.sort((a, b) => {
        if (a.firstSlotDate !== b.firstSlotDate) return a.firstSlotDate < b.firstSlotDate ? -1 : 1;
        if (a.firstSlotTime !== b.firstSlotTime) return (a.firstSlotTime || '') < (b.firstSlotTime || '') ? -1 : 1;
        return (appointmentCounts[a.barberId] || 0) - (appointmentCounts[b.barberId] || 0);
      });

      const best = withSlots[0];
      const barber = eligibleBarbers.find(b => b.id === best.barberId)!;

      res.json({
        barberId: barber.id,
        barberName: barber.name,
        barberAvatar: barber.avatar,
        barberRole: barber.role,
        barberLunchStart: barber.lunchStart,
        barberLunchEnd: barber.lunchEnd,
        barberBreakSchedule: barber.breakSchedule,
        firstSlotDate: best.firstSlotDate,
        firstSlotTime: best.firstSlotTime,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Available slots across all eligible barbers for a given service + date (pick-slot mode)
  app.get("/api/public/:barbershopId/available-slots", async (req, res) => {
    try {
      const { barbershopId } = req.params;
      const { serviceId, date } = req.query as { serviceId?: string; date?: string };

      if (!serviceId || !date) {
        return res.status(400).json({ error: "serviceId e date são obrigatórios" });
      }

      const barbershop = await storage.getBarbershop(barbershopId);
      if (!barbershop) {
        return res.status(404).json({ error: "Barbearia não encontrada" });
      }

      const service = await storage.getService(serviceId);
      if (!service) {
        return res.status(404).json({ error: "Serviço não encontrado" });
      }

      const allBarbers = await storage.getBarbers(barbershopId);
      const eligibleBarbersRaw = allBarbers.filter(b => b.active && (b as any).allowAutoAssign !== false);
      const eligibleBarbers: typeof eligibleBarbersRaw = [];
      for (const b of eligibleBarbersRaw) {
        const bs = await storage.getBarberServices(b.id);
        if (bs.length === 0 || bs.some(x => x.serviceId === serviceId)) {
          eligibleBarbers.push(b);
        }
      }

      if (eligibleBarbers.length === 0) {
        return res.status(200).json({ slots: [] });
      }

      // Union of all slots available from any barber on this date
      const slotSet = new Set<string>();
      await Promise.all(
        eligibleBarbers.map(async (barber) => {
          const slots = await checkBarberAvailabilityWithDuration(barbershopId, barber.id, date, service.duration);
          slots.forEach(s => slotSet.add(s));
        })
      );

      const slots = Array.from(slotSet).sort();
      res.json({ slots });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Auto-assign barber for a specific date + time slot (pick-slot mode)
  app.get("/api/public/:barbershopId/auto-assign-barber-for-slot", async (req, res) => {
    try {
      const { barbershopId } = req.params;
      const { serviceId, date, time } = req.query as { serviceId?: string; date?: string; time?: string };

      if (!serviceId || !date || !time) {
        return res.status(400).json({ error: "serviceId, date e time são obrigatórios" });
      }

      const barbershop = await storage.getBarbershop(barbershopId);
      if (!barbershop) {
        return res.status(404).json({ error: "Barbearia não encontrada" });
      }

      const service = await storage.getService(serviceId);
      if (!service) {
        return res.status(404).json({ error: "Serviço não encontrado" });
      }

      const allBarbers = await storage.getBarbers(barbershopId);
      const eligibleBarbersRaw = allBarbers.filter(b => b.active && (b as any).allowAutoAssign !== false);
      const eligibleBarbers: typeof eligibleBarbersRaw = [];
      for (const b of eligibleBarbersRaw) {
        const bs = await storage.getBarberServices(b.id);
        if (bs.length === 0 || bs.some(x => x.serviceId === serviceId)) {
          eligibleBarbers.push(b);
        }
      }

      if (eligibleBarbers.length === 0) {
        return res.status(200).json({ error: "Nenhum profissional disponível para agendamento automático" });
      }

      // Check which barbers are available at the requested date + time
      const availabilityResults = await Promise.all(
        eligibleBarbers.map(async (barber) => {
          const slots = await checkBarberAvailabilityWithDuration(barbershopId, barber.id, date, service.duration);
          return { barber, available: slots.includes(time) };
        })
      );

      const availableBarbers = availabilityResults.filter(r => r.available).map(r => r.barber);

      if (availableBarbers.length === 0) {
        return res.status(200).json({ error: "Nenhum profissional disponível neste horário" });
      }

      // Sort by fewest upcoming appointments (least busy)
      const now = new Date();
      const farFuture = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const allAppts = await storage.getAppointments(barbershopId, now, farFuture);
      availableBarbers.sort((a, b) => {
        const countA = allAppts.filter(ap => ap.barberId === a.id && (ap.status === 'scheduled' || ap.status === 'confirmed')).length;
        const countB = allAppts.filter(ap => ap.barberId === b.id && (ap.status === 'scheduled' || ap.status === 'confirmed')).length;
        return countA - countB;
      });

      const barber = availableBarbers[0];
      res.json({
        barberId: barber.id,
        barberName: barber.name,
        barberAvatar: barber.avatar,
        barberRole: barber.role,
        barberLunchStart: barber.lunchStart,
        barberLunchEnd: barber.lunchEnd,
        barberBreakSchedule: barber.breakSchedule,
        requestedDate: date,
        requestedTime: time,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get services for public booking (optionally filtered by barber)
  app.get("/api/public/:barbershopId/services", async (req, res) => {
    try {
      const { barberId } = req.query as { barberId?: string };
      const allServices = await storage.getServices(req.params.barbershopId);
      const activeServices = allServices.filter(s => s.active);

      // If barberId provided, check if this barber has any services configured
      if (barberId) {
        const barberServices = await storage.getBarberServices(barberId);
        // Only filter if barber has services configured (backwards compat: no config = show all)
        if (barberServices.length > 0) {
          const result = barberServices
            .map(bs => {
              const svc = activeServices.find(s => s.id === bs.serviceId);
              if (!svc) return null;
              return {
                id: svc.id,
                name: svc.name,
                price: bs.customPrice ?? svc.price, // custom price takes precedence
                duration: svc.duration,
                category: svc.category,
              };
            })
            .filter(Boolean);
          return res.json(result);
        }
      }

      res.json(activeServices.map(s => ({
        id: s.id,
        name: s.name,
        price: s.price,
        duration: s.duration,
        category: s.category
      })));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Lookup client by phone for returning customers
  app.get("/api/public/:barbershopId/client-lookup", async (req, res) => {
    try {
      const { phone } = req.query;
      if (!phone) {
        return res.status(400).json({ error: "Telefone é obrigatório" });
      }
      
      const normalizedLookupPhone = normalizePhone(phone as string);
      const clients = await storage.getClients(req.params.barbershopId);
      const client = clients.find(c => c.phone === normalizedLookupPhone);
      
      if (!client) {
        return res.json({ found: false });
      }
      
      // Get active packages for this client
      const activePackages = await storage.getActiveClientPackages(client.id);
      const packages = await storage.getPackages(req.params.barbershopId);
      const services = await storage.getServices(req.params.barbershopId);
      
      const packagesWithDetails = activePackages.map(cp => {
        const pkg = packages.find(p => p.id === cp.packageId);
        const service = pkg ? services.find(s => s.id === pkg.serviceId) : null;
        return {
          id: cp.id,
          packageId: cp.packageId,
          packageName: pkg?.name || 'Pacote',
          serviceId: pkg?.serviceId,
          serviceName: service?.name || 'Serviço',
          serviceDuration: service?.duration || 30,
          quantityRemaining: cp.quantityRemaining,
          quantityOriginal: cp.quantityOriginal,
          expiresAt: cp.expiresAt
        };
      });
      
      res.json({ 
        found: true, 
        client: {
          id: client.id,
          name: client.name,
          phone: client.phone
        },
        activePackages: packagesWithDetails
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get appointments for a specific date and barber (for availability)
  app.get("/api/public/:barbershopId/availability", async (req, res) => {
    try {
      const { barberId, date, timezoneOffset } = req.query;
      if (!barberId || !date) {
        return res.status(400).json({ error: "barberId e date são obrigatórios" });
      }
      
      const dateStr = date as string;
      const barberIdStr = String(barberId);
      // Use UTC to match stored appointment times (stored as UTC)
      const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
      
      const appointments = await storage.getAppointments(req.params.barbershopId, startOfDay, endOfDay);
      
      // Filter appointments for the specific barber (ensure string comparison)
      const busySlots = appointments
        .filter(a => 
          String(a.barberId) === barberIdStr && 
          a.status !== 'cancelled'
        )
        .map(a => ({
          startTime: a.startTime,
          endTime: a.endTime
        }));
      
      res.json({ busySlots });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create public booking
  app.post("/api/public/:barbershopId/book", async (req, res) => {
    try {
      const { clientName, clientPhone, clientId, barberId, serviceId, date, time, usePackage, clientPackageId, timezoneOffset, additionalServiceIds } = req.body;
      
      // For package bookings, clientId is required. For normal bookings, name and phone are required
      if (!barberId || !serviceId || !date || !time) {
        return res.status(400).json({ error: "Campos obrigatórios faltando" });
      }
      
      if (!usePackage && (!clientName || !clientPhone)) {
        return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
      }

      // Ensure IDs are strings for consistent comparison
      const barberIdStr = String(barberId);
      const serviceIdStr = String(serviceId);

      // Get barbershop settings for validation
      const barbershop = await storage.getBarbershop(req.params.barbershopId);
      if (!barbershop) {
        return res.status(404).json({ error: "Barbearia não encontrada" });
      }

      // Parse start time - store the time as-is without timezone conversion
      // This ensures the time selected by user (e.g., 08:00) is displayed as 08:00 in admin
      // We force UTC interpretation so the time value is preserved exactly
      const startTime = new Date(`${date}T${time}:00.000Z`);
      
      // For validations, we need to compare apples to apples
      // The client sends timezoneOffset (e.g., "-03:00") to know their local time
      // We reconstruct "now" in the same UTC-as-local convention for comparison
      const clientTzOffset = timezoneOffset || '-03:00'; // Default to Brazil
      const offsetMatch = clientTzOffset.match(/([+-])(\d{2}):(\d{2})/);
      let offsetMinutes = 0;
      if (offsetMatch) {
        const sign = offsetMatch[1] === '+' ? 1 : -1;
        offsetMinutes = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3]));
      }
      
      // Get real UTC time, then add offset to get client's local time, then treat as UTC
      const realNow = new Date();
      const clientLocalTime = new Date(realNow.getTime() + offsetMinutes * 60 * 1000);
      // Construct "now" in same UTC-as-local format for comparison
      const nowAsUTC = new Date(Date.UTC(
        clientLocalTime.getUTCFullYear(),
        clientLocalTime.getUTCMonth(),
        clientLocalTime.getUTCDate(),
        clientLocalTime.getUTCHours(),
        clientLocalTime.getUTCMinutes(),
        clientLocalTime.getUTCSeconds()
      ));

      // Server-side validation: advance hours
      const advanceHours = barbershop.bookingAdvanceHours || 2;
      const minBookingTime = new Date(nowAsUTC.getTime() + advanceHours * 60 * 60 * 1000);
      if (startTime < minBookingTime) {
        const advanceMinutes = Math.round(advanceHours * 60);
        const advanceText = advanceMinutes < 60 ? `${advanceMinutes} minutos` : `${advanceHours} horas`;
        return res.status(400).json({ error: `Agendamento requer ${advanceText} de antecedência` });
      }

      // Server-side validation: max days ahead
      const maxDaysAhead = barbershop.bookingMaxDaysAhead || 30;
      const maxDate = new Date(nowAsUTC.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);
      if (startTime > maxDate) {
        return res.status(400).json({ error: `Agendamento máximo de ${maxDaysAhead} dias no futuro` });
      }

      // Server-side validation: working hours
      // Use the time string directly since it represents local time selected by user
      if (barbershop.workingHours) {
        const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        // Get day of week from date string to avoid timezone issues
        const localDate = new Date(`${date}T12:00:00`); // Use noon to avoid date shifting
        const dayKey = dayMap[localDate.getDay()];
        const workingHours = barbershop.workingHours as Record<string, { open: string; close: string; enabled: boolean }>;
        const dayHours = workingHours[dayKey];
        
        if (!dayHours?.enabled) {
          return res.status(400).json({ error: "Barbearia fechada neste dia" });
        }

        const [openH, openM] = dayHours.open.split(':').map(Number);
        const [closeH, closeM] = dayHours.close.split(':').map(Number);
        // Use time string directly (e.g., "08:00")
        const [slotHour, slotMin] = time.split(':').map(Number);
        
        const slotMins = slotHour * 60 + slotMin;
        const openMins = openH * 60 + openM;
        const closeMins = closeH * 60 + closeM;
        
        if (slotMins < openMins || slotMins >= closeMins) {
          return res.status(400).json({ error: "Horário fora do funcionamento" });
        }
      }

      // Get or create client
      let client;
      if (usePackage && clientId) {
        // Package booking - use existing client
        const clients = await storage.getClients(req.params.barbershopId);
        client = clients.find(c => c.id === clientId);
        if (!client) {
          return res.status(404).json({ error: "Cliente não encontrado" });
        }
      } else {
        // Normal booking - find or create client
        const normalizedClientPhone = normalizePhone(clientPhone);
        const clients = await storage.getClients(req.params.barbershopId);
        client = clients.find(c => c.phone === normalizedClientPhone);
        if (!client) {
          client = await storage.createClient({
            barbershopId: req.params.barbershopId,
            name: clientName,
            phone: normalizedClientPhone
          });
          
          // Schedule welcome message for new client via public booking
          try {
            console.log(`[API-PublicBooking] Novo cliente criado: ${client.id}, telefone: ${client.phone}`);
            if (client.phone) {
              console.log(`[API-PublicBooking] Chamando scheduleWelcomeMessage para ${client.name}...`);
              await scheduleWelcomeMessage(
                req.params.barbershopId,
                client.id,
                client.phone,
                client.name
              );
              console.log(`[API-PublicBooking] Mensagem de boas-vindas agendada com sucesso!`);
            }
          } catch (notifyError) {
            console.error('[Notifications] Erro ao enviar mensagem de boas-vindas:', notifyError);
          }
        }
      }

      // Get service for duration
      const services = await storage.getServices(req.params.barbershopId);
      const service = services.find(s => String(s.id) === serviceIdStr);
      if (!service) {
        return res.status(404).json({ error: "Serviço não encontrado" });
      }
      
      // Get additional services if provided - validate each one
      const additionalServicesArr: string[] = Array.isArray(additionalServiceIds) ? additionalServiceIds.map(String) : [];
      // Filter duplicates and remove the primary service if included
      const uniqueAdditionalIds = Array.from(new Set(additionalServicesArr)).filter(id => id !== serviceIdStr);
      let totalDuration = service.duration;
      const additionalServicesData: typeof service[] = [];
      for (const addSvcId of uniqueAdditionalIds) {
        const addSvc = services.find(s => String(s.id) === addSvcId && s.active);
        if (addSvc) {
          totalDuration += addSvc.duration;
          additionalServicesData.push(addSvc);
        }
      }
      // Use validated array
      const validatedAdditionalIds = additionalServicesData.map(s => String(s.id));

      // Validate barber exists
      const barbers = await storage.getBarbers(req.params.barbershopId);
      const barber = barbers.find(b => String(b.id) === barberIdStr && b.active);
      if (!barber) {
        return res.status(404).json({ error: "Barbeiro não encontrado" });
      }

      // Server-side validation: barber lunch break
      // Use time string directly since it represents local time
      const [slotHour, slotMin] = (time as string).split(':').map(Number);
      const slotStartMinutes = slotHour * 60 + slotMin;
      const slotEndMinutes = slotStartMinutes + totalDuration;

      let breakStart: string | null = null;
      let breakEnd: string | null = null;

      const dayMap2 = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const localDate2 = new Date(`${date}T12:00:00`);
      const dayKey2 = dayMap2[localDate2.getDay()];
      const breakSchedule = barber.breakSchedule as Record<string, { start: string | null; end: string | null; enabled: boolean }> | null;

      if (breakSchedule && breakSchedule[dayKey2]?.enabled) {
        breakStart = breakSchedule[dayKey2].start;
        breakEnd = breakSchedule[dayKey2].end;
      } else if (barber.lunchStart && barber.lunchEnd) {
        breakStart = barber.lunchStart;
        breakEnd = barber.lunchEnd;
      }

      if (breakStart && breakEnd) {
        const [bStartH, bStartM] = breakStart.split(':').map(Number);
        const [bEndH, bEndM] = breakEnd.split(':').map(Number);
        const breakStartMinutes = bStartH * 60 + bStartM;
        const breakEndMinutes = bEndH * 60 + bEndM;

        if (!(slotEndMinutes <= breakStartMinutes || slotStartMinutes >= breakEndMinutes)) {
          return res.status(400).json({ error: "Horário conflita com intervalo do barbeiro" });
        }
      }

      // If using package, validate package
      let validatedClientPackageId = null;
      if (usePackage && clientPackageId) {
        const activePackages = await storage.getActiveClientPackages(client.id);
        const clientPkg = activePackages.find(p => p.id === clientPackageId);
        
        if (!clientPkg) {
          return res.status(400).json({ error: "Pacote não encontrado ou expirado" });
        }
        
        if (clientPkg.quantityRemaining <= 0) {
          return res.status(400).json({ error: "Pacote sem usos restantes" });
        }
        
        // Verify the package is for this service
        const packages = await storage.getPackages(req.params.barbershopId);
        const pkg = packages.find(p => p.id === clientPkg.packageId);
        if (!pkg || pkg.serviceId !== serviceIdStr) {
          return res.status(400).json({ error: "Pacote não é válido para este serviço" });
        }
        
        validatedClientPackageId = clientPackageId;
        
        // NOTE: Package is NOT decremented here - it will be decremented when the comanda is closed
        // This follows the business rule that package usage and commission are only counted when closing the comanda
      }

      // Calculate end time using total duration (primary + additional services)
      const endTime = new Date(startTime.getTime() + totalDuration * 60000);

      // Check for conflicts - use UTC for consistency with stored times
      const conflictStartOfDay = new Date(`${date}T00:00:00`);
      const conflictEndOfDay = new Date(`${date}T23:59:59`);
      const appointments = await storage.getAppointments(req.params.barbershopId, conflictStartOfDay, conflictEndOfDay);
      
      const conflict = appointments.some(a => 
        String(a.barberId) === barberIdStr &&
        a.status !== 'cancelled' &&
        !(endTime <= a.startTime || startTime >= a.endTime)
      );

      if (conflict) {
        return res.status(400).json({ error: "Horário não disponível" });
      }

      // Create appointment
      const appointment = await storage.createAppointment({
        barbershopId: req.params.barbershopId,
        barberId: barberIdStr,
        clientId: client.id,
        serviceId: serviceIdStr,
        startTime,
        endTime,
        status: 'scheduled',
        notes: usePackage ? 'Agendamento online (pacote)' : 'Agendamento online',
        usedPackage: !!usePackage,
        clientPackageId: validatedClientPackageId
      });
      
      // Create appointment services entries for all services (primary + validated additional)
      const allServiceIds = [serviceIdStr, ...validatedAdditionalIds];
      for (const svcId of allServiceIds) {
        const svc = services.find(s => String(s.id) === svcId);
        if (svc) {
          await storage.createAppointmentService({
            appointmentId: appointment.id,
            serviceId: svcId,
            price: svc.price,
            duration: svc.duration,
            usedPackage: usePackage && svcId === serviceIdStr,
            clientPackageId: usePackage && svcId === serviceIdStr ? validatedClientPackageId : null
          });
        }
      }
      
      // Schedule notifications for public booking
      let serviceName = service.name;
      if (validatedAdditionalIds.length > 0) {
        serviceName += ` +${validatedAdditionalIds.length} serviço(s)`;
      }
      
      console.log(`[API-PublicBooking] Agendamento criado: ${appointment.id}`);
      console.log(`[API-PublicBooking] Cliente: ${client.name} (${client.phone}), Barbeiro: ${barber.name}, Serviço: ${serviceName}`);
      
      try {
        if (client.phone && barber && service) {
          console.log(`[API-PublicBooking] Chamando scheduleAppointmentNotifications...`);
          await scheduleAppointmentNotifications(
            appointment.id,
            req.params.barbershopId,
            client.phone,
            client.name,
            barber.name,
            serviceName,
            startTime,
            barber.phone || undefined
          );
          console.log(`[API-PublicBooking] Notificações agendadas com sucesso!`);
        } else {
          console.log(`[API-PublicBooking] NÃO agendou notificações - falta: phone=${!!client.phone}, barber=${!!barber}, service=${!!service}`);
        }
      } catch (notifyError) {
        console.error('[Notifications] Erro ao agendar notificações:', notifyError);
      }

      res.json({ 
        success: true, 
        appointmentId: appointment.id,
        message: usePackage ? 'Agendamento confirmado! Uso do pacote registrado.' : 'Agendamento confirmado!'
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Cancel public booking
  app.patch("/api/public/:barbershopId/cancel/:appointmentId", async (req, res) => {
    try {
      const { clientPhone } = req.body;
      
      if (!clientPhone) {
        return res.status(400).json({ error: "Telefone obrigatório para cancelar" });
      }

      const appointment = await storage.getAppointment(req.params.appointmentId);
      
      if (!appointment || appointment.barbershopId !== req.params.barbershopId) {
        return res.status(404).json({ error: "Agendamento não encontrado" });
      }

      // Verify client phone matches
      const normalizedCancelPhone = normalizePhone(clientPhone);
      const clients = await storage.getClients(req.params.barbershopId);
      const client = clients.find(c => c.phone === normalizedCancelPhone);
      if (!client || client.id !== appointment.clientId) {
        return res.status(403).json({ error: "Telefone não corresponde ao agendamento" });
      }

      await storage.updateAppointment(appointment.id, { status: 'cancelled' });
      
      // Schedule cancellation message
      try {
        if (client.phone) {
          const startDate = new Date(appointment.startTime);
          // Dates are stored as "local time as UTC" - use getUTC* to avoid double conversion
          const cancelDay = startDate.getUTCDate().toString().padStart(2, '0');
          const cancelMonth = (startDate.getUTCMonth() + 1).toString().padStart(2, '0');
          const cancelYear = startDate.getUTCFullYear();
          const cancelH = startDate.getUTCHours().toString().padStart(2, '0');
          const cancelM = startDate.getUTCMinutes().toString().padStart(2, '0');
          const cancelBarber = appointment.barberId ? await storage.getBarber(appointment.barberId) : null;
          await scheduleCancellationMessage(
            appointment.id,
            req.params.barbershopId,
            client.phone,
            client.name,
            `${cancelDay}/${cancelMonth}/${cancelYear}`,
            `${cancelH}:${cancelM}`,
            cancelBarber?.phone || undefined,
            cancelBarber?.name || undefined
          );
        }
      } catch (notifyError) {
        console.error('[Notifications] Erro ao enviar notificação de cancelamento:', notifyError);
      }
      
      res.json({ success: true, message: 'Agendamento cancelado' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get client appointments by phone
  app.get("/api/public/:barbershopId/my-appointments", async (req, res) => {
    try {
      const { phone, timezoneOffset } = req.query;
      
      if (!phone) {
        return res.status(400).json({ error: "Telefone obrigatório" });
      }

      const normalizedApptPhone = normalizePhone(phone as string);
      const clients = await storage.getClients(req.params.barbershopId);
      const client = clients.find(c => c.phone === normalizedApptPhone);
      if (!client) {
        return res.json([]);
      }

      // Appointments are stored as "local time in UTC format" (UTC-as-local)
      // We need to calculate "now" in the same convention to compare correctly
      // Default to Brazil timezone (-03:00) if not provided
      const clientTzOffset = (timezoneOffset as string) || '-03:00';
      const offsetMatch = clientTzOffset.match(/([+-])(\d{2}):(\d{2})/);
      let offsetMinutes = 0;
      if (offsetMatch) {
        const sign = offsetMatch[1] === '+' ? 1 : -1;
        offsetMinutes = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3]));
      }
      
      // Get real UTC time, add offset to get client's local time, then treat as UTC
      const realNow = new Date();
      const clientLocalTime = new Date(realNow.getTime() + offsetMinutes * 60 * 1000);
      // Construct "now" in same UTC-as-local format for comparison
      const nowAsUTC = new Date(Date.UTC(
        clientLocalTime.getUTCFullYear(),
        clientLocalTime.getUTCMonth(),
        clientLocalTime.getUTCDate(),
        0, 0, 0
      ));
      
      // Get appointments from start of today (in client's timezone) to 30 days ahead
      const thirtyDaysLater = new Date(nowAsUTC.getTime() + 30 * 24 * 60 * 60 * 1000);
      const appointments = await storage.getAppointments(req.params.barbershopId, nowAsUTC, thirtyDaysLater);
      const barbers = await storage.getBarbers(req.params.barbershopId);
      const services = await storage.getServices(req.params.barbershopId);
      
      const clientAppointments = appointments
        .filter(a => a.clientId === client.id && a.status !== 'cancelled')
        .map(a => {
          const barber = barbers.find(b => b.id === a.barberId);
          const service = services.find(s => s.id === a.serviceId);
          return {
            id: a.id,
            startTime: a.startTime,
            endTime: a.endTime,
            status: a.status,
            barberName: barber?.name || 'Desconhecido',
            barberAvatar: barber?.avatar,
            serviceName: service?.name || 'Desconhecido',
            servicePrice: service?.price || '0'
          };
        })
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      res.json(clientAppointments);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ NOTIFICATION SETTINGS ROUTES ============
  
  app.get("/api/notification-settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getNotificationSettings(req.session.barbershopId!);
      if (!settings) {
        return res.json({
          provider: 'uazapi',
          welcomeEnabled: true,
          reminder1DayEnabled: true,
          reminder1HourEnabled: true,
          confirmationEnabled: true,
          cancellationEnabled: true,
          welcomeTemplate: null,
          reminderTemplate: null,
          confirmationTemplate: null,
          cancellationTemplate: null,
        });
      }
      res.json(settings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/notification-settings", requireAuth, async (req, res) => {
    try {
      const settingsSchema = z.object({
        provider: z.string().optional(),
        welcomeEnabled: z.boolean().default(true),
        reminder1DayEnabled: z.boolean().default(true),
        reminder1HourEnabled: z.boolean().default(true),
        confirmationEnabled: z.boolean().default(true),
        cancellationEnabled: z.boolean().default(true),
        funnelAutomationEnabled: z.boolean().optional(),
        reactivation20daysEnabled: z.boolean().optional(),
        reactivation30daysEnabled: z.boolean().optional(),
        reactivation45daysEnabled: z.boolean().optional(),
        predictedReturnEnabled: z.boolean().optional(),
        professionalBookingEnabled: z.boolean().optional(),
        professionalCancellationEnabled: z.boolean().optional(),
        cashClosingEnabled: z.boolean().optional(),
        cashClosingPhone: z.string().optional().nullable(),
        welcomeTemplate: z.string().optional().nullable(),
        reminder1DayTemplate: z.string().optional().nullable(),
        reminder1HourTemplate: z.string().optional().nullable(),
        confirmationTemplate: z.string().optional().nullable(),
        cancellationTemplate: z.string().optional().nullable(),
        reactivation20daysTemplate: z.string().optional().nullable(),
        reactivation30daysTemplate: z.string().optional().nullable(),
        reactivation45daysTemplate: z.string().optional().nullable(),
        predictedReturnTemplate: z.string().optional().nullable(),
        subscriptionExpiryTemplate: z.string().optional().nullable(),
      });

      const data = settingsSchema.parse(req.body);
      
      // Forçar UazAPI como único provider (outros não estão configurados)
      const settings = await storage.upsertNotificationSettings({
        barbershopId: req.session.barbershopId!,
        ...data,
        provider: 'uazapi', // Sempre forçar UazAPI
      });

      res.json(settings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ CHATBOT SETTINGS ROUTES ============
  
  app.get("/api/chatbot-settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getChatbotSettings(req.session.barbershopId!);
      if (!settings) {
        return res.json({
          enabled: false,
          systemPrompt: null,
          greetingNewClient: null,
          greetingReturningClient: null,
          askServicePrompt: null,
          askBarberPrompt: null,
          askDatePrompt: null,
          askTimePrompt: null,
          confirmationPrompt: null,
          cancellationPrompt: null,
          noAvailabilityPrompt: null,
          waitingOptionEnabled: true,
          waitingPrompt: null,
          minAdvanceMinutes: 60,
          maxDaysAhead: 30,
          webhookToken: null,
          uazapiInstanceToken: null,
          uazapiInstanceName: null,
          whatsappConnected: false,
          whatsappPhone: null,
        });
      }
      res.json(settings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/chatbot-settings", requireAuth, async (req, res) => {
    try {
      const settingsSchema = z.object({
        enabled: z.boolean().default(false),
        systemPrompt: z.string().optional().nullable(),
        greetingNewClient: z.string().optional().nullable(),
        greetingReturningClient: z.string().optional().nullable(),
        askServicePrompt: z.string().optional().nullable(),
        askBarberPrompt: z.string().optional().nullable(),
        askDatePrompt: z.string().optional().nullable(),
        askTimePrompt: z.string().optional().nullable(),
        confirmationPrompt: z.string().optional().nullable(),
        cancellationPrompt: z.string().optional().nullable(),
        noAvailabilityPrompt: z.string().optional().nullable(),
        waitingOptionEnabled: z.boolean().default(true),
        waitingPrompt: z.string().optional().nullable(),
        minAdvanceMinutes: z.coerce.number().default(60),
        maxDaysAhead: z.coerce.number().default(30),
        webhookToken: z.string().optional().nullable(),
      });

      const data = settingsSchema.parse(req.body);
      
      const settings = await storage.upsertChatbotSettings({
        barbershopId: req.session.barbershopId!,
        ...data,
      });

      res.json(settings);
    } catch (error: any) {
      console.error('[Chatbot] Erro ao salvar configurações:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ WHATSAPP MULTI-INSTÂNCIA (UazAPI) ============

  // Helper: extrai status de resposta do uazapiGO
  // Suporta os formatos: { status: { connected } } e { connected } e { instance: { status: "connected" } }
  function parseUazStatus(d: any): { connected: boolean; phone: string | null } {
    // Formato uazapiGO: { instance: {...}, status: { connected: bool, jid, loggedIn } }
    if (d?.status && typeof d.status === 'object' && 'connected' in d.status) {
      const connected = !!d.status.connected || !!d.status.loggedIn;
      const instanceStatus = d.instance?.status || '';
      const isConnected = connected || instanceStatus === 'connected' || instanceStatus === 'open';
      const phone = d.instance?.owner || (d.status?.jid ? String(d.status.jid).split('@')[0] : null) || null;
      return { connected: !!isConnected, phone };
    }
    // Formato alternativo: { connected: bool, phone: string }
    if ('connected' in d) {
      const statusStr = d.status || '';
      return {
        connected: !!d.connected || statusStr === 'connected' || statusStr === 'open',
        phone: d.phone || null,
      };
    }
    // Formato { data: { connected } }
    if (d?.data && 'connected' in d.data) {
      return { connected: !!d.data.connected, phone: d.data.phone || null };
    }
    return { connected: false, phone: null };
  }

  // Helper: verifica status real da instância no UazAPI
  async function checkUazStatus(apiUrl: string, instanceToken: string, instanceName: string): Promise<{ connected: boolean; phone: string | null } | null> {
    const encoded = encodeURIComponent(instanceName);
    // 1) GET /instance/status (token no header identifica a instância — uazapiGO)
    try {
      const r = await fetch(`${apiUrl}/instance/status`, { headers: { 'token': instanceToken } });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return parseUazStatus(d);
    } catch { /* continua */ }
    // 2) GET /instance/status/{name}
    try {
      const r = await fetch(`${apiUrl}/instance/status/${encoded}`, { headers: { 'token': instanceToken } });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return parseUazStatus(d);
    } catch { /* continua */ }
    // 3) GET /instance/{name}
    try {
      const r = await fetch(`${apiUrl}/instance/${encoded}`, { headers: { 'token': instanceToken } });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return parseUazStatus(d);
    } catch { /* continua */ }
    return null;
  }

  // Helper: extrai QR code de resposta da UazAPI (apenas strings não vazias)
  // Suporta uazapiGO: { instance: { qrcode: "..." } } e formatos alternativos
  function extractQrcode(data: any): string | null {
    const candidates = [
      data?.instance?.qrcode,  // uazapiGO format
      data?.qrcode,
      data?.data?.qrcode,
      data?.base64,
      data?.qr,
    ];
    for (const c of candidates) {
      if (c && typeof c === 'string' && c.trim().length > 10) return c.trim();
    }
    return null;
  }

  app.post("/api/whatsapp/connect", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const apiUrl = (process.env.UAZAPI_URL || '').replace(/\/+$/, '');
      const masterToken = (process.env.UAZAPI_MASTER_TOKEN || '').trim();
      if (!apiUrl || !masterToken) {
        return res.status(500).json({ error: "UAZAPI_URL e UAZAPI_MASTER_TOKEN devem estar configurados" });
      }
      const instanceName = `barbergold-${barbershopId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      let instanceToken: string | null = null;

      // Reutilizar instância existente se já tivermos no banco (evita estourar limite)
      const settings = await storage.getChatbotSettings(barbershopId);
      if (settings?.uazapiInstanceName === instanceName && settings?.uazapiInstanceToken) {
        // Validar token antes de reutilizar — se retornar 401 (token inválido), forçar recriação
        const tokenCheck = await fetch(`${apiUrl}/instance/status`, {
          headers: { 'token': settings.uazapiInstanceToken },
        }).catch(() => null);
        if (tokenCheck?.status === 401) {
          console.log('[WhatsApp] Token salvo inválido (401) — forçando recriação:', instanceName);
          await storage.updateChatbotWhatsappFields(barbershopId, {
            uazapiInstanceToken: null,
            uazapiInstanceName: null,
            whatsappConnected: false,
            whatsappPhone: null,
          });
          // instanceToken permanece null → bloco abaixo criará nova instância
        } else {
          instanceToken = settings.uazapiInstanceToken;
        }
      }

      if (!instanceToken) {
        const createRes = await fetch(`${apiUrl}/instance/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'admintoken': masterToken,
            'apikey': masterToken,
          },
          body: JSON.stringify({ name: instanceName }),
        });
        const createData = await createRes.json().catch(() => ({}));
        if (!createRes.ok) {
          const errStr = String(createData?.message || createData?.error || '').toLowerCase();
          const isMaxReached = errStr.includes('maximum') || errStr.includes('max') || errStr.includes('limit') || errStr.includes('limite');
          if (isMaxReached) {
            const listRes = await fetch(`${apiUrl}/instance`, { headers: { 'admintoken': masterToken } });
            const listData = await listRes.json().catch(() => ({}));
            const arr = Array.isArray(listData) ? listData : (listData?.data || listData?.instances || listData?.list || []);
            const existing = Array.isArray(arr) && arr.find((i: any) => (i.name || i.instanceName) === instanceName);
            const tok = existing?.apikey || existing?.token || existing?.instanceToken || existing?.data?.token;
            if (tok) {
              instanceToken = tok;
              await storage.updateChatbotWhatsappFields(barbershopId, {
                uazapiInstanceName: instanceName,
                uazapiInstanceToken: instanceToken,
                whatsappConnected: existing?.connected ?? false,
                whatsappPhone: existing?.phone ?? null,
              });
              console.log('[WhatsApp] Reutilizando instância existente:', instanceName);
            } else {
              console.error('[WhatsApp] Limite atingido, instância não encontrada na lista:', listData);
              return res.status(400).json({ error: 'Limite de instâncias atingido. Exclua uma instância no painel UazAPI e tente novamente.' });
            }
          } else {
            console.error('[WhatsApp] Erro ao criar instância:', createRes.status, createData);
            const errMsg = createData?.message || createData?.error || (createRes.status === 401 ? 'Token inválido. Verifique o UAZAPI_MASTER_TOKEN.' : 'Falha ao criar instância');
            return res.status(createRes.status).json({ error: errMsg });
          }
        } else {
          instanceToken = createData.token || createData.instanceToken || createData.data?.token || createData.apikey;
          if (!instanceToken) {
            console.error('[WhatsApp] Resposta sem token:', createData);
            return res.status(500).json({ error: 'Resposta da API sem token da instância' });
          }
          await storage.updateChatbotWhatsappFields(barbershopId, {
            uazapiInstanceName: instanceName,
            uazapiInstanceToken: instanceToken,
            whatsappConnected: false,
            whatsappPhone: null,
          });
        }
      }

      // Checar status ANTES de tentar QR — se já conectado, sincroniza DB e retorna
      const statusCheck = await checkUazStatus(apiUrl, instanceToken!, instanceName);
      if (statusCheck?.connected) {
        console.log('[WhatsApp] Instância já conectada, sincronizando DB:', instanceName);
        await storage.updateChatbotWhatsappFields(barbershopId, {
          uazapiInstanceName: instanceName,
          uazapiInstanceToken: instanceToken!,
          whatsappConnected: true,
          whatsappPhone: statusCheck.phone,
        });
        return res.json({ connected: true, qrcode: null, phone: statusCheck.phone, instanceName });
      }

      // Instância não conectada — obter QR code para o admin escanear
      // IMPORTANTE: usar GET /instance/qrcode (sem instanceName no path) — token identifica a instância
      let qrcode: string | null = null;
      const encodedInstanceName = encodeURIComponent(instanceName);

      // 1) GET /instance/qrcode (sem path params — token identifica instância)
      try {
        const r = await fetch(`${apiUrl}/instance/qrcode`, { headers: { 'token': instanceToken! } });
        const d = await r.json().catch(() => ({}));
        if (r.ok) qrcode = extractQrcode(d);
      } catch { /* continua */ }

      // 2) GET /instance/qrcode/{instanceName}
      if (!qrcode) {
        try {
          const r = await fetch(`${apiUrl}/instance/qrcode/${encodedInstanceName}`, { headers: { 'token': instanceToken! } });
          const d = await r.json().catch(() => ({}));
          if (r.ok) qrcode = extractQrcode(d);
        } catch { /* continua */ }
      }

      // 3) POST /instance/connect com body vazio (token no header identifica instância)
      if (!qrcode) {
        try {
          const r = await fetch(`${apiUrl}/instance/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': instanceToken! },
            body: JSON.stringify({}),
          });
          const d = await r.json().catch(() => ({}));
          if (r.ok) qrcode = extractQrcode(d);
        } catch { /* continua */ }
      }

      console.log('[WhatsApp] connect result — qrcode:', qrcode ? 'sim' : 'não', 'instance:', instanceName);
      res.json({ qrcode: qrcode || null, connected: false, instanceName });
    } catch (error: any) {
      console.error('[WhatsApp] Erro connect:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Conectar usando instância criada manualmente no painel UazAPI (bypass do limite)
  app.post("/api/whatsapp/connect-manual", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const { instanceName, instanceToken } = req.body || {};
      if (!instanceName || !instanceToken) {
        return res.status(400).json({ error: "Informe o nome e o token da instância criada no painel UazAPI." });
      }
      const apiUrl = (process.env.UAZAPI_URL || '').replace(/\/+$/, '');
      if (!apiUrl) {
        return res.status(500).json({ error: "UAZAPI_URL não configurado." });
      }
      const name = String(instanceName).trim();
      const token = String(instanceToken).trim();
      const headersToken = { 'Content-Type': 'application/json', 'token': token };
      const encodedName = encodeURIComponent(name);
      let qrcode: string | null = null;

      // Tentar vários endpoints (mesma lógica do connect automático)
      const connectRes = await fetch(`${apiUrl}/instance/connect`, {
        method: 'POST',
        headers: headersToken,
        body: JSON.stringify({ instanceName: name, name }),
      });
      const connectData = await connectRes.json().catch(() => ({}));
      qrcode = connectData.qrcode || connectData.data?.qrcode || connectData.base64 || null;

      if (!qrcode) {
        const qrRes = await fetch(`${apiUrl}/instance/qrcode/${encodedName}`, { headers: { token } });
        const qrData = await qrRes.json().catch(() => ({}));
        if (qrRes.ok) qrcode = qrData.qrcode || qrData.data?.qrcode || qrData.base64 || qrData.qr || null;
      }
      if (!qrcode) {
        const altRes = await fetch(`${apiUrl}/instance/${encodedName}/qrcode`, { headers: { token } });
        const altData = await altRes.json().catch(() => ({}));
        if (altRes.ok) qrcode = altData.qrcode || altData.data?.qrcode || altData.base64 || altData.qr || null;
      }
      if (!qrcode) {
        const fallbackRes = await fetch(`${apiUrl}/instance/connect`, {
          method: 'POST',
          headers: headersToken,
          body: JSON.stringify({}),
        });
        const fallbackData = await fallbackRes.json().catch(() => ({}));
        qrcode = fallbackData.qrcode || fallbackData.data?.qrcode || fallbackData.base64 || null;
      }
      if (!qrcode && (connectRes.status >= 400 || (connectData?.message || connectData?.error))) {
        const errMsg = connectData?.message || connectData?.error || `Falha ao obter QR code`;
        return res.status(connectRes.ok ? 400 : connectRes.status).json({ error: errMsg });
      }
      await storage.updateChatbotWhatsappFields(barbershopId, {
        uazapiInstanceName: name,
        uazapiInstanceToken: token,
        whatsappConnected: false,
        whatsappPhone: null,
      });
      res.json({ qrcode: qrcode || null, instanceName: name });
    } catch (error: any) {
      console.error('[WhatsApp] Erro connect-manual:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp/panel-url", requireAuth, (req, res) => {
    const url = (process.env.UAZAPI_URL || '').replace(/\/+$/, '') || 'https://uazapi.com';
    res.json({ panelUrl: url });
  });

  app.get("/api/whatsapp/qrcode", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const settings = await storage.getChatbotSettings(barbershopId);
      if (!settings?.uazapiInstanceName) {
        return res.status(400).json({ error: "Nenhuma instância conectada. Clique em Conectar primeiro." });
      }
      const instanceToken = settings.uazapiInstanceToken;
      const apiUrl = (process.env.UAZAPI_URL || '').replace(/\/+$/, '');
      if (!apiUrl || !instanceToken) {
        return res.status(400).json({ error: "Configuração incompleta. Clique em Conectar para reiniciar." });
      }
      const encodedName = encodeURIComponent(settings.uazapiInstanceName);
      const instanceName = settings.uazapiInstanceName;

      // Antes de buscar QR, verificar se a instância já está conectada
      const statusCheck = await checkUazStatus(apiUrl, instanceToken, instanceName);
      if (statusCheck?.connected) {
        console.log('[WhatsApp] Instância já conectada (polling QR), sincronizando DB:', instanceName);
        await storage.updateChatbotWhatsappFields(barbershopId, {
          whatsappConnected: true,
          whatsappPhone: statusCheck.phone,
        });
        return res.json({ connected: true, qrcode: null, phone: statusCheck.phone });
      }

      // Instância desconectada — obter QR code para o admin escanear
      let qrcode: string | null = null;
      let lastError: string | null = null;

      // 1) GET /instance/qrcode (token no header identifica instância)
      try {
        const r = await fetch(`${apiUrl}/instance/qrcode`, { headers: { 'token': instanceToken } });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          qrcode = extractQrcode(d);
          if (qrcode) console.log('[WhatsApp] QR obtido via GET /instance/qrcode');
        }
      } catch { /* continua */ }

      // 2) GET /instance/qrcode/{name}
      if (!qrcode) {
        try {
          const r = await fetch(`${apiUrl}/instance/qrcode/${encodedName}`, { headers: { 'token': instanceToken } });
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            qrcode = extractQrcode(d);
            if (qrcode) console.log('[WhatsApp] QR obtido via GET /instance/qrcode/{name}');
          }
        } catch { /* continua */ }
      }

      // 3) GET /instance/status — verifica se já tem QR pronto no campo instance.qrcode
      if (!qrcode) {
        try {
          const r = await fetch(`${apiUrl}/instance/status`, { headers: { 'token': instanceToken } });
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            qrcode = extractQrcode(d);
            if (qrcode) console.log('[WhatsApp] QR obtido via GET /instance/status');
          }
        } catch { /* continua */ }
      }

      // 4) POST /instance/connect (body vazio — token no header identifica instância)
      if (!qrcode) {
        try {
          const r = await fetch(`${apiUrl}/instance/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': instanceToken },
            body: JSON.stringify({}),
          });
          const d = await r.json().catch(() => ({}));
          console.log('[WhatsApp] POST /instance/connect (qrcode poll):', r.status, JSON.stringify(d).slice(0, 200));
          if (r.ok) {
            qrcode = extractQrcode(d);
          } else {
            const errStr = String(d?.message || d?.error || '').toLowerCase();
            if (r.status === 401 || errStr.includes('invalid token')) {
              // Token inválido — limpar DB para que próximo "Conectar" crie instância nova
              console.log('[WhatsApp] Token inválido (401) detectado no polling QR — limpando DB:', instanceName);
              await storage.updateChatbotWhatsappFields(barbershopId, {
                uazapiInstanceToken: null,
                uazapiInstanceName: null,
                whatsappConnected: false,
                whatsappPhone: null,
              });
              return res.status(401).json({ error: 'Token inválido. Clique em "Conectar WhatsApp" novamente.' });
            }
            if (errStr.includes('maximum') || errStr.includes('limit') || r.status === 429) {
              console.log('[WhatsApp] Instância reportada como conectada pelo UazAPI — sincronizando DB');
              const recheck = await checkUazStatus(apiUrl, instanceToken, instanceName);
              const phone = recheck?.phone || settings.whatsappPhone || null;
              await storage.updateChatbotWhatsappFields(barbershopId, {
                whatsappConnected: true,
                whatsappPhone: phone,
              });
              return res.json({ connected: true, qrcode: null, phone });
            }
            lastError = d?.message || d?.error || `POST connect: ${r.status}`;
          }
        } catch { /* continua */ }
      }

      // 5) Após POST /instance/connect, tentar GET /instance/qrcode novamente (pode demorar ~1s para gerar)
      if (!qrcode) {
        await new Promise(r => setTimeout(r, 1200));
        try {
          const r = await fetch(`${apiUrl}/instance/qrcode`, { headers: { 'token': instanceToken } });
          const d = await r.json().catch(() => ({}));
          if (r.ok) qrcode = extractQrcode(d);
        } catch { /* continua */ }
      }

      if (!qrcode) {
        console.error('[WhatsApp] QR não disponível:', lastError, 'instance:', instanceName);
        return res.status(400).json({ error: lastError || "QR não disponível. A instância pode estar desconectada ou o token inválido." });
      }
      res.json({ qrcode });
    } catch (error: any) {
      console.error('[WhatsApp] Erro qrcode:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp/status", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const settings = await storage.getChatbotSettings(barbershopId);
      if (!settings?.uazapiInstanceName) {
        return res.json({ connected: false, phone: null });
      }
      const apiUrl = (process.env.UAZAPI_URL || '').replace(/\/+$/, '');
      const instanceToken = settings.uazapiInstanceToken || process.env.UAZAPI_INSTANCE_TOKEN;
      if (!apiUrl || !instanceToken) {
        return res.json({ connected: settings.whatsappConnected ?? false, phone: settings.whatsappPhone ?? null });
      }
      const statusCheck = await checkUazStatus(apiUrl, instanceToken, settings.uazapiInstanceName);
      if (statusCheck) {
        // Sincronizar DB se o status mudou
        if (statusCheck.connected !== (settings.whatsappConnected ?? false)) {
          await storage.updateChatbotWhatsappFields(barbershopId, {
            whatsappConnected: statusCheck.connected,
            whatsappPhone: statusCheck.phone || settings.whatsappPhone || null,
          });
        }
        return res.json({ connected: statusCheck.connected, phone: statusCheck.phone || settings.whatsappPhone || null });
      }
      // Fallback ao valor do banco
      res.json({ connected: settings.whatsappConnected ?? false, phone: settings.whatsappPhone ?? null });
    } catch (error: any) {
      console.error('[WhatsApp] Erro status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/disconnect", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const settings = await storage.getChatbotSettings(barbershopId);
      if (!settings?.uazapiInstanceName) {
        return res.json({ success: true });
      }
      const apiUrl = (process.env.UAZAPI_URL || '').replace(/\/+$/, '');
      const instanceToken = settings.uazapiInstanceToken;

      // Faz logout do celular — NÃO exclui a instância no UazAPI
      // Isso preserva a instância para reconexão futura sem criar novas
      if (apiUrl && instanceToken) {
        const encoded = encodeURIComponent(settings.uazapiInstanceName);
        const headers = { 'Content-Type': 'application/json', 'token': instanceToken };
        let logoutOk = false;

        // Tentar diferentes endpoints de logout do uazapiGO
        const logoutEndpoints = [
          { method: 'POST', url: `${apiUrl}/instance/logout` },
          { method: 'DELETE', url: `${apiUrl}/instance/logout` },
          { method: 'POST', url: `${apiUrl}/instance/logout/${encoded}` },
          { method: 'GET', url: `${apiUrl}/instance/logout` },
        ];

        for (const ep of logoutEndpoints) {
          try {
            const r = await fetch(ep.url, {
              method: ep.method,
              headers,
              ...(ep.method !== 'GET' ? { body: JSON.stringify({}) } : {}),
            });
            const d = await r.json().catch(() => ({}));
            console.log(`[WhatsApp] ${ep.method} ${ep.url}:`, r.status, JSON.stringify(d).slice(0, 100));
            if (r.ok || r.status === 200) { logoutOk = true; break; }
          } catch { /* continua */ }
        }
        if (!logoutOk) {
          console.warn('[WhatsApp] Nenhum endpoint de logout funcionou — status atualizado apenas no DB');
        }
      }

      // Atualiza apenas o status de conexão — mantém instanceName e instanceToken para reutilização
      await storage.updateChatbotWhatsappFields(barbershopId, {
        whatsappConnected: false,
        whatsappPhone: null,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error('[WhatsApp] Erro disconnect:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/webhook/whatsapp-status/:barbershopId", async (req, res) => {
    try {
      const { barbershopId } = req.params;
      const body = req.body;
      const barbershop = await storage.getBarbershop(barbershopId);
      if (!barbershop) return res.status(404).json({ error: 'Barbershop not found' });
      const phone = body.phone ?? body.data?.phone ?? body.sender ?? body.number ?? null;
      await storage.updateChatbotWhatsappFields(barbershopId, {
        whatsappConnected: true,
        whatsappPhone: phone ? String(phone).replace(/\D/g, '').replace(/^0/, '') : null,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error('[WhatsApp] Erro webhook-status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ WHATSAPP WEBHOOK (UazAPI / Evolution API) ============
  
  app.post("/api/webhook/whatsapp/:barbershopId", async (req, res) => {
    try {
      const { barbershopId } = req.params;
      const body = req.body;
      
      console.log('[Webhook] ========== NOVA MENSAGEM ==========');
      console.log('[Webhook] Barbearia ID:', barbershopId);
      console.log('[Webhook] Headers:', JSON.stringify(req.headers, null, 2));
      console.log('[Webhook] Body completo:', JSON.stringify(body, null, 2));

      // Verify barbershop exists
      const barbershop = await storage.getBarbershop(barbershopId);
      if (!barbershop) {
        console.log('[Webhook] ERRO: Barbearia não encontrada:', barbershopId);
        return res.status(404).json({ error: 'Barbershop not found' });
      }

      // Get chatbot settings to check webhook token
      const chatbotSettings = await storage.getChatbotSettings(barbershopId);
      
      // Verify webhook token if configured
      const webhookToken = req.headers['x-webhook-token'] || req.query.token;
      if (chatbotSettings?.webhookToken && webhookToken !== chatbotSettings.webhookToken) {
        console.log('[Webhook] ERRO: Token verification failed');
        return res.status(401).json({ error: 'Invalid webhook token' });
      }

      let phone = '';
      let message = '';
      let isFromAdmin = false;
      let isFromApi = false;

      // Detectar formato e extrair dados
      console.log('[Webhook] Detectando formato...');
      console.log('[Webhook] body.EventType:', body.EventType);
      console.log('[Webhook] body.event:', body.event);
      console.log('[Webhook] body.message:', body.message ? 'presente' : 'ausente');
      console.log('[Webhook] body.data:', body.data ? 'presente' : 'ausente');

      const cleanWhatsAppId = (raw: string): string => {
        if (!raw) return '';
        return raw.replace(/@s\.whatsapp\.net$/i, '').replace(/@lid$/i, '').replace(/@c\.us$/i, '').replace(/[^\d]/g, '');
      };

      // UazAPI formato real (EventType com body.message)
      if (body.EventType === 'messages' && body.message) {
        console.log('[Webhook] Formato: UazAPI real (EventType=messages, body.message)');
        const msg = body.message;
        const chat = body.chat;
        console.log('[Webhook] RAW fields: sender_pn=', msg.sender_pn, 'sender=', msg.sender, 'chatid=', msg.chatid, 'chat.phone=', chat?.phone);
        phone = cleanWhatsAppId(msg.sender_pn)
          || cleanWhatsAppId(msg.sender)
          || cleanWhatsAppId(msg.chatid)
          || cleanWhatsAppId(chat?.wa_lastMessageSender)
          || cleanWhatsAppId(chat?.wa_chatid)
          || cleanWhatsAppId(chat?.phone)
          || '';
        message = msg.text || msg.content || msg.body || chat?.wa_lastMessageTextVote || '';
        isFromAdmin = msg.fromMe === true;
        isFromApi = msg.wasSentByApi === true;
        console.log('[Webhook] Após cleanWhatsAppId: phone=', phone, 'message:', message);
      }
      // UazAPI format com event minúsculo "messages"
      else if (body.event === 'messages' && body.data) {
        console.log('[Webhook] Formato: UazAPI com event=messages');
        const data = body.data;
        phone = cleanWhatsAppId(data.from) || cleanWhatsAppId(data.sender) || cleanWhatsAppId(data.remoteJid) || '';
        message = data.body || data.text || data.message?.conversation || '';
        isFromAdmin = data.fromMe === true;
        isFromApi = data.wasSentByApi === true;
      }
      // UazAPI formato direto (sem event wrapper)
      else if (body.chatid || body.sender) {
        console.log('[Webhook] Formato: UazAPI direto (chatid/sender)');
        phone = cleanWhatsAppId(body.sender) || cleanWhatsAppId(body.chatid) || cleanWhatsAppId(body.from) || '';
        message = body.text || body.body || (typeof body.message === 'string' ? body.message : '') || '';
        isFromAdmin = body.fromMe === true;
        isFromApi = body.wasSentByApi === true;
      }
      // Evolution API message format
      else if (body.event === 'messages.upsert' && body.data?.message) {
        console.log('[Webhook] Formato: Evolution API messages.upsert');
        phone = cleanWhatsAppId(body.data.key?.remoteJid) || '';
        message = body.data.message?.conversation || body.data.message?.extendedTextMessage?.text || '';
        isFromAdmin = body.data.key?.fromMe === true;
      }
      // Fallback: tentar extrair de qualquer campo
      else if (body.from || body.phone || body.number) {
        console.log('[Webhook] Formato: Fallback genérico');
        phone = cleanWhatsAppId(body.from || body.phone || body.number || '');
        message = body.body || body.text || (typeof body.message === 'string' ? body.message : '') || '';
        isFromAdmin = body.fromMe === true;
        isFromApi = body.wasSentByApi === true;
      }

      // Ignorar mensagens de grupo
      if (phone.includes('@g.us')) {
        console.log('[Webhook] Ignorando: mensagem de grupo');
        return res.json({ success: true, skipped: true, reason: 'group_message' });
      }

      const phoneBeforeNormalize = phone;
      phone = normalizePhone(phone);

      console.log('[Webhook] DIAGNÓSTICO NORMALIZAÇÃO:');
      console.log('[Webhook]   Antes normalizePhone:', phoneBeforeNormalize);
      console.log('[Webhook]   Após normalizePhone:', phone);
      console.log('[Webhook]   Message:', message);
      console.log('[Webhook]   isFromAdmin:', isFromAdmin);
      console.log('[Webhook]   isFromApi:', isFromApi);

      // Se foi enviada pela API, ignorar (evita loop)
      if (isFromApi) {
        console.log('[Webhook] Ignorando: mensagem enviada pela API (evita loop)');
        return res.json({ success: true, skipped: true, reason: 'sent_by_api' });
      }

      // Se é mensagem do admin (fromMe = true), pausar IA para esse cliente
      if (isFromAdmin && phone) {
        console.log('[Webhook] Mensagem do ADMIN detectada - pausando IA por 15 minutos para:', phone);
        const conversation = await storage.getChatConversation(barbershopId, phone);
        if (conversation) {
          const pauseUntil = new Date();
          pauseUntil.setMinutes(pauseUntil.getMinutes() + 15);
          await storage.updateChatConversation(conversation.id, { 
            humanTakeoverUntil: pauseUntil 
          });
          console.log('[Webhook] IA pausada até:', pauseUntil.toISOString());
        }
        return res.json({ success: true, skipped: true, reason: 'admin_message' });
      }

      if (!phone) {
        console.log('[Webhook] ERRO: Phone vazio, não processando');
        return res.json({ success: true, skipped: true, reason: 'empty_phone' });
      }

      // Verificar se IA está pausada para esse cliente (antes de qualquer resposta automática)
      const existingConversation = await storage.getChatConversation(barbershopId, phone);
      if (existingConversation?.humanTakeoverUntil) {
        const now = new Date();
        const takeoverUntil = new Date(existingConversation.humanTakeoverUntil);
        if (now < takeoverUntil) {
          console.log('[Webhook] IA pausada (admin assumiu). Pausado até:', takeoverUntil.toISOString());
          return res.json({ success: true, skipped: true, reason: 'human_takeover_active' });
        } else {
          // Tempo expirou, limpar o campo
          await storage.updateChatConversation(existingConversation.id, { 
            humanTakeoverUntil: null 
          });
          console.log('[Webhook] Pausa expirou, IA retomando controle');
        }
      }

      // Fallback para mensagens não-texto (áudio, imagem, sticker, etc)
      if (!message) {
        console.log('[Webhook] Mensagem não-texto detectada (áudio, imagem, sticker, etc). Respondendo pedindo texto.');
        const chatbotConfig = await storage.getChatbotSettings(barbershopId);
        const notifSettings = await storage.getNotificationSettings(barbershopId);
        const fallbackProvider = getProvider(notifSettings?.provider);
        const fallbackMsg = "Desculpe, só consigo entender mensagens de texto. 📝 Poderia digitar o que precisa, por favor?";
        await fallbackProvider.send({ to: phone, message: fallbackMsg }, chatbotConfig?.uazapiInstanceToken ?? undefined);
        return res.json({ success: true, handled: true, reason: 'non_text_message_fallback' });
      }

      const lookupClient = await storage.getClientByPhone(barbershopId, phone);
      console.log('[Webhook] DIAGNÓSTICO CLIENT LOOKUP:');
      console.log('[Webhook]   Phone usado na query:', phone);
      console.log('[Webhook]   Cliente encontrado:', lookupClient ? `SIM (id=${lookupClient.id}, name=${lookupClient.name})` : 'NÃO');

      console.log('[Webhook] Processando com chatbot...');
      const response = await handleIncomingMessage({
        barbershopId,
        phone,
        message,
      });

      console.log('[Webhook] Resposta do chatbot:', response);

      // Send response via configured provider with fallback
      if (response.message && !response.shouldEndConversation) {
        const chatbotConfig = await storage.getChatbotSettings(barbershopId);
        const settings = await storage.getNotificationSettings(barbershopId);
        const configuredProvider = getProvider(settings?.provider);
        
        console.log('[Webhook] Tentando enviar via provider configurado:', configuredProvider.name);
        let sendResult = await configuredProvider.send(
          { to: phone, message: response.message },
          chatbotConfig?.uazapiInstanceToken ?? undefined
        );
        
        // Se falhou e não é o provider padrão, tenta fallback
        if (!sendResult.success) {
          console.error('[Webhook] Falha com provider configurado:', sendResult.error);
          const fallbackProvider = getProvider(); // Pega o melhor disponível
          
          if (fallbackProvider.name !== configuredProvider.name) {
            console.log('[Webhook] Tentando fallback com:', fallbackProvider.name);
            sendResult = await fallbackProvider.send(
              { to: phone, message: response.message },
              chatbotConfig?.uazapiInstanceToken ?? undefined
            );
          }
        }
        
        console.log('[Webhook] Resultado final do envio:', sendResult);
        if (!sendResult.success) {
          console.error('[Webhook] ERRO: Não foi possível enviar resposta:', sendResult.error);
        }
      }

      console.log('[Webhook] ========== FIM ==========');
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Webhook] ERRO CRÍTICO:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook verification for Evolution API / UazAPI
  app.get("/api/webhook/whatsapp/:barbershopId", async (req, res) => {
    res.json({ status: 'ok', barbershopId: req.params.barbershopId });
  });

  // ============ TEST ENDPOINT - Send WhatsApp Message ============
  app.post("/api/test/send-whatsapp", async (req, res) => {
    try {
      const { phone, message } = req.body;
      
      if (!phone || !message) {
        return res.status(400).json({ error: "Phone e message são obrigatórios" });
      }

      const provider = getProvider();
      console.log('[Test] Enviando mensagem via provider:', provider.name);
      
      const result = await provider.send({ to: phone, message });
      
      res.json({
        provider: provider.name,
        result
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ DEBUG ENDPOINT - Test Full Notification Flow ============
  app.post("/api/debug/test-notification", requireAuth, async (req, res) => {
    try {
      const { clientId, phone } = req.body;
      const barbershopId = req.session.barbershopId!;
      const logs: string[] = [];
      
      logs.push(`[1] Iniciando teste de notificação para barbearia ${barbershopId}`);
      
      // 1. Verificar configurações de notificação
      const settings = await storage.getNotificationSettings(barbershopId);
      logs.push(`[2] Configurações: ${settings ? JSON.stringify({
        welcomeEnabled: settings.welcomeEnabled,
        confirmationEnabled: settings.confirmationEnabled,
        provider: settings.provider
      }) : 'NÃO ENCONTRADAS'}`);
      
      // 2. Verificar barbearia
      const barbershop = await storage.getBarbershop(barbershopId);
      logs.push(`[3] Barbearia: ${barbershop?.name || 'NÃO ENCONTRADA'}`);
      
      // 3. Tentar criar mensagem agendada
      const testPhone = phone || '11999999999';
      logs.push(`[4] Criando mensagem de teste para telefone: ${testPhone}`);
      
      try {
        const scheduledMsg = await storage.createScheduledMessage({
          barbershopId,
          clientId: clientId || null,
          appointmentId: null,
          phone: testPhone,
          message: `[TESTE DEBUG] Notificação de teste - ${new Date().toLocaleString('pt-BR')}`,
          type: 'welcome',
          scheduledFor: new Date(),
          status: 'pending',
        });
        logs.push(`[5] Mensagem criada com sucesso! ID: ${scheduledMsg.id}`);
        
        // 4. Verificar se foi salva
        const pendingMsgs = await storage.getPendingMessages();
        logs.push(`[6] Total de mensagens pendentes: ${pendingMsgs.length}`);
        
        // 5. Tentar enviar imediatamente
        const provider = getProvider(settings?.provider);
        logs.push(`[7] Provider selecionado: ${provider.name}, configurado: ${provider.isConfigured()}`);
        
        const sendResult = await provider.send({
          to: testPhone,
          message: scheduledMsg.message,
        });
        logs.push(`[8] Resultado do envio: ${JSON.stringify(sendResult)}`);
        
        if (sendResult.success) {
          await storage.updateScheduledMessage(scheduledMsg.id, {
            status: 'sent',
            sentAt: new Date(),
          } as any);
          logs.push(`[9] Mensagem marcada como enviada`);
        }
        
        res.json({
          success: true,
          logs,
          scheduledMessageId: scheduledMsg.id,
          sendResult
        });
      } catch (createError: any) {
        logs.push(`[ERRO] Falha ao criar mensagem: ${createError.message}`);
        res.status(500).json({ success: false, logs, error: createError.message });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ FIXED EXPENSES (Despesas Fixas) ============
  
  app.get("/api/fixed-expenses", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const expenses = await storage.getFixedExpenses(barbershopId);
      res.json(expenses);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post("/api/fixed-expenses", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const data = insertFixedExpenseSchema.parse({
        ...req.body,
        barbershopId
      });
      const expense = await storage.createFixedExpense(data);
      res.status(201).json(expense);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  app.put("/api/fixed-expenses/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const barbershopId = req.session.barbershopId!;
      
      // Verify ownership
      const existing = await storage.getFixedExpense(id);
      if (!existing || existing.barbershopId !== barbershopId) {
        return res.status(404).json({ error: "Expense not found" });
      }
      
      const expense = await storage.updateFixedExpense(id, req.body);
      res.json(expense);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  app.delete("/api/fixed-expenses/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const barbershopId = req.session.barbershopId!;
      
      // Verify ownership
      const existing = await storage.getFixedExpense(id);
      if (!existing || existing.barbershopId !== barbershopId) {
        return res.status(404).json({ error: "Expense not found" });
      }
      
      await storage.deleteFixedExpense(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ============ DRE REPORT (Relatório Financeiro) ============
  
  app.get("/api/reports/dre", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const { startDate, endDate } = req.query;

      // Parse dates usando horário de Brasília (GMT-3) para evitar bug de fuso
      const todayBrazil = getBrazilDateString();
      const start = startDate
        ? brazilDateToUTCStart(startDate as string)
        : brazilDateToUTCStart(todayBrazil.slice(0, 8) + '01'); // Primeiro dia do mês atual
      const end = endDate
        ? brazilDateToUTCEnd(endDate as string)
        : brazilDateToUTCEnd(todayBrazil);

      const chartStartStr = (startDate as string) || utcInstantToBrazilDateKey(start);
      const chartEndStr = (endDate as string) || utcInstantToBrazilDateKey(end);
      
      // Get barbershop for fee rates
      const barbershop = await storage.getBarbershop(barbershopId);
      const feeCredit = parseFloat(barbershop?.feeCredit || "0");
      const feeDebit = parseFloat(barbershop?.feeDebit || "0");
      const feePix = parseFloat(barbershop?.feePix || "0");
      
      // Get all closed comandas in date range
      const allComandas = await storage.getComandas(barbershopId, "closed");
      const comandas = allComandas.filter(c => {
        const date = new Date(c.paidAt || c.createdAt);
        return date >= start && date <= end;
      });
      
      // Get barbers for names
      const barbers = await storage.getBarbers(barbershopId);
      const barberMap = new Map(barbers.map(b => [b.id, b.name]));
      
      // Get clients for names
      const clients = await storage.getClients(barbershopId);
      const clientMap = new Map(clients.map(c => [c.id, c.name]));
      
      // Get services and products for names
      const services = await storage.getServices(barbershopId);
      const serviceMap = new Map(services.map(s => [s.id, s.name]));
      
      const products = await storage.getProducts(barbershopId);
      const productMap = new Map(products.map(p => [p.id, p.name]));
      
      const packages = await storage.getPackages(barbershopId);
      const packageMap = new Map(packages.map(p => [p.id, p.name]));
      
      // Calculate sales by payment method
      let cashTotal = 0, pixTotal = 0, creditTotal = 0, debitTotal = 0;
      let cashFees = 0, pixFees = 0, creditFees = 0, debitFees = 0;
      
      const transactions: any[] = [];
      const internalConsumptions: any[] = []; // Consumos internos dos profissionais
      
      // Data structures for barber panel
      const barberStats: Map<string, { 
        name: string;
        totalProduced: number;
        serviceCount: number;
        commission: number;
      }> = new Map();
      
      // Data structures for product panel
      const productSales: Map<string, {
        name: string;
        qtySold: number;
        totalSold: number;
        commission: number;
      }> = new Map();

      const dailyGross = new Map<string, number>();
      const serviceRevenue = new Map<string, { serviceId: string; name: string; total: number }>();
      
      // Initialize barber stats
      barbers.forEach(b => {
        barberStats.set(b.id, {
          name: b.name,
          totalProduced: 0,
          serviceCount: 0,
          commission: 0
        });
      });
      
      // Get all client packages for packageValue calculation in DRE
      const allClientPackages = await storage.getAllClientPackages(barbershopId);
      
      // Get commissions for the period
      const allCommissions = await storage.getCommissions(
        barbershopId,
        undefined,
        start,
        end
      );
      
      // Calculate commission totals per barber
      const pendingCommissions = allCommissions.filter(c => !c.paid && c.type !== 'deduction');
      pendingCommissions.forEach(c => {
        const existing = barberStats.get(c.barberId);
        if (existing) {
          existing.commission += parseFloat(c.amount || '0');
        }
      });
      
      for (const comanda of comandas) {
        const total = parseFloat(comanda.total || "0");
        const date = new Date(comanda.paidAt || comanda.createdAt);
        
        // Get comanda items for details with real names
        const items = await storage.getComandaItems(comanda.id);
        
        // Separar comandas de consumo interno (todos os itens são isBarberPurchase e total é 0)
        const allItemsAreBarberPurchase = items.length > 0 && items.every(i => i.isBarberPurchase);
        if (allItemsAreBarberPurchase && total === 0) {
          // Registrar como consumo interno com o valor original do produto
          const itemDescriptions: string[] = [];
          let consumptionValue = 0;
          for (const item of items) {
            const originalPrice = parseFloat(item.originalPrice?.toString() || item.unitPrice?.toString() || '0');
            consumptionValue += originalPrice * item.quantity;
            if (item.productId && productMap.has(item.productId)) {
              itemDescriptions.push(productMap.get(item.productId)!);
            } else {
              itemDescriptions.push('Produto');
            }
          }
          
          internalConsumptions.push({
            id: comanda.id,
            date: date.toISOString(),
            barberName: barberMap.get(comanda.barberId) || "Desconhecido",
            items: itemDescriptions.join(', '),
            value: consumptionValue
          });
          continue; // Não incluir nas vendas regulares
        }
        
        // Verificar se comanda é apenas venda de pacote (não é produção de barbeiro)
        const isPackageSaleOnly = items.length > 0 && items.every(i => i.type === 'package_sale' || i.type === 'subscription_sale');
        
        // Update barber stats (não somar venda de pacote no total produzido)
        const barberStat = barberStats.get(comanda.barberId);
        if (barberStat && !isPackageSaleOnly) {
          barberStat.totalProduced += total;
        }
        
        // Process items for stats and descriptions
        const itemDescriptions: string[] = [];
        for (const item of items) {
          // Count services for barber (including package_use)
          if ((item.type === 'service' || item.type === 'package_use') && barberStat) {
            barberStat.serviceCount += item.quantity;
          }
          
          // Para package_use, somar o valor proporcional do pacote como produção do barbeiro
          if (item.type === 'package_use' && item.clientPackageId && barberStat) {
            const clientPkg = allClientPackages.find(cp => cp.id === item.clientPackageId);
            if (clientPkg) {
              const pkg = packages.find(p => p.id === clientPkg.packageId);
              if (pkg) {
                const baseAmount = clientPkg.netAmount ? parseFloat(clientPkg.netAmount) : parseFloat(pkg.price);
                const totalUses = clientPkg.quantityOriginal || pkg.quantity || 1;
                const packageValue = baseAmount / totalUses;
                if (isFinite(packageValue) && packageValue > 0) {
                  barberStat.totalProduced += packageValue * item.quantity;
                }
              }
            }
          }
          
          // Track product sales
          if (item.type === 'product' && item.productId) {
            const product = products.find(p => p.id === item.productId);
            const existing = productSales.get(item.productId);
            const itemTotal = parseFloat(item.total || '0');
            const productCommission = product?.hasCommission && product?.commissionPercentage 
              ? itemTotal * parseFloat(product.commissionPercentage) / 100 
              : 0;
            
            if (existing) {
              existing.qtySold += item.quantity;
              existing.totalSold += itemTotal;
              existing.commission += productCommission;
            } else {
              productSales.set(item.productId, {
                name: productMap.get(item.productId) || 'Produto',
                qtySold: item.quantity,
                totalSold: itemTotal,
                commission: productCommission
              });
            }
          }

          // Receita por serviço (extensão DRE)
          if (item.type === 'service' && item.serviceId) {
            const itemTotal = parseFloat(item.total || '0');
            const sid = item.serviceId;
            const name = serviceMap.get(sid) || 'Serviço';
            const cur = serviceRevenue.get(sid);
            if (cur) cur.total += itemTotal;
            else serviceRevenue.set(sid, { serviceId: sid, name, total: itemTotal });
          }
          if (item.type === 'package_use' && item.clientPackageId) {
            const clientPkg = allClientPackages.find(cp => cp.id === item.clientPackageId);
            if (clientPkg) {
              const pkg = packages.find(p => p.id === clientPkg.packageId);
              if (pkg) {
                const baseAmount = clientPkg.netAmount ? parseFloat(clientPkg.netAmount) : parseFloat(pkg.price);
                const totalUses = clientPkg.quantityOriginal || pkg.quantity || 1;
                const packageValue = baseAmount / totalUses;
                if (isFinite(packageValue) && packageValue > 0) {
                  const add = packageValue * item.quantity;
                  const sid = pkg.serviceId;
                  const name = serviceMap.get(sid) || 'Serviço';
                  const cur = serviceRevenue.get(sid);
                  if (cur) cur.total += add;
                  else serviceRevenue.set(sid, { serviceId: sid, name, total: add });
                }
              }
            }
          }
          
          // Build item description
          if (item.serviceId && serviceMap.has(item.serviceId)) {
            itemDescriptions.push(serviceMap.get(item.serviceId)!);
          } else if (item.productId && productMap.has(item.productId)) {
            itemDescriptions.push(productMap.get(item.productId)!);
          } else if (item.packageId && packageMap.has(item.packageId)) {
            itemDescriptions.push(packageMap.get(item.packageId)!);
          } else {
            itemDescriptions.push(item.type === 'service' ? 'Serviço' : item.type === 'product' ? 'Produto' : item.type === 'package_sale' ? 'Pacote' : item.type === 'package_use' ? 'Uso Pacote' : item.type === 'subscription_sale' ? 'Assinatura' : 'Item');
          }
        }
        
        // Calcular comissão total desta comanda
        const comandaItemIds = new Set(items.map(i => i.id));
        const comandaCommissions = allCommissions.filter(c => 
          c.comandaItemId && comandaItemIds.has(c.comandaItemId) && c.type !== 'deduction' && c.type !== 'fee_deduction'
        );
        const comandaCommissionTotal = comandaCommissions.reduce((sum, c) => {
          const amount = parseFloat(c.amount || '0');
          return sum + (amount > 0 ? amount : 0);
        }, 0);
        
        const baseTransaction = {
          id: comanda.id,
          date: date.toISOString(),
          barberName: isPackageSaleOnly ? null : (barberMap.get(comanda.barberId) || "Desconhecido"),
          clientName: comanda.clientId ? clientMap.get(comanda.clientId) || "Cliente" : "Sem cliente",
          items: itemDescriptions,
          total: total,
          commission: comandaCommissionTotal
        };

        const snapCash = cashTotal;
        const snapPix = pixTotal;
        const snapCredit = creditTotal;
        const snapDebit = debitTotal;
        
        if (comanda.paymentMethod === 'split' && comanda.paymentDetails) {
          const details = comanda.paymentDetails as any;
          if (details.split) {
            for (const split of details.split) {
              const amount = parseFloat(split.amount || 0);
              if (split.method === 'cash') {
                cashTotal += amount;
                transactions.push({ ...baseTransaction, paymentMethod: 'Dinheiro', amount, fee: 0, net: amount });
              } else if (split.method === 'pix') {
                pixTotal += amount;
                const fee = amount * feePix / 100;
                pixFees += fee;
                transactions.push({ ...baseTransaction, paymentMethod: 'PIX', amount, fee, net: amount - fee });
              } else if (split.method === 'credit') {
                creditTotal += amount;
                const fee = amount * feeCredit / 100;
                creditFees += fee;
                transactions.push({ ...baseTransaction, paymentMethod: 'Crédito', amount, fee, net: amount - fee });
              } else if (split.method === 'debit') {
                debitTotal += amount;
                const fee = amount * feeDebit / 100;
                debitFees += fee;
                transactions.push({ ...baseTransaction, paymentMethod: 'Débito', amount, fee, net: amount - fee });
              } else if (split.method === 'card') {
                // Generic card - assume credit
                creditTotal += amount;
                const fee = amount * feeCredit / 100;
                creditFees += fee;
                transactions.push({ ...baseTransaction, paymentMethod: 'Cartão', amount, fee, net: amount - fee });
              }
            }
          }
        } else {
          let fee = 0;
          let paymentMethodLabel = '';
          
          switch (comanda.paymentMethod) {
            case 'cash':
              cashTotal += total;
              paymentMethodLabel = 'Dinheiro';
              break;
            case 'pix':
              pixTotal += total;
              fee = total * feePix / 100;
              pixFees += fee;
              paymentMethodLabel = 'PIX';
              break;
            case 'credit':
              creditTotal += total;
              fee = total * feeCredit / 100;
              creditFees += fee;
              paymentMethodLabel = 'Crédito';
              break;
            case 'debit':
              debitTotal += total;
              fee = total * feeDebit / 100;
              debitFees += fee;
              paymentMethodLabel = 'Débito';
              break;
            case 'card':
              creditTotal += total;
              fee = total * feeCredit / 100;
              creditFees += fee;
              paymentMethodLabel = 'Cartão';
              break;
            case 'package_use': {
              paymentMethodLabel = 'Pacote Uso';
              let packageUseValue = 0;
              for (const item of items) {
                if (item.type === 'package_use' && item.clientPackageId) {
                  const clientPkg = allClientPackages.find(cp => cp.id === item.clientPackageId);
                  if (clientPkg) {
                    const pkg = packages.find(p => p.id === clientPkg.packageId);
                    if (pkg) {
                      const baseAmount = clientPkg.netAmount ? parseFloat(clientPkg.netAmount) : parseFloat(pkg.price);
                      const totalUses = clientPkg.quantityOriginal || pkg.quantity || 1;
                      const perUseValue = baseAmount / totalUses;
                      if (isFinite(perUseValue) && perUseValue > 0) {
                        packageUseValue += perUseValue * item.quantity;
                      }
                    }
                  }
                }
              }
              transactions.push({
                ...baseTransaction,
                paymentMethod: paymentMethodLabel,
                amount: packageUseValue,
                fee: 0,
                net: packageUseValue
              });
              break;
            }
            default:
              cashTotal += total;
              paymentMethodLabel = 'Outro';
          }
          
          if (comanda.paymentMethod !== 'package_use') {
            transactions.push({
              ...baseTransaction,
              paymentMethod: paymentMethodLabel,
              amount: total,
              fee,
              net: total - fee
            });
          }
        }

        const dateKey = utcInstantToBrazilDateKey(date);
        const grossDelta =
          (cashTotal - snapCash) +
          (pixTotal - snapPix) +
          (creditTotal - snapCredit) +
          (debitTotal - snapDebit);
        dailyGross.set(dateKey, (dailyGross.get(dateKey) || 0) + grossDelta);
      }
      
      // Get fixed expenses for the period
      const fixedExpenses = await storage.getFixedExpenses(barbershopId);
      const activeExpenses = fixedExpenses.filter(e => e.active);
      
      // Calculate monthly expense total (prorate if not full month)
      const daysInPeriod = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      const periodRatio = Math.min(daysInPeriod / daysInMonth, 1);
      
      const totalFixedExpenses = activeExpenses.reduce((sum, e) => {
        const amount = parseFloat(e.amount);
        if (e.recurrence === 'monthly') {
          return sum + (amount * periodRatio);
        } else if (e.recurrence === 'weekly') {
          return sum + (amount * (daysInPeriod / 7));
        } else if (e.recurrence === 'daily') {
          return sum + (amount * daysInPeriod);
        }
        return sum + amount;
      }, 0);
      
      // Calculate totals
      const grossTotal = cashTotal + pixTotal + creditTotal + debitTotal;
      const totalFees = cashFees + pixFees + creditFees + debitFees;
      const netTotal = grossTotal - totalFees;
      
      // Calculate total commissions to pay
      const totalCommissions = pendingCommissions.reduce((sum, c) => sum + parseFloat(c.amount || '0'), 0);
      
      // Saldo Líquido Real = Bruto - Taxas - Comissões
      const netRealBalance = grossTotal - totalFees - totalCommissions;
      
      const result = netTotal - totalFixedExpenses;
      
      // Prepare barber panel data
      const barberPanel = Array.from(barberStats.values())
        .filter(b => b.totalProduced > 0 || b.serviceCount > 0 || b.commission > 0)
        .sort((a, b) => b.totalProduced - a.totalProduced);
      
      // Prepare product sales panel data
      const productSalesPanel = Array.from(productSales.values())
        .sort((a, b) => b.totalSold - a.totalSold);
      
      // Prepare stock panel data
      const stockPanel = products
        .filter(p => p.active)
        .map(p => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
          stockValue: p.stock * parseFloat(p.price)
        }))
        .sort((a, b) => b.stockValue - a.stockValue);

      const chart = { points: buildChartPoints(dailyGross, chartStartStr, chartEndStr) };
      const serviceRevenueSorted = Array.from(serviceRevenue.values()).sort((a, b) => b.total - a.total);

      const periodMs = end.getTime() - start.getTime() + 1;
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - periodMs + 1);
      const prevComandas = allComandas.filter(c => {
        const d = new Date(c.paidAt || c.createdAt);
        return d >= prevStart && d <= prevEnd;
      });
      let previousGrossTotal = 0;
      for (const comanda of prevComandas) {
        const items = await storage.getComandaItems(comanda.id);
        const allItemsAreBarberPurchase = items.length > 0 && items.every(i => i.isBarberPurchase);
        const t = parseFloat(comanda.total || "0");
        if (allItemsAreBarberPurchase && t === 0) continue;
        const b = getComandaGrossBreakdown(comanda);
        previousGrossTotal += sumGrossFromBreakdown(b);
      }

      const clientsFunnelStats = await storage.getClientsFunnelStats(barbershopId);
      const inactiveCount = clientsFunnelStats.counts.cliente_inativo ?? 0;
      const alerts: Array<{ type: string; severity: 'warning' | 'info'; message: string }> = [];
      if (previousGrossTotal > 0) {
        const pct = ((grossTotal - previousGrossTotal) / previousGrossTotal) * 100;
        if (pct <= -15) {
          alerts.push({
            type: 'revenue_vs_previous',
            severity: 'warning',
            message: `Faturamento caiu ${Math.round(Math.abs(pct))}% em relação ao período anterior equivalente.`,
          });
        }
      }
      if (inactiveCount >= 3) {
        alerts.push({
          type: 'inactive_clients',
          severity: 'info',
          message: `${inactiveCount} clientes inativos no funil.`,
        });
      }
      
      res.json({
        period: { start: start.toISOString(), end: end.toISOString() },
        summary: {
          grossTotal,
          totalFees,
          netTotal,
          fixedExpenses: totalFixedExpenses,
          totalCommissions,
          netRealBalance,
          result
        },
        barberPanel,
        productSalesPanel,
        stockPanel,
        chart,
        serviceRevenue: serviceRevenueSorted,
        alerts,
        previousPeriod: {
          start: prevStart.toISOString(),
          end: prevEnd.toISOString(),
          grossTotal: previousGrossTotal
        },
        funnelSnapshot: {
          inactiveClients: inactiveCount,
          returnRate: clientsFunnelStats.returnRate,
          counts: clientsFunnelStats.counts
        },
        byPaymentMethod: {
          cash: { gross: cashTotal, fees: cashFees, net: cashTotal - cashFees },
          pix: { gross: pixTotal, fees: pixFees, net: pixTotal - pixFees },
          credit: { gross: creditTotal, fees: creditFees, net: creditTotal - creditFees },
          debit: { gross: debitTotal, fees: debitFees, net: debitTotal - debitFees }
        },
        feeRates: { credit: feeCredit, debit: feeDebit, pix: feePix },
        fixedExpensesList: activeExpenses.map(e => ({
          id: e.id,
          name: e.name,
          category: e.category,
          amount: parseFloat(e.amount),
          recurrence: e.recurrence
        })),
        transactions: transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        transactionCount: transactions.length,
        internalConsumptions: internalConsumptions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        internalConsumptionTotal: internalConsumptions.reduce((sum, c) => sum + c.value, 0)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ DEBUG ENDPOINT - Check Notification Status ============
  app.get("/api/debug/notifications-status", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      
      const settings = await storage.getNotificationSettings(barbershopId);
      const pendingMsgs = await storage.getPendingMessages();
      const allMsgs = await storage.getScheduledMessages(barbershopId);
      const provider = getProvider(settings?.provider);
      
      res.json({
        barbershopId,
        settings: settings ? {
          provider: settings.provider,
          welcomeEnabled: settings.welcomeEnabled,
          confirmationEnabled: settings.confirmationEnabled,
          reminder1DayEnabled: settings.reminder1DayEnabled,
          reminder1HourEnabled: settings.reminder1HourEnabled,
          cancellationEnabled: settings.cancellationEnabled,
        } : null,
        provider: {
          name: provider.name,
          configured: provider.isConfigured(),
        },
        messagesTotal: allMsgs.length,
        messagesPending: pendingMsgs.length,
        recentMessages: allMsgs.slice(0, 10).map(m => ({
          id: m.id,
          type: m.type,
          phone: m.phone,
          status: m.status,
          scheduledFor: m.scheduledFor,
          sentAt: m.sentAt,
          error: m.error,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Retry mensagens falhadas ============
  app.post("/api/scheduled-messages/retry-failed", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const count = await storage.resetFailedMessages(barbershopId);
      res.json({ success: true, reset: count, message: `${count} mensagem(ns) resetada(s) para reenvio` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Listar mensagens agendadas ============
  app.get("/api/scheduled-messages", requireAuth, async (req, res) => {
    try {
      const barbershopId = req.session.barbershopId!;
      const status = req.query.status as string | undefined;
      const msgs = await storage.getScheduledMessages(barbershopId, status);
      res.json(msgs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/migrate-phones", requireAuth, async (req: any, res) => {
    try {
      const userId = req.session?.userId;
      const user = userId ? await storage.getUserById(userId) : null;
      if (!user) return res.status(401).json({ error: "Não autenticado" });

      const barbershopId = user.barbershopId;
      const dryRun = req.query.dryRun === 'true';
      const log: string[] = [];

      log.push(`=== MIGRAÇÃO DE TELEFONES (${dryRun ? 'DRY RUN' : 'EXECUTANDO'}) ===`);
      log.push(`Barbearia: ${barbershopId}`);

      const allClients = await storage.getClients(barbershopId);
      log.push(`Total de clientes: ${allClients.length}`);

      const phoneMap = new Map<string, typeof allClients>();

      let normalizedCount = 0;
      let nameFixedCount = 0;
      let duplicatesFound = 0;
      let duplicatesRemoved = 0;

      for (const client of allClients) {
        const normalized = normalizePhone(client.phone);
        const isPhoneName = /^[\d\s+()-]+$/.test((client.name || '').trim());

        if (client.phone !== normalized) {
          log.push(`[NORMALIZAR] id=${client.id} "${client.name}" phone: "${client.phone}" → "${normalized}"`);
          if (!dryRun) {
            await storage.updateClient(client.id, { phone: normalized });
          }
          normalizedCount++;
        }

        if (isPhoneName) {
          log.push(`[NOME_INVALIDO] id=${client.id} name="${client.name}" phone="${normalized}" — nome é número de telefone`);
          nameFixedCount++;
        }

        const key = normalized;
        if (!phoneMap.has(key)) {
          phoneMap.set(key, []);
        }
        phoneMap.get(key)!.push({ ...client, phone: normalized });
      }

      const phoneKeys = Array.from(phoneMap.keys());
      for (const normalizedPhone of phoneKeys) {
        const clients = phoneMap.get(normalizedPhone)!;
        if (clients.length <= 1) continue;

        duplicatesFound++;
        log.push(`[DUPLICATA] phone=${normalizedPhone} — ${clients.length} clientes:`);

        const isPhoneNameRegex = /^[\d\s+()-]+$/;
        const realNameClients = clients.filter((c: any) => !isPhoneNameRegex.test((c.name || '').trim()));
        const phoneNameClients = clients.filter((c: any) => isPhoneNameRegex.test((c.name || '').trim()));

        if (realNameClients.length >= 1 && phoneNameClients.length >= 1) {
          const keeper = realNameClients[0];
          log.push(`  MANTER: id=${keeper.id} name="${keeper.name}"`);

          for (const dup of phoneNameClients) {
            log.push(`  REMOVER: id=${dup.id} name="${dup.name}" (nome é telefone)`);
            if (!dryRun) {
              try {
                await storage.deleteClient(dup.id);
                duplicatesRemoved++;
              } catch (e: any) {
                log.push(`  ERRO ao remover ${dup.id}: ${e.message} (pode ter dados vinculados)`);
              }
            } else {
              duplicatesRemoved++;
            }
          }
        } else {
          log.push(`  MANUAL: todos têm nome real ou todos têm nome=phone, não é seguro auto-unificar`);
          clients.forEach((c: any) => log.push(`    id=${c.id} name="${c.name}" phone="${c.phone}"`));
        }
      }

      const allConversations = await storage.getChatConversationsByBarbershop(barbershopId);
      let convNormalizedCount = 0;
      if (allConversations) {
        log.push(`\nConversas encontradas: ${allConversations.length}`);
        for (const conv of allConversations) {
          const normalized = normalizePhone(conv.phone);
          if (conv.phone !== normalized) {
            log.push(`[CONV_NORMALIZAR] id=${conv.id} phone: "${conv.phone}" → "${normalized}"`);
            if (!dryRun) {
              await storage.updateChatConversation(conv.id, { phone: normalized });
            }
            convNormalizedCount++;
          }
        }
      }

      log.push(`\n=== RESUMO ===`);
      log.push(`Telefones normalizados (clientes): ${normalizedCount}`);
      log.push(`Nomes inválidos (name=phone): ${nameFixedCount}`);
      log.push(`Duplicatas encontradas: ${duplicatesFound}`);
      log.push(`Duplicatas removidas: ${duplicatesRemoved}`);
      log.push(`Conversas normalizadas: ${convNormalizedCount}`);
      log.push(`Modo: ${dryRun ? 'DRY RUN (nada alterado)' : 'EXECUTADO'}`);

      console.log(log.join('\n'));

      res.json({
        success: true,
        dryRun,
        summary: {
          totalClients: allClients.length,
          phonesNormalized: normalizedCount,
          invalidNames: nameFixedCount,
          duplicatesFound,
          duplicatesRemoved,
          conversationsNormalized: convNormalizedCount,
        },
        log,
      });
    } catch (error: any) {
      console.error('[Migration] Erro:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ CAMPANHAS ============

  // POST /api/clients/filter — preview ao vivo de destinatários
  app.post("/api/clients/filter", requireAuth, async (req, res) => {
    try {
      const filterSchema = z.object({
        mode: z.enum(['all', 'funnel', 'inactive', 'manual']),
        funnelStatuses: z.array(z.string()).optional(),
        inactiveDays: z.number().optional(),
        clientIds: z.array(z.string()).optional(),
      });
      const filter = filterSchema.parse(req.body);
      if (filter.mode === 'funnel' && (!filter.funnelStatuses || filter.funnelStatuses.length === 0)) {
        return res.status(400).json({ error: "Selecione pelo menos um status do funil" });
      }
      if (filter.mode === 'manual' && (!filter.clientIds || filter.clientIds.length === 0)) {
        return res.status(400).json({ error: "Selecione pelo menos um cliente" });
      }
      if (filter.mode === 'inactive' && (!filter.inactiveDays || filter.inactiveDays < 1)) {
        return res.status(400).json({ error: "Informe um número de dias válido (mínimo 1)" });
      }
      const clients = await storage.getClientsFiltered(req.session.barbershopId!, filter);
      res.json({ count: clients.length, clients });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/campaigns — criar e iniciar campanha
  app.post("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const bodySchema = z.object({
        name: z.string().optional(),
        message: z.string().min(1, "Mensagem não pode estar vazia"),
        filter: z.object({
          mode: z.enum(['all', 'funnel', 'inactive', 'manual']),
          funnelStatuses: z.array(z.string()).optional(),
          inactiveDays: z.number().optional(),
          clientIds: z.array(z.string()).optional(),
        }),
        delayMinSeconds: z.number().min(5).default(15),
        delayMaxSeconds: z.number().min(10).default(45),
        dailyLimit: z.number().min(1).max(500).default(100),
      });

      const body = bodySchema.parse(req.body);
      const barbershopId = req.session.barbershopId!;

      const f = body.filter;
      if (f.mode === 'funnel' && (!f.funnelStatuses || f.funnelStatuses.length === 0)) {
        return res.status(400).json({ error: "Selecione pelo menos um status do funil" });
      }
      if (f.mode === 'manual' && (!f.clientIds || f.clientIds.length === 0)) {
        return res.status(400).json({ error: "Selecione pelo menos um cliente" });
      }
      if (f.mode === 'inactive' && (!f.inactiveDays || f.inactiveDays < 1)) {
        return res.status(400).json({ error: "Informe um número de dias válido (mínimo 1)" });
      }

      const barbershop = await storage.getBarbershop(barbershopId);
      const clients = await storage.getClientsFiltered(barbershopId, body.filter);

      if (clients.length === 0) {
        return res.status(400).json({ error: "Nenhum cliente encontrado com o filtro selecionado" });
      }

      const campaign = await storage.createCampaign({
        barbershopId,
        name: body.name,
        message: body.message,
        status: 'sending',
        totalRecipients: clients.length,
        sentCount: 0,
        failedCount: 0,
        delayMinSeconds: body.delayMinSeconds,
        delayMaxSeconds: body.delayMaxSeconds,
        dailyLimit: body.dailyLimit,
      } as any);

      const recipients = clients.map(client => ({
        campaignId: campaign.id,
        barbershopId,
        clientId: client.id,
        phone: client.phone,
        clientName: client.name,
        renderedMessage: renderCampaignMessage(body.message, {
          nome: client.name,
          barbearia: barbershop?.name ?? '',
        }),
        status: 'pending' as const,
      }));

      await storage.createCampaignRecipients(recipients);

      res.json(campaign);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/campaigns — listar campanhas da barbearia
  app.get("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const campaigns = await storage.getCampaigns(req.session.barbershopId!);
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/campaigns/:id — detalhe da campanha com destinatários
  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign || campaign.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }
      const recipients = await storage.getCampaignRecipients(req.params.id);
      res.json({ ...campaign, recipients });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/campaigns/:id/stop — parar campanha em andamento
  app.post("/api/campaigns/:id/stop", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign || campaign.barbershopId !== req.session.barbershopId) {
        return res.status(404).json({ error: "Campanha não encontrada" });
      }
      if (campaign.status !== 'sending') {
        return res.status(400).json({ error: "Campanha não está em andamento" });
      }
      await storage.updateCampaign(req.params.id, { status: 'stopped' } as any);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
