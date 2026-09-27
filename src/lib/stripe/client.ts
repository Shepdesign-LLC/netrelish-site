import Stripe from 'stripe';
import type { StripeApi } from './api';

let cached: { key: string; stripe: StripeApi } | undefined;

/** One client per warm function instance. Keyed on the secret so a rotated key never reuses a stale client. */
export function stripeClient(secretKey: string): StripeApi {
  if (cached?.key !== secretKey) {
    cached = {
      key: secretKey,
      stripe: new Stripe(secretKey, {
        appInfo: { name: 'netrelish-site', url: 'https://netrelish.com' },
        maxNetworkRetries: 2,
      }),
    };
  }
  return cached.stripe;
}
