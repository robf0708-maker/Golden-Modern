import { NotificationType } from './types';

export interface TemplateVariables {
  clientName: string;
  barbershopName: string;
  barberName?: string;
  serviceName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
}

const defaultTemplates: Record<NotificationType, string> = {
  welcome: `Olá {clientName}! 🎉

Seja bem-vindo(a) à *{barbershopName}*!

Estamos felizes em tê-lo(a) como cliente. Esperamos proporcionar a melhor experiência para você.

Até breve! ✂️`,

  appointment_reminder_1day: `Olá {clientName}! 📅

Lembrete: você tem um agendamento *amanhã* às *{appointmentTime}* na *{barbershopName}*.

Serviço: {serviceName}
Barbeiro: {barberName}

Caso precise remarcar, entre em contato conosco.

Aguardamos você! ✂️`,

  appointment_reminder_1hour: `Olá {clientName}! ⏰

Seu horário é *em 1 hora*!

🕐 {appointmentTime}
✂️ {serviceName}
💈 {barberName}

Estamos te esperando na *{barbershopName}*!`,

  appointment_confirmed: `Olá {clientName}! ✅

Seu agendamento foi *confirmado*!

📅 {appointmentDate} às {appointmentTime}
✂️ {serviceName}
💈 {barberName}

Local: *{barbershopName}*

Nos vemos em breve!`,

  appointment_cancelled: `Olá {clientName},

Seu agendamento para *{appointmentDate}* às *{appointmentTime}* foi *cancelado*.

Caso queira remarcar, entre em contato conosco ou acesse nossa agenda online.

*{barbershopName}*`,
};

export function getTemplate(type: NotificationType, customTemplate?: string): string {
  return customTemplate || defaultTemplates[type];
}

export function renderTemplate(template: string, variables: TemplateVariables): string {
  let result = template;
  
  result = result.replace(/{\s*clientName\s*}/g, variables.clientName);
  result = result.replace(/{\s*nome\s*}/g, variables.clientName);
  
  result = result.replace(/{\s*barbershopName\s*}/g, variables.barbershopName);
  result = result.replace(/{\s*barbearia\s*}/g, variables.barbershopName);
  
  result = result.replace(/{\s*barberName\s*}/g, variables.barberName || '');
  result = result.replace(/{\s*barbeiro\s*}/g, variables.barberName || '');
  
  result = result.replace(/{\s*serviceName\s*}/g, variables.serviceName || '');
  result = result.replace(/{\s*servico\s*}/g, variables.serviceName || '');
  
  result = result.replace(/{\s*appointmentDate\s*}/g, variables.appointmentDate || '');
  result = result.replace(/{\s*data\s*}/g, variables.appointmentDate || '');
  
  result = result.replace(/{\s*appointmentTime\s*}/g, variables.appointmentTime || '');
  result = result.replace(/{\s*horario\s*}/g, variables.appointmentTime || '');
  
  return result;
}
