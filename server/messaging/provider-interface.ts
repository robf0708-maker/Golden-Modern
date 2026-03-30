import { MessageProvider, MessagePayload, MessageResult } from './types';
import { normalizePhone, phoneForProvider } from '../utils/phone';

class ConsoleProvider implements MessageProvider {
  name = 'console';

  async send(payload: MessagePayload, _instanceToken?: string): Promise<MessageResult> {
    console.log(`[WhatsApp Mock] Enviando para ${payload.to}: ${payload.message}`);
    return { success: true, messageId: `mock-${Date.now()}` };
  }

  isConfigured(): boolean {
    return true;
  }
}

class UazAPIProvider implements MessageProvider {
  name = 'uazapi';
  private apiUrl: string;
  private instanceToken: string;

  constructor() {
    this.apiUrl = process.env.UAZAPI_URL || '';
    this.instanceToken = process.env.UAZAPI_INSTANCE_TOKEN || '';
  }

  async send(payload: MessagePayload, instanceToken?: string): Promise<MessageResult> {
    const token = instanceToken ?? this.instanceToken;
    if (!this.apiUrl || !token) {
      return { success: false, error: 'UazAPI não configurada' };
    }

    try {
      const phone = phoneForProvider(normalizePhone(payload.to));
      
      if (phone.length < 12 || phone.length > 14) {
        console.error(`[UazAPI] Número inválido após normalização: ${phone} (original: ${payload.to})`);
        return { success: false, error: `Número inválido: ${phone}` };
      }
      
      const url = `${this.apiUrl}/send/text`;
      console.log(`[UazAPI] Enviando mensagem para ${phone} via ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': token,
        },
        body: JSON.stringify({
          number: phone,
          text: payload.message,
        }),
      });

      const responseText = await response.text();
      console.log(`[UazAPI] Resposta (${response.status}):`, responseText);

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${responseText}` };
      }

      try {
        const result = JSON.parse(responseText);
        return { success: true, messageId: result.messageid || result.id || `uaz-${Date.now()}` };
      } catch {
        return { success: true, messageId: `uaz-${Date.now()}` };
      }
    } catch (error: any) {
      console.error('[UazAPI] Erro ao enviar:', error);
      return { success: false, error: error.message };
    }
  }

  isConfigured(): boolean {
    return !!(this.apiUrl && this.instanceToken);
  }
}

class EvolutionAPIProvider implements MessageProvider {
  name = 'evolution';
  private apiUrl: string;
  private apiKey: string;
  private instance: string;

  constructor() {
    this.apiUrl = process.env.EVOLUTION_API_URL || '';
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
    this.instance = process.env.EVOLUTION_INSTANCE || '';
  }

  async send(payload: MessagePayload, _instanceToken?: string): Promise<MessageResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Evolution API não configurada' };
    }

    try {
      const phone = phoneForProvider(normalizePhone(payload.to));
      const response = await fetch(`${this.apiUrl}/message/sendText/${this.instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey,
        },
        body: JSON.stringify({
          number: `${phone}@s.whatsapp.net`,
          text: payload.message,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      const result = await response.json();
      return { success: true, messageId: result.key?.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey && this.instance);
  }
}

class TwilioProvider implements MessageProvider {
  name = 'twilio';
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = process.env.TWILIO_WHATSAPP_FROM || '';
  }

  async send(payload: MessagePayload, _instanceToken?: string): Promise<MessageResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Twilio não configurado' };
    }

    try {
      const normalized = normalizePhone(payload.to);
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${auth}`,
        },
        body: new URLSearchParams({
          From: this.fromNumber,
          To: `whatsapp:${normalized}`,
          Body: payload.message,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      const result = await response.json();
      return { success: true, messageId: result.sid };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  isConfigured(): boolean {
    return !!(this.accountSid && this.authToken && this.fromNumber);
  }
}

const providers: Record<string, MessageProvider> = {
  console: new ConsoleProvider(),
  uazapi: new UazAPIProvider(),
  evolution: new EvolutionAPIProvider(),
  twilio: new TwilioProvider(),
};

export function getProvider(name?: string): MessageProvider {
  // Sempre usar UazAPI (único provider configurado e funcionando)
  if (providers.uazapi.isConfigured()) {
    return providers.uazapi;
  }
  
  // Fallback para console se UazAPI não estiver configurado
  console.log('[Provider] UazAPI não configurado, usando console mock');
  return providers.console;
}

export function getAvailableProviders(): string[] {
  return Object.entries(providers)
    .filter(([_, provider]) => provider.isConfigured())
    .map(([name]) => name);
}
