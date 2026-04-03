import { storage } from '../storage';
import { getTemplate, renderTemplate, TemplateVariables } from './templates';
import { NotificationType } from './types';
import { getNowAsUtcLocal } from '../utils/timezone';

export async function scheduleAppointmentNotifications(
  appointmentId: string,
  barbershopId: string,
  clientPhone: string,
  clientName: string,
  barberName: string,
  serviceName: string,
  appointmentStart: Date,
  barberPhone?: string
) {
  console.log(`[Scheduler] Agendando notificações para agendamento ${appointmentId}`);
  console.log(`[Scheduler] Cliente: ${clientName} (${clientPhone}), Barbeiro: ${barberName}, Serviço: ${serviceName}`);
  
  const settings = await storage.getNotificationSettings(barbershopId);
  console.log(`[Scheduler] Configurações:`, settings ? `confirmation=${settings.confirmationEnabled}, reminder1day=${settings.reminder1DayEnabled}, reminder1hour=${settings.reminder1HourEnabled}` : 'não encontradas');
  
  const barbershop = await storage.getBarbershop(barbershopId);
  
  if (!barbershop) {
    console.log(`[Scheduler] Barbearia não encontrada: ${barbershopId}`);
    return;
  }

  // Dates are stored as "local time as UTC" (e.g., 14:00 local = 14:00Z in DB)
  // So we extract hours/minutes using getUTC* to avoid double timezone conversion
  const utcH = appointmentStart.getUTCHours().toString().padStart(2, '0');
  const utcM = appointmentStart.getUTCMinutes().toString().padStart(2, '0');
  const utcDay = appointmentStart.getUTCDate().toString().padStart(2, '0');
  const utcMonth = (appointmentStart.getUTCMonth() + 1).toString().padStart(2, '0');
  const utcYear = appointmentStart.getUTCFullYear();

  const variables: TemplateVariables = {
    clientName,
    barbershopName: barbershop.name,
    barberName,
    serviceName,
    appointmentDate: `${utcDay}/${utcMonth}/${utcYear}`,
    appointmentTime: `${utcH}:${utcM}`,
  };

  const messagesToSchedule: Array<{
    type: NotificationType;
    scheduledFor: Date;
    enabled: boolean;
  }> = [];

  const nowLocal = getNowAsUtcLocal();

  if (settings?.confirmationEnabled ?? true) {
    messagesToSchedule.push({
      type: 'appointment_confirmed',
      scheduledFor: nowLocal,
      enabled: true,
    });
  }

  if (settings?.reminder1DayEnabled ?? true) {
    const oneDayBefore = new Date(appointmentStart.getTime() - 24 * 60 * 60 * 1000);
    if (oneDayBefore > nowLocal) {
      messagesToSchedule.push({
        type: 'appointment_reminder_1day',
        scheduledFor: oneDayBefore,
        enabled: true,
      });
    }
  }

  if (settings?.reminder1HourEnabled ?? true) {
    const oneHourBefore = new Date(appointmentStart.getTime() - 60 * 60 * 1000);
    if (oneHourBefore > nowLocal) {
      messagesToSchedule.push({
        type: 'appointment_reminder_1hour',
        scheduledFor: oneHourBefore,
        enabled: true,
      });
    }
  }

  for (const msg of messagesToSchedule) {
    if (!msg.enabled) continue;

    // Use custom templates based on message type if available
    let customTemplate: string | undefined;
    if (msg.type === 'appointment_confirmed' && settings?.confirmationTemplate) {
      customTemplate = settings.confirmationTemplate;
    } else if (msg.type === 'appointment_reminder_1day' && settings?.reminder1DayTemplate) {
      customTemplate = settings.reminder1DayTemplate;
    } else if (msg.type === 'appointment_reminder_1hour' && settings?.reminder1HourTemplate) {
      customTemplate = settings.reminder1HourTemplate;
    }

    const template = getTemplate(msg.type, customTemplate);
    const message = renderTemplate(template, variables);

    await storage.createScheduledMessage({
      barbershopId,
      clientId: null,
      appointmentId,
      phone: clientPhone,
      message,
      type: msg.type,
      scheduledFor: msg.scheduledFor,
      status: 'pending',
    });
  }

  // Aviso para o profissional
  if (barberPhone && (settings?.professionalBookingEnabled ?? false)) {
    const professionalTemplate = getTemplate('professional_booking');
    const professionalMessage = renderTemplate(professionalTemplate, variables);
    await storage.createScheduledMessage({
      barbershopId,
      clientId: null,
      appointmentId,
      phone: barberPhone,
      message: professionalMessage,
      type: 'professional_booking',
      scheduledFor: nowLocal,
      status: 'pending',
    });
    console.log(`[Scheduler] Aviso de agendamento enviado ao profissional ${barberName} (${barberPhone})`);
  }
}

