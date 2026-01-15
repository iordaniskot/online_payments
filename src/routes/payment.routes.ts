import { Router } from 'express';
import type { Request, Response } from 'express';
import { vivaWalletService } from '../services/viva-wallet.service.js';
import { webhookForwarderService } from '../services/webhook-forwarder.service.js';
import type { CallbackConfig } from '../services/webhook-forwarder.service.js';
import type {
  CreatePaymentOrderRequest,
  UpdateOrderRequest,
} from '../types/viva.types.js';

const router = Router();

// Helper to safely get param as string
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? '';
  }
  return '';
}

// Helper to safely get query param as string or undefined
function getQueryParam(query: Record<string, unknown>, key: string): string | undefined {
  const value = query[key];
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

/**
 * Create a new payment order
 * POST /api/payments/orders
 * 
 * Request Body:
 * - amount (required): Amount in cents (minimum 30)
 * - customerTrns: Description shown to customer
 * - customer: { email, fullName, phone, countryCode, requestLang }
 * - dynamicDescriptor: Bank statement descriptor (max 13 chars)
 * - currencyCode: ISO 4712 currency code (e.g., "978" for EUR)
 * - paymentTimeout: Order expiration in seconds (default: 1800)
 * - preauth: Pre-authorize without charging (default: false)
 * - allowRecurring: Enable recurring payments (default: false)
 * - maxInstallments: Max installments 1-36 (Greece only)
 * - forceMaxInstallments: Force specific installment count
 * - paymentNotification: Send payment request email
 * - tipAmount: Tip included in total amount
 * - disableExactAmount: Allow customer to enter amount
 * - disableCash: Disable cash payment option
 * - disableWallet: Disable Viva wallet option
 * - sourceCode: Payment source code
 * - merchantTrns: Merchant reference
 * - stateId: State for redirect (1 = Expired)
 * - urlFail: Redirect URL on failure/expiry
 * - tags: Transaction tags array
 * - cardTokens: Saved card tokens (max 10)
 * - paymentMethodFees: [{ paymentMethodId, fee }]
 * - isCardVerification: Verify card without charging
 * - nbgLoanOrderOptions: { Code, ReceiptType }
 * - klarnaOrderOptions: { billingAddress, shippingAddress, orderLines }
 * 
 * Callback Configuration (for webhook forwarding):
 * - callback: {
 *     successUrl: URL to call on successful payment
 *     failureUrl: URL to call on failed payment
 *     webhookUrl: Single URL for all events
 *     secret: Secret for signing webhook payloads
 *     includeRawPayload: Include original Viva payload
 *     metadata: Custom data to include in callbacks
 *   }
 */
router.post('/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract callback config from request
    const { callback, ...orderData } = req.body as CreatePaymentOrderRequest & { callback?: CallbackConfig };
    const orderRequest: CreatePaymentOrderRequest = orderData;

    // Validate required fields
    if (orderRequest.isCardVerification) {
      // Card verification requires amount to be 0
      if (orderRequest.amount !== 0) {
        res.status(400).json({
          error: 'For card verification, amount must be 0',
        });
        return;
      }
    } else if (!orderRequest.amount || orderRequest.amount < 30) {
      res.status(400).json({
        error: 'Amount is required and must be at least 30 (cents)',
      });
      return;
    }

    // Validate dynamicDescriptor length
    if (orderRequest.dynamicDescriptor && orderRequest.dynamicDescriptor.length > 13) {
      res.status(400).json({
        error: 'dynamicDescriptor must be 13 characters or less',
      });
      return;
    }

    // Validate cardTokens limit
    if (orderRequest.cardTokens && orderRequest.cardTokens.length > 10) {
      res.status(400).json({
        error: 'Maximum 10 card tokens allowed',
      });
      return;
    }

    // Validate maxInstallments range
    if (orderRequest.maxInstallments !== undefined && 
        (orderRequest.maxInstallments < 1 || orderRequest.maxInstallments > 36)) {
      res.status(400).json({
        error: 'maxInstallments must be between 1 and 36',
      });
      return;
    }

    // Validate stateId and urlFail must be used together
    if ((orderRequest.stateId !== undefined && !orderRequest.urlFail) ||
        (orderRequest.urlFail && orderRequest.stateId === undefined)) {
      res.status(400).json({
        error: 'stateId and urlFail must be used together',
      });
      return;
    }

    const result = await vivaWalletService.createPaymentOrder(orderRequest);

    // Register callback URLs for this order
    if (callback) {
      webhookForwarderService.registerCallback(result.orderCode, callback);
      
      // Optionally notify that order was created
      await webhookForwarderService.forwardOrderCreated(
        result.orderCode,
        {
          amount: orderRequest.amount,
          currency: orderRequest.currencyCode ?? undefined,
          merchantReference: orderRequest.merchantTrns ?? undefined,
          customer: orderRequest.customer ?? undefined,
        },
        callback
      );
    }

    // Generate checkout URL for the customer
    const checkoutUrl = vivaWalletService.getCheckoutUrl({
      orderCode: result.orderCode,
    });

    res.status(201).json({
      success: true,
      orderCode: result.orderCode,
      checkoutUrl,
      callbackRegistered: !!callback,
      message: orderRequest.paymentNotification 
        ? 'Payment notification email sent to customer' 
        : 'Redirect customer to checkoutUrl to complete payment',
    });
  } catch (error) {
    console.error('Error creating payment order:', error);
    res.status(500).json({
      error: 'Failed to create payment order',
    });
  }
});

/**
 * Get order details
 * GET /api/payments/orders/:orderCode
 */
