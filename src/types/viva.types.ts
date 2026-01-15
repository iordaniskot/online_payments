// Viva Wallet API Types

// OAuth Token Response
export interface VivaTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// Customer Information
export interface VivaCustomer {
  email?: string;
  fullName?: string;
  phone?: string;
  countryCode?: string;
  requestLang?: string;
}

// Payment Method Fee
export interface PaymentMethodFee {
  paymentMethodId: string;
  fee: number;
}

// Klarna Address
export interface KlarnaAddress {
  givenName?: string;
  familyName?: string;
  email?: string;
  phone?: string;
  streetAddress?: string;
  streetAddress2?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  country?: string;
}

// Klarna Order Line
export interface KlarnaOrderLine {
  type?: string;
  reference?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  totalAmount: number;
  totalDiscountAmount?: number;
  totalTaxAmount?: number;
  imageUrl?: string;
  productUrl?: string;
}

// Klarna Order Options
export interface KlarnaOrderOptions {
  attachment?: {
    contentType?: string;
    body?: string;
  };
  billingAddress?: KlarnaAddress;
  shippingAddress?: KlarnaAddress;
  orderLines?: KlarnaOrderLine[];
}

// NBG Loan Order Options
export interface NbgLoanOrderOptions {
  Code?: string;
  ReceiptType?: number;
}

// Create Payment Order Request
export interface CreatePaymentOrderRequest {
  // Required
  amount: number; // Amount in smallest currency unit (cents), minimum 30

  // Customer information
  customerTrns?: string; // Description shown to customer (1-2048 chars)
  customer?: VivaCustomer; // Customer details (email, name, phone, etc.)

  // Transaction descriptor
  dynamicDescriptor?: string; // Bank statement descriptor (max 13 chars, Latin only)

  // Currency and timeout
  currencyCode?: string; // ISO 4712 numeric currency code
  paymentTimeout?: number; // Order expiration in seconds (default: 1800)

  // Pre-authorization
  preauth?: boolean; // Hold amount without charging (default: false)

  // Recurring payments
  allowRecurring?: boolean; // Enable recurring payments (default: false)

  // Installments (Greece only)
  maxInstallments?: number; // Max installments 1-36 (default: 0)
  forceMaxInstallments?: boolean; // Force specific installment count

  // Payment notification
  paymentNotification?: boolean; // Send payment request email (default: false)

  // Tip
  tipAmount?: number; // Tip amount included in total

  // Payment options
  disableExactAmount?: boolean; // Allow customer to set amount (default: false)
  disableCash?: boolean; // Disable cash payment option (default: false)
  disableWallet?: boolean; // Disable Viva wallet option (default: false)

  // Source and reference
  sourceCode?: string; // Payment source code
  merchantTrns?: string; // Merchant reference (1-2048 chars)

  // Redirect on expiry
  stateId?: number; // Order state for redirect (1 = Expired)
  urlFail?: string; // URL to redirect on failure/expiry

  // Tags and tokens
  tags?: string[]; // Transaction tags for filtering
  cardTokens?: string[]; // Saved card tokens (max 10)

  // Payment method fees
  paymentMethodFees?: PaymentMethodFee[]; // Additional fees per payment method

  // Card verification
  isCardVerification?: boolean; // Verify card without charging (amount must be 0)

  // Special payment options
  nbgLoanOrderOptions?: NbgLoanOrderOptions; // NBG Loan options
  klarnaOrderOptions?: KlarnaOrderOptions; // Klarna payment options
}

// Create Payment Order Response
export interface CreatePaymentOrderResponse {
  orderCode: number;
}

// Retrieve Order Response
export interface RetrieveOrderResponse {
  OrderCode: number;
  SourceCode: string;
  Tags: string[];
  TipAmount: number;
  RequestLang: string;
  MerchantTrns: string;
  CustomerTrns: string;
  MaxInstallments: number;
  RequestAmount: number;
  ExpirationDate: string;
  StateId: number;
}

// Order State IDs
export enum OrderState {
  Pending = 0,
  Expired = 1,
  Canceled = 2,
  Paid = 3,
}

// Transaction Status
export enum TransactionStatus {
  Success = 'F',
  Error = 'E',
  Pending = 'A',
  Refunded = 'R',
  Canceled = 'X',
  Disputed = 'D',
  UnSettled = 'M',
  Timeout = 'MA',
  IncompleteCard = 'MI',
  Incomplete3DS = 'MW',
}

