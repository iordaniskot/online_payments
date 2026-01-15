import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import paymentRoutes from './routes/payment.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import walletRoutes from './routes/wallet.routes.js';

// Import config validation
import { validateVivaConfig } from './config/viva.config.js';

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

// API Routes
app.use('/api/payments', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/wallets', walletRoutes);

// Payment redirect endpoints (after Viva checkout)
app.get('/payment/success', (req: Request, res: Response) => {
  const { t: transactionId, s: orderCode, lang } = req.query;
  
  console.log('Payment successful redirect:', {
    transactionId,
    orderCode,
    lang,
  });

  // In a real application, you would:
  // 1. Verify the transaction status
  // 2. Update your order in the database
  // 3. Redirect to a proper success page

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

// Start server
app.listen(port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏦 Viva Wallet Payment Platform                        ║
║                                                           ║
║   Server running at http://localhost:${port}               ║
║                                                           ║
║   API Endpoints:                                          ║
║   • POST   /api/payments/orders          - Create order   ║
║   • GET    /api/payments/orders/:code    - Get order      ║
║   • PATCH  /api/payments/orders/:code    - Update order   ║
║   • DELETE /api/payments/orders/:code    - Cancel order   ║
║   • GET    /api/payments/transactions/:id - Get txn       ║
║   • POST   /api/payments/transactions/:id - Recurring/Cap ║
║   • DELETE /api/payments/transactions/:id - Refund        ║
║   • POST   /api/payments/card-tokens     - Save card      ║
║   • GET    /api/wallets                  - Get wallets    ║
║   • GET/POST /api/webhooks/viva          - Webhooks       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Validate Viva Wallet configuration
  if (!validateVivaConfig()) {
    console.log("Environment variables:", {
      VIVA_CLIENT_ID: process.env.VIVA_CLIENT_ID ? 'SET' : 'MISSING',
      VIVA_CLIENT_SECRET: process.env.VIVA_CLIENT_SECRET ? 'SET' : 'MISSING',
    });
    console.warn('⚠️  Viva Wallet configuration incomplete. Check your .env file.');
  } else {
    console.log('✅ Viva Wallet configuration loaded successfully');
  }
});
