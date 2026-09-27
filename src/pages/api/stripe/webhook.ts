import type { APIRoute } from 'astro';
import { bentoClient } from '../../../lib/bento';
import { readEnv } from '../../../lib/env';
import { bentoFulfiller } from '../../../lib/fulfil';
import { json } from '../../../lib/http';
import { hmacLicenser } from '../../../lib/license';
import { stripeClient } from '../../../lib/stripe/client';
import { handleStripeWebhook } from '../../../lib/webhook';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const key = readEnv('STRIPE_SECRET_KEY');
  const secret = readEnv('STRIPE_WEBHOOK_SECRET');
  const licenseSecret = readEnv('LICENSE_SECRET');
  const bento = {
    BENTO_PUBLISHABLE_KEY: readEnv('BENTO_PUBLISHABLE_KEY'),
    BENTO_SECRET_KEY: readEnv('BENTO_SECRET_KEY'),
    BENTO_SITE_UUID: readEnv('BENTO_SITE_UUID'),
  };
  if (!key || !secret || !licenseSecret || !bento.BENTO_SECRET_KEY) {
    // 503, not 200: Stripe keeps retrying for three days, which is exactly what we want while env is missing.
    console.error('webhook: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, LICENSE_SECRET and BENTO_* must all be set');
    return json({ error: 'not configured' }, 503);
  }
  return handleStripeWebhook(request, {
    stripe: stripeClient(key),
    secret,
    fulfil: bentoFulfiller(bentoClient(bento, fetch)),
    license: hmacLicenser(licenseSecret),
  });
};
