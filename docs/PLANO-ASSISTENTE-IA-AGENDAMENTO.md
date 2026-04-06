# Plano: Assistente IA de Agendamento

## Objetivo

Corrigir e simplificar o assistente de IA existente para funcionar de forma focada
exclusivamente em **agendar** e **cancelar** agendamentos via WhatsApp, com respostas
humanizadas via OpenAI.

---

## Diagnóstico Atual

### O que existe
- `server/chatbot/handler.ts` — ponto de entrada das mensagens recebidas
- `server/chatbot/state-machine.ts` — máquina de estados (1496 linhas)
- `server/chatbot/availability-service.ts` — verifica horários disponíveis
- `server/chatbot/booking-service.ts` — cria e cancela agendamentos
- `server/chatbot/response-formatter.ts` — formata respostas com OpenAI gpt-4o-mini

### Problemas identificados

| # | Problema | Impacto | Arquivo |
|---|----------|---------|---------|
| 1 | QR code UazAPI retorna 404 | Bot não recebe/envia mensagens | `debug-933675.log` |
| 2 | API Key OpenAI não confirmada | Respostas caem no fallback estático | `.env` |
| 3 | State-machine com features extras | Aumenta chance de bugs, dificulta manutenção | `state-machine.ts` |
| 4 | Lógica de acompanhante | Fora do escopo desejado | `state-machine.ts` |
| 5 | Lógica de pacotes/multi-serviço | Fora do escopo desejado | `state-machine.ts` |

---

## Fluxo Desejado (Agendar / Cancelar)

```
Cliente envia mensagem
        │
        ▼
  [Chatbot ativo?] ──Não──► Silêncio
        │ Sim
        ▼
  [Human takeover?] ──Sim──► Silêncio (admin respondendo)
        │ Não
        ▼
  [Classificar intenção] (OpenAI)
        │
   ┌────┴────┐
   │         │
AGENDAR  CANCELAR
   │         │
   ▼         ▼
[FLUXO 1] [FLUXO 2]
```

### Fluxo 1 — Agendar

```
STEP 1: NEED_NAME (cliente novo)
  └─ Perguntar o nome
  └─ Salvar nome no cadastro

STEP 2: NEED_SERVICE
  └─ Perguntar qual serviço deseja
  └─ Listar serviços disponíveis de forma natural

STEP 3: NEED_BARBER
  └─ Perguntar preferência de profissional
  └─ Aceita "qualquer um" / "sem preferência"

STEP 4: NEED_TIME
  └─ Buscar próximo horário disponível
  └─ Oferecer horário prioritário
  └─ Oferecer alternativas se recusar
  └─ Aceitar data/hora específica do cliente

STEP 5: CONFIRMATION
  └─ Mostrar resumo completo
  └─ Aguardar confirmação ("sim" / "não")
  └─ Criar agendamento no banco
  └─ Disparar notificações de confirmação
```

### Fluxo 2 — Cancelar

```
STEP 1: Detectar intenção de cancelar

STEP 2: Buscar agendamentos futuros do cliente
  └─ Sem agendamentos → informar educadamente
  └─ 1 agendamento → confirmar cancelamento direto
  └─ Múltiplos → perguntar qual deseja cancelar (AWAITING_CANCEL_CONFIRMATION)

STEP 3: Cancelar no banco
  └─ Atualizar status para 'cancelled'
  └─ Disparar mensagem de cancelamento
  └─ Confirmar ao cliente
```

---

## Estrutura dos Arquivos (Após Limpeza)

```
server/chatbot/
├── handler.ts              (manter — ponto de entrada)
├── state-machine.ts        (SIMPLIFICAR — remover acompanhante, pacotes, multi-serviço)
├── availability-service.ts (manter — sem alterações)
├── booking-service.ts      (manter — sem alterações)
├── response-formatter.ts   (manter — humanização via OpenAI)
└── index.ts                (manter)
```

---

## Estados da Conversa

```typescript
type ConversationState =
  | 'NEED_NAME'                    // cliente novo, precisa do nome
  | 'NEED_SERVICE'                 // aguardando escolha de serviço
  | 'NEED_BARBER'                  // aguardando escolha de barbeiro
  | 'NEED_TIME'                    // aguardando aceite/rejeite de horário
  | 'CONFIRMATION'                 // aguardando confirmação final
  | 'AWAITING_CANCEL_CONFIRMATION' // múltiplos agendamentos, aguardando qual cancelar
```

---

## Intents Suportados (Simplificado)

