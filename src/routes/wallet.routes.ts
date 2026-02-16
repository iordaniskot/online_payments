import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

/**
 * Get all merchant wallets
 * GET /api/wallets
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const wallets = await req.vivaService!.getWallets();

    res.json({
      success: true,
      wallets,
    });
  } catch (error) {
    console.error('Error retrieving wallets:', error);
    res.status(500).json({
      error: 'Failed to retrieve wallets',
    });
  }
});

export default router;
