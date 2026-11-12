import type { APIRoute } from 'astro';
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
  });

export const ALL: APIRoute = () => methodNotAllowed();
