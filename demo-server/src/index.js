const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Configuration
const CONFIG = {
  port: 4000,
  paymentsServerUrl: 'http://localhost:3000',
  webhookSecret: 'demo-webhook-secret-123',
  baseUrl: 'http://localhost:4000',
};

// ============================================
// In-Memory Database (Demo purposes)
// ============================================
const database = {
  products: [
    { id: 'PROD-001', name: 'Premium Widget', price: 2999, stock: 50 },
    { id: 'PROD-002', name: 'Super Gadget', price: 4999, stock: 30 },
    { id: 'PROD-003', name: 'Mega Tool', price: 1499, stock: 100 },
    { id: 'PROD-004', name: 'Ultra Device', price: 7999, stock: 15 },
  ],
  orders: new Map(),
  customers: new Map(),
};

// Order status enum
const OrderStatus = {
  PENDING: 'pending',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
};

// ============================================
// Helper Functions
// ============================================
function generateOrderId() {
  return `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expectedSignature)
  );
}

function calculateOrderTotal(items) {
  return items.reduce((total, item) => {
    const product = database.products.find(p => p.id === item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found`);
    return total + (product.price * item.quantity);
  }, 0);
}

// ============================================
// Routes: Products
// ============================================
app.get('/api/products', (req, res) => {
  res.json({
    success: true,
    products: database.products,
  });
});

app.get('/api/products/:id', (req, res) => {
  const product = database.products.find(p => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, error: 'Product not found' });
  }
  res.json({ success: true, product });
});

// ============================================
// Routes: Checkout & Orders
// ============================================

/**
 * Create a new order and initiate payment
 * POST /api/checkout
 * Body: {
 *   customer: { email, fullName, phone },
 *   items: [{ productId, quantity }],
 *   shippingAddress: { street, city, postalCode, country }
 * }
 */
app.post('/api/checkout', async (req, res) => {
  try {
    const { customer, items, shippingAddress } = req.body;

    // Validate request
    if (!customer || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Customer and items are required',
      });
    }

    // Validate stock
    for (const item of items) {
      const product = database.products.find(p => p.id === item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          error: `Product ${item.productId} not found`,
        });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${product.name}`,
        });
      }
    }

    // Calculate total
    const totalAmount = calculateOrderTotal(items);
    const orderId = generateOrderId();

    // Create order in database
    const order = {
      id: orderId,
      customer,
      items: items.map(item => {
        const product = database.products.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          name: product.name,
          price: product.price,
          quantity: item.quantity,
          subtotal: product.price * item.quantity,
        };
      }),
      shippingAddress,
      totalAmount,
      status: OrderStatus.PENDING,
      createdAt: new Date().toISOString(),
      paymentDetails: null,
      vivaOrderCode: null,
    };

    database.orders.set(orderId, order);

    // Create payment order via our payments middleware
    console.log(`[Checkout] Creating payment for order ${orderId}, amount: ${totalAmount} cents`);

    const paymentResponse = await axios.post(
      `${CONFIG.paymentsServerUrl}/api/payments/orders`,
      {
        amount: totalAmount,
        customerTrns: `Order ${orderId}`,
        customer: {
          email: customer.email,
          fullName: customer.fullName,
          phone: customer.phone || undefined,
          countryCode: shippingAddress?.country || 'GR',
          requestLang: 'en-US',
        },
        merchantTrns: orderId,
        currencyCode: '978', // EUR
        paymentTimeout: 1800, // 30 minutes
        preauth: false,
        allowRecurring: false,
        maxInstallments: 3,
        disableCash: true,
        tags: ['demo-store', 'checkout'],
        // Callback configuration for webhook forwarding
        callback: {
          webhookUrl: `${CONFIG.baseUrl}/webhooks/payment`,
          secret: CONFIG.webhookSecret,
          successUrl: `${CONFIG.baseUrl}/payment/success?orderId=${orderId}`,
          failureUrl: `${CONFIG.baseUrl}/payment/failure?orderId=${orderId}`,
          includeRawPayload: true,
          metadata: {
            orderId,
            customerEmail: customer.email,
          },
        },
      }
    );

    // Update order with Viva order code
    order.vivaOrderCode = paymentResponse.data.orderCode;
    order.status = OrderStatus.AWAITING_PAYMENT;
    order.checkoutUrl = paymentResponse.data.checkoutUrl;

    console.log(`[Checkout] Payment order created: ${order.vivaOrderCode}`);

    res.json({
      success: true,
      order: {
        id: order.id,
        totalAmount: order.totalAmount,
        status: order.status,
        checkoutUrl: order.checkoutUrl,
      },
      message: 'Redirect customer to checkoutUrl to complete payment',
    });

  } catch (error) {
    console.error('[Checkout] Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: error.response?.data || error.message,
    });
  }
});

/**
 * Get order details
 */
app.get('/api/orders/:orderId', (req, res) => {
  const order = database.orders.get(req.params.orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }
  res.json({ success: true, order });
});

/**
 * List all orders
 */
app.get('/api/orders', (req, res) => {
  const orders = Array.from(database.orders.values());
  res.json({
    success: true,
    count: orders.length,
    orders: orders.map(o => ({
      id: o.id,
      status: o.status,
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      customer: o.customer.email,
    })),
  });
});

// ============================================
// Routes: Payment Callbacks (Browser redirects)
// ============================================
app.get('/payment/success', (req, res) => {
  const { orderId } = req.query;
  const order = database.orders.get(orderId);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Successful</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .success { color: #28a745; }
        .order-details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <h1 class="success">✓ Payment Successful!</h1>
      <p>Thank you for your order.</p>
      ${order ? `
        <div class="order-details">
          <h3>Order Details</h3>
          <p><strong>Order ID:</strong> ${order.id}</p>
          <p><strong>Total:</strong> €${(order.totalAmount / 100).toFixed(2)}</p>
          <p><strong>Status:</strong> ${order.status}</p>
        </div>
      ` : '<p>Order details not found.</p>'}
      <p><a href="/api/orders/${orderId}">View Order Status (JSON)</a></p>
    </body>
    </html>
  `);
});

