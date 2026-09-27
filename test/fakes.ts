import Stripe from 'stripe';
import { vi } from 'vitest';
import type { StripeApi } from '../src/lib/stripe/api';

/** A Stripe client whose every method is a vi.fn you can program; webhooks are the real signature code. */
export function fakeStripe(over: Partial<{ [K in keyof StripeApi]: Partial<StripeApi[K]> }> = {}): StripeApi {
  const real = new Stripe('sk_test_fake');
  const stripe: StripeApi = {
    prices: { list: vi.fn(async () => ({ object: 'list', data: [], has_more: false, url: '/v1/prices' })) as never },
    customers: { retrieve: vi.fn(async () => ({ id: 'cus_1', object: 'customer', email: 'a@b.co' })) as never },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })) as never,
        retrieve: vi.fn(async () => ({ id: 'cs_test_1', customer: 'cus_1' })) as never,
      },
    },
    billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://billing.stripe.com/session/x' })) as never } },
    webhooks: { constructEventAsync: (p, h, s) => real.webhooks.constructEventAsync(p, h, s) },
  };
  for (const [k, v] of Object.entries(over)) Object.assign((stripe as unknown as Record<string, object>)[k], v);
  return stripe;
}

export const SECRET = 'whsec_test_secret';

/** A signed webhook request exactly as Stripe would send it. */
export function signedEvent(type: string, object: Record<string, unknown>, id = 'evt_1'): Request {
  const payload = JSON.stringify({ id, object: 'event', type, api_version: '2026-08-26.dahlia', created: 1, livemode: false, pending_webhooks: 1, request: null, data: { object } });
  const header = new Stripe('sk_test_fake').webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return new Request('https://netrelish.com/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': header, 'content-type': 'application/json' } });
}

export function formPost(url: string, fields: Record<string, string>, origin = 'https://netrelish.com') {
  return new Request(url, { method: 'POST', body: new URLSearchParams(fields), headers: { 'content-type': 'application/x-www-form-urlencoded', origin } });
}

export function jsonPost(url: string, fields: Record<string, string>, origin = 'https://netrelish.com') {
  return new Request(url, { method: 'POST', body: JSON.stringify(fields), headers: { 'content-type': 'application/json', origin } });
}
