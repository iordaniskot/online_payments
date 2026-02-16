import { VivaWalletService } from './viva-wallet.service.js';
import { getMerchantByApiKey, getMerchantByKey } from '../config/merchant.config.js';
import type { MerchantConfig } from '../config/merchant.config.js';

// Lazy-created per-merchant service instances
const serviceInstances = new Map<string, VivaWalletService>();

/**
 * Get or create a VivaWalletService for a merchant key
 */
function getOrCreateService(config: MerchantConfig): VivaWalletService {
  let service = serviceInstances.get(config.merchantKey);
  if (!service) {
    service = new VivaWalletService(config.vivaConfig);
    serviceInstances.set(config.merchantKey, service);
  }
  return service;
}

/**
 * Get VivaWalletService by API key (from X-Api-Key header)
 */
export function getServiceByApiKey(apiKey: string): { service: VivaWalletService; config: MerchantConfig } | undefined {
  const merchantConfig = getMerchantByApiKey(apiKey);
  if (!merchantConfig) return undefined;
  return { service: getOrCreateService(merchantConfig), config: merchantConfig };
}

/**
 * Get VivaWalletService by merchant key (from URL path param)
 */
export function getServiceByMerchantKey(merchantKey: string): { service: VivaWalletService; config: MerchantConfig } | undefined {
  const merchantConfig = getMerchantByKey(merchantKey);
  if (!merchantConfig) return undefined;
  return { service: getOrCreateService(merchantConfig), config: merchantConfig };
}
