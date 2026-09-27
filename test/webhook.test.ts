import { describe, it, expect, vi } from 'vitest';
import { handleStripeWebhook, type WebhookDeps } from '../src/lib/webhook';
import type { Fulfilment } from '../src/lib/fulfil';
import { fakeStripe, signedEvent, SECRET } from './fakes';

function deps(over: Partial<WebhookDeps> = {}) {
  const fulfilled: Fulfilment[] = [];
  const d: WebhookDeps = {
    stripe: fakeStripe(), secret: SECRET,
    fulfil: vi.fn(async (f: Fulfilment) => { fulfilled.push(f); }),
    license: vi.fn(async (subject: string) => `NR-KEY-FOR-${subject}`),
    site: 'netrelish.com',
    ...over,
  };
  return { d, fulfilled };
}

const paidSession = {
  id: 'cs_test_1', object: 'checkout.session', mode: 'subscription', payment_status: 'paid', customer: 'cus_1', subscription: 'sub_1', payment_intent: null,
  customer_email: null, customer_details: { email: 'Buyer@Example.com' }, metadata: { plan: 'pro-year', site: 'netrelish.com' },
};

describe('handleStripeWebhook', () => {
  it('400s without a signature, and with a wrong one', async () => {
    const { d } = deps();
    const noSig = new Request('https://netrelish.com/api/stripe/webhook', { method: 'POST', body: '{}' });
    expect((await handleStripeWebhook(noSig, d)).status).toBe(400);
    const wrong = signedEvent('checkout.session.completed', paidSession);
    expect((await handleStripeWebhook(wrong, { ...d, secret: 'whsec_other' })).status).toBe(400);
    expect(d.fulfil).not.toHaveBeenCalled();
  });

  it('issues a license on a paid checkout.session.completed, keyed on customer:subscription', async () => {
    const { d, fulfilled } = deps();
    const res = await handleStripeWebhook(signedEvent('checkout.session.completed', paidSession), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: true });
    expect(d.license).toHaveBeenCalledWith('cus_1:sub_1');
    expect(fulfilled).toEqual([{ type: 'license.issued', email: 'Buyer@Example.com', plan: 'pro-year', key: 'NR-KEY-FOR-cus_1:sub_1', customer: 'cus_1', subject: 'sub_1' }]);
  });

  it('keys a one-time purchase on the payment intent', async () => {
    const { d, fulfilled } = deps();
    await handleStripeWebhook(signedEvent('checkout.session.completed', { ...paidSession, mode: 'payment', subscription: null, payment_intent: 'pi_1', metadata: { plan: 'pro-lifetime', site: 'netrelish.com' } }), d);
    expect(fulfilled[0]).toMatchObject({ type: 'license.issued', plan: 'pro-lifetime', subject: 'pi_1' });
  });

  it('waits on a completed-but-unpaid session, then fulfils on async_payment_succeeded', async () => {
    const { d, fulfilled } = deps();
    const res = await handleStripeWebhook(signedEvent('checkout.session.completed', { ...paidSession, payment_status: 'unpaid' }), d);
    expect(await res.json()).toEqual({ received: true, handled: false });
    await handleStripeWebhook(signedEvent('checkout.session.async_payment_succeeded', paidSession, 'evt_2'), d);
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]!.type).toBe('license.issued');
  });

  it('reports a failed async payment', async () => {
    const { d, fulfilled } = deps();
    await handleStripeWebhook(signedEvent('checkout.session.async_payment_failed', { ...paidSession, payment_status: 'unpaid' }), d);
    expect(fulfilled).toEqual([{ type: 'payment.failed', email: 'Buyer@Example.com', plan: 'pro-year', customer: 'cus_1', payUrl: null }]);
  });

  it('treats invoice.paid as a renewal only for subscription_cycle', async () => {
    const { d, fulfilled } = deps();
    const inv = { id: 'in_1', object: 'invoice', customer: 'cus_1', customer_email: 'a@b.co', billing_reason: 'subscription_cycle', hosted_invoice_url: 'https://invoice.stripe.com/i/x', metadata: {}, parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1', metadata: { plan: 'pro-year', site: 'netrelish.com' } } } };
    await handleStripeWebhook(signedEvent('invoice.paid', inv), d);
    expect(fulfilled).toEqual([{ type: 'license.renewed', email: 'a@b.co', plan: 'pro-year', customer: 'cus_1', subscription: 'sub_1' }]);
    const res = await handleStripeWebhook(signedEvent('invoice.paid', { ...inv, billing_reason: 'subscription_create' }, 'evt_2'), d);
    expect(await res.json()).toEqual({ received: true, handled: false }); // Checkout already issued the key
    expect(fulfilled).toHaveLength(1);
  });

  it('issues a license for a Dashboard invoice tagged with this site and a plan', async () => {
    const { d, fulfilled } = deps();
    const inv = { id: 'in_team', object: 'invoice', customer: 'cus_9', customer_email: 'ops@studio.co', billing_reason: 'manual', metadata: { plan: 'pro-lifetime', site: 'netrelish.com' }, parent: null };
    await handleStripeWebhook(signedEvent('invoice.paid', inv), d);
    expect(d.license).toHaveBeenCalledWith('cus_9:in_team');
    expect(fulfilled[0]).toMatchObject({ type: 'license.issued', plan: 'pro-lifetime', subject: 'in_team', email: 'ops@studio.co' });
    const res = await handleStripeWebhook(signedEvent('invoice.paid', { ...inv, metadata: { site: 'netrelish.com' } }, 'evt_2'), d);
    expect(await res.json()).toEqual({ received: true, handled: false }); // an ordinary invoice, not a license
  });

  it('ignores every event that belongs to another brand on the shared account', async () => {
    const { d } = deps();
    const other = { plan: 'personal', site: 'hookedonfacets.com' };
    const inv = { id: 'in_o', object: 'invoice', customer: 'cus_1', customer_email: 'a@b.co', billing_reason: 'manual', metadata: other, parent: null };
    const cases: [string, Record<string, unknown>][] = [
      ['checkout.session.completed', { ...paidSession, metadata: other }],
      ['checkout.session.async_payment_succeeded', { ...paidSession, metadata: other }],
      ['checkout.session.async_payment_failed', { ...paidSession, payment_status: 'unpaid', metadata: other }],
      ['invoice.paid', inv],
      ['invoice.paid', { ...inv, billing_reason: 'subscription_cycle', metadata: {}, parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_o', metadata: other } } }],
      ['invoice.payment_failed', inv],
      ['customer.subscription.deleted', { id: 'sub_o', object: 'subscription', customer: 'cus_1', metadata: other }],
      ['checkout.session.completed', { ...paidSession, metadata: {} }], // untagged: not ours either
    ];
    for (const [i, [type, obj]] of cases.entries()) {
      const res = await handleStripeWebhook(signedEvent(type, obj, `evt_${i}`), d);
      expect(await res.json()).toEqual({ received: true, handled: false });
    }
    expect(d.fulfil).not.toHaveBeenCalled();
    expect(d.stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it('reports a failed renewal with the hosted invoice link', async () => {
    const { d, fulfilled } = deps();
    const inv = { id: 'in_1', object: 'invoice', customer: 'cus_1', customer_email: 'a@b.co', billing_reason: 'subscription_cycle', hosted_invoice_url: 'https://invoice.stripe.com/i/x', metadata: {}, parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_1', metadata: { plan: 'pro-year', site: 'netrelish.com' } } } };
    await handleStripeWebhook(signedEvent('invoice.payment_failed', inv), d);
    expect(fulfilled).toEqual([{ type: 'payment.failed', email: 'a@b.co', plan: 'pro-year', customer: 'cus_1', payUrl: 'https://invoice.stripe.com/i/x' }]);
  });

  it('ends the license when the subscription is deleted, looking the email up on the customer', async () => {
    const { d, fulfilled } = deps();
    await handleStripeWebhook(signedEvent('customer.subscription.deleted', { id: 'sub_1', object: 'subscription', customer: 'cus_1', metadata: { plan: 'pro-year', site: 'netrelish.com' } }), d);
    expect(d.stripe.customers.retrieve).toHaveBeenCalledWith('cus_1');
    expect(fulfilled).toEqual([{ type: 'license.ended', email: 'a@b.co', plan: 'pro-year', customer: 'cus_1', subscription: 'sub_1' }]);
  });

  it('acknowledges events it does not act on, and duplicates', async () => {
    const { d } = deps({ seen: async (id) => id === 'evt_dup' });
    const res = await handleStripeWebhook(signedEvent('customer.updated', { id: 'cus_1', object: 'customer' }), d);
    expect(await res.json()).toEqual({ received: true, handled: false });
    const dup = await handleStripeWebhook(signedEvent('checkout.session.completed', paidSession, 'evt_dup'), d);
    expect(await dup.json()).toEqual({ received: true, duplicate: true });
    expect(d.fulfil).not.toHaveBeenCalled();
  });

  it('500s when fulfilment throws so Stripe retries', async () => {
    const { d } = deps({ fulfil: vi.fn(async () => { throw new Error('bento down'); }) });
    expect((await handleStripeWebhook(signedEvent('checkout.session.completed', paidSession), d)).status).toBe(500);
  });
});
