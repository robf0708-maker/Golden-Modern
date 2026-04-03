export interface MessagePayload {
  to: string;
  message: string;
  mediaUrl?: string;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface MessageProvider {
  name: string;
  send(payload: MessagePayload, instanceToken?: string): Promise<MessageResult>;
  isConfigured(): boolean;
}

export type NotificationType =
  | 'welcome'
  | 'appointment_reminder_1day'
  | 'appointment_reminder_1hour'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  // Funil de clientes
  | 'reactivation_20days'
  | 'reactivation_30days'
  | 'reactivation_45days'
  | 'predicted_return'
  // Avisos para o profissional
  | 'professional_booking'
  | 'professional_cancellation';

export interface NotificationConfig {
  welcomeEnabled: boolean;
  reminder1DayEnabled: boolean;
  reminder1HourEnabled: boolean;
  confirmationEnabled: boolean;
  cancellationEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  welcomeEnabled: true,
  reminder1DayEnabled: true,
  reminder1HourEnabled: true,
  confirmationEnabled: true,
  cancellationEnabled: true,
};