export async function scheduleWelcomeMessage(
  barbershopId: string,
  clientId: string,
  clientPhone: string,
  clientName: string
) {
  console.log(`[Scheduler] Agendando mensagem de boas-vindas para ${clientName} (${clientPhone})`);
  
  const settings = await storage.getNotificationSettings(barbershopId);
  console.log(`[Scheduler] Configurações de notificação:`, settings ? `welcomeEnabled=${settings.welcomeEnabled}` : 'não encontradas');
  
  if (!(settings?.welcomeEnabled ?? true)) {
    console.log(`[Scheduler] Mensagem de boas-vindas desativada, pulando...`);
    return;
  }
  
  const barbershop = await storage.getBarbershop(barbershopId);
  if (!barbershop) {
    console.log(`[Scheduler] Barbearia não encontrada: ${barbershopId}`);
    return;
  }

  const variables: TemplateVariables = {
    clientName,
    barbershopName: barbershop.name,
  };

  const template = getTemplate('welcome', settings?.welcomeTemplate || undefined);
  const message = renderTemplate(template, variables);

  console.log(`[Scheduler] Criando mensagem de boas-vindas: "${message.substring(0, 50)}..."`);
  
  const scheduledMsg = await storage.createScheduledMessage({
    barbershopId,
    clientId,
    appointmentId: null,
    phone: clientPhone,
    message,
    type: 'welcome',
    scheduledFor: getNowAsUtcLocal(),
    status: 'pending',
  });
  
  console.log(`[Scheduler] Mensagem de boas-vindas agendada com sucesso: ID ${scheduledMsg.id}`);
}

export async function scheduleCancellationMessage(
  appointmentId: string,
  barbershopId: string,
  clientPhone: string,
  clientName: string,
  appointmentDate: string,
  appointmentTime: string,
  barberPhone?: string,
  barberName?: string
) {
  const settings = await storage.getNotificationSettings(barbershopId);

  const barbershop = await storage.getBarbershop(barbershopId);
  if (!barbershop) return;

  await storage.deleteScheduledMessagesByAppointment(appointmentId);

  const variables: TemplateVariables = {
    clientName,
    barbershopName: barbershop.name,
    barberName,
    appointmentDate,
    appointmentTime,
  };

  if (settings?.cancellationEnabled ?? true) {
    const template = getTemplate('appointment_cancelled', settings?.cancellationTemplate || undefined);
    const message = renderTemplate(template, variables);
    await storage.createScheduledMessage({
      barbershopId,
      clientId: null,
      appointmentId: null,
      phone: clientPhone,
      message,
      type: 'appointment_cancelled',
      scheduledFor: getNowAsUtcLocal(),
      status: 'pending',
    });
  }

  // Aviso para o profissional
  if (barberPhone && (settings?.professionalCancellationEnabled ?? false)) {
    const professionalTemplate = getTemplate('professional_cancellation');
    const professionalMessage = renderTemplate(professionalTemplate, variables);
    await storage.createScheduledMessage({
      barbershopId,
      clientId: null,
      appointmentId: null,
      phone: barberPhone,
      message: professionalMessage,
      type: 'professional_cancellation',
      scheduledFor: getNowAsUtcLocal(),
      status: 'pending',
    });
    console.log(`[Scheduler] Aviso de cancelamento enviado ao profissional ${barberName} (${barberPhone})`);
  }
}

export async function scheduleFunnelMessage(
  barbershopId: string,
  clientId: string,
  clientPhone: string,
  clientName: string,
  type: 'reactivation_20days' | 'reactivation_30days' | 'reactivation_45days' | 'predicted_return',
  barberName?: string
): Promise<void> {
  console.log(`[FunnelScheduler] Agendando mensagem tipo "${type}" para ${clientName} (${clientPhone})`);

  const barbershop = await storage.getBarbershop(barbershopId);
  if (!barbershop) {
    console.log(`[FunnelScheduler] Barbearia ${barbershopId} não encontrada, pulando`);
    return;
  }

  const settings = await storage.getNotificationSettings(barbershopId);

  const templateMap: Record<string, string | null | undefined> = {
    reactivation_20days: settings?.reactivation20daysTemplate,
    reactivation_30days: settings?.reactivation30daysTemplate,
    reactivation_45days: settings?.reactivation45daysTemplate,
    predicted_return: settings?.predictedReturnTemplate,
  };

  const variables: TemplateVariables = {
    clientName,
    barbershopName: barbershop.name,
    barberName,
  };

  const customTemplate = templateMap[type] || undefined;
  const template = getTemplate(type as NotificationType, customTemplate);
  const message = renderTemplate(template, variables);

  await storage.createScheduledMessage({
    barbershopId,
    clientId,
    appointmentId: null,
    phone: clientPhone,
    message,
    type,
    scheduledFor: getNowAsUtcLocal(),
    status: 'pending',
  });

  await storage.updateClient(clientId, {
    lastReactivationMessageAt: getNowAsUtcLocal(),
  });

  console.log(`[FunnelScheduler] Mensagem "${type}" agendada para ${clientName}`);
}

