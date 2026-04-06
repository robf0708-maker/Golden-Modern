import OpenAI from "openai";
import type { ResponseData } from "./state-machine";

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

const FORMAT_RESPONSE_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "format_response",
    description: "Formata a resposta para o cliente em linguagem natural. SEMPRE use esta função.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "A mensagem formatada em linguagem natural para enviar ao cliente via WhatsApp",
        },
      },
      required: ["message"],
    },
  },
};

export async function formatResponse(
  data: ResponseData,
  messageHistory: Array<{ role: string; content: string }>,
  systemPrompt?: string,
): Promise<string> {
  const dataBlock = buildDataBlock(data);

  if (!dataBlock) {
    return buildFallbackMessage(data);
  }

  const formatterPrompt = buildFormatterPrompt(data, dataBlock, systemPrompt);

  try {
    const openai = getOpenAIClient();

    const recentMessages = messageHistory.slice(-6);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: formatterPrompt },
        ...recentMessages.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      tools: [FORMAT_RESPONSE_TOOL],
      tool_choice: { type: "function", function: { name: "format_response" } },
      max_tokens: 400,
      temperature: 0.6,
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0] as any;
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      if (args.message) {
        console.log(`[ResponseFormatter] Mensagem formatada pela IA: ${args.message.substring(0, 80)}...`);
        return args.message;
      }
    }

    console.warn(`[ResponseFormatter] IA não retornou mensagem. Usando fallback.`);
    return buildFallbackMessage(data);
  } catch (error) {
    console.error(`[ResponseFormatter] Erro ao formatar com IA:`, error);
    return buildFallbackMessage(data);
  }
}

function buildFormatterPrompt(data: ResponseData, dataBlock: string, customSystemPrompt?: string): string {
  const baseRules = `Você é um atendente de barbearia formatando mensagens para WhatsApp.

REGRAS ABSOLUTAS:
1. Use APENAS os dados fornecidos no bloco DADOS abaixo. NUNCA invente horários, datas, preços ou nomes.
2. Se um dado não está no bloco DADOS, ele NÃO EXISTE. Não o mencione.
3. Seja breve, natural e educado. Frases curtas.
4. Use emojis com moderação (máximo 2-3 por mensagem).
5. NUNCA use listas numeradas.
6. NUNCA mostre IDs internos ao cliente.
7. Responda em português brasileiro.
8. SEMPRE use o nome do cliente (campo CLIENTE nos DADOS) na resposta. Chame o cliente pelo nome em TODAS as mensagens, sem exceção.

${customSystemPrompt ? `INSTRUÇÕES ADICIONAIS DA BARBEARIA:\n${customSystemPrompt}\n` : ''}

PROIBIÇÕES:
- PROIBIDO inventar qualquer horário, data ou informação não presente nos DADOS
- PROIBIDO sugerir horários alternativos que não estejam listados nos DADOS
- PROIBIDO mencionar preços fora do contexto de confirmação
- PROIBIDO fazer perguntas fora do escopo da TAREFA`;

  return `${baseRules}\n\n${dataBlock}`;
}

