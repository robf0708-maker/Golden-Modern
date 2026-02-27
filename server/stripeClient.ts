import Stripe from 'stripe';

let connectionSettings: any;
let cachedCredentials: { publishableKey: string; secretKey: string; source: 'secrets' | 'replit' } | null = null;

const isProduction = process.env.REPLIT_DEPLOYMENT === '1';

async function getCredentials() {
  // Se já temos credenciais em cache, retornar
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const env = isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO';

  // Usar secrets configurados manualmente (prioridade - funciona em dev e prod)
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY) {
    cachedCredentials = {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      secretKey: process.env.STRIPE_SECRET_KEY,
      source: 'secrets',
    };
    console.log(`[Stripe] ${env}: Usando chaves configuradas via secrets`);
    return cachedCredentials;
  }

  // Fallback: tentar usar a integração Replit
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    throw new Error(`[Stripe] ${env}: Não configurado. Configure STRIPE_SECRET_KEY e STRIPE_PUBLISHABLE_KEY nos secrets.`);
  }

  const connectorName = 'stripe';
  const targetEnvironment = isProduction ? 'production' : 'development';

  try {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', connectorName);
    url.searchParams.set('environment', targetEnvironment);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    });

    const data = await response.json();
    
    connectionSettings = data.items?.[0];

    if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
      throw new Error(`[Stripe] ${env}: Integração Replit (${targetEnvironment}) não encontrada. Configure STRIPE_SECRET_KEY e STRIPE_PUBLISHABLE_KEY nos secrets.`);
    }

    cachedCredentials = {
      publishableKey: connectionSettings.settings.publishable,
      secretKey: connectionSettings.settings.secret,
      source: 'replit',
    };
    console.log(`[Stripe] ${env}: Usando integração Replit (${targetEnvironment})`);
    return cachedCredentials;
  } catch (error: any) {
    const errorMsg = error?.message || 'Erro desconhecido';
    throw new Error(`[Stripe] ${env}: Falha ao obter credenciais. ${errorMsg}`);
  }
}

// Retorna o webhook secret (usa secrets manuais ou valor padrão)
export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('[Stripe] STRIPE_WEBHOOK_SECRET não configurado nos secrets.');
  }
  return secret;
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil' as any,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
