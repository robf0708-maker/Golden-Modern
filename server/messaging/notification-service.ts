import { getProvider } from './provider-interface';
import { getTemplate, renderTemplate, TemplateVariables } from './templates';
import { NotificationType, MessageResult, NotificationConfig, DEFAULT_NOTIFICATION_CONFIG } from './types';

export class NotificationService {
  async sendNotification(
    type: NotificationType,
    phone: string,
    variables: TemplateVariables,
    config?: NotificationConfig,
    customTemplate?: string
  ): Promise<MessageResult> {
    const notificationConfig = config || DEFAULT_NOTIFICATION_CONFIG;
    
    if (!this.isNotificationEnabled(type, notificationConfig)) {
      return { success: false, error: 'Notificação desativada nas configurações' };
    }

    const template = getTemplate(type, customTemplate);
    const message = renderTemplate(template, variables);
    
    const provider = getProvider();
    return provider.send({ to: phone, message });
  }

  private isNotificationEnabled(type: NotificationType, config: NotificationConfig): boolean {
    switch (type) {
      case 'welcome':
        return config.welcomeEnabled;
      case 'appointment_reminder_1day':
        return config.reminder1DayEnabled;
      case 'appointment_reminder_1hour':
        return config.reminder1HourEnabled;
      case 'appointment_confirmed':
        return config.confirmationEnabled;
      case 'appointment_cancelled':
        return config.cancellationEnabled;
      default:
        return false;
    }
  }

  async sendWelcome(
    phone: string,
    clientName: string,
    barbershopName: string,
    config?: NotificationConfig
  ): Promise<MessageResult> {
    return this.sendNotification('welcome', phone, { clientName, barbershopName }, config);
  }

  async sendAppointmentConfirmation(
    phone: string,
    variables: TemplateVariables,
    config?: NotificationConfig
  ): Promise<MessageResult> {
    return this.sendNotification('appointment_confirmed', phone, variables, config);
  }

  async sendAppointmentCancellation(
    phone: string,
    variables: TemplateVariables,
    config?: NotificationConfig
  ): Promise<MessageResult> {
    return this.sendNotification('appointment_cancelled', phone, variables, config);
  }
}

export const notificationService = new NotificationService();
