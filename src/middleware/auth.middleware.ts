import type { Request, Response, NextFunction } from 'express';
import { getServiceByApiKey } from '../services/merchant.service.js';

/**
 * Middleware that reads X-Api-Key header, resolves merchant config,
 * and attaches the merchant's VivaWalletService to the request.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-Api-Key header' });
    return;
  }

  const result = getServiceByApiKey(apiKey);
  if (!result) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.merchantKey = result.config.merchantKey;
  req.merchantConfig = result.config;
  req.vivaService = result.service;

  next();
}
