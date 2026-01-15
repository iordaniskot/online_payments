import axios from 'axios';
import type { AxiosError } from 'axios';
import crypto from 'crypto';

/**
 * Webhook event types that can be forwarded
 */
export enum WebhookEventType {
  PAYMENT_SUCCESS = 'payment.success',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REFUNDED = 'payment.refunded',
  PAYMENT_PENDING = 'payment.pending',
  ORDER_CREATED = 'order.created',
  ORDER_CANCELLED = 'order.cancelled',
}

/**
 * Standardized webhook payload sent to callback URLs
 */
export interface WebhookForwardPayload {
  event: WebhookEventType;
  timestamp: string;
  data: {
    transactionId?: string | undefined;
    orderCode?: number | string | undefined;
    amount?: number | undefined;
    currency?: string | undefined;
    status?: string | undefined;
    customer?: {
      email?: string | undefined;
      fullName?: string | undefined;
      phone?: string | undefined;
    } | undefined;
    card?: {
      lastFour?: string | undefined;
      brand?: string | undefined;
      expiryDate?: string | undefined;
    } | undefined;
    merchantReference?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  };
  raw?: unknown | undefined; // Original Viva payload (optional)
}

/**
 * Callback configuration stored per order
 */
export interface CallbackConfig {
  successUrl?: string;
  failureUrl?: string;
  webhookUrl?: string; // Single URL for all events
  secret?: string; // Secret for signing payloads
  includeRawPayload?: boolean;
  metadata?: Record<string, unknown>; // Custom data to include in callbacks
}

// In-memory store for callback configurations (per orderCode)
// In production, use Redis or a database
const callbackStore = new Map<string, CallbackConfig>();

// Default callback URL from environment
const DEFAULT_CALLBACK_URL = process.env.WEBHOOK_CALLBACK_URL || '';
const DEFAULT_CALLBACK_SECRET = process.env.WEBHOOK_CALLBACK_SECRET || '';

/**
 * Webhook Forwarder Service
 * Handles forwarding payment events to external servers
 */
class WebhookForwarderService {
  /**
   * Register callback URLs for an order
   */
  registerCallback(orderCode: string | number, config: CallbackConfig): void {
    callbackStore.set(String(orderCode), config);
    console.log(`Registered callback for order ${orderCode}:`, {
      successUrl: config.successUrl ? '✓' : '✗',
      failureUrl: config.failureUrl ? '✓' : '✗',
      webhookUrl: config.webhookUrl ? '✓' : '✗',
    });
  }

  /**
   * Get callback configuration for an order
   */
  getCallback(orderCode: string | number): CallbackConfig | undefined {
    return callbackStore.get(String(orderCode));
  }

  /**
   * Remove callback configuration after use
   */
  removeCallback(orderCode: string | number): void {
    callbackStore.delete(String(orderCode));
  }

