import OpenAI from "openai";
import { storage } from "../storage";
import type { Client, Service, Barber, Appointment, ChatConversation, ChatbotSettings } from "@shared/schema";
import { getNowAsUtcLocal, getBrazilDateString, getBrazilTimeString } from "../utils/timezone";
import {
  getNextAvailableSlot,
  getAvailabilitySummaryForBarbers,
  getLeastBusyBarber,
  checkBarberAvailabilityWithDuration,
  filterFutureSlots,
  normalizeDateStr,
  formatDateBrazil,
  formatTimeBrazil,
  type SlotInfo,
  type BarberAvailabilitySummary,
} from "./availability-service";
import {
  validateSlot,
  validateAndCreateAppointment,
  cancelAppointment,
  cancelMultipleAppointments,
  getClientPackageForService,
} from "./booking-service";

export type ConversationState =
  | 'NEED_NAME'
  | 'NEED_SERVICE'
  | 'NEED_BARBER'
  | 'NEED_TIME'
  | 'CONFIRMATION'
  | 'AWAITING_CANCEL_CONFIRMATION';

export interface IntentClassification {
  intent: string;
  value?: string;
  secondary_value?: string;
  date_value?: string;
  time_value?: string;
  cancel_scope?: 'all' | 'individual';
  appointment_index?: number;
  use_package?: boolean;
}

export interface StateTransitionResult {
  newState: ConversationState;
  responseData: ResponseData;
  conversationUpdates: Partial<{
    pendingServiceId: string | null;
    pendingBarberId: string | null;
    pendingDate: string | null;
    pendingTime: string | null;
    messageHistory: any[];
    state: string;
    humanTakeoverUntil: Date | null;
    clientId: string;
  }>;
  actionTaken?: string;
}

export interface ResponseData {
  type: 'greeting_new' | 'greeting_returning' | 'ask_service' | 'ask_barber' |
        'offer_time' | 'ask_confirmation' | 'booking_confirmed' | 'booking_error' |
        'cancelled' | 'no_availability' | 'error' | 'ask_cancel_scope' |
        'session_expired' | 'max_participants' | 'ask_package_use' | 'inform_existing_appointments' |
        'ask_companion_name' | 'rescheduling_start';
  barbershopName: string;
  clientName: string;
  currentTime: string;
  currentDate: string;
  services?: { id: string; name: string; duration: number }[];
  barbers?: { id: string; name: string }[];
  barberSummaries?: BarberAvailabilitySummary[];
  earliestBarber?: BarberAvailabilitySummary | null;
  prioritySlot?: SlotInfo | null;
  otherSlots?: SlotInfo[];
  crossBarberSlots?: SlotInfo[];
  searchedNextDay?: boolean;
  searchedDate?: string;
  selectedService?: { name: string; price: string; duration: number };
  selectedBarber?: { name: string };
  selectedDate?: string;
  selectedTime?: string;
  bookingSummary?: {
    serviceName: string;
    barberName: string;
    date: string;
    time: string;
    duration: number;
    usedPackage: boolean;
  };
  existingAppointments?: {
    index: number;
    date: string;
    time: string;
    serviceName: string;
    barberName: string;
  }[];
  packageInfo?: {
    packageName: string;
    remainingUses: number;
    clientPackageId: string;
    servicePrice: string;
  };
  errorMessage?: string;
  cancelledDate?: string;
  cancelledTime?: string;
  waitingOptionEnabled?: boolean;
  customGreetingNew?: string;
  customGreetingReturning?: string;
}

export function calculateCurrentState(client: Client, isNewClient: boolean, conversation: ChatConversation): ConversationState {
  if (isNewClient) {
    console.log(`[StateMachine] calculateCurrentState: NEED_NAME porque isNewClient=true`);
    return 'NEED_NAME';
  }
  if (!conversation.pendingServiceId) {
    console.log(`[StateMachine] calculateCurrentState: NEED_SERVICE (cliente conhecido: "${client.name}")`);
    return 'NEED_SERVICE';
  }
  if (!conversation.pendingBarberId) {
    return 'NEED_BARBER';
  }
  if (!conversation.pendingDate || !conversation.pendingTime) {
    return 'NEED_TIME';
  }
  return 'CONFIRMATION';
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return openaiClient;
}

const CLASSIFY_INTENT_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "classify_intent",
    description: "Classifica a intenção do cliente com base na mensagem recebida. SEMPRE use esta função para responder.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: [
            "provide_name",
            "select_service",
            "select_barber",
            "no_preference_barber",
            "accept_time",
            "reject_time",
            "change_barber",
            "provide_date",
            "provide_time",
            "confirm_booking",
            "reject_booking",
            "cancel_appointment",
            "use_package_yes",
            "use_package_no",
            "greeting",
            "ask_availability",
            "book_for_companion",
            "provide_companion_name",
            "select_multiple_services",
            "reschedule",
            "unclear",
            "non_text",
          ],
          description: "A intenção classificada da mensagem do cliente",
        },
        value: {
          type: "string",
          description: "Valor extraído: nome do cliente, nome do serviço, nome do barbeiro, ou horário mencionado",
        },
        secondary_value: {
          type: "string",
          description: "Valor secundário se aplicável (ex: ID do serviço ou barbeiro se mencionado)",
        },
        date_value: {
          type: "string",
          description: "Data mencionada pelo cliente no formato YYYY-MM-DD se aplicável",
        },
        time_value: {
          type: "string",
          description: "Horário mencionado pelo cliente no formato HH:MM se aplicável",
        },
        appointment_index: {
          type: "number",
          description: "Índice do agendamento a cancelar (1-based) se o cliente especificar qual",
        },
      },
      required: ["intent"],
    },
  },
};

