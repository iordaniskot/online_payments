import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import type { WebhookPayload } from "../types/viva.types.js";
import { webhookForwarderService } from "../services/webhook-forwarder.service.js";
import { getMerchantByKey } from "../config/merchant.config.js";
import { vivaConfig } from "../config/viva.config.js";

const router = Router();

/**
 * Verify webhook signature using the merchant's webhook secret
 */
function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret) {
    console.warn("Webhook secret not configured, skipping verification");
    return true;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

router.get("/viva", async (req: Request, res: Response) => {
  try {
    const isDemo = process.env.VIVA_ENVIRONMENT !== "production";
    const tokenUrl = isDemo
      ? "https://demo.vivapayments.com/api/messages/config/token"
      : "https://www.vivapayments.com/api/messages/config/token";

    const credentials = Buffer.from(
      `${vivaConfig.merchantId}:${vivaConfig.apiKey}`,
    ).toString("base64");

    const response = await axios.get(tokenUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("Webhook verification failed:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

/**
 * Webhook verification endpoint (per merchant)
 * Viva Wallet sends a GET request to verify the webhook URL.
 * GET /api/webhooks/viva/:merchantKey
 */
router.get("/viva/:merchantKey", async (req: Request, res: Response) => {
  try {
    const merchantKey = req.params["merchantKey"] as string;
    const merchant = getMerchantByKey(merchantKey);

    if (!merchant) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }

    // const isDemo = merchant.vivaConfig.authUrl.includes('demo');
    const tokenUrl = "https://demo.vivapayments.com/api/messages/config/token";
    // 'https://www.vivapayments.com/api/messages/config/token';

    const credentials = Buffer.from(
      `${merchant.vivaConfig.merchantId}:${merchant.vivaConfig.apiKey}`,
    ).toString("base64");

    console.log(
      `Request made from : ${req.ip} to verify webhook for merchantKey ${merchantKey}`,
    );
    // console.log(
    //     "Credentials for merchantKey", merchantKey, ":", {
    //         merchantId: merchant.vivaConfig.merchantId,
    //         apiKey: merchant.vivaConfig.apiKey ? '✓ set' : '✗ not set',
    //         tokenUrl,
    //     }
    // )

    const response = await axios.get(tokenUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    console.log("Webhook verification response :", {
      status: response.status,
      data: response.data,
    });
    res.json(response.data);
  } catch (error) {
    console.error("Webhook verification failed:", error);
    res.status(500).json({ error: "Verification failed" });
  }
});

/**
 * Webhook receiver endpoint (per merchant)
 * Viva Wallet sends POST requests for payment events
 * POST /api/webhooks/viva/:merchantKey
 */
router.post("/viva/:merchantKey", async (req: Request, res: Response) => {
  try {
    const merchantKey = req.params["merchantKey"] as string;
    const merchant = getMerchantByKey(merchantKey);

    if (!merchant) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }

    // Get signature from headers
    const signature = req.headers["viva-signature-256"] as string;

    // Verify signature if secret is configured
    if (merchant.webhookSecret && signature) {
      const rawBody = JSON.stringify(req.body);
      if (!verifySignature(rawBody, signature, merchant.webhookSecret)) {
        console.error(`Invalid webhook signature for merchant ${merchantKey}`);
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }

    const payload: WebhookPayload = req.body;

    console.log(`Received Viva webhook for merchant ${merchantKey}:`, {
      eventTypeId: payload.EventTypeId,
      transactionId: payload.EventData?.TransactionId,
      orderCode: payload.EventData?.OrderCode,
      statusId: payload.EventData?.StatusId,
      amount: payload.EventData?.Amount,
    });

    // Handle different event types
    switch (payload.EventTypeId) {
      case 1796: // Transaction Payment Created
        await handleTransactionPaymentCreated(payload);
        break;

      case 1798: // Transaction Failed
        await handleTransactionFailed(payload);
        break;

      case 1797: // Transaction Reversal Created (Refund/Cancel)
        await handleTransactionReversalCreated(payload);
        break;

      default:
        console.log(`Unhandled event type: ${payload.EventTypeId}`);
    }

    // Respond with 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    // Still return 200 to prevent retries for processing errors
    res.status(200).json({ received: true, error: "Processing error" });
  }
});

/**
 * Handle successful payment event
 */
async function handleTransactionPaymentCreated(
  payload: WebhookPayload,
): Promise<void> {
  const { EventData } = payload;

  console.log("Payment successful:", {
    transactionId: EventData.TransactionId,
    orderCode: EventData.OrderCode,
    amount: EventData.Amount,
    email: EventData.Email,
    cardNumber: EventData.CardNumber,
  });

  // Forward to callback URL
  await webhookForwarderService.forwardPaymentSuccess(
    EventData.OrderCode,
    {
      transactionId: EventData.TransactionId,
      amount: EventData.Amount,
      currency: EventData.CurrencyCode,
      status: EventData.StatusId,
      customer: {
        email: EventData.Email,
        fullName: EventData.FullName,
        phone: EventData.Phone,
      },
      card: {
        lastFour: EventData.CardNumber?.slice(-4),
        brand: String(EventData.CardTypeId),
        expiryDate: undefined,
      },
      merchantReference: EventData.MerchantTrns,
    },
    payload, // Include raw payload
  );
}

/**
 * Handle failed payment event
 */
async function handleTransactionFailed(payload: WebhookPayload): Promise<void> {
  const { EventData } = payload;

  console.log("Payment failed:", {
    transactionId: EventData.TransactionId,
    orderCode: EventData.OrderCode,
    statusId: EventData.StatusId,
  });

  // Forward to callback URL
  await webhookForwarderService.forwardPaymentFailed(
    EventData.OrderCode,
    {
      transactionId: EventData.TransactionId,
      status: EventData.StatusId,
      merchantReference: EventData.MerchantTrns,
    },
    payload, // Include raw payload
  );
}

/**
 * Handle refund/reversal event
 */
async function handleTransactionReversalCreated(
  payload: WebhookPayload,
): Promise<void> {
  const { EventData } = payload;

  console.log("Transaction reversed:", {
    transactionId: EventData.TransactionId,
    orderCode: EventData.OrderCode,
    amount: EventData.Amount,
  });

  // Forward to callback URL
  await webhookForwarderService.forwardPaymentRefunded(
    EventData.OrderCode,
    {
      transactionId: EventData.TransactionId,
      amount: EventData.Amount,
      currency: EventData.CurrencyCode,
      merchantReference: EventData.MerchantTrns,
    },
    payload, // Include raw payload
  );
}

/**
 * Test endpoint to simulate Viva webhooks (for local development)
 * POST /api/webhooks/test-simulate
 *
 * Body: {
 *   orderCode: number,
 *   eventType: "success" | "failed" | "refund",
 *   amount?: number,
 *   transactionId?: string
 * }
 */
router.post(
  "/test-simulate",
  async (req: Request, res: Response): Promise<void> => {
    if (process.env.NODE_ENV === "production") {
      res.status(403).json({ error: "Test endpoint disabled in production" });
      return;
    }

    const { orderCode, eventType, amount, transactionId } = req.body;

    if (!orderCode) {
      res.status(400).json({ error: "orderCode is required" });
      return;
    }

    const testTransactionId = transactionId || `TEST-${Date.now()}`;
    const testAmount = amount || 1000;

    // Create a mock Viva webhook payload
    const mockPayload: WebhookPayload = {
      EventTypeId:
        eventType === "success" ? 1796 : eventType === "refund" ? 1797 : 1798,
      EventData: {
        TransactionId: testTransactionId,
        OrderCode: Number(orderCode),
        Amount: testAmount,
        StatusId: eventType === "success" ? "F" : "E",
        CurrencyCode: "EUR",
        Email: "test@example.com",
        FullName: "Test User",
        Phone: "+306912345678",
        CardNumber: "************4242",
        CardTypeId: 0,
        MerchantTrns: `ORDER-${orderCode}`,
      },
    };

    console.log("Simulating Viva webhook:", {
      eventType,
      orderCode,
      transactionId: testTransactionId,
    });

    try {
      // Process the mock webhook like a real one
      switch (mockPayload.EventTypeId) {
        case 1796:
          await handleTransactionPaymentCreated(mockPayload);
          break;
        case 1798:
          await handleTransactionFailed(mockPayload);
          break;
        case 1797:
          await handleTransactionReversalCreated(mockPayload);
          break;
      }

      res.json({
        success: true,
        message: `Simulated ${eventType} webhook for order ${orderCode}`,
        forwarded: true,
      });
    } catch (error) {
      console.error("Error simulating webhook:", error);
      res.status(500).json({ error: "Failed to simulate webhook" });
    }
  },
);

/**
 * Debug endpoint to check registered callbacks
 * GET /api/webhooks/callbacks/:orderCode
 */
router.get("/callbacks/:orderCode", (req: Request, res: Response): void => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Debug endpoint disabled in production" });
    return;
  }

  const orderCode = req.params.orderCode as string;
  const callback = webhookForwarderService.getCallback(orderCode);

  if (callback) {
    res.json({
      orderCode,
      hasCallback: true,
      webhookUrl: callback.webhookUrl ? "✓ configured" : "✗ not set",
      successUrl: callback.successUrl ? "✓ configured" : "✗ not set",
      failureUrl: callback.failureUrl ? "✓ configured" : "✗ not set",
      hasSecret: !!callback.secret,
      includeRawPayload: callback.includeRawPayload,
      metadata: callback.metadata,
    });
  } else {
    res.json({
      orderCode,
      hasCallback: false,
      message: "No callback registered for this order",
    });
  }
});

export default router;
