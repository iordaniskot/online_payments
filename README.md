# Viva Wallet Payment Middleware

A TypeScript/Express.js payment middleware that wraps the Viva Wallet API. Use this service as a centralized payment gateway for your applications.

## Features

- **Payment Orders**: Create, retrieve, update, and cancel payment orders
- **Transactions**: View transaction details, create recurring payments, capture pre-auths
- **Refunds**: Full and partial refunds with fast refund support
- **Card Tokenization**: Save cards for future payments
- **Webhook Forwarding**: Receive Viva webhooks and forward them to your application
- **Wallet Management**: View merchant wallet balances

## Architecture

```
┌──────────────┐         ┌─────────────────────┐         ┌─────────────┐
│    Your      │  HTTP   │   Payment Middleware │  HTTP   │    Viva     │
│ Application  │ ◄─────► │   (this service)     │ ◄─────► │   Wallet    │
└──────────────┘         └─────────────────────┘         └─────────────┘
       ▲                          │
       │                          │
       └──────────────────────────┘
         Webhook forwarding (payment.success, payment.failed, etc.)
```

---

## Integration Guide

### Step 1: Deploy the Middleware

```bash
# Clone and install
git clone <repo-url>
cd online_payments
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Viva Wallet credentials

# Build and start
npm run build
npm start
```

The middleware will run on `http://localhost:3000` (or your configured port).

### Step 2: Create a Payment Order

From your application, call the middleware to create a payment order:

```javascript
// Your application server (e.g., Node.js)
const axios = require('axios');

const PAYMENTS_URL = 'https://payments.yourdomain.com'; // Your middleware URL

async function createPayment(order) {
  const response = await axios.post(`${PAYMENTS_URL}/api/payments/orders`, {
    // Required
    amount: 5000,  // Amount in cents (€50.00)
    
    // Customer info
    customerTrns: `Order ${order.id}`,
    customer: {
      email: order.customer.email,
      fullName: order.customer.name,
      phone: order.customer.phone,
      countryCode: 'GR',
      requestLang: 'en-US',
    },
    
    // Your reference (important for webhook matching)
    merchantTrns: order.id,
    
    // Payment options
    currencyCode: '978',        // EUR
    paymentTimeout: 1800,       // 30 minutes
    preauth: false,             // Capture immediately
    allowRecurring: false,
    maxInstallments: 3,
    disableCash: true,
    
    // Callback configuration - WHERE YOUR SERVER RECEIVES WEBHOOKS
    callback: {
      webhookUrl: 'https://yourapp.com/webhooks/payment',  // Your webhook endpoint
      secret: 'your-shared-secret',                        // For signature verification
      successUrl: 'https://yourapp.com/checkout/success',  // Browser redirect on success
      failureUrl: 'https://yourapp.com/checkout/failure',  // Browser redirect on failure
      includeRawPayload: true,                             // Include original Viva payload
      metadata: {                                          // Custom data returned in webhooks
        orderId: order.id,
        customerId: order.customerId,
      },
    },
  });

  return {
    orderCode: response.data.orderCode,
    checkoutUrl: response.data.checkoutUrl,  // Redirect customer here
  };
}
```

### Step 3: Redirect Customer to Checkout

```javascript
// Express.js example
app.post('/checkout', async (req, res) => {
  const order = await createOrder(req.body);
  const payment = await createPayment(order);
  
  // Save the Viva order code for reference
  order.vivaOrderCode = payment.orderCode;
  await order.save();
  
  // Redirect customer to Viva's secure checkout page
  res.redirect(payment.checkoutUrl);
});
```

### Step 4: Receive Payment Webhooks

Set up an endpoint in your application to receive webhook notifications:

```javascript
const crypto = require('crypto');

// Verify webhook signature
function verifySignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Webhook endpoint
app.post('/webhooks/payment', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;

  // Verify signature
  if (!verifySignature(payload, signature, 'your-shared-secret')) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle different event types
  switch (payload.event) {
    case 'payment.success':
      handlePaymentSuccess(payload);
      break;
    case 'payment.failed':
      handlePaymentFailed(payload);
      break;
    case 'payment.refunded':
      handlePaymentRefunded(payload);
      break;
    case 'order.created':
      // Optional: order was created in Viva
      break;
  }

  res.json({ received: true });
});

function handlePaymentSuccess(payload) {
  const { orderId } = payload.data.metadata;
  const order = await Order.findById(orderId);
  
  order.status = 'paid';
  order.paymentDetails = {
    transactionId: payload.data.transactionId,
    amount: payload.data.amount,
    paidAt: payload.timestamp,
  };
  await order.save();
  
  // Trigger your business logic
  await sendConfirmationEmail(order);
  await updateInventory(order);
  await createShipment(order);
}

function handlePaymentFailed(payload) {
  const { orderId } = payload.data.metadata;
  const order = await Order.findById(orderId);
  
  order.status = 'failed';
  await order.save();
  
  await sendPaymentFailedEmail(order);
}

function handlePaymentRefunded(payload) {
  const { orderId } = payload.data.metadata;
  const order = await Order.findById(orderId);
  
  order.status = 'refunded';
  await order.save();
  
  await restoreInventory(order);
  await sendRefundEmail(order);
}
```

### Step 5: Webhook Payload Structure

Your webhook endpoint will receive payloads in this format:

