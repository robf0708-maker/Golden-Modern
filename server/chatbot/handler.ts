import { storage } from "../storage";
import type { ChatbotSettings, ChatConversation, Client } from "@shared/schema";
import { getNowAsUtcLocal, getBrazilDateString, getBrazilTimeString } from "../utils/timezone";
import {
  calculateCurrentState,
  classifyIntent,
  processStateTransition,
  type ConversationState,
} from "./state-machine";
import { formatResponse } from "./response-formatter";
import {
  checkBarberAvailability,
  checkBarberAvailabilityWithDuration,
  formatDateBrazil,
  formatTimeBrazil,
} from "./availability-service";

interface IncomingMessage {
  barbershopId: string;
  phone: string;
  message: string;
}

interface ChatResponse {
  message: string;
  shouldEndConversation?: boolean;
}

const CONVERSATION_TIMEOUT_MS = 30 * 60 * 1000;

const OUT_OF_SCOPE_KEYWORDS = [
  'produto', 'comprar', 'vender', 'promoção', 'desconto',
  'endereço', 'endereco', 'como chegar', 'localização', 'localizacao',
  'telefone', 'contato', 'reclamação', 'reclamacao', 'problema',
  'como funciona', 'explicar', 'horário de funcionamento',
  'horario de funcionamento', 'aberto', 'abre', 'fecha',
];

const HUMAN_TAKEOVER_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_UNCLEAR_BEFORE_TAKEOVER = 3;

function isOutOfScope(message: string): boolean {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return OUT_OF_SCOPE_KEYWORDS.some(kw => {
    const normalizedKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return lower.includes(normalizedKw);
  });
}

function countRecentUnclear(messageHistory: any[]): number {
  let count = 0;
  for (let i = messageHistory.length - 1; i >= 0; i--) {
    const msg = messageHistory[i];
    if (msg.role === 'user' && msg.intent === 'unclear') {
      count++;
    } else if (msg.role === 'user') {
      break;
    }
  }
  return count;
}

