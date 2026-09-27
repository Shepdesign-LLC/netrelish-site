import type { APIRoute } from 'astro';
import { handlePortal } from '../../lib/portal';
import { readEnv } from '../../lib/env';
import { ALLOWED_HOSTS } from '../../lib/hosts';
import { notConfigured } from '../../lib/http';
import { stripeClient } from '../../lib/stripe/client';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const key = readEnv('STRIPE_SECRET_KEY');
  if (!key) {
    console.error('portal: STRIPE_SECRET_KEY not set');
    return notConfigured(request, 'Billing isn’t configured yet.', '/?portal=error#pro');
  }
  return handlePortal(request, {
    stripe: stripeClient(key),
    allowedHosts: ALLOWED_HOSTS,
    siteUrl: new URL(request.url).origin,
    // Optional: the bpc_… from scripts/stripe-portal.mjs. Unset opens the account's default configuration.
    configuration: readEnv('STRIPE_PORTAL_CONFIG') || undefined,
  });
};
