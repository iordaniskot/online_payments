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
