import { storage } from '../storage';
import { getProvider } from './provider-interface';

let isRunning = false;
let shouldStop = false;
let intervalId: NodeJS.Timeout | null = null;

// Caracteres Unicode invisíveis — tornam cada mensagem única para evitar
// detecção de mensagens idênticas pelo WhatsApp
const ZW_VARIANTS = ['\u200B', '\u200C', '\u200D', '\uFEFF'];

function addVariation(message: string, index: number): string {
  return message + ZW_VARIANTS[index % ZW_VARIANTS.length];
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function processCampaigns(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;

  try {
    const campaigns = await storage.getCampaignsSending();
    if (campaigns.length === 0) return;

    // Processa uma campanha por vez
    const campaign = campaigns[0];
    console.log(`[CampaignJob] Processando campanha ${campaign.id}`);

    // Verificar se WhatsApp está conectado para esta barbearia
    const chatbotSettings = await storage.getChatbotSettings(campaign.barbershopId);
    if (!chatbotSettings?.whatsappConnected) {
      console.log(`[CampaignJob] WhatsApp desconectado para barbearia ${campaign.barbershopId}`);
      return;
    }

    const provider = getProvider('uazapi');
    const delayMin = (campaign.delayMinSeconds ?? 15) * 1000;
    const delayMax = (campaign.delayMaxSeconds ?? 45) * 1000;
    let variationIndex = campaign.sentCount + campaign.failedCount;

    while (!shouldStop) {
      // Verificar limite diário antes de cada envio
      const sentToday = await storage.getCampaignSentTodayCount(campaign.barbershopId);
      if (sentToday >= (campaign.dailyLimit ?? 100)) {
        console.log(`[CampaignJob] Limite diário atingido para barbearia ${campaign.barbershopId}`);
        // Mantém campanha como 'sending' — vai continuar amanhã
        break;
      }

      // Pegar próximo destinatário pendente
      const recipient = await storage.getPendingCampaignRecipient(campaign.id);
      if (!recipient) {
        // Todos enviados — marcar como concluída
        await storage.updateCampaign(campaign.id, {
          status: 'done',
          completedAt: new Date(),
        } as any);
        console.log(`[CampaignJob] Campanha ${campaign.id} concluída`);
        break;
      }

      // Adicionar variação invisível para evitar detecção de mensagem idêntica
      const messageToSend = addVariation(recipient.renderedMessage, variationIndex);

      try {
        const result = await provider.send(
          { to: recipient.phone, message: messageToSend },
          chatbotSettings.uazapiInstanceToken ?? undefined
        );

        if (result.success) {
          await storage.updateCampaignRecipient(recipient.id, {
            status: 'sent',
            sentAt: new Date(),
          });
          await storage.incrementCampaignSentCount(campaign.id);
          console.log(`[CampaignJob] Enviado para ${recipient.phone}`);
        } else {
          await storage.updateCampaignRecipient(recipient.id, {
            status: 'failed',
            error: result.error,
          });
          await storage.incrementCampaignFailedCount(campaign.id);
          console.warn(`[CampaignJob] Falha ao enviar para ${recipient.phone}: ${result.error}`);
        }
      } catch (err: any) {
        await storage.updateCampaignRecipient(recipient.id, {
          status: 'failed',
          error: err.message,
        });
        await storage.incrementCampaignFailedCount(campaign.id);
        console.error(`[CampaignJob] Erro ao enviar para ${recipient.phone}:`, err);
      }

      variationIndex++;

      // Delay aleatório anti-spam entre cada mensagem
      await randomDelay(delayMin, delayMax);

      // Re-checar se campanha foi parada externamente pelo admin
      const refreshed = await storage.getCampaign(campaign.id);
      if (refreshed?.status === 'stopped') {
        console.log(`[CampaignJob] Campanha ${campaign.id} parada pelo admin`);
        shouldStop = true;
      }
    }
  } catch (error) {
    console.error('[CampaignJob] Erro inesperado:', error);
  } finally {
    isRunning = false;
  }
}

export function startCampaignJob(intervalMs: number = 30000): void {
  if (intervalId) return;
  console.log('[CampaignJob] Job de campanhas iniciado');
  processCampaigns();
  intervalId = setInterval(async () => {
    await processCampaigns();
  }, intervalMs);
}

export function stopCampaignJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    shouldStop = true;
    console.log('[CampaignJob] Job de campanhas parado');
  }
}
