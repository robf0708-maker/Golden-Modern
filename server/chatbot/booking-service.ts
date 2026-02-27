import { storage } from "../storage";
import type { Barber, Service, Client, Appointment, ChatbotSettings } from "@shared/schema";
import { getNowAsUtcLocal, getBrazilDateString } from "../utils/timezone";
import {
  checkBarberAvailabilityWithDuration,
  getBarberBreakForDate,
  getDayOfWeekFromDate,
  filterFutureSlots,
  normalizeDateStr,
  formatDateBrazil,
  formatTimeBrazil,
  isSlotValid,
  isDateInPast,
  isTimeInPast,
  isTimeBeforeMinAdvance,
  isDateTooFarAhead,
} from "./availability-service";
import { scheduleAppointmentNotifications, scheduleCancellationMessage } from "../messaging";

export const MAX_PARTICIPANTS = 4;
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export interface BookingParticipant {
  name: string;
  isMainClient: boolean;
  clientId?: string;
  serviceId?: string;
  serviceName?: string;
  serviceDuration?: number;
  servicePrice?: string;
  barberId?: string;
  barberName?: string;
  date?: string;
  time?: string;
  usePackage?: boolean;
  clientPackageId?: string;
}

export interface BookingSession {
  barbershopId: string;
  mainClientId: string;
  participants: BookingParticipant[];
  createdAt: number;
}

export interface BookingValidationResult {
  valid: boolean;
  error?: string;
  availableSlots?: string[];
  suggestedSlot?: string;
}

export interface BookingCreationResult {
  success: boolean;
  error?: string;
  appointmentId?: string;
  summary?: {
    serviceName: string;
    barberName: string;
    date: string;
    time: string;
    duration: number;
    usedPackage: boolean;
  };
}

export interface CancelResult {
  success: boolean;
  error?: string;
  cancelledDate?: string;
  cancelledTime?: string;
}

export function createBookingSession(barbershopId: string, mainClientId: string): BookingSession {
  return {
    barbershopId,
    mainClientId,
    participants: [],
    createdAt: Date.now(),
  };
}

export function isSessionExpired(session: BookingSession): boolean {
  return (Date.now() - session.createdAt) > SESSION_TIMEOUT_MS;
}

export function canAddParticipant(session: BookingSession): { allowed: boolean; reason?: string } {
  if (session.participants.length >= MAX_PARTICIPANTS) {
    return {
      allowed: false,
      reason: `Limite máximo de ${MAX_PARTICIPANTS} participantes por sessão atingido.`,
    };
  }
  return { allowed: true };
}

export function addParticipant(session: BookingSession, participant: BookingParticipant): { success: boolean; error?: string } {
  const check = canAddParticipant(session);
  if (!check.allowed) {
    return { success: false, error: check.reason };
  }
  session.participants.push(participant);
  return { success: true };
}

export function isAllParticipantsComplete(session: BookingSession): boolean {
  return session.participants.length > 0 && session.participants.every(p =>
    p.serviceId && p.barberId && p.date && p.time
  );
}

export function getIncompleteParticipants(session: BookingSession): number[] {
  return session.participants
    .map((p, i) => (!p.serviceId || !p.barberId || !p.date || !p.time) ? i : -1)
    .filter(i => i >= 0);
}