export async function handleIncomingMessage(incoming: IncomingMessage): Promise<ChatResponse> {
  const { barbershopId, phone, message } = incoming;

  const settings = await storage.getChatbotSettings(barbershopId);
  if (!settings?.enabled) {
    return { message: "", shouldEndConversation: true };
  }

  let conversation = await storage.getChatConversation(barbershopId, phone);
  if (!conversation) {
    conversation = await storage.createChatConversation({
      barbershopId,
      phone,
      state: "idle",
      messageHistory: [],
    });
  } else if (conversation.phone !== phone) {
    console.log(`[Chatbot] Normalizando phone da conversa: ${conversation.phone} → ${phone}`);
    await storage.updateChatConversation(conversation.id, { phone });
    conversation = { ...conversation, phone };
  }

  if (message.trim().toLowerCase() === '/liberar') {
    console.log(`[Chatbot] Comando /liberar recebido para ${phone} - desativando human takeover`);
    await storage.updateChatConversation(conversation.id, {
      humanTakeoverUntil: null,
    });
    return { message: "", shouldEndConversation: true };
  }

  if (conversation.humanTakeoverUntil) {
    const takeoverUntil = new Date(conversation.humanTakeoverUntil).getTime();
    const now = Date.now();
    if (now < takeoverUntil) {
      console.log(`[Chatbot] Human takeover ativo para ${phone} até ${new Date(takeoverUntil).toISOString()} - bot não responde`);
      return { message: "", shouldEndConversation: true };
    } else {
      console.log(`[Chatbot] Human takeover expirou para ${phone} - reativando bot`);
      await storage.updateChatConversation(conversation.id, {
        humanTakeoverUntil: null,
      });
      conversation = (await storage.getChatConversation(barbershopId, phone))!;
    }
  }

  let client = await storage.getClientByPhone(barbershopId, phone);
  const isPhoneAsName = (name: string | null) => /^[\d\s+()-]+$/.test((name || '').trim());
  const isNewClient = !client || isPhoneAsName(client.name);

  console.log(`[Chatbot] ====== DIAGNÓSTICO HANDLER ======`);
  console.log(`[Chatbot]   barbershopId recebido: ${barbershopId}`);
  console.log(`[Chatbot]   phone normalizado: ${phone}`);
  console.log(`[Chatbot]   clientFound: ${!!client}`);
  console.log(`[Chatbot]   isNewClient: ${isNewClient}`);
  if (client) {
    console.log(`[Chatbot]   client.id: ${client.id}`);
    console.log(`[Chatbot]   client.name: "${client.name}"`);
    console.log(`[Chatbot]   client.phone: "${client.phone}"`);
    console.log(`[Chatbot]   client.barbershopId: ${client.barbershopId}`);
    const isPhoneAsName = /^[\d\s+()-]+$/.test((client.name || '').trim());
    console.log(`[Chatbot]   nomeÉTelefone: ${isPhoneAsName}`);
  } else {
    console.log(`[Chatbot]   NENHUM CLIENTE ENCONTRADO para barbershopId=${barbershopId} phone=${phone}`);
  }

  const lastMessageTime = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
  const timeSinceLastMessage = Date.now() - lastMessageTime;

  if (timeSinceLastMessage > CONVERSATION_TIMEOUT_MS && (conversation.pendingServiceId || conversation.pendingBarberId || conversation.pendingDate || conversation.pendingTime)) {
    console.log(`[Chatbot] Conversa inativa por ${Math.round(timeSinceLastMessage / 60000)}min - resetando estado`);
    await storage.updateChatConversation(conversation.id, {
      pendingServiceId: null,
      pendingBarberId: null,
      pendingDate: null,
      pendingTime: null,
      state: 'idle',
      messageHistory: [],
    });
    conversation = (await storage.getChatConversation(barbershopId, phone))!;
  }

  if (client && client.phone !== phone) {
    console.log(`[Chatbot] Normalizando phone do cliente "${client.name}": ${client.phone} → ${phone}`);
    await storage.updateClient(client.id, { phone });
    client = { ...client, phone };
  }

  if (!client) {
    client = await storage.createClient({
      barbershopId,
      name: phone,
      phone,
    });
  }

  if (!conversation.clientId && client) {
    await storage.updateChatConversation(conversation.id, { clientId: client.id });
  }

  if (isOutOfScope(message)) {
    console.log(`[Chatbot] Mensagem fora do escopo detectada: "${message.substring(0, 80)}"`);
    const takeoverUntil = new Date(Date.now() + HUMAN_TAKEOVER_DURATION_MS);
    await storage.updateChatConversation(conversation.id, {
      humanTakeoverUntil: takeoverUntil,
    });
    const clientName = (client.name && !/^[\d\s+()-]+$/.test(client.name.trim())) ? client.name : '';
    const greeting = clientName ? `${clientName}, entendo!` : 'Entendo!';
    return {
      message: `${greeting} Vou transferir sua pergunta para nossa equipe. Aguarde que já te respondemos! 😊`,
    };
  }

  const barbershop = await storage.getBarbershop(barbershopId);
  const services = await storage.getServices(barbershopId);
  const barbers = await storage.getBarbers(barbershopId);
  const activeServices = services.filter(s => s.active);
  const activeBarbers = barbers.filter(b => b.active);

  const now = getNowAsUtcLocal();
  const thirtyDaysAhead = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30,
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()
  ));
  const allAppointments = await storage.getAppointments(barbershopId, now, thirtyDaysAhead);
  const clientAppointments = client ? allAppointments.filter(a =>
    a.clientId === client!.id && a.status !== 'cancelled'
  ) : [];

  const messageHistory = conversation.messageHistory || [];
  messageHistory.push({
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  });

  const currentState = calculateCurrentState(client, isNewClient, conversation);

  console.log(`[Chatbot] ====== NOVA MENSAGEM ======`);
  console.log(`[Chatbot] Estado: ${currentState} | Cliente: ${client.name} (${client.phone}) | Novo: ${isNewClient}`);
  console.log(`[Chatbot] Mensagem: "${message.substring(0, 80)}"`);
  console.log(`[Chatbot] Agendamentos do cliente: ${clientAppointments.length}`);
  console.log(`[Chatbot] Conversa pendente: serviço=${conversation.pendingServiceId || 'N/A'}, barbeiro=${conversation.pendingBarberId || 'N/A'}, data=${conversation.pendingDate || 'N/A'}, hora=${conversation.pendingTime || 'N/A'}`);

  const intent = await classifyIntent(message, currentState, {
    services: activeServices,
    barbers: activeBarbers,
    clientAppointments,
  });

  console.log(`[Chatbot] Intent: ${intent.intent} | Value: ${intent.value || 'N/A'}`);

  if (intent.intent === 'unclear') {
    const unclearCount = countRecentUnclear(messageHistory) + 1;
    console.log(`[Chatbot] Intent unclear - contagem consecutiva: ${unclearCount}/${MAX_UNCLEAR_BEFORE_TAKEOVER}`);

    (messageHistory[messageHistory.length - 1] as any).intent = 'unclear';

    if (unclearCount >= MAX_UNCLEAR_BEFORE_TAKEOVER) {
      console.log(`[Chatbot] ${MAX_UNCLEAR_BEFORE_TAKEOVER}x unclear seguidas - ativando human takeover`);
      const takeoverUntil = new Date(Date.now() + HUMAN_TAKEOVER_DURATION_MS);
      await storage.updateChatConversation(conversation.id, {
        humanTakeoverUntil: takeoverUntil,
        messageHistory: messageHistory.slice(-20),
      });
      const clientName = (client.name && !/^[\d\s+()-]+$/.test(client.name.trim())) ? client.name : '';
      const greeting = clientName ? `Desculpe, ${clientName}` : 'Desculpe';
      return {
        message: `${greeting}, não estou conseguindo entender. Vou chamar nossa equipe para te ajudar melhor! 😊`,
      };
    }
  }

  const transition = await processStateTransition({
    currentState,
    intent,
    barbershopId,
    barbershopName: barbershop?.name || "Barbearia",
    client,
    isNewClient,
    services: activeServices,
    barbers: activeBarbers,
    conversation,
    settings,
    clientAppointments,
  });

  if (transition.conversationUpdates && Object.keys(transition.conversationUpdates).length > 0) {
    await storage.updateChatConversation(conversation.id, transition.conversationUpdates);
  }

  const responseMessage = await formatResponse(
    transition.responseData,
    messageHistory,
    settings.systemPrompt || undefined,
  );

  messageHistory.push({
    role: "assistant",
    content: responseMessage,
    timestamp: new Date().toISOString(),
  });

  const trimmedHistory = messageHistory.slice(-20);

  await storage.updateChatConversation(conversation.id, {
    messageHistory: trimmedHistory,
  });

  const clienteTipo = isNewClient ? 'NOVO (criado agora)' : `CONHECIDO como "${client.name}"`;
  console.log(`[Chatbot] ====== RESPOSTA FINAL ======`);
  console.log(`[Chatbot]   Tipo cliente: ${clienteTipo}`);
  console.log(`[Chatbot]   Estado usado: ${currentState}`);
  console.log(`[Chatbot]   responseData.type: ${transition.responseData.type}`);
  console.log(`[Chatbot]   TEXTO ENVIADO: "${responseMessage}"`);
  console.log(`[Chatbot] ============================`);

  return { message: responseMessage };
}

export { checkBarberAvailability, checkBarberAvailabilityWithDuration, formatDateBrazil, formatTimeBrazil };
