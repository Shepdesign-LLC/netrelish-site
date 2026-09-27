/** /api/checkout — turns a buy-button post into a Stripe-hosted Checkout page. No Stripe.js on our pages, ever. */
import type Stripe from 'stripe';
import type { StripeApi } from './stripe/api';
import type { Plan } from './stripe/catalog';
import { planLookupKeys } from './stripe/catalog';
import type { PriceResolver } from './stripe/prices';
import { EMAIL, fail, hostAllowed, json, originHost, readFields, seeOther, wantsJson } from './http';

export interface CheckoutDeps {
  stripe: StripeApi;
  prices: PriceResolver;
  catalog: Record<string, Plan>;
  allowedHosts: string[];
  /** Origin the customer comes back to, e.g. https://netrelish.com — previews pass their own. */
  siteUrl: string;
}

export const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]+$/;

export async function handleCheckout(req: Request, deps: CheckoutDeps): Promise<Response> {
  if (!hostAllowed(originHost(req), deps.allowedHosts)) {
    return new Response('forbidden', { status: 403 });
  }
  const fields = await readFields(req);
  const plan = deps.catalog[fields.plan ?? ''];
  if (!plan) return fail(req, 400, 'That plan doesn’t exist.', '/?checkout=invalid#pro');

  const email = (fields.email ?? '').trim().toLowerCase();
  const site = deps.siteUrl.replace(/\/$/, '');
  const tag = { plan: plan.id, site: new URL(site).hostname };

  let session: Stripe.Checkout.Session;
  try {
    const keys = planLookupKeys(plan);
    const ids = await deps.prices(keys);
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: plan.mode,
      line_items: keys.map((k) => ({ price: ids[k], quantity: 1 })),
      success_url: `${site}/checkout/done?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/#pro`,
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      billing_address_collection: 'auto',
      metadata: tag,
      custom_text: { submit: { message: 'Your license key arrives by email within a minute of payment.' } },
      ...(EMAIL.test(email) ? { customer_email: email } : {}),
      ...(plan.mode === 'subscription'
        ? { subscription_data: { metadata: tag } }
        : { customer_creation: 'always', payment_intent_data: { metadata: tag } }),
    };
    session = await deps.stripe.checkout.sessions.create(params);
  } catch (e) {
    console.error('checkout: stripe failed', e instanceof Error ? e.message : e);
    return fail(req, 502, 'Couldn’t start checkout — try again in a minute.', '/?checkout=error#pro');
  }
  if (!session.url) return fail(req, 502, 'Couldn’t start checkout — try again in a minute.', '/?checkout=error#pro');
  return wantsJson(req) ? json({ ok: true, url: session.url }) : seeOther(session.url);
}