export async function validateSlot(params: {
  barbershopId: string;
  barberId: string;
  date: string;
  time: string;
  serviceDuration: number;
  minAdvanceMinutes: number;
  maxDaysAhead: number;
}): Promise<BookingValidationResult> {
  const { barbershopId, barberId, date, time, serviceDuration, minAdvanceMinutes, maxDaysAhead } = params;

  const normalizedDate = normalizeDateStr(date);
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(normalizedDate)) {
    return { valid: false, error: `Data inválida. Use o formato YYYY-MM-DD.` };
  }

  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(time)) {
    return { valid: false, error: `Horário inválido. Use o formato HH:MM.` };
  }

  if (isDateInPast(normalizedDate)) {
    const todayStr = getBrazilDateString();
    return { valid: false, error: `A data ${normalizedDate} já passou. Hoje é ${todayStr}.` };
  }

  if (isTimeInPast(normalizedDate, time)) {
    const nowLocal = getNowAsUtcLocal();
    const currentTimeStr = `${nowLocal.getUTCHours().toString().padStart(2, '0')}:${nowLocal.getUTCMinutes().toString().padStart(2, '0')}`;
    return { valid: false, error: `O horário ${time} já passou. Agora são ${currentTimeStr}.` };
  }

  if (isTimeBeforeMinAdvance(normalizedDate, time, minAdvanceMinutes)) {
    return { valid: false, error: `O horário ${time} é muito próximo. Antecedência mínima: ${minAdvanceMinutes} minutos.` };
  }

  if (isDateTooFarAhead(normalizedDate, maxDaysAhead)) {
    return { valid: false, error: `Só é possível agendar com até ${maxDaysAhead} dias de antecedência.` };
  }

  const availableSlots = await checkBarberAvailabilityWithDuration(barbershopId, barberId, normalizedDate, serviceDuration);
  const futureSlots = filterFutureSlots(availableSlots, normalizedDate, minAdvanceMinutes);

  console.log(`[BookingService] validateSlot: barbeiro=${barberId}, data=${normalizedDate}, hora=${time}, slots disponíveis: [${futureSlots.slice(0, 10).join(', ')}]`);

  if (!isSlotValid(time, availableSlots)) {
    if (futureSlots.length > 0) {
      return {
        valid: false,
        error: `O horário ${time} NÃO está disponível (ocupado ou fora do expediente).`,
        availableSlots: futureSlots.slice(0, 8),
        suggestedSlot: futureSlots[0],
      };
    }
    return {
      valid: false,
      error: `O horário ${time} NÃO está disponível e não há outros horários nesta data.`,
    };
  }

  if (!futureSlots.includes(time)) {
    return {
      valid: false,
      error: `O horário ${time} é muito próximo. Antecedência mínima: ${minAdvanceMinutes} minutos.`,
      availableSlots: futureSlots.slice(0, 8),
      suggestedSlot: futureSlots[0],
    };
  }

  return { valid: true };
}

