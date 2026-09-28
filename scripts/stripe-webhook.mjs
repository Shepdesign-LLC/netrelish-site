// Idempotent webhook endpoint for the store. Matched on URL; prints the signing secret ONCE, at creation, for
// STRIPE_WEBHOOK_SECRET. The event list is exactly what src/lib/webhook.ts handles — nothing more, per Stripe's guidance.
//
//   STRIPE_SECRET_KEY=sk_… node scripts/stripe-webhook.mjs https://netrelish.com/api/stripe/webhook [--dry-run]
import Stripe from 'stripe';

const [, , url, ...flags] = process.argv;
const dry = flags.includes('--dry-run');
if (!url || !/^https:\/\//.test(url)) { console.error('usage: node scripts/stripe-webhook.mjs https://<host>/api/stripe/webhook [--dry-run]'); process.exit(2); }
const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('STRIPE_SECRET_KEY is not set'); process.exit(2); }

const EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
];

const stripe = new Stripe(key, { appInfo: { name: 'netrelish-site webhook' } });
const mode = /_live_/.test(key) ? 'LIVE' : 'test';
const all = await stripe.webhookEndpoints.list({ limit: 100 });
const found = all.data.find((e) => e.url === url);

if (found) {
  const missing = EVENTS.filter((e) => !found.enabled_events.includes(e) && !found.enabled_events.includes('*'));
  console.log(`= endpoint exists (${found.id}, ${found.status}, api ${found.api_version}) in the ${mode} account`);
  if (missing.length) {
    if (dry) console.log(`[dry-run] would add events: ${missing.join(', ')}`);
    else { await stripe.webhookEndpoints.update(found.id, { enabled_events: [...new Set([...found.enabled_events, ...EVENTS])] }); console.log(`~ added events: ${missing.join(', ')}`); }
  }
  console.log('  the signing secret is only shown at creation — reveal or roll it from the endpoint page in the Dashboard');
} else if (dry) {
  console.log(`[dry-run] would create ${url} in the ${mode} account for: ${EVENTS.join(', ')}`);
} else {
  const e = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENTS,
    api_version: Stripe.API_VERSION, // the SDK's pinned version, so payload shapes match the types the handler was written against
    description: 'netrelish.com store: license fulfilment',
    metadata: { site: 'netrelish.com', route: '/api/stripe/webhook' },
  });
  console.log(`+ created ${e.id} (${mode}, api ${e.api_version})`);
  console.log(`  STRIPE_WEBHOOK_SECRET=${e.secret}   ← shown once; put it in Vercel now`);
}