  /**
   * Generate HMAC signature for payload
   */
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Forward webhook to a URL
   */
  private async forwardToUrl(
    url: string,
    payload: WebhookForwardPayload,
    secret?: string
  ): Promise<boolean> {
    try {
      const payloadString = JSON.stringify(payload);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
      };

      // Add signature if secret is provided
      if (secret) {
        const signature = this.generateSignature(payloadString, secret);
        headers['X-Webhook-Signature'] = signature;
        headers['X-Webhook-Signature-256'] = `sha256=${signature}`;
      }

      const response = await axios.post(url, payload, {
        headers,
        timeout: 10000, // 10 second timeout
      });

      console.log(`Webhook forwarded successfully to ${url}:`, {
        status: response.status,
        event: payload.event,
        orderCode: payload.data.orderCode,
      });

      return true;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error(`Failed to forward webhook to ${url}:`, {
        event: payload.event,
        orderCode: payload.data.orderCode,
        error: axiosError.message,
        status: axiosError.response?.status,
      });
      return false;
    }
  }

  /**
   * Forward payment success event
   */
  async forwardPaymentSuccess(
    orderCode: string | number,
    data: WebhookForwardPayload['data'],
    rawPayload?: unknown
  ): Promise<void> {
    const config = this.getCallback(orderCode);
    const payload: WebhookForwardPayload = {
      event: WebhookEventType.PAYMENT_SUCCESS,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        orderCode,
        metadata: config?.metadata,
      },
      raw: config?.includeRawPayload ? rawPayload : undefined,
    };

    // Forward to registered success URL
    if (config?.successUrl) {
      await this.forwardToUrl(config.successUrl, payload, config.secret);
    }

    // Forward to registered webhook URL
    if (config?.webhookUrl) {
      await this.forwardToUrl(config.webhookUrl, payload, config.secret);
    }

    // Forward to default callback URL
    if (DEFAULT_CALLBACK_URL && !config?.successUrl && !config?.webhookUrl) {
      await this.forwardToUrl(DEFAULT_CALLBACK_URL, payload, DEFAULT_CALLBACK_SECRET);
    }

    // Clean up callback after successful payment
    this.removeCallback(orderCode);
  }

  /**
   * Forward payment failed event
   */
  async forwardPaymentFailed(
    orderCode: string | number,
    data: WebhookForwardPayload['data'],
    rawPayload?: unknown
  ): Promise<void> {
    const config = this.getCallback(orderCode);
    const payload: WebhookForwardPayload = {
      event: WebhookEventType.PAYMENT_FAILED,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        orderCode,
        metadata: config?.metadata,
      },
      raw: config?.includeRawPayload ? rawPayload : undefined,
    };

    // Forward to registered failure URL
    if (config?.failureUrl) {
      await this.forwardToUrl(config.failureUrl, payload, config.secret);
    }

    // Forward to registered webhook URL
    if (config?.webhookUrl) {
      await this.forwardToUrl(config.webhookUrl, payload, config.secret);
    }

    // Forward to default callback URL
    if (DEFAULT_CALLBACK_URL && !config?.failureUrl && !config?.webhookUrl) {
      await this.forwardToUrl(DEFAULT_CALLBACK_URL, payload, DEFAULT_CALLBACK_SECRET);
    }

    // Keep callback for retry attempts (don't remove on failure)
  }

  /**
   * Forward refund/reversal event
   */
  async forwardPaymentRefunded(
    orderCode: string | number,
    data: WebhookForwardPayload['data'],
    rawPayload?: unknown
  ): Promise<void> {
    const config = this.getCallback(orderCode);
    const payload: WebhookForwardPayload = {
      event: WebhookEventType.PAYMENT_REFUNDED,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        orderCode,
        metadata: config?.metadata,
      },
      raw: config?.includeRawPayload ? rawPayload : undefined,
    };

    // Forward to registered webhook URL
    if (config?.webhookUrl) {
      await this.forwardToUrl(config.webhookUrl, payload, config.secret);
    }

    // Forward to default callback URL
    if (DEFAULT_CALLBACK_URL) {
      await this.forwardToUrl(DEFAULT_CALLBACK_URL, payload, DEFAULT_CALLBACK_SECRET);
    }
  }

  /**
   * Forward order created event (optional, for tracking)
   */
  async forwardOrderCreated(
    orderCode: string | number,
    data: WebhookForwardPayload['data'],
    config?: CallbackConfig
  ): Promise<void> {
    const payload: WebhookForwardPayload = {
      event: WebhookEventType.ORDER_CREATED,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        orderCode,
        metadata: config?.metadata,
      },
    };

    // Forward to registered webhook URL
    if (config?.webhookUrl) {
      await this.forwardToUrl(config.webhookUrl, payload, config.secret);
    }

    // Forward to default callback URL if configured
    if (DEFAULT_CALLBACK_URL) {
      await this.forwardToUrl(DEFAULT_CALLBACK_URL, payload, DEFAULT_CALLBACK_SECRET);
    }
  }
}

export const webhookForwarderService = new WebhookForwarderService();
