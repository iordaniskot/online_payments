// Viva Wallet Configuration

export interface VivaConfig {
  // OAuth2 credentials
  clientId: string;
  clientSecret: string;
  
  // Basic Auth credentials
  merchantId: string;
  apiKey: string;
  
  // Environment URLs
  authUrl: string;
  apiUrl: string;
  checkoutUrl: string;
  ordersApiUrl: string;
  
  // Optional settings
  sourceCode: string | undefined;
}

// Demo environment URLs
const DEMO_AUTH_URL = 'https://demo-accounts.vivapayments.com';
const DEMO_API_URL = 'https://demo-api.vivapayments.com';
const DEMO_CHECKOUT_URL = 'https://demo.vivapayments.com';

// Production environment URLs
const PROD_AUTH_URL = 'https://accounts.vivapayments.com';
const PROD_API_URL = 'https://api.vivapayments.com';
const PROD_CHECKOUT_URL = 'https://www.vivapayments.com';

// Use a getter function to ensure env vars are read after dotenv.config()
function getVivaConfig(): VivaConfig {
  const isDemo = process.env.VIVA_ENVIRONMENT !== 'production';
  
  return {
    // OAuth2 credentials (for API calls like create order, retrieve transaction)
    clientId: process.env.VIVA_CLIENT_ID || '',
    clientSecret: process.env.VIVA_CLIENT_SECRET || '',
    
    // Basic Auth credentials (for legacy API calls)
    merchantId: process.env.VIVA_MERCHANT_ID || '',
    apiKey: process.env.VIVA_API_KEY || '',
    
    // Environment-specific URLs
    authUrl: isDemo ? DEMO_AUTH_URL : PROD_AUTH_URL,
    apiUrl: isDemo ? DEMO_API_URL : PROD_API_URL,
    checkoutUrl: isDemo ? DEMO_CHECKOUT_URL : PROD_CHECKOUT_URL,
    ordersApiUrl: isDemo ? DEMO_CHECKOUT_URL : PROD_CHECKOUT_URL,
    
    // Default payment source
    sourceCode: process.env.VIVA_SOURCE_CODE,
  };
}

// Export as a getter to ensure fresh values after dotenv loads
export const vivaConfig: VivaConfig = new Proxy({} as VivaConfig, {
  get(_, prop: keyof VivaConfig) {
    return getVivaConfig()[prop];
  }
});

// OAuth2 Scopes
export const VIVA_SCOPES = {
  REDIRECT_CHECKOUT: 'urn:viva:payments:core:api:redirectcheckout',
  ACQUIRING: 'urn:viva:payments:core:api:acquiring',
  CARD_TOKENIZATION: 'urn:viva:payments:core:api:acquiring:cardtokenization',
  TRANSACTIONS: 'urn:viva:payments:core:api:acquiring:transactions',
  MERCHANTS_WALLETS: 'urn:viva:payments:core:api:merchants:wallets',
} as const;

// Validate configuration
export function validateVivaConfig(): boolean {
  const requiredFields = ['clientId', 'clientSecret'];
  const missingFields = requiredFields.filter(
    (field) => !vivaConfig[field as keyof VivaConfig]
  );

  if (missingFields.length > 0) {
    console.error(
      `Missing required Viva Wallet configuration: ${missingFields.join(', ')}`
    );
    return false;
  }

  return true;
}

export default vivaConfig;