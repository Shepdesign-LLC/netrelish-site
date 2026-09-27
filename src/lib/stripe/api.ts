import type Stripe from 'stripe';

/**
 * The slice of the Stripe SDK this site uses. Deliberately narrow: tests fake it, and nothing
 * new can reach Stripe without showing up here. The real `Stripe` instance satisfies it structurally.
 */
export interface StripeApi {
  prices: { list(params: Stripe.PriceListParams): Promise<Stripe.ApiList<Stripe.Price>> };
  customers: { retrieve(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer> };
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session>;
      retrieve(id: string): Promise<Stripe.Checkout.Session>;
    };
  };
  billingPortal: {
    sessions: { create(params: Stripe.BillingPortal.SessionCreateParams): Promise<Stripe.BillingPortal.Session> };
  };
  webhooks: { constructEventAsync(payload: string, header: string, secret: string): Promise<Stripe.Event> };
}

/** Stripe hands back either an id or the expanded object; we only ever want the id. */
export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}
