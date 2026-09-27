// Idempotent Customer Portal configuration: what a NetRelish buyer can do in the Stripe-hosted portal, as code rather than
// Dashboard clicks, so a sandbox and the live account get the same one. Found by metadata.site; prints the id for
// STRIPE_PORTAL_CONFIG (optional — leave it unset to use the account default instead).
//
//   STRIPE_SECRET_KEY=sk_… node scripts/stripe-portal.mjs [--dry-run] [--update]
//
// Without --update an existing configuration is left alone (so a Dashboard tweak survives a re-run); with it, the
// features below are written over whatever is there.
import Stripe from 'stripe';

const SITE = 'netrelish.com';
const flags = process.argv.slice(2);
const dry = flags.includes('--dry-run');
const update = flags.includes('--update');
const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('STRIPE_SECRET_KEY is not set'); process.exit(2); }

const stripe = new Stripe(key, { appInfo: { name: 'netrelish-site portal' } });
const mode = /_live_/.test(key) ? 'LIVE' : 'test';

// What a NetRelish buyer can do in the portal: cancel (at period end, with a reason), keep the card current, see
// invoices, fix name/address/tax id. No plan switching — a lifetime buyer has nothing to switch to, and yearly → lifetime
// is a new purchase, not an update. The login page gives "lost my link" buyers a way in from the license email.
const WANT = {
  name: 'NetRelish',
  business_profile: { headline: 'NetRelish Pro', privacy_policy_url: `https://${SITE}/privacy` },
  default_return_url: `https://${SITE}/#pro`,
  features: {
    customer_update: { enabled: true, allowed_updates: ['address', 'email', 'name', 'tax_id'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: 'at_period_end',
      proration_behavior: 'none',
      cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] },
    },
    subscription_update: { enabled: false },
  },
  login_page: { enabled: true },
  metadata: { site: SITE },
};

const all = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
const found = all.data.find((c) => c.metadata?.site === SITE);

if (found && !update) {
  console.log(`= portal configuration for ${SITE} exists (${found.id}) in the ${mode} account; pass --update to rewrite it`);
  print(found);
} else if (dry) {
  console.log(`[dry-run] would ${found ? `update ${found.id}` : 'create'} the ${SITE} portal configuration in the ${mode} account`);
} else {
  const c = found
    ? await stripe.billingPortal.configurations.update(found.id, WANT)
    : await stripe.billingPortal.configurations.create(WANT);
  console.log(`${found ? '~ updated' : '+ created'} ${c.id} (${mode})`);
  print(c);
}

function print(c) {
  console.log(`  STRIPE_PORTAL_CONFIG=${c.id}`);
  if (c.login_page?.url) console.log(`  portal login page (for the license email): ${c.login_page.url}`);
}
