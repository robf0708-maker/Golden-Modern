# CLAUDE.md — BarberGold

Sistema de gerenciamento premium para barbearias. SaaS multi-tenant com agendamento, PDV, comissões, relatórios financeiros e chatbot WhatsApp com IA.

---

## Stack

**Frontend:** React 19 + TypeScript, Vite, Wouter (routing), TanStack Query, Tailwind CSS v4, shadcn/ui (Radix UI), React Hook Form + Zod, Framer Motion, Recharts

**Backend:** Node.js (>=20), Express 4, TypeScript (tsx dev / esbuild prod), WebSockets (ws)

**Banco:** PostgreSQL + Drizzle ORM 0.39, drizzle-zod, connect-pg-simple (sessões)

**Integrações:** Stripe (assinaturas), Resend (e-mail), UazAPI (WhatsApp), OpenAI (chatbot), Google Cloud Storage (uploads)

**Auth:** express-session + Passport.js local strategy + bcryptjs

---

## Comandos

```bash
# Desenvolvimento
npm run dev:client          # Vite na porta 5000
npm run dev                 # Backend Express com tsx

# Produção
npm run build               # Vite (frontend) + esbuild (backend)
npm start                   # Inicia build de produção

# Banco de dados
npm run db:push             # Aplica migrações Drizzle
npm run db:restore-dump     # Restaura dump PostgreSQL

# Tipo check
npm check                   # tsc --noEmit
```

---

## Arquitetura

```
Golden-Modern-main/
├── client/src/
│   ├── pages/              # Páginas da aplicação
│   ├── components/         # Componentes reutilizáveis + shadcn/ui
│   ├── lib/api.ts          # Hooks React Query + fetchAPI()
│   ├── hooks/              # use-mobile, use-toast, use-upload
│   └── App.tsx             # Roteamento (Wouter)
├── server/
│   ├── index.ts            # Setup Express + jobs de background
│   ├── routes.ts           # TODOS os endpoints da API (246KB)
│   ├── storage.ts          # Camada de acesso ao banco (88KB)
│   ├── chatbot/            # Chatbot WhatsApp modular
│   │   ├── handler.ts      # Orquestrador de webhooks
│   │   ├── state-machine.ts
│   │   ├── booking-service.ts
│   │   ├── availability-service.ts
│   │   └── response-formatter.ts
│   ├── messaging/          # Sistema de mensagens agendadas
│   │   ├── scheduler.ts    # Agenda mensagens
│   │   ├── sender-job.ts   # Job a cada 60s que envia mensagens pendentes
│   │   ├── campaign-job.ts # Job a cada 30s para campanhas
│   │   └── templates.ts
│   ├── reports/            # Relatórios financeiros (DRE)
│   └── utils/
│       ├── phone.ts        # normalizePhone() — E.164 (+55XXXXXXXXXXX)
│       └── timezone.ts
├── shared/
│   └── schema.ts           # Schema Drizzle completo (37KB)
├── script/                 # Build e scripts de migração
├── docs/                   # Documentação e migrações manuais
├── drizzle.config.ts
└── vite.config.ts
```

---

## Multi-Tenant

- Raiz do tenant: tabela `barbershops`
- **Todas as tabelas** têm FK `barbershopId` — sempre filtre por isso
- Sessão armazena: `userId`, `barbershopId`, e opcionalmente `barberId` (painel do barbeiro)
- Nunca cruzar dados entre barbershops diferentes

---

## Banco de Dados

**Schema:** `shared/schema.ts`  
**Config:** `drizzle.config.ts` — aponta para `DATABASE_URL`

Tabelas principais:
- `barbershops` — tenant root
- `users` — admins/gerentes
- `barbers` — funcionários (auth separada)
- `clients` — clientes com funil de retenção
- `appointments` — agendamentos
- `comandas` + `comanda_items` — PDV/transações
- `cash_register` + `cash_transactions` — caixa diário
- `commissions` + `commission_payments` — comissões dos barbeiros
- `packages` + `subscriptions` — pacotes recorrentes
- `scheduled_messages` — fila de mensagens WhatsApp/e-mail
- `chat_conversations` — estado das conversas do chatbot
- `campaigns` + `campaign_batches` — marketing WhatsApp