function buildDataBlock(data: ResponseData): string {
  const lines: string[] = [];
  lines.push(`BARBEARIA: ${data.barbershopName}`);
  lines.push(`CLIENTE: ${data.clientName}`);
  lines.push(`DATA ATUAL: ${data.currentDate} ${data.currentTime}`);

  switch (data.type) {
    case 'greeting_new':
      lines.push('');
      lines.push('TAREFA: Cumprimente o cliente (é novo) e pergunte APENAS o nome dele. Nada mais.');
      if (data.customGreetingNew) {
        lines.push(`SAUDAÇÃO SUGERIDA: ${data.customGreetingNew.replace('{barbershopName}', data.barbershopName)}`);
      }
      break;

    case 'greeting_returning':
      lines.push('');
      lines.push(`TAREFA: Cumprimente o cliente pelo nome e pergunte qual serviço deseja. Seja breve e natural.`);
      if (data.customGreetingReturning) {
        lines.push(`SAUDAÇÃO SUGERIDA: ${data.customGreetingReturning.replace('{clientName}', data.clientName)}`);
      }
      if (data.existingAppointments && data.existingAppointments.length > 0) {
        lines.push('');
        lines.push('AGENDAMENTOS EXISTENTES DO CLIENTE (informe sobre eles):');
        for (const appt of data.existingAppointments) {
          lines.push(`- ${appt.date} às ${appt.time} - ${appt.serviceName} com ${appt.barberName}`);
        }
      }
      if (data.services) {
        lines.push('');
        lines.push('SERVIÇOS DISPONÍVEIS (NÃO liste para o cliente, apenas use para entender se ele mencionar):');
        for (const s of data.services) {
          lines.push(`- ${s.name} (${s.duration}min)`);
        }
      }
      break;

    case 'ask_service':
      lines.push('');
      lines.push('TAREFA: Pergunte qual serviço o cliente deseja. NÃO mostre preços. Seja natural, sem listas numeradas.');
      if (data.errorMessage) {
        lines.push(`ERRO: ${data.errorMessage}`);
      }
      if (data.existingAppointments && data.existingAppointments.length > 0) {
        lines.push('');
        lines.push('AGENDAMENTOS EXISTENTES DO CLIENTE (informe se é a primeira mensagem):');
        for (const appt of data.existingAppointments) {
          lines.push(`- ${appt.date} às ${appt.time} - ${appt.serviceName} com ${appt.barberName}`);
        }
      }
      if (data.services) {
        lines.push('');
        lines.push('SERVIÇOS DISPONÍVEIS (mencione de forma natural se necessário):');
        for (const s of data.services) {
          lines.push(`- ${s.name} (${s.duration}min)`);
        }
      }
      break;

    case 'ask_barber':
      lines.push('');
      lines.push('TAREFA: Pergunte se o cliente tem preferência de profissional. Mostre os profissionais disponíveis.');
      if (data.errorMessage) {
        lines.push(`ERRO: ${data.errorMessage}`);
      }
      if (data.selectedService) {
        lines.push(`SERVIÇO ESCOLHIDO: ${data.selectedService.name}`);
      }
      if (data.barbers) {
        lines.push('');
        lines.push('PROFISSIONAIS DISPONÍVEIS:');
        for (const b of data.barbers) {
          lines.push(`- ${b.name}`);
        }
      }
      if (data.crossBarberSlots && data.crossBarberSlots.length > 0) {
        lines.push('');
        lines.push('HORÁRIOS DISPONÍVEIS COM OUTROS PROFISSIONAIS (mencione como sugestão):');
        for (const s of data.crossBarberSlots) {
          lines.push(`- ${s.barberName} às ${s.time} (${s.date})`);
        }
      }
      break;

    case 'offer_time':
      lines.push('');
      if (data.errorMessage) {
        lines.push(`AVISO: ${data.errorMessage}`);
        lines.push('');
      }
      lines.push('TAREFA: Ofereça o HORÁRIO PRIORITÁRIO ao cliente. Se ele recusar, ofereça outros horários ou profissionais disponíveis. Informe que pode trocar de profissional se quiser.');
      if (data.selectedBarber) {
        lines.push(`PROFISSIONAL: ${data.selectedBarber.name}`);
      }
      if (data.searchedNextDay) {
        lines.push(`AVISO: Não havia horários para a data pedida. O próximo dia disponível é ${data.searchedDate}.`);
      }
      if (data.prioritySlot) {
        lines.push('');
        lines.push(`HORÁRIO PRIORITÁRIO: ${data.prioritySlot.date} às ${data.prioritySlot.time} com ${data.prioritySlot.barberName}`);
      }
      if (data.otherSlots && data.otherSlots.length > 0) {
        lines.push('');
        lines.push('OUTROS HORÁRIOS DISPONÍVEIS:');
        for (const s of data.otherSlots) {
          lines.push(`- ${s.time}`);
        }
      }
      if (data.crossBarberSlots && data.crossBarberSlots.length > 0) {
        lines.push('');
        lines.push('HORÁRIOS COM OUTROS PROFISSIONAIS (ofereça como alternativa):');
        for (const s of data.crossBarberSlots) {
          lines.push(`- ${s.time} com ${s.barberName}`);
        }
        lines.push('INSTRUÇÃO: Mencione esses horários como opção caso o cliente queira outro profissional ou horário mais conveniente.');
      }
      if (!data.prioritySlot && (!data.otherSlots || data.otherSlots.length === 0)) {
        lines.push('SEM HORÁRIOS DISPONÍVEIS. Informe o cliente educadamente.');
      }
      break;

    case 'ask_confirmation':
      lines.push('');
      lines.push('TAREFA: Mostre o resumo e PERGUNTE se o cliente deseja confirmar.');
      lines.push('PROIBIDO: Dizer "confirmado", "agendado", "marcado" ou qualquer frase que indique que já foi feito. O agendamento AINDA NÃO foi criado.');
      lines.push('OBRIGATÓRIO: Termine a mensagem com uma PERGUNTA como "Posso confirmar?" ou "Confirmo para você?"');
      if (data.selectedService) {
        lines.push(`SERVIÇO: ${data.selectedService.name} - R$${data.selectedService.price}`);
        lines.push(`DURAÇÃO: ${data.selectedService.duration} minutos`);
      }
      if (data.selectedBarber) {
        lines.push(`PROFISSIONAL: ${data.selectedBarber.name}`);
      }
      if (data.selectedDate) {
        lines.push(`DATA: ${data.selectedDate}`);
      }
      if (data.selectedTime) {
        lines.push(`HORÁRIO: ${data.selectedTime}`);
      }
      if (data.packageInfo) {
        lines.push('');
        lines.push(`PACOTE DISPONÍVEL: ${data.packageInfo.packageName} (${data.packageInfo.remainingUses} usos restantes)`);
        lines.push(`PERGUNTE: Deseja usar o pacote (R$0,00) ou pagar avulso (R$${data.packageInfo.servicePrice})?`);
      }
      break;

    case 'ask_package_use':
      lines.push('');
      lines.push('TAREFA: Informe o resumo do agendamento e PERGUNTE se deseja usar o pacote ou pagar avulso.');
      lines.push('PROIBIDO: Dizer "confirmado", "agendado" ou "marcado". O agendamento AINDA NÃO foi criado.');
      lines.push('OBRIGATÓRIO: Termine com uma PERGUNTA clara sobre usar o pacote ou pagar avulso.');
      if (data.selectedService) {
        lines.push(`SERVIÇO: ${data.selectedService.name} - R$${data.selectedService.price}`);
      }
      if (data.selectedBarber) {
        lines.push(`PROFISSIONAL: ${data.selectedBarber.name}`);
      }
      if (data.selectedDate) {
        lines.push(`DATA: ${data.selectedDate}`);
      }
      if (data.selectedTime) {
        lines.push(`HORÁRIO: ${data.selectedTime}`);
      }
      if (data.packageInfo) {
        lines.push('');
        lines.push(`PACOTE DISPONÍVEL: ${data.packageInfo.packageName} (${data.packageInfo.remainingUses} usos restantes)`);
        lines.push(`COM PACOTE: R$0,00 (desconta 1 uso do pacote)`);
        lines.push(`AVULSO: R$${data.packageInfo.servicePrice}`);
      }
      break;

    case 'booking_confirmed':
      lines.push('');
      lines.push('TAREFA: Confirme o agendamento com entusiasmo e mostre o resumo.');
      if (data.bookingSummary) {
        lines.push(`SERVIÇO: ${data.bookingSummary.serviceName}`);
        lines.push(`PROFISSIONAL: ${data.bookingSummary.barberName}`);
        lines.push(`DATA: ${data.bookingSummary.date}`);
        lines.push(`HORÁRIO: ${data.bookingSummary.time}`);
        lines.push(`DURAÇÃO: ${data.bookingSummary.duration} minutos`);
        if (data.bookingSummary.usedPackage) {
          lines.push(`PACOTE: Uso registrado (R$0,00)`);
        }
      }
      break;

    case 'booking_error':
      lines.push('');
      lines.push('TAREFA: Informe o erro ao cliente de forma educada e sugira alternativa se houver.');
      if (data.errorMessage) {
        lines.push(`ERRO: ${data.errorMessage}`);
      }
      break;

    case 'cancelled':
      lines.push('');
      lines.push('TAREFA: Confirme o cancelamento ao cliente.');
      if (data.cancelledDate && data.cancelledTime) {
        lines.push(`AGENDAMENTO CANCELADO: ${data.cancelledDate} às ${data.cancelledTime}`);
      }
      break;

    case 'ask_cancel_scope':
      lines.push('');
      lines.push('TAREFA: O cliente quer cancelar mas tem múltiplos agendamentos. Pergunte qual deseja cancelar.');
      if (data.existingAppointments) {
        lines.push('');
        lines.push('AGENDAMENTOS DO CLIENTE:');
        for (const appt of data.existingAppointments) {
          lines.push(`${appt.index}. ${appt.date} às ${appt.time} - ${appt.serviceName} com ${appt.barberName}`);
        }
      }
      break;

    case 'rescheduling_start':
      lines.push('');
      lines.push('TAREFA: Informe que o agendamento anterior foi cancelado e pergunte qual serviço o cliente deseja para o novo agendamento.');
      if (data.cancelledDate && data.cancelledTime) {
        lines.push(`AGENDAMENTO CANCELADO: ${data.cancelledDate} às ${data.cancelledTime}`);
      }
      if (data.services) {
        lines.push('');
        lines.push('SERVIÇOS DISPONÍVEIS (mencione de forma natural):');
        for (const s of data.services) {
          lines.push(`- ${s.name} (${s.duration}min)`);
        }
      }
      break;

    case 'ask_companion_name':
      lines.push('');
      lines.push('TAREFA: Pergunte o nome da pessoa para quem o cliente quer agendar (acompanhante). Seja breve e simpático.');
      break;

    case 'no_availability':
      lines.push('');
      lines.push('TAREFA: Informe que não há horários disponíveis no momento. Seja educado.');
      if (data.errorMessage) {
        lines.push(`DETALHE: ${data.errorMessage}`);
      }
      break;

    case 'error':
      lines.push('');
      lines.push('TAREFA: Informe o erro ao cliente de forma educada.');
      if (data.errorMessage) {
        lines.push(`ERRO: ${data.errorMessage}`);
      }
      break;

    case 'session_expired':
      lines.push('');
      lines.push('TAREFA: Informe que a sessão expirou e o cliente precisa recomeçar.');
      break;

    case 'max_participants':
      lines.push('');
      lines.push('TAREFA: Informe educadamente que o limite máximo de participantes por sessão foi atingido.');
      break;

    default:
      return '';
  }

  return `DADOS (USE SOMENTE ESTES):\n${lines.join('\n')}`;
}