app.get('/payment/failure', (req, res) => {
  const { orderId } = req.query;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Failed</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .error { color: #dc3545; }
      </style>
    </head>
    <body>
      <h1 class="error">✗ Payment Failed</h1>
      <p>We're sorry, your payment could not be processed.</p>
      <p>Order ID: ${orderId}</p>
      <p><a href="/api/checkout">Try Again</a></p>
    </body>
    </html>
  `);
});

// ============================================
// Routes: Webhook Handler
// ============================================

/**
 * Receive payment webhooks from our payments middleware
 * This is where the magic happens - real-time payment notifications
 */
app.post('/webhooks/payment', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;

  console.log('\n========================================');
  console.log('[Webhook] Received payment webhook');
  console.log('[Webhook] Event:', payload.event);
  console.log('[Webhook] Timestamp:', payload.timestamp);
  console.log('========================================\n');

  // Verify signature
  try {
    if (!verifyWebhookSignature(payload, signature, CONFIG.webhookSecret)) {
      console.error('[Webhook] Invalid signature!');
      return res.status(401).json({ error: 'Invalid signature' });
    }
    console.log('[Webhook] Signature verified ✓');
  } catch (error) {
    console.error('[Webhook] Signature verification failed:', error.message);
    // Continue anyway for demo purposes
  }

  // Extract order ID from metadata or merchantReference
  const orderId = payload.data?.metadata?.orderId || payload.data?.merchantReference;
  const order = orderId ? database.orders.get(orderId) : null;

  if (!order) {
    console.warn(`[Webhook] Order not found: ${orderId}`);
    // Still acknowledge the webhook
    return res.json({ received: true, warning: 'Order not found' });
  }

  // Handle different event types (support both formats)
  const eventType = payload.event?.toLowerCase?.() || '';
  
  switch (eventType) {
    case 'payment.success':
      handlePaymentSuccess(order, payload);
      break;

    case 'payment.failed':
      handlePaymentFailed(order, payload);
      break;

    case 'payment.refunded':
      handlePaymentRefunded(order, payload);
      break;

    case 'order.created':
      console.log(`[Webhook] Order created notification for ${orderId}`);
      break;

    case 'ORDER_CREATED':
      console.log(`[Webhook] Order created notification for ${orderId}`);
      break;

    default:
      console.log(`[Webhook] Unknown event type: ${payload.event}`);
  }

  res.json({ received: true, orderId: order.id, status: order.status });
});

function handlePaymentSuccess(order, payload) {
  console.log(`[Payment Success] Order ${order.id} has been paid!`);
  
  // Update order status
  order.status = OrderStatus.PAID;
  order.paidAt = new Date().toISOString();
  order.paymentDetails = {
    transactionId: payload.data.transactionId,
    amount: payload.data.amount,
    currency: payload.data.currency,
    card: payload.data.card,
  };

  // Decrease stock (business logic)
  for (const item of order.items) {
    const product = database.products.find(p => p.id === item.productId);
    if (product) {
      product.stock -= item.quantity;
      console.log(`[Stock] ${product.name}: ${product.stock + item.quantity} -> ${product.stock}`);
    }
  }

  // In a real app, you would:
  // - Send confirmation email
  // - Create shipping label
  // - Update inventory system
  // - Notify warehouse
  console.log(`[Business Logic] Would send confirmation email to ${order.customer.email}`);
  console.log(`[Business Logic] Would create shipping label for order ${order.id}`);
}

function handlePaymentFailed(order, payload) {
  console.log(`[Payment Failed] Order ${order.id} payment failed`);
  
  order.status = OrderStatus.FAILED;
  order.failedAt = new Date().toISOString();
  order.failureReason = payload.data.status || 'Unknown';

  // In a real app, you would:
  // - Send failure notification
  // - Release reserved stock
  // - Log for analytics
  console.log(`[Business Logic] Would send payment failure email to ${order.customer.email}`);
}

function handlePaymentRefunded(order, payload) {
  console.log(`[Payment Refunded] Order ${order.id} has been refunded`);
  
  order.status = OrderStatus.REFUNDED;
  order.refundedAt = new Date().toISOString();
  order.refundDetails = {
    transactionId: payload.data.transactionId,
    amount: payload.data.amount,
  };

  // Restore stock
  for (const item of order.items) {
    const product = database.products.find(p => p.id === item.productId);
    if (product) {
      product.stock += item.quantity;
      console.log(`[Stock Restored] ${product.name}: ${product.stock - item.quantity} -> ${product.stock}`);
    }
  }

  console.log(`[Business Logic] Would send refund confirmation to ${order.customer.email}`);
}

// ============================================
// Routes: Admin / Testing
// ============================================

/**
 * Simulate a payment webhook (for testing without Viva)
 */
app.post('/api/test/simulate-payment', (req, res) => {
  const { orderId, success = true } = req.body;
  const order = database.orders.get(orderId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const payload = {
    event: success ? 'PAYMENT_SUCCESS' : 'PAYMENT_FAILED',
    timestamp: new Date().toISOString(),
    data: {
      transactionId: `SIM-${Date.now()}`,
      orderCode: order.vivaOrderCode,
      amount: order.totalAmount,
      currency: 'EUR',
      status: success ? 'completed' : 'failed',
      merchantReference: orderId,
      metadata: { orderId },
      card: success ? { lastFour: '4242', brand: 'Visa' } : undefined,
    },
  };

  if (success) {
    handlePaymentSuccess(order, payload);
  } else {
    handlePaymentFailed(order, payload);
  }

  res.json({
    success: true,
    message: `Simulated ${success ? 'successful' : 'failed'} payment`,
    order: {
      id: order.id,
      status: order.status,
    },
  });
});

/**
 * Reset demo database
 */
app.post('/api/test/reset', (req, res) => {
  database.orders.clear();
  database.products.forEach(p => {
    if (p.id === 'PROD-001') p.stock = 50;
    if (p.id === 'PROD-002') p.stock = 30;
    if (p.id === 'PROD-003') p.stock = 100;
    if (p.id === 'PROD-004') p.stock = 15;
  });
  res.json({ success: true, message: 'Database reset' });
});

// ============================================
// Home / Health
// ============================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Demo E-commerce Server</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
        pre { background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .endpoint { margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
        .method { font-weight: bold; color: #007bff; }
        .method.post { color: #28a745; }
      </style>
    </head>
    <body>
      <h1>🛒 Demo E-commerce Server</h1>
      <p>This server demonstrates integration with the Viva Payments middleware.</p>
      
      <h2>Available Endpoints</h2>
      
      <h3>Products</h3>
      <div class="endpoint"><span class="method">GET</span> <code>/api/products</code> - List all products</div>
      <div class="endpoint"><span class="method">GET</span> <code>/api/products/:id</code> - Get product details</div>
      
      <h3>Checkout</h3>
      <div class="endpoint"><span class="method post">POST</span> <code>/api/checkout</code> - Create order & initiate payment</div>
      <div class="endpoint"><span class="method">GET</span> <code>/api/orders</code> - List all orders</div>
      <div class="endpoint"><span class="method">GET</span> <code>/api/orders/:id</code> - Get order details</div>
      
      <h3>Testing</h3>
      <div class="endpoint"><span class="method post">POST</span> <code>/api/test/simulate-payment</code> - Simulate payment webhook</div>
      <div class="endpoint"><span class="method post">POST</span> <code>/api/test/reset</code> - Reset database</div>
      
      <h2>Quick Test</h2>
      <pre>
# 1. View products
curl http://localhost:4000/api/products

# 2. Create an order
curl -X POST http://localhost:4000/api/checkout \\
  -H "Content-Type: application/json" \\
  -d '{
    "customer": {
      "email": "demo@example.com",
      "fullName": "Demo Customer",
      "phone": "+306912345678"
    },
    "items": [
      { "productId": "PROD-001", "quantity": 2 },
      { "productId": "PROD-003", "quantity": 1 }
    ],
    "shippingAddress": {
      "street": "123 Demo Street",
      "city": "Athens",
      "postalCode": "10431",
      "country": "GR"
    }
  }'

# 3. Simulate successful payment (use the orderId from step 2)
curl -X POST http://localhost:4000/api/test/simulate-payment \\
  -H "Content-Type: application/json" \\
  -d '{"orderId": "ORD-xxx", "success": true}'

# 4. Check order status
curl http://localhost:4000/api/orders/ORD-xxx
      </pre>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Start Server
// ============================================
app.listen(CONFIG.port, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('🛒 Demo E-commerce Server');
  console.log('='.repeat(50));
  console.log(`Server running on: http://localhost:${CONFIG.port}`);
  console.log(`Payments server:   ${CONFIG.paymentsServerUrl}`);
  console.log(`Webhook endpoint:  ${CONFIG.baseUrl}/webhooks/payment`);
  console.log('='.repeat(50));
  console.log('');
});