export async function classifyIntent(
  message: string,
  currentState: ConversationState,
  context: {
    services: Service[];
    barbers: Barber[];
    clientAppointments: Appointment[];
    existingAppointments?: { date: string; time: string; serviceName: string; barberName: string }[];
  }
): Promise<IntentClassification> {
  const openai = getOpenAIClient();

  const serviceNames = context.services.map(s => `${s.name} (ID: ${s.id})`).join(', ');
  const barberNames = context.barbers.map(b => `${b.name} (ID: ${b.id})`).join(', ');
  const today = getBrazilDateString();
  const currentTime = getBrazilTimeString();

  const stateRules: Record<string, string> = {
    'NEED_NAME': `Esperando o nome do cliente.
INTENTS VÁLIDOS: provide_name, greeting, cancel_appointment, unclear
- Qualquer texto que pareça um nome → provide_name (value = nome)
- Se a mensagem é confusa ou irrelevante → unclear`,

    'NEED_SERVICE': `Esperando escolha de serviço.
INTENTS VÁLIDOS: select_service, select_multiple_services, book_for_companion, provide_companion_name, greeting, cancel_appointment, reschedule, ask_availability, unclear
- Se menciona UM serviço (corte, barba, etc.) → select_service
- Se menciona DOIS ou mais serviços (ex: "corte e barba", "corte barba e sobrancelha") → select_multiple_services (value = nomes separados por vírgula, ex: "corte,barba")
- Se diz "agendar para meu filho/esposa/amigo/outra pessoa", "marcar pra fulano", "quero agendar para outra pessoa" → book_for_companion
- Se o último pedido foi o nome do acompanhante e o cliente responde com um nome → provide_companion_name (value = nome)
- Se pede "mais próximo", "próximo horário", "qual tem" SEM mencionar serviço → ask_availability (precisa do serviço primeiro)
- Se a mensagem é confusa ou irrelevante → unclear
- PROIBIDO usar: no_preference_barber, accept_time, reject_time, reject_booking, confirm_booking neste estado`,

    'NEED_BARBER': `Esperando escolha de barbeiro.
INTENTS VÁLIDOS: select_barber, no_preference_barber, cancel_appointment, reschedule, greeting, unclear
- Se diz "não", "não tenho", "tanto faz", "qualquer um", "sem preferência", "não importa" → SEMPRE no_preference_barber
- Se menciona nome de barbeiro → select_barber
- Se a mensagem é confusa ou irrelevante → unclear
- PROIBIDO usar: reject_booking, reject_time, accept_time, confirm_booking neste estado
- REGRA ABSOLUTA: "não" ou "não tenho" neste estado NUNCA é reject_booking, é SEMPRE no_preference_barber`,

    'NEED_TIME': `Esperando aceitar/rejeitar horário ou informar preferência de horário.
INTENTS VÁLIDOS: accept_time, reject_time, provide_date, provide_time, select_barber, change_barber, no_preference_barber, cancel_appointment, reschedule, unclear
- Se diz "sim", "pode ser", "ok", "esse", "confirma", "fechado", "bora" → accept_time
- Se diz "não", "outro horário", "mais tarde", "outro dia" → reject_time
- Se menciona dia/data → provide_date
- Se menciona horário → provide_time
- Se menciona nome de barbeiro → select_barber (value = nome, secondary_value = ID se encontrado)
- Se diz "outro profissional", "trocar barbeiro", "tem outro?" → change_barber
- Se diz "qualquer um", "tanto faz", "sem preferência de profissional" → no_preference_barber
- Se a mensagem é confusa ou irrelevante → unclear
- PROIBIDO usar: reject_booking, confirm_booking neste estado`,

    'CONFIRMATION': `Esperando confirmação final ou resposta sobre pacote.
INTENTS VÁLIDOS: confirm_booking, reject_booking, use_package_yes, use_package_no, cancel_appointment, reschedule, unclear
- Se diz "sim", "pode", "confirma" → confirm_booking ou use_package_yes
- Se diz "não", "cancelar", "desistir" → reject_booking ou use_package_no
- Se diz "usar pacote" / "com pacote" → use_package_yes
- Se diz "pagar avulso" / "sem pacote" → use_package_no
- Se a mensagem é confusa ou irrelevante → unclear`,

    'AWAITING_CANCEL_CONFIRMATION': `Esperando o cliente escolher qual agendamento cancelar.
INTENTS VÁLIDOS: cancel_appointment, unclear, greeting
- Se o cliente informa número/índice do agendamento → cancel_appointment (appointment_index = número)
- Se diz "todos" ou "cancelar tudo" → cancel_appointment (cancel_scope = "all")
- Se a mensagem é confusa → unclear`,
  };

  const classificationPrompt = `Você é um classificador de intenção. Analise a mensagem do cliente e classifique a intenção.

ESTADO ATUAL: ${currentState}
DATA HOJE: ${today}
HORA ATUAL: ${currentTime}

SERVIÇOS DISPONÍVEIS: ${serviceNames}
PROFISSIONAIS DISPONÍVEIS: ${barberNames}
AGENDAMENTOS DO CLIENTE: ${context.clientAppointments.length}

REGRAS GERAIS:
- Se o cliente diz um nome próprio → provide_name (value = nome)
- Se menciona um serviço (corte, barba, etc.) → select_service (value = nome do serviço, secondary_value = ID se encontrado)
- Se menciona um barbeiro por nome → select_barber (value = nome, secondary_value = ID se encontrado)
- Se menciona dia/data → provide_date (date_value = YYYY-MM-DD)
  - "hoje" = ${today}
  - "amanhã" = calcule a data
  - "segunda", "terça", etc. = calcule a próxima ocorrência
- Se menciona horário → provide_time (time_value = HH:MM)
- Se quer cancelar/desmarcar → cancel_appointment
- Se quer reagendar / mudar horário / trocar data → reschedule
- non_text é EXCLUSIVAMENTE para mensagens de mídia (áudio, imagem, figurinha, vídeo, documento). Se a mensagem contém QUALQUER texto legível, NUNCA classifique como non_text. Texto confuso = unclear, NUNCA non_text.
- Se é saudação (oi, olá, bom dia) → greeting

REGRAS DO ESTADO ATUAL (PRIORIDADE MÁXIMA):
${stateRules[currentState] || 'Classifique conforme as regras gerais.'}

REGRA CRÍTICA: Respeite os INTENTS VÁLIDOS do estado atual. NÃO classifique um intent que não esteja listado como válido para o estado.

Analise e classifique:`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: classificationPrompt },
        { role: "user", content: message },
      ],
      tools: [CLASSIFY_INTENT_TOOL],
      tool_choice: { type: "function", function: { name: "classify_intent" } },
      max_tokens: 200,
      temperature: 0.1,
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0] as any;
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(`[StateMachine] Intent classificada: ${args.intent} | value: ${args.value || 'N/A'} | state: ${currentState}`);
      return args as IntentClassification;
    }

    console.warn(`[StateMachine] Sem tool_call na resposta. Retornando unclear.`);
    return { intent: 'unclear' };
  } catch (error) {
    console.error(`[StateMachine] Erro ao classificar intent:`, error);
    return { intent: 'unclear' };
  }
}

