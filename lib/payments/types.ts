export type CheckoutLineItem = {
  name: string;
  sku: string | null;
  quantity: number;
  unitAmountCents: number;
};

export type CreateCheckoutSessionInput = {
  invoiceId: string;
  paymentAttemptId: string;
  amountCents: number;
  currency: string;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  metadata: Record<string, string>;
};

export type CheckoutSessionResult = {
  providerSessionId: string;
  providerPaymentIntentId: string | null;
  checkoutUrl: string;
};

export type NormalizedPaymentStatus =
  | "paid"
  | "pending"
  | "failed"
  | "cancelled"
  | "expired";

export type NormalizedPaymentWebhook = {
  provider: string;
  providerEventId: string;
  type: string;
  paymentStatus: NormalizedPaymentStatus;
  providerSessionId: string | null;
  providerPaymentIntentId: string | null;
  invoiceId: string | null;
  paymentAttemptId: string | null;
  storeId: string | null;
};

export class PaymentProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderConfigError";
  }
}

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
