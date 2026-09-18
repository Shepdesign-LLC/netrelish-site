import type { APIRoute } from 'astro';
import { handleJoin } from '../../lib/join';

export const prerender = false;

const allowedHosts = ['netrelish.com', 'localhost', 'vercel.app'];

export const POST: APIRoute = async ({ request }) => {
  const env = {
    BENTO_PUBLISHABLE_KEY: import.meta.env.BENTO_PUBLISHABLE_KEY ?? process.env.BENTO_PUBLISHABLE_KEY ?? '',
    BENTO_SECRET_KEY: import.meta.env.BENTO_SECRET_KEY ?? process.env.BENTO_SECRET_KEY ?? '',
    BENTO_SITE_UUID: import.meta.env.BENTO_SITE_UUID ?? process.env.BENTO_SITE_UUID ?? '',
  };
  if (!env.BENTO_SECRET_KEY) {
    console.error('join: BENTO_* env not set');
    const json = (request.headers.get('content-type') ?? '').includes('application/json');
    return json
      ? new Response(JSON.stringify({ ok: false, error: 'The list isn’t configured yet.' }), { status: 503, headers: { 'content-type': 'application/json' } })
      : new Response(null, { status: 303, headers: { location: '/?join=error#join' } });
  }
  return handleJoin(request, { fetch, env, allowedHosts });
};
