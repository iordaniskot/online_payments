import type { VivaWalletService } from '../services/viva-wallet.service.js';
import type { MerchantConfig } from '../config/merchant.config.js';

declare global {
  namespace Express {
    interface Request {
      merchantKey?: string | undefined;
      merchantConfig?: MerchantConfig | undefined;
      vivaService?: VivaWalletService | undefined;
    }
  }
}
