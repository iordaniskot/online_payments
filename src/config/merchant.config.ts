import crypto from 'crypto';
import type { VivaConfig } from './viva.config.js';

export interface MerchantConfig {
  merchantKey: string;
  apiKey: string; // Separate API key for X-Api-Key header authentication
  vivaConfig: VivaConfig;
  webhookSecret: string;
}

// Demo environment URLs
const DEMO_AUTH_URL = 'https://demo-accounts.vivapayments.com';
const DEMO_API_URL = 'https://demo-api.vivapayments.com';
const DEMO_CHECKOUT_URL = 'https://demo.vivapayments.com';

// Production environment URLs
const PROD_AUTH_URL = 'https://accounts.vivapayments.com';
const PROD_API_URL = 'https://api.vivapayments.com';
const PROD_CHECKOUT_URL = 'https://www.vivapayments.com';

// Registry: apiKey -> MerchantConfig
const merchantsByApiKey = new Map<string, MerchantConfig>();
// Registry: merchantKey -> MerchantConfig
const merchantsByKey = new Map<string, MerchantConfig>();

/**
 * Scan environment variables for MERCHANT_* prefixes and build merchant configs.
 * Pattern: MERCHANT_{key}_VIVA_CLIENT_ID, MERCHANT_{key}_VIVA_CLIENT_SECRET, etc.
 * API key: MERCHANT_{key}_API_KEY (required, used for X-Api-Key header)
 */
export function loadMerchantConfigs(): void {
  merchantsByApiKey.clear();
  merchantsByKey.clear();

  // Find all unique merchant keys from env vars
  const merchantKeys = new Set<string>();
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^MERCHANT_([^_]+)_VIVA_/);
    if (match?.[1]) {
      merchantKeys.add(match[1]);
    }
  }

  for (const merchantKey of merchantKeys) {
    const prefix = `MERCHANT_${merchantKey}_`;
    const merchantApiKey = process.env[`${prefix}API_KEY`] || '';
    const clientId = process.env[`${prefix}VIVA_CLIENT_ID`] || '';
    const clientSecret = process.env[`${prefix}VIVA_CLIENT_SECRET`] || '';
    const merchantId = process.env[`${prefix}VIVA_MERCHANT_ID`] || '';
    const vivaApiKey = process.env[`${prefix}VIVA_API_KEY`] || '';
    const sourceCode = process.env[`${prefix}VIVA_SOURCE_CODE`];
    const webhookSecret = process.env[`${prefix}VIVA_WEBHOOK_SECRET`] || '';
    const environment = process.env[`${prefix}VIVA_ENVIRONMENT`] || 'demo';
    const isDemo = environment !== 'production';

    if (!clientId || !clientSecret) {
      console.warn(`⚠️  Merchant "${merchantKey}": missing VIVA_CLIENT_ID or VIVA_CLIENT_SECRET, skipping`);
      continue;
    }

    if (!merchantApiKey) {
      console.warn(`⚠️  Merchant "${merchantKey}": missing API_KEY, generating a random one`);
    }

    const apiKey = merchantApiKey || crypto.randomBytes(24).toString('hex');

    const config: MerchantConfig = {
      merchantKey,
      apiKey,
      webhookSecret,
      vivaConfig: {
        clientId,
        clientSecret,
        merchantId,
        apiKey: vivaApiKey,
        authUrl: isDemo ? DEMO_AUTH_URL : PROD_AUTH_URL,
        apiUrl: isDemo ? DEMO_API_URL : PROD_API_URL,
        checkoutUrl: isDemo ? DEMO_CHECKOUT_URL : PROD_CHECKOUT_URL,
        ordersApiUrl: isDemo ? DEMO_CHECKOUT_URL : PROD_CHECKOUT_URL,
        sourceCode,
      },
    };

    merchantsByApiKey.set(apiKey, config);
    merchantsByKey.set(merchantKey, config);
  }
}

/**
 * Look up a merchant by their API key (X-Api-Key header value)
 */
export function getMerchantByApiKey(apiKey: string): MerchantConfig | undefined {
  return merchantsByApiKey.get(apiKey);
}

/**
 * Look up a merchant by their merchant key (URL path param)
 */
export function getMerchantByKey(merchantKey: string): MerchantConfig | undefined {
  return merchantsByKey.get(merchantKey);
}

/**
 * Get all registered merchant keys
 */
export function getMerchantKeys(): string[] {
  return Array.from(merchantsByKey.keys());
}

/**
 * Get all registered merchants (for startup logging)
 */
export function getAllMerchants(): MerchantConfig[] {
  return Array.from(merchantsByKey.values());
}

/**
 * Validate that at least one merchant is configured
 */
export function validateMerchantConfigs(): boolean {
  if (merchantsByKey.size === 0) {
    console.error('No merchant configurations found. Add MERCHANT_{key}_VIVA_* env vars.');
    return false;
  }
  return true;
}