```typescript
type Intent =
  | 'provide_name'          // cliente informa o nome
  | 'select_service'        // cliente escolhe serviço
  | 'select_barber'         // cliente escolhe barbeiro
  | 'no_preference_barber'  // "qualquer um", "tanto faz"
  | 'accept_time'           // "sim", "pode ser", "ok"
  | 'reject_time'           // "não", "outro horário"
  | 'provide_date'          // cliente informa data
  | 'provide_time'          // cliente informa horário
  | 'confirm_booking'       // confirmação final
  | 'reject_booking'        // desistência
  | 'cancel_appointment'    // quer cancelar agendamento
  | 'greeting'              // saudação
  | 'unclear'               // não entendeu
```

### Intents REMOVIDOS (fora do escopo)
- `use_package_yes / use_package_no` — lógica de pacotes
- `book_for_companion` — agendar para outra pessoa
- `provide_companion_name` — nome do acompanhante
- `select_multiple_services` — múltiplos serviços de uma vez

---

## Humanização (Como Funciona)

O assistente usa **OpenAI gpt-4o-mini** em dois momentos:

### 1. Classificar intenção (`classifyIntent`)
- Entende linguagem natural: "quero dar uma aparada" → `select_service: "barba"`
- Entende datas relativas: "amanhã de tarde" → `provide_date + provide_time`
- Entende negativas: "não" no estado NEED_BARBER → `no_preference_barber` (não rejeição)

### 2. Formatar resposta (`formatResponse`)
- Recebe os dados estruturados e gera texto natural
- Chama o cliente pelo nome em toda resposta
- Varia as frases (não repete sempre a mesma)
- Tom descontraído, adequado para barbearia
- Fallback estático caso a API esteja indisponível

### Variáveis de ambiente necessárias
```env
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
AI_INTEGRATIONS_OPENAI_BASE_URL=    # opcional, para OpenRouter etc.
```

---

## Passos de Execução

### Passo 1 — Corrigir conexão WhatsApp
- [ ] Verificar instância no painel UazAPI (`estayle0708.uazapi.com`)
- [ ] Confirmar nome da instância: `barbergold-{barbershopId}`
- [ ] Confirmar token da instância no banco (`chatbotSettings.uazapiInstanceToken`)
- [ ] Testar endpoint de QR code manualmente
- [ ] Verificar se `UAZAPI_BASE_URL` no `.env` está correto

### Passo 2 — Confirmar OpenAI API Key
- [ ] Checar se `AI_INTEGRATIONS_OPENAI_API_KEY` está definida no `.env`
- [ ] Testar uma chamada simples para confirmar que a key funciona
- [ ] Verificar se `AI_INTEGRATIONS_OPENAI_BASE_URL` é necessário

### Passo 3 — Simplificar state-machine.ts
- [ ] Remover estados/intents de acompanhante (`book_for_companion`, `provide_companion_name`)
- [ ] Remover lógica de pacotes (`use_package_yes`, `use_package_no`, `ask_package_use`)
- [ ] Remover `select_multiple_services`
- [ ] Remover `ask_companion_name` do ResponseData
- [ ] Remover `max_participants` / `BookingSession` multi-participante
- [ ] Atualizar prompt de classificação de intents
- [ ] Testar fluxo completo: agendar + cancelar

### Passo 4 — Teste end-to-end
- [ ] Simular conversa de novo cliente via webhook
- [ ] Simular agendamento completo
- [ ] Simular cancelamento
- [ ] Verificar se notificações são disparadas corretamente
- [ ] Verificar logs (`[Chatbot]`, `[StateMachine]`, `[ResponseFormatter]`)

---

## Regras de Comportamento do Bot

| Situação | Comportamento |
|----------|--------------|
| Mensagem fora do escopo | Transfere para equipe humana (human takeover 24h) |
| 3 mensagens incompreensíveis seguidas | Ativa human takeover |
| Admin envia `/liberar` | Desativa human takeover |
| Conversa inativa > 30min com dados pendentes | Reseta estado |
| Cliente sem agendamentos tenta cancelar | Informa educadamente |
| Horário indisponível | Oferece próximo slot disponível |

---

## Referências de Código

| Arquivo | Linhas-chave |
|---------|-------------|
| `server/chatbot/handler.ts` | L63 — `handleIncomingMessage()` (entrada principal) |
| `server/chatbot/state-machine.ts` | L111 — `calculateCurrentState()`, L201 — `classifyIntent()`, L327 — `processStateTransition()` |
| `server/chatbot/availability-service.ts` | `checkBarberAvailabilityWithDuration()` |
| `server/chatbot/booking-service.ts` | `validateAndCreateAppointment()`, `cancelAppointment()` |
| `server/chatbot/response-formatter.ts` | L33 — `formatResponse()` |
| `server/routes.ts` | L4744 — webhook WhatsApp |
| `shared/schema.ts` | L — tabelas `chatbotSettings`, `chatConversations`, `appointments` |
