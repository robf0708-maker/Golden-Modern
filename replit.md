# BarberGold - Sistema de Gestão para Barbearias

## Overview

BarberGold is a premium barbershop management system built as a full-stack web application. It provides multi-tenant support for barbershops to manage appointments, point-of-sale transactions, clients, services, products, packages, and financial operations including cash register management and commission tracking.

The application is designed with a dark luxury theme featuring gold accents, targeting high-end barbershops that need comprehensive business management tools.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme variables for dark mode luxury aesthetic
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript compiled with tsx for development, esbuild for production
- **API Pattern**: RESTful JSON API with session-based authentication
- **Session Management**: express-session with PostgreSQL store (connect-pg-simple)
- **Password Security**: bcryptjs for password hashing

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Managed via drizzle-kit (`npm run db:push`)

### Multi-Tenant Design
The system implements multi-tenancy at the barbershop level:
- Each barbershop has its own isolated data
- Users are associated with a specific barbershop
- All queries filter by `barbershopId` to ensure data isolation

### Key Data Entities
- **Users**: Authentication and barbershop association
- **Barbershops**: Tenant containers
- **Barbers**: Staff with commission configuration
- **Clients**: Customer records with visit history
- **Services**: Available services with pricing and duration
- **Products**: Inventory items for sale
- **Packages**: Service bundles (e.g., "10 haircuts for R$200")
- **Appointments**: Scheduled services with conflict detection
- **Comandas**: Point-of-sale tickets with itemized transactions
- **Commissions**: Comissões positivas (serviços e uso de pacote) e negativas (deduções por compras do profissional). NOTA: Vendas de pacote (package/package_sale/subscription_sale) NÃO geram comissão - apenas uso de pacote (package_use) gera.
- **Cash Register**: Daily cash management with transactions
- **ChatbotSettings**: Per-barbershop chatbot configuration (prompts, rules, behavior)
- **ChatConversations**: Active conversation state tracking for WhatsApp chatbot
- **Subscriptions**: Recurring subscription plans linked to packages
- **SubscriptionPayments**: Payment history for subscriptions (card, cash, PIX)

### Subscription System (Recurring Packages)
Admin-only subscription management system:
- **Recurring Packages**: Packages can be marked as recurring with configurable intervals (weekly, biweekly, monthly)
- **Payment Methods**: Card (Stripe), Cash, or PIX
- **Stripe Integration**: Card setup via Checkout Sessions, off-session payment intents for charging
- **Credit Management**: Subscription credits are linked via `subscriptionId` on clientPackages
- **Expiry Blocking**: Credits are blocked when subscription status is not "active"
- **WhatsApp Alerts**: Automatic alerts 3 days before subscription expiry (configurable per barbershop)
- **Multi-tenant Security**: All subscription operations verify barbershopId ownership

### Payment Fee Management
Automatic tracking and deduction of payment processing fees:
- **Fee Configuration**: Settings page allows configuring fee percentages for Credit Card, Debit Card, and PIX
- **Automatic Fee Recording**: When comandas are closed with card/PIX, fees are automatically recorded as withdrawals in the cash register
- **Split Payment Support**: Fees are calculated per payment method for split payments (e.g., part card + part cash)
- **Commission Adjustment**: Barber commissions are reduced proportionally to fees (commission on net value)
- **Fee Deduction Type**: Creates negative commission entries with type 'fee_deduction' for tracking
- **Stripe Subscription Fees**: Webhook automatically records card fees for recurring subscription payments
- **Finance Dashboard**: Displays total payment fees in a dedicated card for visibility

### AI-Powered WhatsApp Chatbot (Modular Architecture)
The chatbot was refactored into 5 modular services to prevent AI hallucination and enforce deterministic behavior:

#### Module Structure (`server/chatbot/`)
- **availability-service.ts**: Pure code for slot calculation. No AI. Functions: `checkBarberAvailabilityWithDuration()`, `getNextAvailableSlot()` (ignores times < now + minAdvanceMinutes, sorts by date+time, returns first valid), `getAvailabilitySummaryForBarbers()`, `filterFutureSlots()`, `isSlotValid()`, date/time validation helpers.
- **booking-service.ts**: SINGLE SOURCE OF TRUTH. Re-validates before any creation. Constants: `MAX_PARTICIPANTS=4`, `SESSION_TIMEOUT_MS=30min`. BookingSession with `participants[]`, `finalizeBooking()` only when ALL confirmed (never partial). Package only for `clientId` (never companions). Handles cancellation with scope `'all'|'individual'`.
- **state-machine.ts**: Deterministic state transitions. States: `NEED_NAME → NEED_SERVICE → NEED_BARBER → NEED_TIME → CONFIRMATION`. AI used ONLY for `classify_intent` via `tool_choice:"required"` (never "auto"). Code decides transitions, data to fetch, and actions.
- **response-formatter.ts**: Explicit AI↔Code contract. AI receives `ResponseData` with pre-computed fields (slots, summaries, names). AI is PROHIBITED from generating times/dates/rules not in provided data. Uses `tool_choice:"required"` with `format_response`. Fallback messages for all response types.
- **handler.ts**: Orchestrator (~250 lines). Receives webhook → checks human takeover → checks session timeout → detects out-of-scope → loads data → calls state-machine → checks unclear escalation → calls booking-service (authority) → formats via response-formatter → returns. Contains prevention logic (takeover, timeout, out-of-scope keywords).
- **index.ts**: Barrel exports for `handleIncomingMessage` and availability functions.

