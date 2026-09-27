/**
 * What this site sells, keyed by the `plan` value a buy button posts. Prices live in Stripe and are
 * found by lookup key (see stripe/catalog.netrelish.json and scripts/stripe-seed.mjs), so this file
 * never holds a price id and the same code runs against any account.
 */
export interface Plan {
  id: string;
  name: string;
  /** `subscription` renews; `payment` is a single charge. */
  mode: 'subscription' | 'payment';
  /** Lookup key of the recurring price. Required in subscription mode. */
  recurring?: string;
  /**
   * Lookup key of a one-time price billed on the first invoice only. In subscription mode this is the
   * "first-year" line that makes year one cost more than a renewal; in payment mode it's the whole charge.
   */
  oneTime?: string;
}

export const PLANS: Record<string, Plan> = {
  'pro-year':     { id: 'pro-year',     name: 'NetRelish Pro, yearly',   mode: 'subscription', recurring: 'netrelish_pro_year' },
  'pro-lifetime': { id: 'pro-lifetime', name: 'NetRelish Pro, lifetime', mode: 'payment',      oneTime: 'netrelish_pro_lifetime' },
};

/** Lookup keys a plan needs, in the order they should appear on the Checkout page. */
export function planLookupKeys(plan: Plan): string[] {
  return [plan.oneTime, plan.recurring].filter((k): k is string => Boolean(k));
}