// Retrieve Transaction Response
export interface RetrieveTransactionResponse {
  email: string;
  bankId: string;
  amount: number;
  conversionRate: number;
  originalAmount: number;
  originalCurrencyCode: string;
  sourceCode: string;
  switching: boolean;
  orderCode: number;
  statusId: string;
  fullName: string;
  insDate: string;
  cardNumber: string;
  currencyCode: string;
  customerTrns: string;
  merchantTrns: string;
  transactionTypeId: number;
  recurringSupport: boolean;
  totalInstallments: number;
  cardCountryCode: string;
  cardUniqueReference: string;
  cardIssuingBank: string | null;
  currentInstallment: number;
  cardTypeId: number;
  cardExpirationDate: string;
  digitalWalletId: number;
}

// Create Transaction Request (for recurring/capture)
export interface CreateTransactionRequest {
  amount: number;
  installments?: number;
  customerTrns?: string;
  merchantTrns?: string;
  sourceCode?: string;
  tipAmount?: number;
  currencyCode?: string;
}

// Create Transaction Response
export interface CreateTransactionResponse {
  Emv: null;
  Amount: number;
  StatusId: string;
  CurrencyCode: number;
  TransactionId: string;
  ReferenceNumber: number;
  AuthorizationId: number;
  RetrievalReferenceNumber: number;
  ThreeDSecureStatusId: number;
  ErrorCode: number;
  ErrorText: string | null;
  TimeStamp: string;
  CorrelationId: string | null;
  EventId: number;
  Success: boolean;
}

// Cancel Transaction Response
export interface CancelTransactionResponse {
  Emv: null;
  Amount: number;
  StatusId: string;
  CurrencyCode: number;
  TransactionId: string;
  ReferenceNumber: number;
  AuthorizationId: string | null;
  RetrievalReferenceNumber: number;
  ThreeDSecureStatusId: number;
  ErrorCode: number;
  ErrorText: string | null;
  TimeStamp: string;
  CorrelationId: string | null;
  EventId: number;
  Success: boolean;
}

// Create Card Token Request
export interface CreateCardTokenRequest {
  transactionId: string;
  groupId?: string;
  cardTokenType?: number;
}

// Create Card Token Response
export interface CreateCardTokenResponse {
  token: string;
}

// Update Order Request
export interface UpdateOrderRequest {
  amount?: number;
  disablePaidState?: boolean;
  expirationDate?: string;
  isCanceled?: boolean;
}

// Wallet Information
export interface VivaWallet {
  iban: string;
  walletId: number;
  amount: number;
  isPrimary: boolean;
  available: number;
  overdraft: number;
  currencyCode: number;
  friendlyName: string;
}

// Transaction Types
export enum TransactionType {
  Capture = 0,
  PreAuth = 1,
  Void = 4,
  Charge = 5,
  Refund = 7,
  OCT = 15,
  Reversal = 16,
  Rebate = 18,
  FastRefund = 19,
}

// Webhook Event Types
export enum WebhookEventType {
  TransactionPaymentCreated = 'TransactionPaymentCreated',
  TransactionFailed = 'TransactionFailed',
  TransactionReversalCreated = 'TransactionReversalCreated',
}

// Webhook Payload
export interface WebhookPayload {
  EventTypeId: number;
  EventData: {
    TransactionId: string;
    OrderCode: number;
    StatusId?: string;
    Amount?: number;
    CurrencyCode?: string;
    Email?: string;
    FullName?: string;
    Phone?: string;
    InsDate?: string;
    CardNumber?: string;
    BankId?: string;
    CardUniqueReference?: string;
    CardTypeId?: number;
    SourceCode?: string;
    MerchantTrns?: string;
    CustomerTrns?: string;
    Tags?: string[];
    Descriptor?: string;
  };
}

// API Error Response
export interface VivaErrorResponse {
  ErrorCode: number;
  ErrorText: string;
  TimeStamp: string;
  CorrelationId: string;
  EventId: number;
  Success: boolean;
}

// Checkout URL Helper
export interface CheckoutUrlParams {
  orderCode: number;
  color?: string | undefined;
  paymentMethod?: string | undefined;
}
