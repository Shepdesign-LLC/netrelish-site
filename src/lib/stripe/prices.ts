import type { StripeApi } from './api';

export type PriceResolver = (lookupKeys: string[]) => Promise<Record<string, string>>;

/** lookup_key → price id, cached for the life of the function instance. A missing key is a config error, not a 404. */
export function priceResolver(stripe: StripeApi): PriceResolver {
  const cache = new Map<string, string>();
  return async (keys) => {
    const missing = keys.filter((k) => !cache.has(k));
    if (missing.length) {
      const res = await stripe.prices.list({ lookup_keys: missing, active: true, limit: 100 });
      for (const p of res.data) if (p.lookup_key) cache.set(p.lookup_key, p.id);
    }
    const out: Record<string, string> = {};
    for (const k of keys) {
      const id = cache.get(k);
      if (!id) throw new Error(`stripe: no active price with lookup_key "${k}" — run scripts/stripe-seed.mjs`);
      out[k] = id;
    }
    return out;
  };
}
