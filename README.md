# Viva Wallet Payment Middleware

A multi-merchant payment middleware built with TypeScript and Express.js that sits between your applications and the [Viva Wallet](https://www.viva.com/) payment gateway. It provides a unified REST API for creating payments, managing transactions, handling webhooks, and redirecting customers — all while supporting multiple merchants with independent Viva Wallet credentials.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Webhook System](#webhook-system)
- [Viva Wallet Dashboard Setup](#viva-wallet-dashboard-setup)
- [Demo Server](#demo-server)
- [Production Deployment](#production-deployment)
- [Test Cards (Demo Environment)](#test-cards-demo-environment)
- [Project Structure](#project-structure)
- [Resources](#resources)
- [License](#license)

---

## Overview

This middleware solves a common problem: you have one or more applications (e-commerce stores, booking platforms, SaaS products) that need to accept payments through Viva Wallet, but you don't want each application to implement the full Viva API integration, manage OAuth tokens, or handle raw webhooks directly.

Instead, your applications talk to this middleware over a simple REST API. The middleware handles:

- **OAuth2 token management** — automatic token acquisition and caching with refresh before expiry
- **Dual authentication** — OAuth2 Bearer tokens for modern Viva APIs, Basic Auth for legacy APIs
- **Webhook reception and forwarding** — receives raw Viva webhooks, normalizes them, signs them with HMAC-SHA256, and forwards them to your application's endpoints
- **Browser redirects** — after payment, customers are redirected back to your application's success/failure pages
- **Multi-merchant isolation** — each merchant has its own Viva credentials, OAuth tokens, and webhook endpoints

## Features

| Feature | Description |
|---------|-------------|
| **Payment Orders** | Create, retrieve, update, and cancel payment orders |
| **Transactions** | View transaction details, create recurring payments, capture pre-authorized payments |
| **Refunds** | Full and partial refunds, plus Viva's fast refund API |
| **Card Tokenization** | Save cards for future payments via Viva's token API |
| **Webhook Forwarding** | Receive Viva webhooks and forward normalized events to your application |
| **Browser Redirects** | Redirect customers to your success/failure pages after checkout |
| **Multi-Merchant** | Support multiple merchants with independent credentials and webhook endpoints |
| **API Key Auth** | Protect all API endpoints with per-merchant `X-Api-Key` header authentication |
| **Wallet Management** | View merchant wallet balances |

## Architecture

```
                          ┌──────────────────────────────┐
                          │    This Middleware (Express)  │
                          │                              │
  ┌──────────────┐  HTTP  │  ┌────────────────────────┐  │  HTTP   ┌─────────────┐
  │  Your App    │───────►│  │  Auth Middleware        │  │───────►│  Viva Wallet │
  │  (any stack) │  POST  │  │  (X-Api-Key header)    │  │  OAuth2 │  APIs        │
  │              │◄───────│  └────────────────────────┘  │◄───────│             │
  └──────────────┘  JSON  │  ┌────────────────────────┐  │  JSON   └──────┬──────┘
                          │  │  Merchant Service       │  │               │
  ┌──────────────┐        │  │  (per-merchant Viva     │  │               │
  │  Customer    │        │  │   service instances)    │  │               │
  │  Browser     │───────►│  └────────────────────────┘  │               │
  └──────────────┘        │  ┌────────────────────────┐  │◄──────────────┘
    redirect to           │  │  Webhook Forwarder      │  │  Viva sends
    Viva checkout         │  │  (normalizes & signs    │  │  webhooks here
                          │  │   events, POSTs them    │  │
                          │  │   to your app)          │  │
                          │  └────────────────────────┘  │
                          └──────────────────────────────┘
```

**Key points:**

- Your application never talks to Viva directly — it only talks to this middleware.
- The middleware authenticates your app via `X-Api-Key` header, resolves which merchant the request belongs to, and uses that merchant's Viva credentials.
- Viva sends webhook events (payment success, failure, refund) to per-merchant endpoints on this middleware (`/api/webhooks/viva/:merchantKey`), which then normalizes them and forwards them to your application's webhook URL.
- After a customer completes payment on Viva's checkout page, their browser is redirected back to your application's success or failure URL.

## How It Works

### Payment Flow (step by step)

```
1. Your App                    POST /api/payments/orders
   ─────────────────────────►  (X-Api-Key: sk_your_key)
                               {amount: 5000, callback: {webhookUrl, redirectSuccessUrl, ...}}

2. Middleware                  Authenticates via X-Api-Key
                               Resolves merchant → gets Viva credentials
                               Acquires OAuth2 token (cached)
                               Calls Viva: POST /checkout/v2/orders
                               Registers callback URLs for this order
                               Returns orderCode + checkoutUrl

3. Your App                    Redirects customer browser to checkoutUrl
   ◄─────────────────────────  

4. Customer                    Completes payment on Viva's hosted checkout page
   ─────────────────────────►  (Viva handles card details, 3DS, etc.)

5. Viva                        Redirects customer browser to redirectSuccessUrl
   ─────────────────────────►  (your app's success page)

6. Viva                        Sends webhook POST to /api/webhooks/viva/:merchantKey
   ─────────────────────────►  (EventTypeId: 1796 = payment created)

7. Middleware                  Verifies Viva signature
                               Normalizes the raw Viva payload into a clean format
                               Signs it with your callback secret (HMAC-SHA256)
                               POSTs to your app's webhookUrl

8. Your App                    Receives normalized webhook
   ◄─────────────────────────  Verifies X-Webhook-Signature header
                               Updates order status, sends emails, etc.
```

### Multi-Merchant Model

Each merchant is configured via environment variables with a unique key (e.g., `myshop`, `hotelresort`). At startup, the middleware scans `MERCHANT_*` env vars, builds a registry of merchants, and creates independent `VivaWalletService` instances for each — with their own OAuth token cache.

- **API requests** are routed to the correct merchant via the `X-Api-Key` header.
- **Webhook requests** from Viva are routed via the URL path: `/api/webhooks/viva/:merchantKey`.

---

## Getting Started

### Prerequisites

- **Node.js** v18+ (tested on v20, v25)
- **npm** v9+
- A **Viva Wallet** account with API credentials ([sign up for demo](https://demo.vivapayments.com/))

### Installation

```bash
git clone <repo-url>
cd online_payments
npm install
```

### Quick Start

```bash
# 1. Create your environment file
cp .env.example .env

# 2. Edit .env with your Viva Wallet credentials (see Configuration section)

# 3. Build and start
npm run build
npm start
```

The middleware starts on `http://localhost:3000` (configurable via `PORT` env var).

### Development Mode

```bash
npm run dev
```

This uses `nodemon` to watch for file changes, recompile TypeScript, and restart the server automatically.

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm start` | `node dist/index.js` | Run the compiled server |
| `npm run dev` | `nodemon` | Watch mode with auto-rebuild |

---

## Configuration

All configuration is done through environment variables. Copy `.env.example` to `.env` and fill in your values.

### Merchant Configuration

Each merchant is defined by a set of env vars with the pattern `MERCHANT_{key}_*`, where `{key}` is a unique identifier for the merchant (e.g., `myshop`, `hotelresort`).

```env
# ---- Merchant "myshop" ----
MERCHANT_myshop_API_KEY=sk_live_myshop_random_secret_key    # Your secret API key for X-Api-Key header
MERCHANT_myshop_VIVA_ENVIRONMENT=demo                        # "demo" or "production"
MERCHANT_myshop_VIVA_CLIENT_ID=xxx.apps.vivapayments.com     # OAuth2 Client ID (from Viva dashboard)
MERCHANT_myshop_VIVA_CLIENT_SECRET=xxxxxxxx                  # OAuth2 Client Secret
MERCHANT_myshop_VIVA_MERCHANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # Merchant ID (UUID)
MERCHANT_myshop_VIVA_API_KEY=xxxxxxxx                        # Viva API Key (for Basic Auth)
MERCHANT_myshop_VIVA_SOURCE_CODE=Default                     # Payment source code (from Viva dashboard)
MERCHANT_myshop_VIVA_WEBHOOK_SECRET=xxxxxxxx                 # Webhook verification secret (from Viva dashboard)
```

| Variable | Required | Description |
|----------|----------|-------------|
| `MERCHANT_{key}_API_KEY` | Recommended | Secret key your application sends in the `X-Api-Key` header. If omitted, a random key is auto-generated at startup (logged to console). |
| `MERCHANT_{key}_VIVA_ENVIRONMENT` | Yes | `demo` or `production`. Controls which Viva API URLs are used. |
| `MERCHANT_{key}_VIVA_CLIENT_ID` | Yes | OAuth2 Client ID from Viva dashboard → Settings → API Access. |
| `MERCHANT_{key}_VIVA_CLIENT_SECRET` | Yes | OAuth2 Client Secret from Viva dashboard. |
| `MERCHANT_{key}_VIVA_MERCHANT_ID` | Yes | Merchant ID (UUID) from Viva dashboard. |
| `MERCHANT_{key}_VIVA_API_KEY` | Yes | API Key for Basic Auth (legacy Viva APIs). |
| `MERCHANT_{key}_VIVA_SOURCE_CODE` | No | Payment source code. Defaults to `Default`. |
| `MERCHANT_{key}_VIVA_WEBHOOK_SECRET` | No | Used to verify incoming Viva webhook signatures. |

### Adding Multiple Merchants

Simply add another set of env vars with a different key:

```env
# First merchant
MERCHANT_myshop_API_KEY=sk_live_myshop_abc123
MERCHANT_myshop_VIVA_ENVIRONMENT=production
MERCHANT_myshop_VIVA_CLIENT_ID=...
# ... (all other VIVA_* vars)

# Second merchant
MERCHANT_hotelresort_API_KEY=sk_live_hotelresort_def456
MERCHANT_hotelresort_VIVA_ENVIRONMENT=production
MERCHANT_hotelresort_VIVA_CLIENT_ID=...
# ... (all other VIVA_* vars)
```

Each merchant gets:
- Its own API key for authentication
- Its own Viva OAuth2 token cache
- Its own webhook endpoint: `/api/webhooks/viva/myshop`, `/api/webhooks/viva/hotelresort`

### Application Settings

```env
PORT=3000                    # Server port (default: 3000)
NODE_ENV=development         # "development" or "production"
```

---

## Authentication

All API endpoints under `/api/payments/*` and `/api/wallets/*` require an `X-Api-Key` header. This key identifies which merchant the request belongs to.

```bash
curl -X POST http://localhost:3000/api/payments/orders \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: sk_live_myshop_abc123" \
  -d '{"amount": 5000}'
```

| Scenario | Response |
|----------|----------|
| Missing `X-Api-Key` header | `401 {"error": "Missing X-Api-Key header"}` |
| Invalid API key | `401 {"error": "Invalid API key"}` |
| Valid API key | Request proceeds, merchant's Viva credentials are used |

Webhook endpoints (`/api/webhooks/*`) do **not** require `X-Api-Key` — they use the `:merchantKey` path parameter instead, since Viva sends webhooks directly and cannot include custom headers.

---

## API Reference

All endpoints below require the `X-Api-Key` header unless noted otherwise.

### Payment Orders

#### Create Payment Order

`POST /api/payments/orders`

Creates a payment order in Viva Wallet and returns a checkout URL to redirect the customer to.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✓ | Amount in cents (minimum 30, i.e., €0.30). Set to 0 for card verification. |
| `customerTrns` | string | | Description shown to customer on checkout (1–2048 chars) |
| `customer` | object | | Customer details |
| `customer.email` | string | | Customer email address |
| `customer.fullName` | string | | Customer full name |
| `customer.phone` | string | | Customer phone number |
| `customer.countryCode` | string | | ISO country code (e.g., `GR`) |
| `customer.requestLang` | string | | Checkout language (e.g., `en-US`) |
| `merchantTrns` | string | | Your internal order reference (1–2048 chars). Returned in webhooks. |
| `dynamicDescriptor` | string | | Bank statement descriptor (max 13 chars, Latin only) |
| `currencyCode` | string | | ISO 4217 numeric code (default: `978` for EUR) |
| `paymentTimeout` | number | | Order expiration in seconds (default: 1800 = 30 min) |
| `preauth` | boolean | | Pre-authorize without charging (default: `false`) |
| `allowRecurring` | boolean | | Enable card tokenization for recurring payments (default: `false`) |
| `maxInstallments` | number | | Maximum installments 1–36, Greece only (default: 0) |
| `forceMaxInstallments` | boolean | | Force specific installment count |
| `paymentNotification` | boolean | | Send payment request email to customer (default: `false`) |
| `tipAmount` | number | | Tip amount included in total |
| `disableExactAmount` | boolean | | Allow customer to enter their own amount (default: `false`) |
| `disableCash` | boolean | | Disable cash payment option (default: `false`) |
| `disableWallet` | boolean | | Disable Viva wallet option (default: `false`) |
| `sourceCode` | string | | Override payment source code |
| `tags` | string[] | | Transaction tags for filtering |
| `cardTokens` | string[] | | Saved card tokens to show (max 10) |
| `isCardVerification` | boolean | | Verify card without charging (amount must be 0) |
| `stateId` | number | | Order state for redirect. Must be used with `urlFail`. |
| `urlFail` | string | | Redirect URL on failure/expiry. Must be used with `stateId`. |
| `paymentMethodFees` | array | | Additional fees per payment method: `[{paymentMethodId, fee}]` |
| `callback` | object | | **Callback configuration** (see below) |

**Callback Configuration (`callback` object):**

| Field | Type | Description |
|-------|------|-------------|
| `webhookUrl` | string | URL where this middleware POSTs normalized payment events (success, failure, refund) |
| `successUrl` | string | URL where this middleware POSTs only on successful payment |
| `failureUrl` | string | URL where this middleware POSTs only on failed payment |
| `secret` | string | Shared secret for HMAC-SHA256 signature on webhook POSTs |
| `redirectSuccessUrl` | string | Browser redirect URL after successful payment (appended to Viva checkout URL) |
| `redirectFailureUrl` | string | Browser redirect URL after failed payment (appended to Viva checkout URL) |
| `includeRawPayload` | boolean | Include the original Viva webhook payload in the `raw` field |
| `metadata` | object | Custom key-value data included in all webhook payloads for this order |

> **Note:** `webhookUrl` receives all events. `successUrl`/`failureUrl` are event-specific POST endpoints. `redirectSuccessUrl`/`redirectFailureUrl` are browser redirects (GET), not webhook POSTs.

**Response (201):**

```json
{
  "success": true,
  "orderCode": 1234567890123456,
  "checkoutUrl": "https://demo.vivapayments.com/web/checkout?ref=1234567890123456&successUrl=...",
  "callbackRegistered": true,
  "message": "Redirect customer to checkoutUrl to complete payment"
}
```

#### Get Order Details

`GET /api/payments/orders/:orderCode`

```json
{
  "success": true,
  "order": {
    "OrderCode": 1234567890123456,
    "SourceCode": "Default",
    "MerchantTrns": "ORD-12345",
    "RequestAmount": 50.00,
    "StateId": 0,
    "ExpirationDate": "2026-02-16T12:00:00"
  }
}
```

#### Update Order

`PATCH /api/payments/orders/:orderCode`

| Field | Type | Description |
|-------|------|-------------|
| `amount` | number | New amount in cents |
| `expirationDate` | string | New expiration date |
| `isCanceled` | boolean | Cancel the order |

#### Cancel Order

`DELETE /api/payments/orders/:orderCode`

### Transactions

#### Get Transaction

`GET /api/payments/transactions/:transactionId`

Returns full transaction details including card info, status, and amounts.

#### Create Transaction (Recurring/Capture)

`POST /api/payments/transactions/:transactionId`

Used to capture a pre-authorized payment or create a recurring charge.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✓ | Amount in cents |
| `installments` | number | | Number of installments |
| `customerTrns` | string | | Customer-visible description |
| `merchantTrns` | string | | Your reference |

#### Refund Transaction

`DELETE /api/payments/transactions/:transactionId?amount=1000`

Refunds a transaction. Omit `amount` for full refund, include for partial.

#### Fast Refund

`POST /api/payments/transactions/:transactionId/refund`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✓ | Refund amount in cents |
| `sourceCode` | string | | Source code |
| `merchantTrns` | string | | Your reference |

### Card Tokens

#### Save Card Token

`POST /api/payments/card-tokens`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transactionId` | string | ✓ | Transaction to tokenize |
| `groupId` | string | | Token group ID |

### Checkout URL

#### Get Checkout URL

`GET /api/payments/checkout-url/:orderCode?color=0000ff&paymentMethod=card`

Returns a checkout URL for an existing order, with optional customization.

### Wallets

#### Get Wallet Balances

`GET /api/wallets`

Returns wallet balances for the authenticated merchant.

---

## Webhook System

The webhook system has two layers:

1. **Viva → Middleware**: Viva sends raw webhook events to `/api/webhooks/viva/:merchantKey`
2. **Middleware → Your App**: The middleware normalizes these events and forwards them to your registered callback URL(s)

### Viva Webhook Endpoints (No Auth Required)

These endpoints are called by Viva directly:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/webhooks/viva/:merchantKey` | Webhook URL verification (Viva calls this to verify ownership) |
| `POST` | `/api/webhooks/viva/:merchantKey` | Receives webhook events from Viva |

### Webhook Forwarding to Your App

When you create a payment order with a `callback` configuration, the middleware registers those URLs. When Viva sends a webhook event, the middleware:

1. Verifies the Viva signature (if `VIVA_WEBHOOK_SECRET` is configured)
2. Normalizes the raw Viva payload into a clean, consistent format
3. Signs the payload with your `callback.secret` using HMAC-SHA256
4. POSTs it to your `callback.webhookUrl` (or event-specific URL)

**Headers sent to your webhook endpoint:**

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Webhook-Event` | Event type (e.g., `payment.success`) |
| `X-Webhook-Timestamp` | ISO 8601 timestamp |
| `X-Webhook-Signature` | HMAC-SHA256 hex digest of the JSON body |
| `X-Webhook-Signature-256` | `sha256=` prefixed signature |

**Normalized webhook payload your app receives:**

```json
{
  "event": "payment.success",
  "timestamp": "2026-02-16T10:30:00.000Z",
  "data": {
    "transactionId": "abc123-def456",
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
      "brand": "0"
    },
    "merchantReference": "ORD-12345",
    "metadata": {
      "orderId": "ORD-12345",
      "customerId": "CUST-789"
    }
  },
  "raw": { ... }
}
```

### Event Types

| Event | Viva EventTypeId | Description |
|-------|-----------------|-------------|
| `order.created` | — | Order created (sent internally when middleware creates the Viva order) |
| `payment.success` | 1796 | Transaction payment created successfully |
| `payment.failed` | 1798 | Transaction failed |
| `payment.refunded` | 1797 | Transaction reversal (refund/cancel) created |

### Verifying Webhook Signatures in Your App

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

app.post('/webhooks/payment', (req, res) => {
  const signature = req.headers['x-webhook-signature'];

  if (!verifySignature(req.body, signature, 'your-callback-secret')) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  switch (req.body.event) {
    case 'payment.success':
      // Update order status, send confirmation email, etc.
      break;
    case 'payment.failed':
      // Handle failure
      break;
    case 'payment.refunded':
      // Handle refund
      break;
  }

  res.json({ received: true });
});
```

### Testing Webhooks Locally

Since Viva can't reach `localhost`, use the built-in simulation endpoint (disabled in production):

```bash
# Simulate successful payment
curl -X POST http://localhost:3000/api/webhooks/test-simulate \
  -H "Content-Type: application/json" \
  -d '{"orderCode": 1234567890123456, "eventType": "success", "amount": 5000}'

# Simulate failed payment
curl -X POST http://localhost:3000/api/webhooks/test-simulate \
  -H "Content-Type: application/json" \
  -d '{"orderCode": 1234567890123456, "eventType": "failed"}'

# Check registered callbacks for an order
curl http://localhost:3000/api/webhooks/callbacks/1234567890123456
```

---

## Viva Wallet Dashboard Setup

### 1. Get API Credentials

1. Log in to the [Viva Wallet Dashboard](https://demo.vivapayments.com/) (or [production](https://www.vivapayments.com/))
2. Go to **Settings** → **API Access**
3. Note your **Merchant ID** and **API Key** (for Basic Auth)
4. Create an **OAuth2 Client** — note the **Client ID** and **Client Secret**

### 2. Create a Payment Source

1. Go to **Sales** → **Online Payments** → **Payment Sources**
2. Create a new source or use `Default`
3. Note the **Source Code**

### 3. Register Webhook URL

1. Go to **Settings** → **API Access** → **Webhooks**
2. Add your webhook URL: `https://yourdomain.com/api/webhooks/viva/{merchantKey}`
3. Viva will send a GET request to verify ownership — the middleware handles this automatically by calling Viva's `/api/messages/config/token` endpoint with your merchant's Basic Auth credentials
4. Enable the events you need:
   - **Transaction Payment Created** (1796) — successful payments
   - **Transaction Failed** (1798) — failed payments
   - **Transaction Reversal Created** (1797) — refunds
5. Note the **Webhook Verification Key** and set it as `MERCHANT_{key}_VIVA_WEBHOOK_SECRET`

> **Important:** Viva can only send webhooks to publicly accessible HTTPS URLs. For local development, use the `/api/webhooks/test-simulate` endpoint instead.

---

## Demo Server

The `demo-server/` directory contains a complete working e-commerce server that demonstrates how to integrate with this middleware. It includes:

- **Product catalog** — 4 demo products with stock tracking
- **Checkout flow** — creates orders, sends payment requests to the middleware, returns checkout URLs
- **Webhook handling** — receives normalized webhooks, updates order status, adjusts stock
- **Payment result pages** — HTML pages shown after successful/failed payments
- **Admin/test endpoints** — simulate payments, reset database

### Running the Demo

```bash
# Terminal 1: Start the payment middleware
npm run build && npm start

# Terminal 2: Start the demo server
cd demo-server
npm install
node src/index.js
```

The demo server runs on `http://localhost:4000`. Configure its connection to the middleware via environment variables or edit the `CONFIG` object in `demo-server/src/index.js`:

```javascript
const CONFIG = {
  port: 4000,
  paymentsServerUrl: 'http://localhost:3000',                    // Middleware URL
  merchantApiKey: 'sk_demo_myshop_your_secret_key_here',         // Must match MERCHANT_{key}_API_KEY
  webhookSecret: 'demo-webhook-secret-123',                      // For verifying incoming webhooks
  baseUrl: 'http://localhost:4000',                              // Demo server's own URL
};
```

### Demo Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | List all products |
| `POST` | `/api/checkout` | Create order and initiate payment |
| `GET` | `/api/orders` | List all orders |
| `GET` | `/api/orders/:orderId` | Get order details |
| `POST` | `/api/test/simulate-payment` | Simulate a payment webhook |
| `POST` | `/api/test/reset` | Reset the in-memory database |

### Example: Create a Checkout

```bash
curl -X POST http://localhost:4000/api/checkout \
  -H "Content-Type: application/json" \
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
```

The response includes a `checkoutUrl` — open it in a browser to complete payment using a [test card](#test-cards-demo-environment).

---

## Production Deployment

### Environment Variables

```env
PORT=3000
NODE_ENV=production

MERCHANT_myshop_API_KEY=sk_live_myshop_GENERATE_A_STRONG_RANDOM_KEY
MERCHANT_myshop_VIVA_ENVIRONMENT=production
MERCHANT_myshop_VIVA_CLIENT_ID=your_production_client_id.apps.vivapayments.com
MERCHANT_myshop_VIVA_CLIENT_SECRET=your_production_client_secret
MERCHANT_myshop_VIVA_MERCHANT_ID=your-merchant-uuid
MERCHANT_myshop_VIVA_API_KEY=your_production_api_key
MERCHANT_myshop_VIVA_SOURCE_CODE=Default
MERCHANT_myshop_VIVA_WEBHOOK_SECRET=your_webhook_secret
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```bash
docker build -t viva-payment-middleware .
docker run -p 3000:3000 --env-file .env viva-payment-middleware
```

### Security Checklist

- [ ] Use strong, random `API_KEY` values (at least 32 characters)
- [ ] Never commit `.env` to version control
- [ ] Run behind a reverse proxy (nginx, Caddy) with HTTPS
- [ ] Set `NODE_ENV=production` to disable test/debug endpoints
- [ ] Restrict network access — only your application servers should reach this middleware
- [ ] Verify webhook signatures on your application server

---

## Test Cards (Demo Environment)

When `VIVA_ENVIRONMENT=demo`, Viva uses test URLs. Use these cards on the checkout page:

| Card Number | Type | Result |
|-------------|------|--------|
| 4111 1111 1111 1111 | Visa | Success (amount ≥ €0.30) |
| 5199 8162 6654 6408 | Mastercard | Success (amount ≥ €0.30) |
| 4000 0000 0000 0002 | Visa | Declined |

Use any future expiry date and any 3-digit CVV.

---

## Project Structure

```
online_payments/
├── src/
│   ├── index.ts                     # Express app setup, route mounting, startup
│   ├── config/
│   │   ├── merchant.config.ts       # Multi-merchant registry (scans env vars)
│   │   └── viva.config.ts           # VivaConfig interface definition
│   ├── middleware/
│   │   └── auth.middleware.ts       # X-Api-Key authentication
│   ├── routes/
│   │   ├── payment.routes.ts        # Payment orders, transactions, refunds, card tokens
│   │   ├── webhook.routes.ts        # Viva webhook verification & reception, test simulate
│   │   └── wallet.routes.ts         # Wallet balance queries
│   ├── services/
│   │   ├── viva-wallet.service.ts   # Viva API client (OAuth2 + Basic Auth)
│   │   ├── merchant.service.ts      # Per-merchant service instance factory
│   │   └── webhook-forwarder.service.ts  # Normalizes & forwards webhooks to your app
│   └── types/
│       ├── viva.types.ts            # Viva API request/response types
│       └── express.d.ts             # Express Request augmentation (merchantKey, vivaService)
├── demo-server/
│   └── src/
│       └── index.js                 # Demo e-commerce server
├── dist/                            # Compiled JavaScript output
├── .env.example                     # Environment variable template
├── package.json
├── tsconfig.json
└── nodemon.json
```

---

## Resources

- [Viva Wallet Developer Portal](https://developer.viva.com/)
- [Payment API Documentation](https://developer.viva.com/apis-for-payments/payment-api/)
- [Smart Checkout Guide](https://developer.viva.com/smart-checkout/)
- [Webhooks Documentation](https://developer.viva.com/webhooks-for-payments/)
- [Viva Demo Environment](https://demo.vivapayments.com/)

## License

ISC