router.get('/orders/:orderCode', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderCodeStr = getParam(req.params, 'orderCode');
    const orderCode = parseInt(orderCodeStr, 10);

    if (isNaN(orderCode)) {
      res.status(400).json({
        error: 'Invalid order code',
      });
      return;
    }

    const order = await vivaWalletService.getOrder(orderCode);

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('Error retrieving order:', error);
    res.status(500).json({
      error: 'Failed to retrieve order',
    });
  }
});

/**
 * Update an order
 * PATCH /api/payments/orders/:orderCode
 */
router.patch('/orders/:orderCode', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderCodeStr = getParam(req.params, 'orderCode');
    const orderCode = parseInt(orderCodeStr, 10);
    const updateRequest: UpdateOrderRequest = req.body;

    if (isNaN(orderCode)) {
      res.status(400).json({
        error: 'Invalid order code',
      });
      return;
    }

    await vivaWalletService.updateOrder(orderCode, updateRequest);

    res.json({
      success: true,
      message: 'Order updated successfully',
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      error: 'Failed to update order',
    });
  }
});

/**
 * Cancel an order
 * DELETE /api/payments/orders/:orderCode
 */
router.delete('/orders/:orderCode', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderCodeStr = getParam(req.params, 'orderCode');
    const orderCode = parseInt(orderCodeStr, 10);

    if (isNaN(orderCode)) {
      res.status(400).json({
        error: 'Invalid order code',
      });
      return;
    }

    await vivaWalletService.cancelOrder(orderCode);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      error: 'Failed to cancel order',
    });
  }
});

/**
 * Get transaction details
 * GET /api/payments/transactions/:transactionId
 */
router.get('/transactions/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const transactionId = getParam(req.params, 'transactionId');

    const transaction = await vivaWalletService.getTransaction(transactionId);

    res.json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error('Error retrieving transaction:', error);
    res.status(500).json({
      error: 'Failed to retrieve transaction',
    });
  }
});

/**
 * Create recurring payment or capture pre-auth
 * POST /api/payments/transactions/:transactionId
 */
router.post('/transactions/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const transactionId = getParam(req.params, 'transactionId');
    const transactionRequest = req.body;

    if (!transactionRequest.amount) {
      res.status(400).json({
        error: 'Amount is required',
      });
      return;
    }

    const result = await vivaWalletService.createTransaction(
      transactionId,
      transactionRequest
    );

    res.status(201).json({
      success: true,
      transaction: result,
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({
      error: 'Failed to create transaction',
    });
  }
});

/**
 * Refund/Cancel a transaction
 * DELETE /api/payments/transactions/:transactionId
 */
router.delete('/transactions/:transactionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const transactionId = getParam(req.params, 'transactionId');
    const amountStr = getQueryParam(req.query as Record<string, unknown>, 'amount');
    const sourceCode = getQueryParam(req.query as Record<string, unknown>, 'sourceCode');
    
    const amount = amountStr ? parseInt(amountStr, 10) : undefined;

    const result = await vivaWalletService.cancelTransaction(
      transactionId,
      amount,
      sourceCode
    );

    res.json({
      success: true,
      transaction: result,
    });
  } catch (error) {
    console.error('Error cancelling transaction:', error);
    res.status(500).json({
      error: 'Failed to cancel transaction',
    });
  }
});

/**
 * Fast refund
 * POST /api/payments/transactions/:transactionId/refund
 */
router.post('/transactions/:transactionId/refund', async (req: Request, res: Response): Promise<void> => {
  try {
    const transactionId = getParam(req.params, 'transactionId');
    const { amount, sourceCode, merchantTrns } = req.body;

    if (!amount) {
      res.status(400).json({
        error: 'Amount is required',
      });
      return;
    }

    const result = await vivaWalletService.fastRefund(
      transactionId,
      amount,
      sourceCode,
      merchantTrns
    );

    res.json({
      success: true,
      refundTransactionId: result.transactionId,
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      error: 'Failed to process refund',
    });
  }
});

/**
 * Create card token for saving card
 * POST /api/payments/card-tokens
 */
router.post('/card-tokens', async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId, groupId } = req.body;

    if (!transactionId) {
      res.status(400).json({
        error: 'Transaction ID is required',
      });
      return;
    }

    const result = await vivaWalletService.createCardToken({
      transactionId,
      groupId,
    });

    res.status(201).json({
      success: true,
      token: result.token,
    });
  } catch (error) {
    console.error('Error creating card token:', error);
    res.status(500).json({
      error: 'Failed to create card token',
    });
  }
});

/**
 * Get checkout URL for an order
 * GET /api/payments/checkout-url/:orderCode
 */
router.get('/checkout-url/:orderCode', (req: Request, res: Response): void => {
  try {
    const orderCodeStr = getParam(req.params, 'orderCode');
    const orderCode = parseInt(orderCodeStr, 10);
    const color = getQueryParam(req.query as Record<string, unknown>, 'color');
    const paymentMethod = getQueryParam(req.query as Record<string, unknown>, 'paymentMethod');

    if (isNaN(orderCode)) {
      res.status(400).json({
        error: 'Invalid order code',
      });
      return;
    }

    const checkoutUrl = vivaWalletService.getCheckoutUrl({
      orderCode,
      color,
      paymentMethod,
    });

    res.json({
      success: true,
      checkoutUrl,
    });
  } catch (error) {
    console.error('Error generating checkout URL:', error);
    res.status(500).json({
      error: 'Failed to generate checkout URL',
    });
  }
});

export default router;
