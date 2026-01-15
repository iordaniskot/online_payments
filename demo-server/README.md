# Demo E-commerce Server

A demo Node.js server that showcases integration with the Viva Payments middleware.

## Features

- **Product Catalog**: In-memory product database
- **Checkout Flow**: Creates orders and initiates payment via the payments middleware
- **Webhook Handling**: Receives real-time payment notifications
- **Stock Management**: Automatic stock updates on payment success/refund
- **Payment Simulation**: Test endpoints to simulate payment webhooks

## Setup

```bash
# Install dependencies
cd demo-server
npm install

# Start the server (make sure payments server is running on port 3000)
npm start

# Or with auto-reload
npm run dev
```

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   Customer      │     │   Demo E-commerce   │     │   Payments   │
│   Browser       │     │   Server (:4000)    │     │   Middleware │
└────────┬────────┘     └──────────┬──────────┘     │   (:3000)    │
         │                         │                 └───────┬──────┘
         │  1. POST /api/checkout  │                         │
         │ ───────────────────────>│                         │
         │                         │  2. Create Payment      │
         │                         │ ───────────────────────>│
         │                         │                         │
         │                         │  3. Return checkoutUrl  │
         │                         │ <───────────────────────│
         │  4. Redirect to Viva    │                         │
         │ <───────────────────────│                         │
         │                         │                         │
         │  5. Customer pays       │                         │
         │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
         │                         │                         │
         │                         │  6. Webhook: PAID       │
         │                         │ <───────────────────────│
         │                         │  (Update order, stock)  │
         │                         │                         │
         │  7. Redirect to success │                         │
         │ <─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
         │                         │                         │
```

## API Endpoints

### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List all products |
| GET | `/api/products/:id` | Get product by ID |

### Checkout & Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/checkout` | Create order and initiate payment |
| GET | `/api/orders` | List all orders |
| GET | `/api/orders/:orderId` | Get order details |

### Testing

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/test/simulate-payment` | Simulate payment webhook |
| POST | `/api/test/reset` | Reset demo database |

## Example Usage

### 1. View Products

```bash
curl http://localhost:4000/api/products
```

### 2. Create an Order

```bash
curl -X POST http://localhost:4000/api/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "email": "customer@example.com",
      "fullName": "John Doe",
      "phone": "+306912345678"
    },
    "items": [
      { "productId": "PROD-001", "quantity": 2 },
      { "productId": "PROD-003", "quantity": 1 }
    ],
    "shippingAddress": {
      "street": "123 Main Street",
      "city": "Athens",
      "postalCode": "10431",
      "country": "GR"
    }
  }'
```

Response:
```json
{
  "success": true,
  "order": {
    "id": "ORD-1705312345678-ABC123XYZ",
    "totalAmount": 7497,
    "status": "awaiting_payment",
    "checkoutUrl": "https://demo.vivapayments.com/web/checkout?ref=..."
  },
  "message": "Redirect customer to checkoutUrl to complete payment"
}
```

### 3. Simulate Payment Success

```bash
curl -X POST http://localhost:4000/api/test/simulate-payment \
  -H "Content-Type: application/json" \
  -d '{"orderId": "ORD-1705312345678-ABC123XYZ", "success": true}'
```

### 4. Check Order Status

```bash
curl http://localhost:4000/api/orders/ORD-1705312345678-ABC123XYZ
```

## Webhook Payload Structure

When a payment event occurs, the payments middleware forwards a standardized webhook:

```json
{
  "event": "PAYMENT_SUCCESS",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "data": {
    "transactionId": "abc123",
    "orderCode": 123456789,
    "amount": 7497,
    "currency": "EUR",
    "status": "completed",
    "customer": {
      "email": "customer@example.com",
      "fullName": "John Doe"
    },
    "card": {
      "lastFour": "4242",
      "brand": "Visa"
    },
    "merchantReference": "ORD-1705312345678-ABC123XYZ",
    "metadata": {
      "orderId": "ORD-1705312345678-ABC123XYZ",
      "customerEmail": "customer@example.com"
    }
  },
  "raw": { /* Original Viva payload */ }
}
```

## Order Status Flow

```
PENDING → AWAITING_PAYMENT → PAID → SHIPPED → DELIVERED
                           ↘
                            FAILED
                           ↘
                            REFUNDED
```
