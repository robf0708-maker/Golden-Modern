import { storage } from '../storage';
import { getProvider } from './provider-interface';
import { getNowAsUtcLocal } from '../utils/timezone';
import { scheduleFunnelMessage } from './scheduler';

// Chaves estáveis para advisory locks do Postgres — impedem execução duplicada entre processos
const SENDER_LOCK_KEY = 42001;
const FUNNEL_LOCK_KEY = 42003;

// Janela máxima de atraso: mensagens com scheduledFor mais antigo que isso são descartadas.
// Protege contra disparo em massa quando o servidor volta após ficar fora do ar por muito tempo.
const MAX_DELAY_MS = 15 * 60 * 1000; // 15 minutos

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;
let funnelJobIntervalId: NodeJS.Timeout | null = null;

export async function processPendingMessages(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const result = await storage.withAdvisoryLock(SENDER_LOCK_KEY, async () => {
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

          // Mensagem atrasada além da janela: descarta em vez de disparar "com atraso".
          // Evita flood ao religar o servidor após queda longa (incidente histórico: 36 msgs).
          const delayMs = now.getTime() - scheduledFor.getTime();
          if (delayMs > MAX_DELAY_MS) {
            await storage.updateScheduledMessage(message.id, {
              status: 'expired',
              error: `Descartada por atraso > ${MAX_DELAY_MS / 60000} min (atraso real: ${Math.round(delayMs / 60000)} min)`,
            } as any);
            console.warn(`[MessageSender] Mensagem ${message.id} expirada (atraso ${Math.round(delayMs / 60000)} min) — descartada sem enviar`);
            continue;
          }

          const chatbotConfig = await storage.getChatbotSettings(message.barbershopId);

          if (!chatbotConfig?.whatsappConnected) {
            console.log(`[MessageSender] WhatsApp desconectado para barbearia ${message.barbershopId}, aguardando conexão...`);
            continue;
          }

          const sendResult = await provider.send(
            { to: message.phone, message: message.message },
            chatbotConfig?.uazapiInstanceToken ?? undefined
          );

          if (sendResult.success) {
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
                error: sendResult.error,
                retryCount: retryCount + 1,
              } as any);
              console.warn(`[MessageSender] Falha ao enviar para ${message.phone} (tentativa ${retryCount + 1}/3): ${sendResult.error}`);
            } else {
              await storage.updateScheduledMessage(message.id, {
                status: 'failed',
                error: sendResult.error,
              } as any);
              console.error(`[MessageSender] Falha definitiva ao enviar para ${message.phone}: ${sendResult.error}`);
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
      return true;
    });

    if (result === null) {
      console.log('[MessageSender] Outra instância já está processando — lock ocupado, pulando ciclo');
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
    const result = await storage.withAdvisoryLock(FUNNEL_LOCK_KEY, async () => {
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
      return true;
    });

    if (result === null) {
      console.log('[FunnelJob] Outra instância já está processando o funil — lock ocupado, pulando ciclo');
    }
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

  // Grace window: aguarda 30s antes do primeiro tick após subir o servidor.
  // Combinado com a janela de expiração (MAX_DELAY_MS), dá tempo de abortar se algo estiver errado.
  console.log(`[MessageSender] Iniciando job com intervalo de ${intervalMs}ms (primeiro tick em 30s)`);

  setTimeout(() => processPendingMessages(), 30_000);

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