#### Immutable Rules
- Code controls 100% of business logic; AI only classifies intent and formats natural language
- No examples with fixed times in AI prompts - only placeholders like `{slots}`, `{priority_slot}`
- `tool_choice` is always `"required"` (never `"auto"`) to force structured responses
- booking-service re-validates every slot before creating appointment (even if state-machine validated)
- Package usage restricted to main client (`clientId`), never companions
- Session timeout (30min) discards entire session, not individual data

#### Human Takeover System
- **Out-of-scope detection**: Keywords like 'produto', 'endereço', 'reclamação', etc. trigger automatic human takeover
- **Unclear escalation**: 3 consecutive 'unclear' intent classifications → automatic human takeover
- **Takeover duration**: 24 hours auto-expiry, bot stops responding during takeover
- **Admin release**: Command `/liberar` sent to conversation phone clears takeover immediately
- **Field**: `humanTakeoverUntil` timestamp on `chat_conversations` table (already in schema)

#### Session Timeout
- **Duration**: 30 minutes of inactivity
- **Action**: Resets all pending* fields (serviceId, barberId, date, time), state to 'idle', clears message history
- **Location**: handler.ts, runs before any message processing

#### Cancellation System
- **Single cancel**: `cancel_appointment` with `appointment_index` or when only 1 appointment exists
- **Multiple cancel**: `cancel_scope='all'` calls `cancelMultipleAppointments()` from booking-service
- **Date preservation**: After cancellation, if `intent.date_value` exists, saved to `pendingDate` for next booking

#### Flexible Booking Flow (Cross-Barber)
- **Cross-barber alternatives**: When a barber has no slots or the requested time is unavailable, system searches ALL barbers and shows alternatives
- **Barber switching in NEED_TIME**: Client can say "outro profissional" / name a barber during time selection via `change_barber`/`select_barber` intents
- **No lock-in**: If barber has no availability, goes back to NEED_BARBER with cross-barber slot suggestions
- **`crossBarberSlots`**: New field in ResponseData showing available times with other professionals
- **Priority slot integrity**: Cross-barber slots are NEVER set as prioritySlot when pendingBarberId doesn't match
- **Same conversation rebook**: After booking confirmed or cancelled, state resets to NEED_SERVICE for immediate re-booking

#### Time Alternative Logic
- When requested time is unavailable, alternatives are reordered to show nearest times >= requested time first, then earlier times
- Prevents always showing 08:00 as first alternative when client asked for 10:00+

#### Technical Details
- **OpenAI Integration**: Uses Replit AI Integrations (no separate API key needed)
- **Timezone Handling**: System uses "local time as UTC" convention (14:00 São Paulo = 14:00Z in DB). All date construction uses Date.UTC / Z suffix. All reading uses getUTC* methods. Helper getNowAsUtcLocal() converts real server time to this convention. Never use toLocaleString with timezone for DB dates - only for converting real time to local.
- **Configurable Prompts**: Custom greetings for new/returning clients, per-barbershop customization
- **Webhook Endpoint**: `/api/webhook/whatsapp/:barbershopId` receives messages from UazAPI
- **State Management**: Conversation state tracked in database with message history (last 20 messages)
- **Business Rules**: Configurable minAdvanceMinutes (default 5) and maxDaysAhead (default 30)
- **Date Normalization**: All date inputs are normalized to YYYY-MM-DD format to prevent filter failures.

### Phone Normalization (Centralised)
- **Standard**: E.164 format `+55XXXXXXXXXXX` (always 13 digits with country code)
- **Function**: `normalizePhone()` in `server/utils/phone.ts` — single source of truth
- **Applied at**: Webhook (incoming), admin client/barber create/update, public booking, cancellation, barber login, all message providers
- **Validation**: `isValidBrazilianPhone()` rejects invalid lengths, DDDs <11, missing 9th mobile digit
- **Provider helper**: `phoneForProvider()` strips `+` prefix for API calls (returns `55XXXXXXXXXXX`)
- **Rule**: ALL phone storage and lookups MUST go through `normalizePhone()` — no inline normalization

### WhatsApp Notifications (UazAPI)
- **Provider**: UazAPI (env vars: UAZAPI_URL, UAZAPI_INSTANCE_TOKEN)
- **Automatic Scheduling**: Confirmation (immediate), reminder 1 day before, reminder 1 hour before
- **Sender Job**: Runs every 60 seconds processing pending messages from scheduled_messages table

### Authentication Flow
1. Signup creates a new barbershop and first admin user
2. Login validates credentials and creates a server-side session
3. Session stored in PostgreSQL for persistence across restarts
4. AuthGuard component protects authenticated routes

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage in PostgreSQL

### UI Libraries
- **Radix UI**: Complete primitive library for accessible components
- **Lucide React**: Icon library
- **date-fns**: Date manipulation with Portuguese locale support
- **class-variance-authority**: Component variant management

### Development Tools
- **Vite**: Development server and build tool
- **Replit Plugins**: cartographer, dev-banner, runtime-error-modal for Replit integration

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption (has default for development)