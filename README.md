# Viva Wallet Online Payment Platform

A TypeScript/Express.js payment platform with full Viva Wallet API integration.

## Features

- **Payment Orders**: Create, retrieve, update, and cancel payment orders
- **Transactions**: View transaction details, create recurring payments, capture pre-auths
- **Refunds**: Full and partial refunds with fast refund support
- **Card Tokenization**: Save cards for future payments
- **Webhooks**: Receive real-time payment notifications
- **Wallet Management**: View merchant wallet balances

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and add your Viva Wallet credentials:

```bash
cp .env.example .env
```

Edit `.env` with your credentials from the [Viva Wallet Dashboard](https://demo.vivapayments.com):

```env
VIVA_ENVIRONMENT=demo
VIVA_CLIENT_ID=your_client_id
VIVA_CLIENT_SECRET=your_client_secret
VIVA_MERCHANT_ID=your_merchant_id
VIVA_API_KEY=your_api_key
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Build for Production

```bash
npm run build
npm start
```

## API Endpoints

### Payment Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/orders` | Create a payment order |
| GET | `/api/payments/orders/:orderCode` | Get order details |
| PATCH | `/api/payments/orders/:orderCode` | Update an order |
| DELETE | `/api/payments/orders/:orderCode` | Cancel an order |
| GET | `/api/payments/checkout-url/:orderCode` | Get checkout URL |

### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments/transactions/:id` | Get transaction details |
| POST | `/api/payments/transactions/:id` | Create recurring/capture |
| DELETE | `/api/payments/transactions/:id` | Refund transaction |
| POST | `/api/payments/transactions/:id/refund` | Fast refund |

### Card Tokens

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/card-tokens` | Create card token |

### Wallets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallets` | Get merchant wallets |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/viva` | Webhook verification |
| POST | `/api/webhooks/viva` | Receive webhook events |

## Usage Examples

### Create a Payment Order

```bash
curl -X POST http://localhost:3000/api/payments/orders \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "customerTrns": "Order #12345",
    "customer": {
      "email": "customer@example.com",
      "fullName": "John Doe",
      "phone": "+306900000000"
    }
  }'
```

Response:
```json
{
  "success": true,
  "orderCode": 1234567890123456,
  "checkoutUrl": "https://demo.vivapayments.com/web/checkout?ref=1234567890123456"
}
```

### Get Transaction Details

```bash
curl http://localhost:3000/api/payments/transactions/your-transaction-id
```

### Refund a Transaction

```bash
curl -X POST http://localhost:3000/api/payments/transactions/your-transaction-id/refund \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 500
  }'
```

## Payment Flow

1. **Create Order**: Call `POST /api/payments/orders` with payment details
2. **Redirect Customer**: Use the `checkoutUrl` to redirect customer to Viva checkout
3. **Customer Pays**: Customer completes payment on Viva's secure page
4. **Redirect Back**: Customer is redirected to your success/failure URL
5. **Webhook**: Receive real-time notification about payment status

## Webhooks Setup

1. Go to Viva Wallet Dashboard → Settings → API Access → Webhooks
2. Add your webhook URL: `https://yourdomain.com/api/webhooks/viva`
3. Copy the verification key and add it to your `.env`:
   ```env
   VIVA_WEBHOOK_SECRET=your_webhook_secret
   ```

## Test Cards (Demo Environment)

| Card Number | Type | Result |
|-------------|------|--------|
| 4111 1111 1111 1111 | Visa | Success (amount ≥ 30) |
| 5199 8162 6654 6408 | Mastercard | Success (amount ≥ 30) |
| 4000 0000 0000 0002 | Visa | Declined |

Use any future expiry date and any 3-digit CVV.

## Project Structure

```
src/
├── config/
│   └── viva.config.ts      # Viva Wallet configuration
├── routes/
│   ├── payment.routes.ts   # Payment API endpoints
│   ├── webhook.routes.ts   # Webhook handlers
│   └── wallet.routes.ts    # Wallet endpoints
├── services/
│   └── viva-wallet.service.ts  # Viva Wallet API wrapper
├── types/
│   └── viva.types.ts       # TypeScript type definitions
└── index.ts                # Application entry point
```

## Resources

- [Viva Wallet Developer Portal](https://developer.viva.com/)
- [Payment API Documentation](https://developer.viva.com/apis-for-payments/payment-api/)
- [Smart Checkout Guide](https://developer.viva.com/smart-checkout/)
- [Webhooks Documentation](https://developer.viva.com/webhooks-for-payments/)

## License

ISC