```json
{
  "event": "payment.success",
  "timestamp": "2026-01-15T14:30:00.000Z",
  "data": {
    "transactionId": "abc123def456",
    "orderCode": 1234567890123456,
    "amount": 5000,
    "currency": "EUR",
    "status": "F",
    "customer": {
      "email": "customer@example.com",
      "fullName": "John Doe",
      "phone": "+306912345678"
    },
    "card": {
      "lastFour": "4242",
      "brand": "Visa"
    },
    "merchantReference": "ORDER-12345",
    "metadata": {
      "orderId": "ORDER-12345",
      "customerId": "CUST-789"
    }
  },
  "raw": { /* Original Viva Wallet payload (if includeRawPayload: true) */ }
}
```

### Webhook Event Types

| Event | Description |
|-------|-------------|
| `order.created` | Payment order created in Viva |
| `payment.success` | Payment completed successfully |
| `payment.failed` | Payment failed or was declined |
| `payment.refunded` | Payment was refunded |

---

## API Reference

### Create Payment Order

`POST /api/payments/orders`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✓ | Amount in cents |
| `customerTrns` | string | | Description shown to customer |
| `customer` | object | | Customer details |
| `customer.email` | string | | Customer email |
| `customer.fullName` | string | | Customer name |
| `customer.phone` | string | | Customer phone |
| `customer.countryCode` | string | | ISO country code |
| `merchantTrns` | string | | Your order reference |
| `currencyCode` | string | | ISO 4217 code (default: 978/EUR) |
| `paymentTimeout` | number | | Seconds until expiry |
| `preauth` | boolean | | Pre-authorize only |
| `allowRecurring` | boolean | | Allow card tokenization |
| `maxInstallments` | number | | Max installments (1-36) |
| `disableCash` | boolean | | Disable cash payment |
| `callback` | object | | Webhook configuration |
| `callback.webhookUrl` | string | | Your webhook endpoint |
| `callback.secret` | string | | HMAC signing secret |
| `callback.successUrl` | string | | Browser redirect on success |
| `callback.failureUrl` | string | | Browser redirect on failure |
| `callback.includeRawPayload` | boolean | | Include Viva's raw payload |
| `callback.metadata` | object | | Custom data for webhooks |

**Response:**

```json
{
  "success": true,
  "orderCode": 1234567890123456,
  "checkoutUrl": "https://demo.vivapayments.com/web/checkout?ref=1234567890123456",
  "callbackRegistered": true
}
```

### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments/orders/:orderCode` | Get order details |
| PATCH | `/api/payments/orders/:orderCode` | Update order amount |
| DELETE | `/api/payments/orders/:orderCode` | Cancel order |
| GET | `/api/payments/transactions/:id` | Get transaction |
| DELETE | `/api/payments/transactions/:id` | Refund transaction |
| POST | `/api/payments/transactions/:id/refund` | Fast refund |
| GET | `/api/wallets` | Get wallet balances |

---

## Production Setup

### 1. Configure Viva Wallet Webhooks

In the **Viva Wallet Dashboard**:

1. Go to **Settings** → **API Access** → **Webhooks**
2. Add webhook URL: `https://payments.yourdomain.com/api/webhooks/viva`
3. Enable events:
   - Transaction Payment Created (1796)
   - Transaction Failed (1798)
   - Transaction Reversal Created (1797)
4. Copy the webhook secret

### 2. Environment Variables

```env
# Server
PORT=3000
NODE_ENV=production

# Viva Wallet (Production)
VIVA_ENVIRONMENT=production
VIVA_CLIENT_ID=your_production_client_id
VIVA_CLIENT_SECRET=your_production_client_secret
VIVA_MERCHANT_ID=your_merchant_id
VIVA_API_KEY=your_api_key
VIVA_WEBHOOK_SECRET=your_webhook_secret

# Production URLs (automatically set based on VIVA_ENVIRONMENT)
# VIVA_AUTH_URL=https://accounts.vivapayments.com
# VIVA_API_URL=https://api.vivapayments.com
# VIVA_CHECKOUT_URL=https://www.vivapayments.com
```

### 3. Deploy

Deploy as a Docker container or to your preferred platform:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

---

## Test Cards (Demo Environment)

| Card Number | Type | Result |
|-------------|------|--------|
| 4111 1111 1111 1111 | Visa | Success (amount ≥ €0.30) |
| 5199 8162 6654 6408 | Mastercard | Success (amount ≥ €0.30) |
| 4000 0000 0000 0002 | Visa | Declined |

Use any future expiry date and any 3-digit CVV.

---

## Testing Webhooks Locally

For local development, use the test endpoint to simulate Viva webhooks:

```bash
# Simulate successful payment
curl -X POST http://localhost:3000/api/webhooks/viva/test \
  -H "Content-Type: application/json" \
  -d '{"orderCode": 1234567890123456, "eventType": "success", "amount": 5000}'

# Simulate failed payment
curl -X POST http://localhost:3000/api/webhooks/viva/test \
  -H "Content-Type: application/json" \
  -d '{"orderCode": 1234567890123456, "eventType": "failed"}'

# Check registered callbacks
curl http://localhost:3000/api/webhooks/callbacks/1234567890123456
```

---

## Example Integration

See the `demo-server/` directory for a complete e-commerce integration example with:

- Product catalog
- Checkout flow
- Webhook handling
- Order status updates
- Stock management

```bash
cd demo-server
npm install
npm start
# Server runs on http://localhost:4000
```

---

## Resources

- [Viva Wallet Developer Portal](https://developer.viva.com/)
- [Payment API Documentation](https://developer.viva.com/apis-for-payments/payment-api/)
- [Smart Checkout Guide](https://developer.viva.com/smart-checkout/)
- [Webhooks Documentation](https://developer.viva.com/webhooks-for-payments/)

## License

ISC
