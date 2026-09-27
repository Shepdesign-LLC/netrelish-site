/**
 * /api/stripe/webhook — the only place a purchase becomes a license.
 *
 * Rules: verify the signature on the raw body; 2xx only once the fulfilment side effect has happened
 * (Stripe retries on anything else); fulfil on `checkout.session.completed` when paid, on
 * `async_payment_succeeded` otherwise; treat `invoice.paid` as a renewal (subscription_cycle) or an
 * agency invoice (manual + metadata.plan), never as the first purchase, which Checkout already covered.
 */
import type Stripe from 'stripe';
import type { StripeApi } from './stripe/api';
import { idOf } from './stripe/api';
import type { Fulfiller } from './fulfil';
import type { Licenser } from './license';
import { json } from './http';

export interface WebhookDeps {
  stripe: StripeApi;
  secret: string;
  fulfil: Fulfiller;
  license: Licenser;
  /** Optional replay guard. Fulfilment is idempotent anyway (keys are derived), so this only saves work. */
  seen?: (eventId: string) => Promise<boolean>;
}

export async function handleStripeWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return json({ error: 'missing stripe-signature' }, 400);
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await deps.stripe.webhooks.constructEventAsync(body, sig, deps.secret);
  } catch (e) {
    console.error('webhook: bad signature', e instanceof Error ? e.message : e);
    return json({ error: 'bad signature' }, 400);
  }

  if (deps.seen && (await deps.seen(event.id))) return json({ received: true, duplicate: true });

  try {
    const handled = await dispatch(event, deps);
    return json({ received: true, handled });
  } catch (e) {
    console.error(`webhook: ${event.type} ${event.id} failed`, e instanceof Error ? e.message : e);
    return json({ error: 'fulfilment failed' }, 500);
  }
}

async function dispatch(event: Stripe.Event, deps: WebhookDeps): Promise<boolean> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return fulfilSession(event.data.object, deps);
    case 'checkout.session.async_payment_failed': {
      const s = event.data.object;
      const email = s.customer_details?.email ?? s.customer_email;
      const customer = idOf(s.customer);
      if (!email || !customer) return false;
      await deps.fulfil({ type: 'payment.failed', email, plan: s.metadata?.plan ?? '', customer, payUrl: null });
      return true;
    }
    case 'invoice.paid':
      return fulfilInvoice(event.data.object, deps);
    case 'invoice.payment_failed': {
      const inv = event.data.object;
      const customer = idOf(inv.customer);
      if (!inv.customer_email || !customer) return false;
      await deps.fulfil({ type: 'payment.failed', email: inv.customer_email, plan: invoicePlan(inv), customer, payUrl: inv.hosted_invoice_url ?? null });
      return true;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const customer = idOf(sub.customer);
      if (!customer) return false;
      const c = await deps.stripe.customers.retrieve(customer);
      if (c.deleted || !c.email) return false;
      await deps.fulfil({ type: 'license.ended', email: c.email, plan: sub.metadata?.plan ?? '', customer, subscription: sub.id });
      return true;
    }
    default:
      return false;
  }
}

async function fulfilSession(s: Stripe.Checkout.Session, deps: WebhookDeps): Promise<boolean> {
  if (s.payment_status !== 'paid') return false; // completed-but-processing: async_payment_succeeded will follow
  const email = s.customer_details?.email ?? s.customer_email;
  const customer = idOf(s.customer);
  const subject = idOf(s.subscription) ?? idOf(s.payment_intent) ?? s.id;
  if (!email || !customer) throw new Error(`session ${s.id} has no email/customer`);
  const plan = s.metadata?.plan ?? '';
  const key = await deps.license(`${customer}:${subject}`);
  await deps.fulfil({ type: 'license.issued', email, plan, key, customer, subject });
  return true;
}

async function fulfilInvoice(inv: Stripe.Invoice, deps: WebhookDeps): Promise<boolean> {
  const customer = idOf(inv.customer);
  const email = inv.customer_email;
  if (!customer || !email) return false;
  const plan = invoicePlan(inv);
  const subscription = idOf(inv.parent?.subscription_details?.subscription);

  if (inv.billing_reason === 'subscription_cycle' && subscription) {
    await deps.fulfil({ type: 'license.renewed', email, plan, customer, subscription });
    return true;
  }
  if (inv.billing_reason === 'manual' && plan && inv.id) {
    // An invoice sent from the Dashboard for an agency deal. metadata.plan on the invoice marks it as a license sale.
    const key = await deps.license(`${customer}:${inv.id}`);
    await deps.fulfil({ type: 'license.issued', email, plan, key, customer, subject: inv.id });
    return true;
  }
  return false; // subscription_create (Checkout handled it), subscription_update, upcoming, …
}

function invoicePlan(inv: Stripe.Invoice): string {
  return inv.parent?.subscription_details?.metadata?.plan ?? inv.metadata?.plan ?? '';
}
