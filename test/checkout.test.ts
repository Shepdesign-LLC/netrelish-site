import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { handleCheckout, type CheckoutDeps } from '../src/lib/checkout';
import type { Plan } from '../src/lib/stripe/catalog';
import { fakeStripe, formPost, jsonPost } from './fakes';

const URL_ = 'https://netrelish.com/api/checkout';
const catalog: Record<string, Plan> = {
  'pro-year': { id: 'pro-year', name: 'Pro yearly', mode: 'subscription', recurring: 'netrelish_pro_year' },
  'pro-lifetime': { id: 'pro-lifetime', name: 'Pro lifetime', mode: 'payment', oneTime: 'netrelish_pro_lifetime' },
  'hof-personal': { id: 'hof-personal', name: 'HoF Personal', mode: 'subscription', recurring: 'hof_personal_year', oneTime: 'hof_personal_first_year' },
};
const ids: Record<string, string> = { netrelish_pro_year: 'price_year', netrelish_pro_lifetime: 'price_life', hof_personal_year: 'price_hp', hof_personal_first_year: 'price_hp1' };

function deps(over: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    stripe: fakeStripe(),
    prices: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, ids[k]]))),
    catalog, allowedHosts: ['netrelish.com', 'localhost'], siteUrl: 'https://netrelish.com',
    ...over,
  };
}
const created = (d: CheckoutDeps) => (d.stripe.checkout.sessions.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Stripe.Checkout.SessionCreateParams;

describe('handleCheckout', () => {
  it('rejects a foreign origin', async () => {
    expect((await handleCheckout(formPost(URL_, { plan: 'pro-year' }, 'https://evil.example'), deps())).status).toBe(403);
  });

  it('bounces an unknown plan back to the pricing card', async () => {
    const res = await handleCheckout(formPost(URL_, { plan: 'gold' }), deps());
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/?checkout=invalid#pro');
    expect((await handleCheckout(jsonPost(URL_, { plan: '' }), deps())).status).toBe(400);
  });

  it('303s a form post to the hosted Checkout page', async () => {
    const d = deps();
    const res = await handleCheckout(formPost(URL_, { plan: 'pro-year' }), d);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
  });

  it('returns the url as JSON for fetch() callers', async () => {
    const res = await handleCheckout(jsonPost(URL_, { plan: 'pro-year' }), deps());
    expect(await res.json()).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  });

  it('builds a subscription session with tax, promo codes, and the plan tagged on the subscription', async () => {
    const d = deps();
    await handleCheckout(formPost(URL_, { plan: 'pro-year', email: 'Ryan@Example.com' }), d);
    const p = created(d);
    expect(p).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_year', quantity: 1 }],
      success_url: 'https://netrelish.com/checkout/done?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://netrelish.com/#pro',
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      customer_email: 'ryan@example.com',
      metadata: { plan: 'pro-year', site: 'netrelish.com' },
      subscription_data: { metadata: { plan: 'pro-year', site: 'netrelish.com' } },
    });
    expect(p.customer_creation).toBeUndefined(); // not allowed in subscription mode
    expect(p.payment_intent_data).toBeUndefined();
  });

  it('builds a payment session that always creates a Customer, and skips a bad email', async () => {
    const d = deps();
    await handleCheckout(formPost(URL_, { plan: 'pro-lifetime', email: 'nope' }), d);
    const p = created(d);
    expect(p.mode).toBe('payment');
    expect(p.line_items).toEqual([{ price: 'price_life', quantity: 1 }]);
    expect(p.customer_creation).toBe('always');
    expect(p.payment_intent_data).toEqual({ metadata: { plan: 'pro-lifetime', site: 'netrelish.com' } });
    expect(p.customer_email).toBeUndefined();
    expect(p.subscription_data).toBeUndefined();
  });

  it('puts the one-time first-year line before the renewal price (renewals at half)', async () => {
    const d = deps();
    await handleCheckout(formPost(URL_, { plan: 'hof-personal' }), d);
    expect(created(d).line_items).toEqual([{ price: 'price_hp1', quantity: 1 }, { price: 'price_hp', quantity: 1 }]);
    expect(created(d).mode).toBe('subscription');
  });

  it('uses the preview origin it was given for the return urls', async () => {
    const d = deps({ siteUrl: 'https://netrelish-git-x.vercel.app/', allowedHosts: ['netrelish.com', 'vercel.app'] });
    await handleCheckout(formPost(URL_, { plan: 'pro-year' }, 'https://netrelish-git-x.vercel.app'), d);
    expect(created(d).cancel_url).toBe('https://netrelish-git-x.vercel.app/#pro');
    expect(created(d).metadata).toEqual({ plan: 'pro-year', site: 'netrelish-git-x.vercel.app' });
  });

  it('502s when a price is missing or Stripe is down, never a silent success', async () => {
    const d = deps({ prices: vi.fn(async () => { throw new Error('no price'); }) });
    const res = await handleCheckout(jsonPost(URL_, { plan: 'pro-year' }), d);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false });
    const d2 = deps({ stripe: fakeStripe({ checkout: { sessions: { create: vi.fn(async () => { throw new Error('ECONNRESET'); }) as never, retrieve: vi.fn() as never } } }) });
    const res2 = await handleCheckout(formPost(URL_, { plan: 'pro-year' }), d2);
    expect(res2.headers.get('location')).toBe('/?checkout=error#pro');
  });
});