export async function validateAndCreateAppointment(params: {
  barbershopId: string;
  clientId: string;
  serviceId: string;
  barberId: string;
  date: string;
  time: string;
  usePackage?: boolean;
  clientPackageId?: string;
  companionName?: string;
}): Promise<BookingCreationResult> {
  const { barbershopId, clientId, serviceId, barberId, date, time, usePackage, clientPackageId, companionName } = params;

  const normalizedDate = normalizeDateStr(date);

  const serviceIds = serviceId.includes(',') ? serviceId.split(',') : [serviceId];
  const allServices: Array<{ id: string; name: string; duration: number; price: string }> = [];
  let totalDuration = 0;

  for (const sid of serviceIds) {
    const svc = await storage.getService(sid);
    if (!svc) {
      return { success: false, error: `Serviço não encontrado.` };
    }
    allServices.push(svc);
    totalDuration += svc.duration;
  }

  const service = allServices[0];

  const barber = await storage.getBarber(barberId);
  if (!barber) {
    return { success: false, error: `Profissional não encontrado.` };
  }

  const barbershop = await storage.getBarbershop(barbershopId);
  if (!barbershop) {
    return { success: false, error: `Barbearia não encontrada.` };
  }

  const settings = await storage.getChatbotSettings(barbershopId);
  const minAdvanceMinutes = settings?.minAdvanceMinutes ?? 5;
  const maxDaysAhead = settings?.maxDaysAhead ?? 30;

  const validation = await validateSlot({
    barbershopId,
    barberId,
    date: normalizedDate,
    time,
    serviceDuration: totalDuration,
    minAdvanceMinutes,
    maxDaysAhead,
  });

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const dayOfWeek = getDayOfWeekFromDate(normalizedDate);
  const workingHours = barbershop.workingHours as Record<string, { open: string; close: string; enabled: boolean }> | null;
  const daySchedule = workingHours?.[dayOfWeek];

  if (!daySchedule?.enabled) {
    return { success: false, error: `A barbearia não funciona neste dia.` };
  }

  const startTime = new Date(`${normalizedDate}T${time}:00.000Z`);
  const endTime = new Date(startTime.getTime() + totalDuration * 60 * 1000);

  const [closeH, closeM] = daySchedule.close.split(':').map(Number);
  const closeMins = closeH * 60 + closeM;
  const endMins = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();

  if (endMins > closeMins) {
    return { success: false, error: `O serviço de ${totalDuration} minutos não cabe antes do fechamento às ${daySchedule.close}.` };
  }

  const dayBreak = getBarberBreakForDate(barber, normalizedDate);
  if (dayBreak) {
    const startMins = startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
    const [lunchStartH, lunchStartM] = dayBreak.start.split(':').map(Number);
    const [lunchEndH, lunchEndM] = dayBreak.end.split(':').map(Number);
    const lunchStartMins = lunchStartH * 60 + lunchStartM;
    const lunchEndMins = lunchEndH * 60 + lunchEndM;

    const overlapsLunch = (startMins >= lunchStartMins && startMins < lunchEndMins) ||
                         (endMins > lunchStartMins && endMins <= lunchEndMins) ||
                         (startMins < lunchStartMins && endMins > lunchEndMins);
    if (overlapsLunch) {
      return { success: false, error: `O horário conflita com o intervalo do ${barber.name} (${dayBreak.start} - ${dayBreak.end}).` };
    }
  }

  const dateStart = new Date(`${normalizedDate}T00:00:00.000Z`);
  const dateEnd = new Date(`${normalizedDate}T23:59:59.999Z`);
  const existingAppointments = await storage.getAppointments(barbershopId, dateStart, dateEnd);
  const barberAppointments = existingAppointments.filter(a =>
    a.barberId === barber.id && a.status !== 'cancelled'
  );

  const hasConflict = barberAppointments.some(a => {
    const aStart = new Date(a.startTime).getTime();
    const aEnd = new Date(a.endTime).getTime();
    return (startTime.getTime() < aEnd && endTime.getTime() > aStart);
  });

  if (hasConflict) {
    const availableSlots = await checkBarberAvailabilityWithDuration(barbershopId, barber.id, normalizedDate, totalDuration);
    return {
      success: false,
      error: `O horário ${time} já está ocupado para ${barber.name}. ${availableSlots.length > 0 ? `Horários disponíveis: ${availableSlots.slice(0, 5).join(", ")}` : 'Sem horários nesta data.'}`,
    };
  }

  let validatedClientPackageId: string | null = null;
  if (usePackage && clientPackageId && allServices.length === 1) {
    const clientPackages = await storage.getActiveClientPackages(clientId);
    const cp = clientPackages.find(p => p.id === clientPackageId);
    if (!cp) {
      return { success: false, error: `Pacote não encontrado ou expirado.` };
    }
    if (cp.quantityRemaining <= 0) {
      return { success: false, error: `Pacote sem usos restantes.` };
    }
    const pkg = await storage.getPackage(cp.packageId);
    if (!pkg || pkg.serviceId !== service.id) {
      return { success: false, error: `Este pacote não cobre o serviço "${service.name}".` };
    }
    validatedClientPackageId = cp.id;
    console.log(`[BookingService] Usando pacote ${cp.id} para agendamento (${cp.quantityRemaining} usos restantes)`);
  }

  const combinedName = allServices.length > 1 ? allServices.map(s => s.name).join(' + ') : service.name;
  const appointment = await storage.createAppointment({
    barbershopId,
    barberId: barber.id,
    clientId,
    serviceId: service.id,
    startTime,
    endTime,
    status: "confirmed",
    notes: `Agendado via chatbot WhatsApp${allServices.length > 1 ? ` (${combinedName})` : ''}${usePackage ? ' (usando pacote)' : ''}${companionName ? ` (Acompanhante: ${companionName})` : ''}`,
  });

  for (const svc of allServices) {
    await storage.createAppointmentService({
      appointmentId: appointment.id,
      serviceId: svc.id,
      price: svc.price,
      duration: svc.duration,
      usedPackage: allServices.length === 1 ? !!validatedClientPackageId : false,
      clientPackageId: allServices.length === 1 ? validatedClientPackageId : null,
    });
  }

  console.log(`[BookingService] Agendamento criado: ${appointment.id}${allServices.length > 1 ? ` (${allServices.length} serviços: ${combinedName})` : ''}`);

  try {
    const client = await storage.getClient(clientId);
    if (client?.phone) {
      await scheduleAppointmentNotifications(
        appointment.id,
        barbershopId,
        client.phone,
        client.name,
        barber.name,
        combinedName,
        startTime
      );
      console.log(`[BookingService] Notificações agendadas para agendamento ${appointment.id}`);
    }
  } catch (notifyError) {
    console.error('[BookingService] Erro ao agendar notificações:', notifyError);
  }

  const formattedDate = formatDateBrazil(startTime);

  return {
    success: true,
    appointmentId: appointment.id,
    summary: {
      serviceName: combinedName,
      barberName: barber.name,
      date: formattedDate,
      time,
      duration: totalDuration,
      usedPackage: !!validatedClientPackageId,
    },
  };
}

