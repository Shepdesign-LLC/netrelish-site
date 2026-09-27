import type { APIRoute } from 'astro';
import { handleCheckout } from '../../lib/checkout';
import { readEnv } from '../../lib/env';
import { ALLOWED_HOSTS } from '../../lib/hosts';
import { notConfigured } from '../../lib/http';
import { PLANS } from '../../lib/stripe/catalog';
import { stripeClient } from '../../lib/stripe/client';
import { priceResolver } from '../../lib/stripe/prices';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const key = readEnv('STRIPE_SECRET_KEY');
  if (!key) {
    console.error('checkout: STRIPE_SECRET_KEY not set');
    return notConfigured(request, 'The store isn’t open yet.', '/?checkout=error#pro');
  }
  const stripe = stripeClient(key);
  return handleCheckout(request, {
    stripe,
    prices: priceResolver(stripe),
    catalog: PLANS,
    allowedHosts: ALLOWED_HOSTS,
    siteUrl: new URL(request.url).origin,
  });
};