function buildFallbackMessage(data: ResponseData): string {
  switch (data.type) {
    case 'greeting_new':
      return `Olá! Seja bem-vindo à ${data.barbershopName}! Como posso ajudá-lo? Qual é o seu nome?`;

    case 'greeting_returning':
      let greeting = `Olá, ${data.clientName}! O que manda para nós hoje?`;
      if (data.existingAppointments && data.existingAppointments.length > 0) {
        const appt = data.existingAppointments[0];
        greeting += ` Vi que você já tem um agendamento para ${appt.date} às ${appt.time}.`;
      }
      return greeting;

    case 'ask_service':
      if (data.errorMessage) {
        return `${data.errorMessage} Qual serviço você gostaria?`;
      }
      return `Qual serviço você gostaria?`;

    case 'ask_barber':
      return `Tem preferência de profissional?`;

    case 'offer_time':
      if (data.prioritySlot) {
        let msg = '';
        if (data.errorMessage) {
          msg += `${data.errorMessage} `;
        }
        if (data.searchedNextDay) {
          msg += `O próximo horário disponível é ${data.prioritySlot.date} às ${data.prioritySlot.time} com ${data.prioritySlot.barberName}. Pode ser?`;
        } else {
          msg += `Tenho horário às ${data.prioritySlot.time} com ${data.prioritySlot.barberName}. Pode ser?`;
        }
        return msg;
      }
      return data.errorMessage || 'Sem horários disponíveis no momento.';

    case 'ask_confirmation': {
      let msg = 'Resumo do agendamento:\n';
      if (data.selectedService) msg += `✂️ ${data.selectedService.name} - R$${data.selectedService.price}\n`;
      if (data.selectedBarber) msg += `💇 ${data.selectedBarber.name}\n`;
      if (data.selectedDate) msg += `📅 ${data.selectedDate}\n`;
      if (data.selectedTime) msg += `🕐 ${data.selectedTime}\n`;
      msg += '\nConfirma?';
      return msg;
    }

    case 'ask_package_use': {
      let msg = '';
      if (data.selectedService) msg += `${data.selectedService.name}`;
      if (data.selectedBarber) msg += ` com ${data.selectedBarber.name}`;
      if (data.selectedDate) msg += ` em ${data.selectedDate}`;
      if (data.selectedTime) msg += ` às ${data.selectedTime}`;
      msg += '.\n\n';
      if (data.packageInfo) {
        msg += `Você tem o pacote "${data.packageInfo.packageName}" (${data.packageInfo.remainingUses} usos restantes). Deseja usar o pacote (R$0,00) ou pagar avulso (R$${data.packageInfo.servicePrice})?`;
      } else {
        msg += 'Posso confirmar para você?';
      }
      return msg;
    }

    case 'booking_confirmed':
      if (data.bookingSummary) {
        return `Agendamento confirmado! ✂️ ${data.bookingSummary.serviceName} com ${data.bookingSummary.barberName} em ${data.bookingSummary.date} às ${data.bookingSummary.time}. Te esperamos!`;
      }
      return 'Agendamento confirmado! Te esperamos!';

    case 'booking_error':
      return data.errorMessage || 'Erro ao criar agendamento.';

    case 'cancelled':
      return `Agendamento de ${data.cancelledDate} às ${data.cancelledTime} cancelado com sucesso.`;

    case 'ask_cancel_scope':
      if (data.existingAppointments) {
        return `Você tem ${data.existingAppointments.length} agendamentos. Qual deseja cancelar?`;
      }
      return 'Qual agendamento deseja cancelar?';

    case 'rescheduling_start':
      return `Tudo certo, ${data.clientName}! Agendamento cancelado. Vamos marcar um novo horário. Qual serviço você deseja?`;

    case 'ask_companion_name':
      return `${data.clientName}, qual o nome da pessoa para quem você quer agendar?`;

    case 'no_availability':
      return data.errorMessage || 'Sem horários disponíveis no momento.';

    case 'error':
      return data.errorMessage || 'Desculpe, ocorreu um erro. Tente novamente.';

    case 'session_expired':
      return 'Sua sessão expirou. Vamos recomeçar?';

    case 'max_participants':
      return 'O limite máximo de participantes por sessão foi atingido.';

    default:
      return 'Desculpe, não consegui processar sua mensagem.';
  }
}
