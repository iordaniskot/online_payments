import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import paymentRoutes from './routes/payment.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import walletRoutes from './routes/wallet.routes.js';

// Import merchant config
import { loadMerchantConfigs, validateMerchantConfigs, getAllMerchants } from './config/merchant.config.js';
import { authMiddleware } from './middleware/auth.middleware.js';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Viva Wallet Payment Platform',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// API Routes — payment & wallet routes require X-Api-Key auth
app.use('/api/payments', authMiddleware, paymentRoutes);
app.use('/api/wallets', authMiddleware, walletRoutes);

// Webhook routes use :merchantKey path param instead of X-Api-Key
app.use('/api/webhooks', webhookRoutes);

// Payment redirect endpoints (after Viva checkout)
app.get('/payment/success', (req: Request, res: Response) => {
  const { t: transactionId, s: orderCode, lang } = req.query;
  
  console.log('Payment successful redirect:', {
    transactionId,
    orderCode,
    lang,
  });

  res.json({
    success: true,
    message: 'Payment completed successfully!',
    transactionId,
    orderCode,
  });
});

app.get('/payment/failure', (req: Request, res: Response) => {
  const { t: transactionId, s: orderCode, lang } = req.query;
  
  console.log('Payment failed redirect:', {
    transactionId,
    orderCode,
    lang,
  });

  res.json({
    success: false,
    message: 'Payment failed or was cancelled.',
    transactionId,
    orderCode,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Load merchant configurations and start server
loadMerchantConfigs();

app.listen(port, () => {




  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏦 Viva Wallet Payment Platform                        ║
║                                                           ║
║   Server running at http://localhost:${port}               ║
║                                                           ║
║   API Endpoints (require X-Api-Key header):               ║
║   • POST   /api/payments/orders          - Create order   ║
║   • GET    /api/payments/orders/:code    - Get order      ║
║   • PATCH  /api/payments/orders/:code    - Update order   ║
║   • DELETE /api/payments/orders/:code    - Cancel order   ║
║   • GET    /api/payments/transactions/:id - Get txn       ║
║   • POST   /api/payments/transactions/:id - Recurring/Cap ║
║   • DELETE /api/payments/transactions/:id - Refund        ║
║   • POST   /api/payments/card-tokens     - Save card      ║
║   • GET    /api/wallets                  - Get wallets    ║
║                                                           ║
║   Webhook Endpoints (per merchant):                       ║
║   • GET/POST /api/webhooks/viva/:merchantKey              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  if (!validateMerchantConfigs()) {
    console.warn('⚠️  No merchant configurations found. Check your .env file.');
    console.warn('   Add MERCHANT_{key}_VIVA_CLIENT_ID, MERCHANT_{key}_VIVA_CLIENT_SECRET, etc.');
  } else {
    const merchants = getAllMerchants();
    console.log(`✅ Loaded ${merchants.length} merchant(s):`);
    for (const m of merchants) {
      console.log(`   📌 ${m.merchantKey}`);
      console.log(`      API Key:     ${m.apiKey}`);
      console.log(`      Webhook URL: /api/webhooks/viva/${m.merchantKey}`);
    }
  }
});
