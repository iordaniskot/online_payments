import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';
import vivaConfig, { VIVA_SCOPES } from '../config/viva.config.js';
import type {
  VivaTokenResponse,
  CreatePaymentOrderRequest,
  CreatePaymentOrderResponse,
  RetrieveOrderResponse,
  RetrieveTransactionResponse,
  CreateTransactionRequest,
  CreateTransactionResponse,
  CancelTransactionResponse,
  CreateCardTokenRequest,
  CreateCardTokenResponse,
  UpdateOrderRequest,
  VivaWallet,
  CheckoutUrlParams,
} from '../types/viva.types.js';

/**
 * Viva Wallet Payment Service
 * Handles all interactions with the Viva Wallet API
 */
export class VivaWalletService {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private axiosInstance: AxiosInstance;

  constructor() {
    // Axios instance for OAuth2 authenticated requests
    this.axiosInstance = axios.create({
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get Basic Auth header - computed fresh each time to ensure env vars are loaded
   */
  private getBasicAuthHeader(): string {
    return `Basic ${Buffer.from(
      `${vivaConfig.merchantId}:${vivaConfig.apiKey}`
    ).toString('base64')}`;
  }

  /**
   * Get axios config with Basic Auth for legacy API calls
   */
  private getBasicAuthConfig() {
    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getBasicAuthHeader(),
      },
    };
  }

  /**
   * Get OAuth2 access token
   * Implements token caching to avoid unnecessary token requests
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post<VivaTokenResponse>(
        `${vivaConfig.authUrl}/connect/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(
              `${vivaConfig.clientId}:${vivaConfig.clientSecret}`
            ).toString('base64')}`,
          },
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry 5 minutes before actual expiry for safety
      this.tokenExpiry = new Date(
        Date.now() + (response.data.expires_in - 300) * 1000
      );

      return this.accessToken;
    } catch (error) {
      this.handleError(error, 'Failed to get access token');
      throw error;
    }
  }

  /**
   * Create a payment order
   * Returns an order code that can be used to redirect the customer to checkout
   */
  async createPaymentOrder(
    request: CreatePaymentOrderRequest
  ): Promise<CreatePaymentOrderResponse> {
    const token = await this.getAccessToken();

    try {
      const response = await this.axiosInstance.post<CreatePaymentOrderResponse>(
        `${vivaConfig.apiUrl}/checkout/v2/orders`,
        {
          ...request,
          sourceCode: request.sourceCode || vivaConfig.sourceCode,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to create payment order');
      throw error;
    }
  }

  /**
   * Generate checkout URL for customer redirect
   */
  getCheckoutUrl(params: CheckoutUrlParams): string {
    let url = `${vivaConfig.checkoutUrl}/web/checkout?ref=${params.orderCode}`;
    
    if (params.color) {
      url += `&color=${encodeURIComponent(params.color)}`;
    }
    
    if (params.paymentMethod) {
      url += `&paymentMethod=${encodeURIComponent(params.paymentMethod)}`;
    }

    if (params.successUrl) {
      url += `&successUrl=${encodeURIComponent(params.successUrl)}`;
    }

    if (params.failureUrl) {
      url += `&failureUrl=${encodeURIComponent(params.failureUrl)}`;
    }
    
    return url;
  }

  /**
   * Retrieve order details by order code
   * Uses Basic Auth
   */
  async getOrder(orderCode: number): Promise<RetrieveOrderResponse> {
    try {
      const response = await axios.get<RetrieveOrderResponse>(
        `${vivaConfig.ordersApiUrl}/api/orders/${orderCode}`,
        this.getBasicAuthConfig()
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to retrieve order');
      throw error;
    }
  }

  /**
   * Update an existing order
   * Uses Basic Auth
   */
  async updateOrder(
    orderCode: number,
    request: UpdateOrderRequest
  ): Promise<void> {
    try {
      await axios.patch(
        `${vivaConfig.ordersApiUrl}/api/orders/${orderCode}`,
        request,
        this.getBasicAuthConfig()
      );
    } catch (error) {
      this.handleError(error, 'Failed to update order');
      throw error;
    }
  }

  /**
   * Cancel a payment order
   * Uses Basic Auth
   */
  async cancelOrder(orderCode: number): Promise<void> {
    try {
      await axios.delete(
        `${vivaConfig.ordersApiUrl}/api/orders/${orderCode}`,
        this.getBasicAuthConfig()
      );
    } catch (error) {
      this.handleError(error, 'Failed to cancel order');
      throw error;
    }
  }

  /**
   * Retrieve transaction details
   */
  async getTransaction(
    transactionId: string
  ): Promise<RetrieveTransactionResponse> {
    const token = await this.getAccessToken();

    try {
      const response = await this.axiosInstance.get<RetrieveTransactionResponse>(
        `${vivaConfig.apiUrl}/checkout/v2/transactions/${transactionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to retrieve transaction');
      throw error;
    }
  }

  /**
   * Create a recurring payment or capture a pre-authorized transaction
   * Uses Basic Auth
   */
  async createTransaction(
    transactionId: string,
    request: CreateTransactionRequest
  ): Promise<CreateTransactionResponse> {
    try {
      const response = await axios.post<CreateTransactionResponse>(
        `${vivaConfig.ordersApiUrl}/api/transactions/${transactionId}`,
        request,
        this.getBasicAuthConfig()
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to create transaction');
      throw error;
    }
  }

  /**
   * Cancel/refund a transaction
   * Uses Basic Auth
   */
  async cancelTransaction(
    transactionId: string,
    amount?: number,
    sourceCode?: string
  ): Promise<CancelTransactionResponse> {
    try {
      let url = `${vivaConfig.ordersApiUrl}/api/transactions/${transactionId}`;
      const params = new URLSearchParams();
      
      if (amount !== undefined) {
        params.append('amount', amount.toString());
      }
      if (sourceCode) {
        params.append('sourceCode', sourceCode);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await axios.delete<CancelTransactionResponse>(url, this.getBasicAuthConfig());

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to cancel transaction');
      throw error;
    }
  }

  /**
   * Create a card token from a transaction
   * This allows saving the card for future payments
   */
  async createCardToken(
    request: CreateCardTokenRequest
  ): Promise<CreateCardTokenResponse> {
    const token = await this.getAccessToken();

    try {
      const response = await this.axiosInstance.post<CreateCardTokenResponse>(
        `${vivaConfig.apiUrl}/acquiring/v1/cards/tokens`,
        request,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to create card token');
      throw error;
    }
  }

  /**
   * Retrieve merchant wallets
   */
  async getWallets(): Promise<VivaWallet[]> {
    const token = await this.getAccessToken();

    try {
      const response = await this.axiosInstance.get<VivaWallet[]>(
        `${vivaConfig.apiUrl}/merchants/v1/wallets`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to retrieve wallets');
      throw error;
    }
  }

  /**
   * Fast refund - refund money to customer's card quickly
   */
  async fastRefund(
    transactionId: string,
    amount: number,
    sourceCode?: string,
    merchantTrns?: string
  ): Promise<{ transactionId: string }> {
    const token = await this.getAccessToken();

    try {
      const response = await this.axiosInstance.post<{ transactionId: string }>(
        `${vivaConfig.apiUrl}/acquiring/v1/transactions/${transactionId}:fastrefund`,
        {
          amount,
          sourceCode: sourceCode || 'Default',
          merchantTrns,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.handleError(error, 'Failed to process fast refund');
      throw error;
    }
  }

  /**
   * Error handler for API requests
   */
  private handleError(error: unknown, context: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(`${context}:`, {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
      });
    } else {
      console.error(`${context}:`, error);
    }
  }
}

// Export singleton instance
export const vivaWalletService = new VivaWalletService();
export default vivaWalletService;
