import { storage } from '../storage';
import { getProvider } from './provider-interface';
import { getNowAsUtcLocal } from '../utils/timezone';
import { scheduleFunnelMessage } from './scheduler';

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;
let funnelJobIntervalId: NodeJS.Timeout | null = null;

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

        const chatbotConfig = await storage.getChatbotSettings(message.barbershopId);

        if (!chatbotConfig?.whatsappConnected) {
          console.log(`[MessageSender] WhatsApp desconectado para barbearia ${message.barbershopId}, aguardando conexão...`);
          continue;
        }

        const result = await provider.send(
          { to: message.phone, message: message.message },
          chatbotConfig?.uazapiInstanceToken ?? undefined
        );

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

export async function processFunnelJobs(): Promise<void> {
  console.log('[FunnelJob] Iniciando job diário do funil...');

  try {
    await storage.backfillClientsWithoutFunnelData();

    const allClients = await storage.getAllClientsForFunnelJob();
    const now = getNowAsUtcLocal();
    let processed = 0;
    let messagesScheduled = 0;
    const settingsCache = new Map<string, any>();

    for (const client of allClients) {
      try {
        processed++;

        if (!client.lastVisitAt) continue;

        const days = client.daysSinceVisit;

        if (days > 30 && client.clientStatus !== 'cliente_plano') {
          await storage.updateClient(client.id, { clientStatus: 'cliente_inativo' });
        }

        if (!settingsCache.has(client.barbershopId)) {
          settingsCache.set(client.barbershopId, await storage.getNotificationSettings(client.barbershopId));
        }
        const settings = settingsCache.get(client.barbershopId);

        const lastMsgAt = client.lastReactivationMessageAt;
        const lastMsgDaysAgo = lastMsgAt
          ? (now.getTime() - new Date(lastMsgAt).getTime()) / (1000 * 60 * 60 * 24)
          : null;

        const alreadySentRecently = lastMsgDaysAgo !== null && lastMsgDaysAgo < 8;

        if (!(settings?.funnelAutomationEnabled ?? false)) continue;

        if (!alreadySentRecently) {
          if (days >= 20 && days < 30 && lastMsgAt === null && (settings?.reactivation20daysEnabled ?? false)) {
            await scheduleFunnelMessage(
              client.barbershopId,
              client.id,
              client.phone,
              client.name,
              'reactivation_20days'
            );
            messagesScheduled++;
          } else if (days >= 30 && days < 45 && lastMsgDaysAgo !== null && lastMsgDaysAgo >= 8 && (settings?.reactivation30daysEnabled ?? false)) {
            await scheduleFunnelMessage(
              client.barbershopId,
              client.id,
              client.phone,
              client.name,
              'reactivation_30days'
            );
            messagesScheduled++;
          } else if (days >= 45 && lastMsgDaysAgo !== null && lastMsgDaysAgo >= 8 && (settings?.reactivation45daysEnabled ?? false)) {
            await scheduleFunnelMessage(
              client.barbershopId,
              client.id,
              client.phone,
              client.name,
              'reactivation_45days'
            );
            messagesScheduled++;
          }
        }

        if (client.daysUntilPredictedVisit !== null && (settings?.predictedReturnEnabled ?? false)) {
          const daysUntil = client.daysUntilPredictedVisit;

          if (daysUntil >= 0 && daysUntil <= 3) {
            const predictiveSentRecently = lastMsgDaysAgo !== null && lastMsgDaysAgo < 3;
            if (!predictiveSentRecently) {
              await scheduleFunnelMessage(
                client.barbershopId,
                client.id,
                client.phone,
                client.name,
                'predicted_return'
              );
              messagesScheduled++;
            }
          }
        }
      } catch (clientError) {
        console.error(`[FunnelJob] Erro ao processar cliente ${client.id}:`, clientError);
      }
    }

    console.log(`[FunnelJob] Concluído: ${processed} clientes processados, ${messagesScheduled} mensagens agendadas`);
  } catch (error) {
    console.error('[FunnelJob] Erro geral no job do funil:', error);
  }
}

export function startFunnelJob(): void {
  if (funnelJobIntervalId) {
    console.log('[FunnelJob] Job do funil já está rodando');
    return;
  }

  // Aguarda 30s antes de iniciar para não competir com o pool de conexões na subida do servidor
  setTimeout(() => processFunnelJobs(), 30_000);

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  funnelJobIntervalId = setInterval(async () => {
    await processFunnelJobs();
  }, TWENTY_FOUR_HOURS);

  console.log('[FunnelJob] Job diário do funil iniciado (intervalo: 24h, início em 30s)');
}

export function stopFunnelJob(): void {
  if (funnelJobIntervalId) {
    clearInterval(funnelJobIntervalId);
    funnelJobIntervalId = null;
    console.log('[FunnelJob] Job do funil parado');
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