**Convenção de timezone:** "local time as UTC" — 14:00 de São Paulo = `14:00Z` no banco. Nunca converter.

**Migrações manuais** ficam em `docs/migrations/` como arquivos SQL.

---

## Chatbot WhatsApp (Anti-Alucinação)

Arquitetura modular com separação estrita de responsabilidades:

1. **state-machine.ts** — transições determinísticas (código controla, não IA)
2. **availability-service.ts** — cálculo de slots (funções puras, zero IA)
3. **booking-service.ts** — SSOT para criar/cancelar agendamentos (re-valida antes de persistir)
4. **response-formatter.ts** — IA apenas formata linguagem natural (dados já computados)
5. **handler.ts** — orquestrador (~250 linhas): webhook, human takeover, detecção out-of-scope

**Regra imutável:** Código controla lógica de negócio. IA só classifica intenção e formata respostas.

**Human Takeover:**
- Palavras-chave out-of-scope → takeover automático
- 3 intenções `unclear` consecutivas → escalonamento
- Duração: 24h com auto-expiração
- Campo: `humanTakeoverUntil` em `chat_conversations`
- Admin digita `/liberar` para limpar imediatamente

---

## Jobs de Background (server/index.ts)

Iniciam automaticamente ao subir o servidor:

| Job | Intervalo | Responsabilidade |
|-----|-----------|-----------------|
| `sender-job.ts` | 60s | Envia mensagens WhatsApp/email pendentes |
| `campaign-job.ts` | 30s | Dispara campanhas de marketing |
| Funil | diário | Recalcula métricas de funil dos clientes |

**IMPORTANTE:** Nunca reiniciar o servidor sem permissão do usuário — os jobs disparam automaticamente e podem enviar mensagens reais aos clientes.

---

## Telefones

- Sempre usar `normalizePhone()` de `server/utils/phone.ts`
- Formato E.164: `+55XXXXXXXXXXX`
- Aplicar em todos os pontos de entrada (webhooks, formulários, bookings)

---

## Comissões

- Tipos: `'service'` | `'package_use'` | `'fee_deduction'`
- Positivas: serviços e uso de pacotes
- Negativas: deduções por taxas de pagamento
- Pagamentos separados em `commission_payments`

---

## Variáveis de Ambiente

```bash
DATABASE_URL=postgresql://...       # Obrigatório
SESSION_SECRET=<random-32-bytes>    # Obrigatório
NODE_ENV=production
PORT=5000

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# WhatsApp (UazAPI)
UAZAPI_URL=https://api.uaz.ai
UAZAPI_MASTER_TOKEN=
UAZAPI_INSTANCE_TOKEN=

# Email (Resend)
RESEND_API_KEY=
```

---

## Padrões de API

- Todos endpoints em `/api/*`
- Webhooks: `/api/webhook/*` (Stripe, WhatsApp)
- Público (sem auth): `/api/public/*`
- Painel do barbeiro: `/api/barber/*`
- Autenticação: session-based com cookies httpOnly
- Erros retornam `{ message: string, status: number }`
- Validação de inputs com Zod em todos os endpoints

---

## Frontend — Roteamento (App.tsx)

Rotas protegidas com `AuthGuard`. Painel do barbeiro tem auth separada (`/barber/login`). Página de agendamento público em `/book/:slug` (sem auth).

---

## Arquivos Chave para Entender o Sistema

| Arquivo | O que contém |
|---------|-------------|
| `shared/schema.ts` | Todo o modelo de dados |
| `server/routes.ts` | Todos os endpoints (246KB) |
| `server/storage.ts` | Todas as queries ao banco (88KB) |
| `client/src/lib/api.ts` | Hooks React Query do frontend |
| `client/src/App.tsx` | Roteamento do frontend |
| `replit.md` | Visão geral da arquitetura |