export async function finalizeMultiParticipantBooking(session: BookingSession): Promise<{
  success: boolean;
  error?: string;
  results?: BookingCreationResult[];
}> {
  if (isSessionExpired(session)) {
    return {
      success: false,
      error: 'Sessão expirada. Nenhum agendamento foi criado. Será necessário recomeçar.',
    };
  }

  if (!isAllParticipantsComplete(session)) {
    const incomplete = getIncompleteParticipants(session);
    return {
      success: false,
      error: `Participantes incompletos: ${incomplete.map(i => session.participants[i].name).join(', ')}. Todos os participantes devem estar confirmados antes de finalizar.`,
    };
  }

  const results: BookingCreationResult[] = [];

  for (const participant of session.participants) {
    const result = await validateAndCreateAppointment({
      barbershopId: session.barbershopId,
      clientId: participant.isMainClient ? session.mainClientId : (participant.clientId || session.mainClientId),
      serviceId: participant.serviceId!,
      barberId: participant.barberId!,
      date: participant.date!,
      time: participant.time!,
      usePackage: participant.isMainClient ? participant.usePackage : false,
      clientPackageId: participant.isMainClient ? participant.clientPackageId : undefined,
    });

    if (!result.success) {
      return {
        success: false,
        error: `Falha ao agendar para ${participant.name}: ${result.error}. Nenhum agendamento parcial foi criado.`,
        results,
      };
    }

    results.push(result);
  }

  return { success: true, results };
}

export async function cancelAppointment(
  clientAppointments: Appointment[],
  appointmentIndex: number
): Promise<CancelResult> {
  if (appointmentIndex < 1 || appointmentIndex > clientAppointments.length) {
    return {
      success: false,
      error: `Índice de agendamento inválido. O cliente tem ${clientAppointments.length} agendamento(s).`,
    };
  }

  const appointment = clientAppointments[appointmentIndex - 1];
  await storage.updateAppointment(appointment.id, { status: "cancelled" });

  const date = new Date(appointment.startTime);
  const formattedDate = formatDateBrazil(date);
  const formattedTime = formatTimeBrazil(date);

  try {
    if (appointment.clientId) {
      const client = await storage.getClient(appointment.clientId);
      if (client?.phone) {
        await scheduleCancellationMessage(
          appointment.id,
          appointment.barbershopId,
          client.phone,
          client.name,
          formattedDate,
          formattedTime
        );
        console.log(`[BookingService] Notificação de cancelamento agendada para ${appointment.id}`);
      }
    }
  } catch (notifyError) {
    console.error('[BookingService] Erro ao agendar notificação de cancelamento:', notifyError);
  }

  return {
    success: true,
    cancelledDate: formattedDate,
    cancelledTime: formattedTime,
  };
}

export async function cancelMultipleAppointments(
  clientAppointments: Appointment[],
  scope: 'all' | 'individual',
  indices?: number[]
): Promise<{ success: boolean; cancelled: number; errors: string[] }> {
  const errors: string[] = [];
  let cancelled = 0;

  const toCancel = scope === 'all'
    ? clientAppointments.map((_, i) => i + 1)
    : (indices || []);

  for (const idx of toCancel) {
    const result = await cancelAppointment(clientAppointments, idx);
    if (result.success) {
      cancelled++;
    } else {
      errors.push(result.error || `Erro ao cancelar agendamento ${idx}`);
    }
  }

  return { success: errors.length === 0, cancelled, errors };
}

export async function getClientPackageForService(clientId: string, serviceId: string): Promise<{
  hasPackage: boolean;
  packageId?: string;
  clientPackageId?: string;
  packageName?: string;
  remainingUses?: number;
} | null> {
  const activePackages = await storage.getActiveClientPackages(clientId);

  for (const cp of activePackages) {
    const pkg = await storage.getPackage(cp.packageId);
    if (pkg && pkg.serviceId === serviceId && cp.quantityRemaining > 0) {
      return {
        hasPackage: true,
        packageId: pkg.id,
        clientPackageId: cp.id,
        packageName: pkg.name,
        remainingUses: cp.quantityRemaining,
      };
    }
  }

  return { hasPackage: false };
}
