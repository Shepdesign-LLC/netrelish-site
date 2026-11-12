import type { APIRoute } from 'astro';
import { checkRateLimit } from '@vercel/firewall';
import { readEnv } from '../../lib/env';
import { handleLicenseRelay, methodNotAllowed } from '../../lib/license-relay';

export const prerender = false;

// Shipped apps call this exact URL (https://netrelish.com/api/license). It has to survive the WordPress cutover.
export const POST: APIRoute = ({ request }) =>
  handleLicenseRelay(request, {
    fetch,
    apiKey: readEnv('CREEM_API_KEY'),
    apiBase: readEnv('CREEM_API_BASE'),
    environment: readEnv('VERCEL_ENV'),
    productId: readEnv('CREEM_PRODUCT_ID'),
    // The distributed limits live in Vercel's Firewall, so they're only there on Vercel.
    checkRateLimit: readEnv('VERCEL_ENV') ? checkRateLimit : undefined,
  });

export const ALL: APIRoute = () => methodNotAllowed();
