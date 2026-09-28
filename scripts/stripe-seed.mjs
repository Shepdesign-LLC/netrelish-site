// Idempotent catalog seed. Products are matched on metadata.slug, prices on lookup_key; existing ones are
// left alone (a changed amount needs a new lookup key or a Dashboard edit — Stripe prices are immutable).
//
//   STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-seed.mjs stripe/catalog.netrelish.json [--dry-run]
import { readFileSync } from 'node:fs';
import Stripe from 'stripe';

const [, , file, ...flags] = process.argv;
const dry = flags.includes('--dry-run');
if (!file) { console.error('usage: node scripts/stripe-seed.mjs <catalog.json> [--dry-run]'); process.exit(2); }
const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('STRIPE_SECRET_KEY is not set'); process.exit(2); }

const stripe = new Stripe(key, { appInfo: { name: 'netrelish-site seed' } });
const catalog = JSON.parse(readFileSync(file, 'utf8'));
const mode = key.startsWith('sk_live') ? 'LIVE' : 'test';
console.log(`${dry ? '[dry-run] ' : ''}seeding ${catalog.products.length} product(s) into a ${mode} account`);

for (const p of catalog.products) {
  const found = await stripe.products.search({ query: `active:'true' AND metadata['slug']:'${p.slug}'`, limit: 1 });
  let product = found.data[0];
  if (product) {
    console.log(`  = product ${p.slug} exists (${product.id})`);
  } else if (dry) {
    console.log(`  + product ${p.slug} would be created`);
  } else {
    product = await stripe.products.create({ name: p.name, description: p.description, tax_code: p.tax_code, metadata: { slug: p.slug } });
    console.log(`  + product ${p.slug} created (${product.id})`);
  }
  for (const pr of p.prices) {
    const have = await stripe.prices.list({ lookup_keys: [pr.lookup_key], limit: 1 });
    if (have.data[0]) { console.log(`    = price ${pr.lookup_key} exists (${have.data[0].id})`); continue; }
    const desc = `${pr.currency.toUpperCase()} ${(pr.unit_amount / 100).toFixed(2)}${pr.recurring ? ' / ' + pr.recurring.interval : ' once'}`;
    if (dry || !product) { console.log(`    + price ${pr.lookup_key} would be created: ${desc}`); continue; }
    const price = await stripe.prices.create({
      product: product.id, lookup_key: pr.lookup_key, transfer_lookup_key: true, nickname: pr.nickname,
      currency: pr.currency, unit_amount: pr.unit_amount, tax_behavior: pr.tax_behavior ?? 'exclusive', // Stripe Tax needs one; unspecified prices are refused by Checkout unless the account has a default
      ...(pr.recurring ? { recurring: pr.recurring } : {}),
    });
    console.log(`    + price ${pr.lookup_key} created (${price.id}): ${desc}`);
  }
}
console.log('done');
