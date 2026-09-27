import type { APIRoute } from 'astro';
import { handleJoin } from '../../lib/join';
import { readEnv } from '../../lib/env';
import { notConfigured } from '../../lib/http';
import { ALLOWED_HOSTS } from '../../lib/hosts';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const env = {
    BENTO_PUBLISHABLE_KEY: readEnv('BENTO_PUBLISHABLE_KEY'),
    BENTO_SECRET_KEY: readEnv('BENTO_SECRET_KEY'),
    BENTO_SITE_UUID: readEnv('BENTO_SITE_UUID'),
  };
  if (!env.BENTO_SECRET_KEY) {
    console.error('join: BENTO_* env not set');
    return notConfigured(request, 'The list isn’t configured yet.', '/?join=error#join');
  }
  return handleJoin(request, { fetch, env, allowedHosts: ALLOWED_HOSTS });
};