export async function processStateTransition(params: {
  currentState: ConversationState;
  intent: IntentClassification;
  barbershopId: string;
  barbershopName: string;
  client: Client;
  isNewClient: boolean;
  services: Service[];
  barbers: Barber[];
  conversation: ChatConversation;
  settings: ChatbotSettings;
  clientAppointments: Appointment[];
}): Promise<StateTransitionResult> {
  const {
    currentState, intent, barbershopId, barbershopName, client,
    isNewClient, services, barbers, conversation, settings, clientAppointments,
  } = params;

  const today = getBrazilDateString();
  const currentTime = getBrazilTimeString();
  const minAdvance = settings.minAdvanceMinutes ?? 5;
  const maxDaysAhead = settings.maxDaysAhead || 30;

  const baseResponseData: Partial<ResponseData> = {
    barbershopName,
    clientName: client.name,
    currentTime,
    currentDate: today,
    waitingOptionEnabled: settings.waitingOptionEnabled,
    customGreetingNew: settings.greetingNewClient || undefined,
    customGreetingReturning: settings.greetingReturningClient || undefined,
  };

  const existingAppts = clientAppointments.map((a, i) => {
    const s = services.find(sv => sv.id === a.serviceId);
    const b = barbers.find(br => br.id === a.barberId);
    const date = new Date(a.startTime);
    return {
      index: i + 1,
      date: formatDateBrazil(date),
      time: formatTimeBrazil(date),
      serviceName: s?.name || 'Serviço',
      barberName: b?.name || 'Profissional',
    };
  });

  if (intent.intent === 'reschedule') {
    if (clientAppointments.length === 0) {
      return {
        newState: currentState,
        responseData: {
          ...baseResponseData,
          type: 'error',
          errorMessage: 'Você não tem agendamentos para reagendar.',
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    const apptToCancel = clientAppointments.length === 1 ? clientAppointments[0] : null;
    if (apptToCancel) {
      const result = await cancelAppointment(clientAppointments, 1);
      if (result.success) {
        return {
          newState: 'NEED_SERVICE',
          responseData: {
            ...baseResponseData,
            type: 'rescheduling_start',
            cancelledDate: result.cancelledDate,
            cancelledTime: result.cancelledTime,
            services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
          } as ResponseData,
          conversationUpdates: {
            pendingServiceId: null,
            pendingBarberId: null,
            pendingDate: null,
            pendingTime: null,
            state: 'idle',
          },
          actionTaken: 'appointment_cancelled',
        };
      }
      return {
        newState: currentState,
        responseData: {
          ...baseResponseData,
          type: 'error',
          errorMessage: result.error,
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    // Múltiplos agendamentos: pedir qual reagendar
    return {
      newState: 'AWAITING_CANCEL_CONFIRMATION',
      responseData: {
        ...baseResponseData,
        type: 'ask_cancel_scope',
        existingAppointments: existingAppts,
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  if (intent.intent === 'cancel_appointment') {
    if (clientAppointments.length === 0) {
      return {
        newState: currentState,
        responseData: {
          ...baseResponseData,
          type: 'error',
          errorMessage: 'Você não tem agendamentos para cancelar.',
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    if (intent.cancel_scope === 'all' && clientAppointments.length > 1) {
      console.log(`[StateMachine] Cancelando TODOS os ${clientAppointments.length} agendamentos`);
      const result = await cancelMultipleAppointments(clientAppointments, 'all');
      if (result.success || result.cancelled > 0) {
        const dateValueAfterCancel = intent.date_value ? normalizeDateStr(intent.date_value) : null;
        return {
          newState: 'NEED_SERVICE',
          responseData: {
            ...baseResponseData,
            type: 'cancelled',
            cancelledDate: `${result.cancelled} agendamento(s)`,
            cancelledTime: 'todos cancelados',
          } as ResponseData,
          conversationUpdates: {
            pendingServiceId: null,
            pendingBarberId: null,
            pendingDate: dateValueAfterCancel,
            pendingTime: null,
            state: 'idle',
          },
          actionTaken: 'appointment_cancelled',
        };
      }
      return {
        newState: currentState,
        responseData: {
          ...baseResponseData,
          type: 'error',
          errorMessage: result.errors.join('; ') || 'Erro ao cancelar agendamentos.',
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    if (clientAppointments.length === 1 || intent.appointment_index) {
      const idx = intent.appointment_index || 1;
      const result = await cancelAppointment(clientAppointments, idx);
      if (result.success) {
        const dateValueAfterCancel = intent.date_value ? normalizeDateStr(intent.date_value) : null;
        return {
          newState: 'NEED_SERVICE',
          responseData: {
            ...baseResponseData,
            type: 'cancelled',
            cancelledDate: result.cancelledDate,
            cancelledTime: result.cancelledTime,
          } as ResponseData,
          conversationUpdates: {
            pendingServiceId: null,
            pendingBarberId: null,
            pendingDate: dateValueAfterCancel,
            pendingTime: null,
            state: 'idle',
          },
          actionTaken: 'appointment_cancelled',
        };
      }
      return {
        newState: currentState,
        responseData: {
          ...baseResponseData,
          type: 'error',
          errorMessage: result.error,
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    return {
      newState: 'AWAITING_CANCEL_CONFIRMATION',
      responseData: {
        ...baseResponseData,
        type: 'ask_cancel_scope',
        existingAppointments: existingAppts,
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  switch (currentState) {
    case 'NEED_NAME':
      return await handleNeedName(intent, baseResponseData, client, services, barbers, barbershopId, minAdvance, maxDaysAhead, existingAppts);

    case 'NEED_SERVICE':
      return await handleNeedService(intent, baseResponseData, client, services, barbers, barbershopId, conversation, settings, existingAppts, minAdvance, maxDaysAhead);

    case 'NEED_BARBER':
      return await handleNeedBarber(intent, baseResponseData, client, services, barbers, barbershopId, conversation, settings, minAdvance, maxDaysAhead);

    case 'NEED_TIME':
      return await handleNeedTime(intent, baseResponseData, client, services, barbers, barbershopId, conversation, settings, minAdvance, maxDaysAhead);

    case 'CONFIRMATION':
      return await handleConfirmation(intent, baseResponseData, client, services, barbers, barbershopId, conversation, settings, clientAppointments);

    default:
      return {
        newState: currentState,
        responseData: {
          ...baseResponseData,
          type: 'error',
          errorMessage: 'Estado desconhecido.',
        } as ResponseData,
        conversationUpdates: {},
      };
  }
}

async function handleNeedName(
  intent: IntentClassification,
  baseData: Partial<ResponseData>,
  client: Client,
  services: Service[],
  barbers: Barber[],
  barbershopId: string,
  minAdvance: number,
  maxDaysAhead: number,
  existingAppts: any[],
): Promise<StateTransitionResult> {
  if (intent.intent === 'provide_name' && intent.value) {
    await storage.updateClient(client.id, { name: intent.value });
    console.log(`[StateMachine] Nome atualizado: ${intent.value}`);

    return {
      newState: 'NEED_SERVICE',
      responseData: {
        ...baseData,
        type: 'ask_service',
        clientName: intent.value,
        services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
        existingAppointments: existingAppts,
      } as ResponseData,
      conversationUpdates: {},
      actionTaken: 'name_updated',
    };
  }

  return {
    newState: 'NEED_NAME',
    responseData: {
      ...baseData,
      type: 'greeting_new',
    } as ResponseData,
    conversationUpdates: {},
  };
}

async function handleNeedService(
  intent: IntentClassification,
  baseData: Partial<ResponseData>,
  client: Client,
  services: Service[],
  barbers: Barber[],
  barbershopId: string,
  conversation: ChatConversation,
  settings: ChatbotSettings,
  existingAppts: any[],
  minAdvance: number,
  maxDaysAhead: number,
): Promise<StateTransitionResult> {
  if (intent.intent === 'greeting') {
    return {
      newState: 'NEED_SERVICE',
      responseData: {
        ...baseData,
        type: 'greeting_returning',
        services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
        existingAppointments: existingAppts,
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  if (intent.intent === 'ask_availability') {
    return {
      newState: 'NEED_SERVICE',
      responseData: {
        ...baseData,
        type: 'ask_service',
        services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
        existingAppointments: existingAppts,
        errorMessage: 'Para buscar o horário mais próximo, preciso saber qual serviço você deseja.',
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  if (intent.intent === 'book_for_companion') {
    return {
      newState: 'NEED_SERVICE',
      responseData: {
        ...baseData,
        type: 'ask_companion_name',
      } as ResponseData,
      conversationUpdates: {
        state: 'awaiting_companion_name',
      },
    };
  }

  if (intent.intent === 'provide_companion_name' && intent.value) {
    const companionName = intent.value.trim();
    console.log(`[StateMachine] Acompanhante definido: ${companionName}`);
    return {
      newState: 'NEED_SERVICE',
      responseData: {
        ...baseData,
        type: 'ask_service',
        services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
        existingAppointments: existingAppts,
        errorMessage: `Agendamento para ${companionName}. Qual serviço deseja?`,
      } as ResponseData,
      conversationUpdates: {
        state: `companion:${companionName}`,
      },
    };
  }

  if (conversation.state === 'awaiting_companion_name' && intent.intent !== 'cancel_appointment' && intent.intent !== 'greeting') {
    const companionName = (intent.value || '').trim();
    if (companionName) {
      console.log(`[StateMachine] Acompanhante definido (via fallback): ${companionName}`);
      return {
        newState: 'NEED_SERVICE',
        responseData: {
          ...baseData,
          type: 'ask_service',
          services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
          existingAppointments: existingAppts,
          errorMessage: `Agendamento para ${companionName}. Qual serviço deseja?`,
        } as ResponseData,
        conversationUpdates: {
          state: `companion:${companionName}`,
        },
      };
    }
  }

  if (intent.intent === 'select_multiple_services' && intent.value) {
    const comboSearchName = intent.value.replace(/,/g, ' e ').replace(/\s+/g, ' ').trim().toLowerCase();
    const comboService = services.find(s =>
      s.name.toLowerCase().replace(/\s+/g, ' ').trim() === comboSearchName
    );

    if (comboService) {
      console.log(`[StateMachine] Serviço combo encontrado: ${comboService.name} (${comboService.id})`);
      const { summaries, earliestBarber } = await getAvailabilitySummaryForBarbers({
        barbershopId, barbers, serviceDuration: comboService.duration,
        minAdvanceMinutes: minAdvance, maxDaysAhead,
      });
      return {
        newState: 'NEED_BARBER',
        responseData: {
          ...baseData, type: 'ask_barber',
          barbers: barbers.map(b => ({ id: b.id, name: b.name })),
          barberSummaries: summaries, earliestBarber,
          selectedService: { name: comboService.name, price: comboService.price, duration: comboService.duration },
        } as ResponseData,
        conversationUpdates: { pendingServiceId: comboService.id },
        actionTaken: 'service_selected',
      };
    }

    const serviceNames = intent.value.split(',').map(s => s.trim().toLowerCase());
    const matchedServices: typeof services = [];
    for (const name of serviceNames) {
      const found = services.find(s =>
        s.name.toLowerCase().includes(name) || name.includes(s.name.toLowerCase())
      );
      if (found && !matchedServices.find(m => m.id === found.id)) {
        matchedServices.push(found);
      }
    }

    if (matchedServices.length < 2) {
      return {
        newState: 'NEED_SERVICE',
        responseData: {
          ...baseData, type: 'ask_service',
          services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
          errorMessage: 'Não encontrei todos os serviços mencionados. Quais serviços você deseja?',
          existingAppointments: existingAppts,
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    const totalDuration = matchedServices.reduce((sum, s) => sum + s.duration, 0);
    const totalPrice = matchedServices.reduce((sum, s) => sum + parseFloat(s.price), 0);
    const combinedName = matchedServices.map(s => s.name).join(' + ');
    const pendingServiceIds = matchedServices.map(s => s.id).join(',');

    console.log(`[StateMachine] Múltiplos serviços: ${combinedName} (${totalDuration}min, R$${totalPrice.toFixed(2)})`);

    const { summaries, earliestBarber } = await getAvailabilitySummaryForBarbers({
      barbershopId, barbers, serviceDuration: totalDuration,
      minAdvanceMinutes: minAdvance, maxDaysAhead,
    });

    return {
      newState: 'NEED_BARBER',
      responseData: {
        ...baseData, type: 'ask_barber',
        barbers: barbers.map(b => ({ id: b.id, name: b.name })),
        barberSummaries: summaries, earliestBarber,
        selectedService: { name: combinedName, price: totalPrice.toFixed(2), duration: totalDuration },
      } as ResponseData,
      conversationUpdates: { pendingServiceId: pendingServiceIds },
      actionTaken: 'service_selected',
    };
  }

  if (intent.intent === 'select_service') {
    let service: Service | undefined;

    if (intent.secondary_value) {
      service = services.find(s => s.id === intent.secondary_value);
    }
    if (!service && intent.value) {
      service = services.find(s =>
        s.name.toLowerCase().includes(intent.value!.toLowerCase()) ||
        intent.value!.toLowerCase().includes(s.name.toLowerCase())
      );
    }

    if (!service) {
      return {
        newState: 'NEED_SERVICE',
        responseData: {
          ...baseData,
          type: 'ask_service',
          services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
          errorMessage: `Serviço "${intent.value}" não encontrado.`,
          existingAppointments: existingAppts,
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    console.log(`[StateMachine] Serviço selecionado: ${service.name} (${service.id})`);

    const { summaries, earliestBarber } = await getAvailabilitySummaryForBarbers({
      barbershopId,
      barbers,
      serviceDuration: service.duration,
      minAdvanceMinutes: minAdvance,
      maxDaysAhead,
    });

    return {
      newState: 'NEED_BARBER',
      responseData: {
        ...baseData,
        type: 'ask_barber',
        barbers: barbers.map(b => ({ id: b.id, name: b.name })),
        barberSummaries: summaries,
        earliestBarber,
        selectedService: { name: service.name, price: service.price, duration: service.duration },
      } as ResponseData,
      conversationUpdates: {
        pendingServiceId: service.id,
      },
      actionTaken: 'service_selected',
    };
  }

  return {
    newState: 'NEED_SERVICE',
    responseData: {
      ...baseData,
      type: 'ask_service',
      services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
      existingAppointments: existingAppts,
    } as ResponseData,
    conversationUpdates: {},
  };
}

async function handleNeedBarber(
  intent: IntentClassification,
  baseData: Partial<ResponseData>,
  client: Client,
  services: Service[],
  barbers: Barber[],
  barbershopId: string,
  conversation: ChatConversation,
  settings: ChatbotSettings,
  minAdvance: number,
  maxDaysAhead: number,
): Promise<StateTransitionResult> {
  let selectedBarber: Barber | undefined;
  const selectedService = conversation.pendingServiceId ? services.find(s => s.id === conversation.pendingServiceId) : null;
  const serviceDuration = selectedService?.duration || 30;

  if (intent.intent === 'select_barber') {
    if (intent.secondary_value) {
      selectedBarber = barbers.find(b => b.id === intent.secondary_value);
    }
    if (!selectedBarber && intent.value) {
      selectedBarber = barbers.find(b =>
        b.name.toLowerCase().includes(intent.value!.toLowerCase()) ||
        intent.value!.toLowerCase().includes(b.name.toLowerCase())
      );
    }

    if (!selectedBarber) {
      const { summaries, earliestBarber } = await getAvailabilitySummaryForBarbers({
        barbershopId, barbers, serviceDuration, minAdvanceMinutes: minAdvance, maxDaysAhead,
      });

      return {
        newState: 'NEED_BARBER',
        responseData: {
          ...baseData,
          type: 'ask_barber',
          barbers: barbers.map(b => ({ id: b.id, name: b.name })),
          barberSummaries: summaries,
          earliestBarber,
          errorMessage: `Profissional "${intent.value}" não encontrado.`,
          selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
        } as ResponseData,
        conversationUpdates: {},
      };
    }
  } else if (intent.intent === 'no_preference_barber') {
    const { summaries } = await getAvailabilitySummaryForBarbers({
      barbershopId, barbers, serviceDuration, minAdvanceMinutes: minAdvance, maxDaysAhead,
    });

    const leastBusy = getLeastBusyBarber(summaries);
    if (leastBusy) {
      selectedBarber = barbers.find(b => b.id === leastBusy.barberId);
      console.log(`[StateMachine] Sem preferência → barbeiro menos ocupado: ${leastBusy.barberName} (${leastBusy.slotsToday} slots disponíveis hoje)`);
    }

    if (!selectedBarber) {
      return {
        newState: 'NEED_BARBER',
        responseData: {
          ...baseData,
          type: 'no_availability',
          errorMessage: 'Nenhum profissional com horário disponível no momento.',
        } as ResponseData,
        conversationUpdates: {},
      };
    }
  } else {
    const { summaries, earliestBarber } = await getAvailabilitySummaryForBarbers({
      barbershopId, barbers, serviceDuration, minAdvanceMinutes: minAdvance, maxDaysAhead,
    });

    return {
      newState: 'NEED_BARBER',
      responseData: {
        ...baseData,
        type: 'ask_barber',
        barbers: barbers.map(b => ({ id: b.id, name: b.name })),
        barberSummaries: summaries,
        earliestBarber,
        selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  console.log(`[StateMachine] Barbeiro selecionado: ${selectedBarber.name} (${selectedBarber.id})`);

  const slotsResult = await getNextAvailableSlot({
    barbershopId,
    barberId: selectedBarber.id,
    barbers,
    serviceDuration,
    minAdvanceMinutes: minAdvance,
    maxDaysAhead,
  });

  if (!slotsResult.slot) {
    const allBarbersResult = await getNextAvailableSlot({
      barbershopId,
      barbers,
      serviceDuration,
      minAdvanceMinutes: minAdvance,
      maxDaysAhead,
    });
    
    const crossBarberSlots = allBarbersResult.allSlots
      .filter(s => s.barberId !== selectedBarber.id)
      .slice(0, 5);
    
    return {
      newState: 'NEED_BARBER',
      responseData: {
        ...baseData,
        type: 'ask_barber',
        barbers: barbers.map(b => ({ id: b.id, name: b.name })),
        errorMessage: `${selectedBarber.name} não tem horários disponíveis nos próximos dias.`,
        crossBarberSlots,
        selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
      } as ResponseData,
      conversationUpdates: {
        pendingBarberId: null,
      },
      actionTaken: 'barber_selected',
    };
  }

  return {
    newState: 'NEED_TIME',
    responseData: {
      ...baseData,
      type: 'offer_time',
      selectedBarber: { name: selectedBarber.name },
      prioritySlot: slotsResult.slot,
      otherSlots: slotsResult.allSlots.slice(1, 10),
      searchedNextDay: slotsResult.searchedNextDay,
      searchedDate: slotsResult.searchedDate,
      selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
    } as ResponseData,
    conversationUpdates: {
      pendingBarberId: selectedBarber.id,
    },
    actionTaken: 'barber_selected',
  };
}

async function handleNeedTime(
  intent: IntentClassification,
  baseData: Partial<ResponseData>,
  client: Client,
  services: Service[],
  barbers: Barber[],
  barbershopId: string,
  conversation: ChatConversation,
  settings: ChatbotSettings,
  minAdvance: number,
  maxDaysAhead: number,
): Promise<StateTransitionResult> {
  const selectedService = conversation.pendingServiceId ? services.find(s => s.id === conversation.pendingServiceId) : null;
  const selectedBarber = conversation.pendingBarberId ? barbers.find(b => b.id === conversation.pendingBarberId) : null;
  const serviceDuration = selectedService?.duration || 30;

  if (intent.intent === 'accept_time' || intent.intent === 'confirm_booking' ||
      intent.intent === 'provide_time' || intent.intent === 'provide_date') {

    let targetDate = conversation.pendingDate || getBrazilDateString();
    let targetTime: string | undefined;

    if (intent.date_value) {
      targetDate = normalizeDateStr(intent.date_value);
    }

    if (intent.time_value) {
      targetTime = intent.time_value;
    }

    if (intent.intent === 'accept_time' && !targetTime) {
      const slotsResult = await getNextAvailableSlot({
        barbershopId,
        barberId: selectedBarber?.id,
        barbers,
        serviceDuration,
        minAdvanceMinutes: minAdvance,
        maxDaysAhead,
        startDate: targetDate,
      });
      if (slotsResult.slot) {
        targetTime = slotsResult.slot.time;
        targetDate = slotsResult.slot.date;
      }
    }

    if (!targetTime) {
      const slotsResult = await getNextAvailableSlot({
        barbershopId,
        barberId: selectedBarber?.id,
        barbers,
        serviceDuration,
        minAdvanceMinutes: minAdvance,
        maxDaysAhead,
        startDate: targetDate,
      });

      return {
        newState: 'NEED_TIME',
        responseData: {
          ...baseData,
          type: 'offer_time',
          selectedBarber: selectedBarber ? { name: selectedBarber.name } : undefined,
          prioritySlot: slotsResult.slot,
          otherSlots: slotsResult.allSlots.slice(1, 10),
          searchedNextDay: slotsResult.searchedNextDay,
          searchedDate: slotsResult.searchedDate,
          selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    const validation = await validateSlot({
      barbershopId,
      barberId: selectedBarber?.id || '',
      date: targetDate,
      time: targetTime,
      serviceDuration,
      minAdvanceMinutes: minAdvance,
      maxDaysAhead,
    });

    if (!validation.valid) {
      console.log(`[StateMachine] Slot rejeitado: ${targetDate} ${targetTime} - ${validation.error}`);

      const slotsResult = await getNextAvailableSlot({
        barbershopId,
        barberId: selectedBarber?.id,
        barbers,
        serviceDuration,
        minAdvanceMinutes: minAdvance,
        maxDaysAhead,
        startDate: targetDate,
      });

      let bestSlot = slotsResult.slot;
      let alternativeSlots = slotsResult.allSlots.slice(1, 10);

      if (targetTime && slotsResult.allSlots.length > 0) {
        const slotsAfter = slotsResult.allSlots.filter(s => s.time >= targetTime);
        const slotsBefore = slotsResult.allSlots.filter(s => s.time < targetTime);
        const reordered = [...slotsAfter, ...slotsBefore];
        bestSlot = reordered[0] || slotsResult.slot;
        alternativeSlots = reordered.slice(1, 10);
        console.log(`[StateMachine] Slots reordenados próximos a ${targetTime}: melhor=${bestSlot?.time}, alternativas=[${alternativeSlots.map(s => s.time).join(', ')}]`);
      }

      let crossBarberSlots: SlotInfo[] = [];
      if (selectedBarber) {
        const allBarbersResult = await getNextAvailableSlot({
          barbershopId,
          barbers,
          serviceDuration,
          minAdvanceMinutes: minAdvance,
          maxDaysAhead,
          startDate: targetDate,
        });
        crossBarberSlots = allBarbersResult.allSlots
          .filter(s => s.barberId !== selectedBarber.id)
          .slice(0, 5);
        if (targetTime && crossBarberSlots.length > 0) {
          crossBarberSlots.sort((a, b) => {
            const diffA = Math.abs(parseInt(a.time.replace(':', '')) - parseInt(targetTime.replace(':', '')));
            const diffB = Math.abs(parseInt(b.time.replace(':', '')) - parseInt(targetTime.replace(':', '')));
            return diffA - diffB;
          });
        }
        console.log(`[StateMachine] Cross-barber slots: [${crossBarberSlots.map(s => `${s.barberName}@${s.time}`).join(', ')}]`);
      }

      return {
        newState: 'NEED_TIME',
        responseData: {
          ...baseData,
          type: 'offer_time',
          selectedBarber: selectedBarber ? { name: selectedBarber.name } : undefined,
          prioritySlot: bestSlot,
          otherSlots: alternativeSlots,
          crossBarberSlots,
          searchedNextDay: slotsResult.searchedNextDay,
          searchedDate: slotsResult.searchedDate,
          errorMessage: validation.error,
          selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    console.log(`[StateMachine] Slot validado: ${targetDate} ${targetTime}`);

    const isCompanionBooking = conversation.state?.startsWith('companion:');
    const packageInfo = (selectedService && !isCompanionBooking)
      ? await getClientPackageForService(client.id, selectedService.id)
      : null;

    if (packageInfo?.hasPackage) {
      console.log(`[StateMachine] Cliente tem pacote: ${packageInfo.packageName} (${packageInfo.remainingUses} usos). Perguntando se quer usar.`);
      return {
        newState: 'CONFIRMATION',
        responseData: {
          ...baseData,
          type: 'ask_package_use',
          selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
          selectedBarber: selectedBarber ? { name: selectedBarber.name } : undefined,
          selectedDate: targetDate,
          selectedTime: targetTime,
          packageInfo: {
            packageName: packageInfo.packageName!,
            remainingUses: packageInfo.remainingUses!,
            clientPackageId: packageInfo.clientPackageId!,
            servicePrice: selectedService?.price || '0',
          },
        } as ResponseData,
        conversationUpdates: {
          pendingDate: targetDate,
          pendingTime: targetTime,
        },
        actionTaken: 'datetime_selected',
      };
    }

    console.log(`[StateMachine] Sem pacote. Criando agendamento direto: ${targetDate} ${targetTime}`);
    const companionNameForBooking = conversation.state?.startsWith('companion:') ? conversation.state.split(':')[1] : undefined;
    const result = await validateAndCreateAppointment({
      barbershopId,
      clientId: client.id,
      serviceId: conversation.pendingServiceId!,
      barberId: conversation.pendingBarberId!,
      date: targetDate,
      time: targetTime,
      companionName: companionNameForBooking,
    });

    if (result.success) {
      console.log(`[StateMachine] Agendamento criado com sucesso: ${result.appointmentId}`);
      return {
        newState: 'NEED_SERVICE',
        responseData: {
          ...baseData,
          type: 'booking_confirmed',
          bookingSummary: result.summary,
        } as ResponseData,
        conversationUpdates: {
          pendingServiceId: null,
          pendingBarberId: null,
          pendingDate: null,
          pendingTime: null,
          state: 'idle',
        },
        actionTaken: 'appointment_created',
      };
    }

    console.log(`[StateMachine] Erro ao criar agendamento: ${result.error}`);
    return {
      newState: 'NEED_TIME',
      responseData: {
        ...baseData,
        type: 'booking_error',
        errorMessage: result.error,
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  if (intent.intent === 'reject_time') {
    const slotsResult = await getNextAvailableSlot({
      barbershopId,
      barberId: selectedBarber?.id,
      barbers,
      serviceDuration,
      minAdvanceMinutes: minAdvance,
      maxDaysAhead,
      startDate: conversation.pendingDate || getBrazilDateString(),
    });

    let crossBarberSlots: SlotInfo[] = [];
    if (selectedBarber) {
      const allBarbersResult = await getNextAvailableSlot({
        barbershopId,
        barbers,
        serviceDuration,
        minAdvanceMinutes: minAdvance,
        maxDaysAhead,
        startDate: conversation.pendingDate || getBrazilDateString(),
      });
      crossBarberSlots = allBarbersResult.allSlots
        .filter(s => s.barberId !== selectedBarber.id)
        .slice(0, 5);
    }

    return {
      newState: 'NEED_TIME',
      responseData: {
        ...baseData,
        type: 'offer_time',
        selectedBarber: selectedBarber ? { name: selectedBarber.name } : undefined,
        prioritySlot: slotsResult.slot,
        otherSlots: slotsResult.allSlots.slice(1, 10),
        crossBarberSlots,
        searchedNextDay: slotsResult.searchedNextDay,
        searchedDate: slotsResult.searchedDate,
        selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  if (intent.intent === 'select_barber' || intent.intent === 'change_barber' || intent.intent === 'no_preference_barber') {
    let newBarber: Barber | undefined;
    
    if (intent.intent === 'select_barber') {
      if (intent.secondary_value) {
        newBarber = barbers.find(b => b.id === intent.secondary_value);
      }
      if (!newBarber && intent.value) {
        newBarber = barbers.find(b =>
          b.name.toLowerCase().includes(intent.value!.toLowerCase()) ||
          intent.value!.toLowerCase().includes(b.name.toLowerCase())
        );
      }
    }
    
    if (intent.intent === 'no_preference_barber' || intent.intent === 'change_barber') {
      const { summaries, earliestBarber } = await getAvailabilitySummaryForBarbers({
        barbershopId, barbers, serviceDuration, minAdvanceMinutes: minAdvance, maxDaysAhead,
      });
      
      if (intent.intent === 'change_barber') {
        const otherBarbers = barbers.filter(b => b.id !== conversation.pendingBarberId);
        return {
          newState: 'NEED_BARBER',
          responseData: {
            ...baseData,
            type: 'ask_barber',
            barbers: otherBarbers.map(b => ({ id: b.id, name: b.name })),
            barberSummaries: summaries.filter(s => s.barberId !== conversation.pendingBarberId),
            earliestBarber: summaries.filter(s => s.barberId !== conversation.pendingBarberId).find(s => s.firstSlotTime) || null,
            selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
          } as ResponseData,
          conversationUpdates: {
            pendingBarberId: null,
            pendingDate: null,
            pendingTime: null,
          },
        };
      }
      
      if (earliestBarber) {
        newBarber = barbers.find(b => b.id === earliestBarber.barberId);
      }
    }
    
    if (!newBarber) {
      return {
        newState: 'NEED_BARBER',
        responseData: {
          ...baseData,
          type: 'ask_barber',
          barbers: barbers.map(b => ({ id: b.id, name: b.name })),
          selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
          errorMessage: intent.value ? `Profissional "${intent.value}" não encontrado.` : undefined,
        } as ResponseData,
        conversationUpdates: {
          pendingBarberId: null,
          pendingDate: null,
          pendingTime: null,
        },
      };
    }
    
    const targetDate = intent.date_value ? normalizeDateStr(intent.date_value) : (conversation.pendingDate || getBrazilDateString());
    const slotsResult = await getNextAvailableSlot({
      barbershopId,
      barberId: newBarber.id,
      barbers,
      serviceDuration,
      minAdvanceMinutes: minAdvance,
      maxDaysAhead,
      startDate: targetDate,
    });
    
    if (!slotsResult.slot) {
      const allSlotsResult = await getNextAvailableSlot({
        barbershopId,
        barbers,
        serviceDuration,
        minAdvanceMinutes: minAdvance,
        maxDaysAhead,
        startDate: targetDate,
      });
      
      const crossBarberSlots = allSlotsResult.allSlots
        .filter(s => s.barberId !== newBarber!.id)
        .slice(0, 5);
      
      return {
        newState: 'NEED_BARBER',
        responseData: {
          ...baseData,
          type: 'ask_barber',
          barbers: barbers.map(b => ({ id: b.id, name: b.name })),
          errorMessage: `${newBarber.name} não tem horários disponíveis.`,
          crossBarberSlots,
          selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
        } as ResponseData,
        conversationUpdates: {
          pendingBarberId: null,
          pendingDate: null,
          pendingTime: null,
        },
      };
    }
    
    return {
      newState: 'NEED_TIME',
      responseData: {
        ...baseData,
        type: 'offer_time',
        selectedBarber: { name: newBarber.name },
        prioritySlot: slotsResult.slot,
        otherSlots: slotsResult.allSlots.slice(1, 10),
        searchedNextDay: slotsResult.searchedNextDay,
        searchedDate: slotsResult.searchedDate,
        selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
      } as ResponseData,
      conversationUpdates: {
        pendingBarberId: newBarber.id,
        pendingDate: null,
        pendingTime: null,
      },
    };
  }

  const slotsResult = await getNextAvailableSlot({
    barbershopId,
    barberId: selectedBarber?.id,
    barbers,
    serviceDuration,
    minAdvanceMinutes: minAdvance,
    maxDaysAhead,
    startDate: conversation.pendingDate || getBrazilDateString(),
  });

  return {
    newState: 'NEED_TIME',
    responseData: {
      ...baseData,
      type: 'offer_time',
      selectedBarber: selectedBarber ? { name: selectedBarber.name } : undefined,
      prioritySlot: slotsResult.slot,
      otherSlots: slotsResult.allSlots.slice(1, 10),
      searchedNextDay: slotsResult.searchedNextDay,
      searchedDate: slotsResult.searchedDate,
      selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
    } as ResponseData,
    conversationUpdates: {},
  };
}

async function handleConfirmation(
  intent: IntentClassification,
  baseData: Partial<ResponseData>,
  client: Client,
  services: Service[],
  barbers: Barber[],
  barbershopId: string,
  conversation: ChatConversation,
  settings: ChatbotSettings,
  clientAppointments: Appointment[],
): Promise<StateTransitionResult> {
  const selectedService = conversation.pendingServiceId ? services.find(s => s.id === conversation.pendingServiceId) : null;
  const selectedBarber = conversation.pendingBarberId ? barbers.find(b => b.id === conversation.pendingBarberId) : null;

  if (intent.intent === 'use_package_yes' || intent.intent === 'use_package_no') {
    const usePackage = intent.intent === 'use_package_yes';
    let clientPackageId: string | undefined;

    if (usePackage && selectedService) {
      const pkgInfo = await getClientPackageForService(client.id, selectedService.id);
      if (pkgInfo?.hasPackage) {
        clientPackageId = pkgInfo.clientPackageId;
      }
    }

    const companionNamePkg = conversation.state?.startsWith('companion:') ? conversation.state.split(':')[1] : undefined;
    const result = await validateAndCreateAppointment({
      barbershopId,
      clientId: client.id,
      serviceId: conversation.pendingServiceId!,
      barberId: conversation.pendingBarberId!,
      date: conversation.pendingDate!,
      time: conversation.pendingTime!,
      usePackage,
      clientPackageId,
      companionName: companionNamePkg,
    });

    if (result.success) {
      return {
        newState: 'NEED_SERVICE',
        responseData: {
          ...baseData,
          type: 'booking_confirmed',
          bookingSummary: result.summary,
        } as ResponseData,
        conversationUpdates: {
          pendingServiceId: null,
          pendingBarberId: null,
          pendingDate: null,
          pendingTime: null,
          state: 'idle',
        },
        actionTaken: 'appointment_created',
      };
    }

    return {
      newState: 'CONFIRMATION',
      responseData: {
        ...baseData,
        type: 'booking_error',
        errorMessage: result.error,
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  if (intent.intent === 'confirm_booking') {
    const isCompanionBookingConfirm = conversation.state?.startsWith('companion:');
    const packageInfo = (selectedService && !isCompanionBookingConfirm)
      ? await getClientPackageForService(client.id, selectedService.id)
      : null;

    if (packageInfo?.hasPackage) {
      return {
        newState: 'CONFIRMATION',
        responseData: {
          ...baseData,
          type: 'ask_package_use',
          selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
          selectedBarber: selectedBarber ? { name: selectedBarber.name } : undefined,
          selectedDate: conversation.pendingDate || undefined,
          selectedTime: conversation.pendingTime || undefined,
          packageInfo: {
            packageName: packageInfo.packageName!,
            remainingUses: packageInfo.remainingUses!,
            clientPackageId: packageInfo.clientPackageId!,
            servicePrice: selectedService?.price || '0',
          },
        } as ResponseData,
        conversationUpdates: {},
      };
    }

    const companionNameConfirm = conversation.state?.startsWith('companion:') ? conversation.state.split(':')[1] : undefined;
    const result = await validateAndCreateAppointment({
      barbershopId,
      clientId: client.id,
      serviceId: conversation.pendingServiceId!,
      barberId: conversation.pendingBarberId!,
      date: conversation.pendingDate!,
      time: conversation.pendingTime!,
      companionName: companionNameConfirm,
    });

    if (result.success) {
      return {
        newState: 'NEED_SERVICE',
        responseData: {
          ...baseData,
          type: 'booking_confirmed',
          bookingSummary: result.summary,
        } as ResponseData,
        conversationUpdates: {
          pendingServiceId: null,
          pendingBarberId: null,
          pendingDate: null,
          pendingTime: null,
          state: 'idle',
        },
        actionTaken: 'appointment_created',
      };
    }

    return {
      newState: 'CONFIRMATION',
      responseData: {
        ...baseData,
        type: 'booking_error',
        errorMessage: result.error,
      } as ResponseData,
      conversationUpdates: {},
    };
  }

  if (intent.intent === 'reject_booking') {
    return {
      newState: 'NEED_SERVICE',
      responseData: {
        ...baseData,
        type: 'ask_service',
        services: services.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
      } as ResponseData,
      conversationUpdates: {
        pendingServiceId: null,
        pendingBarberId: null,
        pendingDate: null,
        pendingTime: null,
        state: 'idle',
      },
    };
  }

  return {
    newState: 'CONFIRMATION',
    responseData: {
      ...baseData,
      type: 'ask_confirmation',
      selectedService: selectedService ? { name: selectedService.name, price: selectedService.price, duration: selectedService.duration } : undefined,
      selectedBarber: selectedBarber ? { name: selectedBarber.name } : undefined,
      selectedDate: conversation.pendingDate || undefined,
      selectedTime: conversation.pendingTime || undefined,
    } as ResponseData,
    conversationUpdates: {},
  };
}
