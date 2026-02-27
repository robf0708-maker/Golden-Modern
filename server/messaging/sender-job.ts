import { storage } from '../storage';
import { getProvider } from './provider-interface';
import { getNowAsUtcLocal } from '../utils/timezone';

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

export async function processPendingMessages(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const pendingMessages = await storage.getPendingMessages();
    
    if (pendingMessages.length > 0) {
      console.log(`[MessageSender] ${pendingMessages.length} mensagem(ns) pendente(s) para enviar`);
    }
    
    const provider = getProvider('uazapi');
    
    for (const message of pendingMessages) {
      try {
        const now = getNowAsUtcLocal();
        const scheduledFor = new Date(message.scheduledFor);
        if (scheduledFor > now) {
          continue;
        }

        const result = await provider.send({
          to: message.phone,
          message: message.message,
        });

        if (result.success) {
          await storage.updateScheduledMessage(message.id, {
            status: 'sent',
            sentAt: new Date(),
          } as any);
          console.log(`[MessageSender] Mensagem enviada via ${provider.name} para ${message.phone}`);
        } else {
          const retryCount = (message as any).retryCount || 0;
          if (retryCount < 3) {
            await storage.updateScheduledMessage(message.id, {
              status: 'pending',
              error: result.error,
              retryCount: retryCount + 1,
            } as any);
            console.warn(`[MessageSender] Falha ao enviar para ${message.phone} (tentativa ${retryCount + 1}/3): ${result.error}`);
          } else {
            await storage.updateScheduledMessage(message.id, {
              status: 'failed',
              error: result.error,
            } as any);
            console.error(`[MessageSender] Falha definitiva ao enviar para ${message.phone}: ${result.error}`);
          }
        }
      } catch (error: any) {
        await storage.updateScheduledMessage(message.id, {
          status: 'failed',
          error: error.message,
        } as any);
        console.error(`[MessageSender] Erro ao processar mensagem:`, error);
      }
    }
  } catch (error) {
    console.error('[MessageSender] Erro ao buscar mensagens pendentes:', error);
  } finally {
    isRunning = false;
  }
}

export function startMessageSenderJob(intervalMs: number = 60000): void {
  if (intervalId) {
    console.log('[MessageSender] Job já está rodando');
    return;
  }

  console.log(`[MessageSender] Iniciando job com intervalo de ${intervalMs}ms`);
  
  processPendingMessages();
  
  intervalId = setInterval(async () => {
    await processPendingMessages();
  }, intervalMs);
}

export function stopMessageSenderJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[MessageSender] Job parado');
  }
}
