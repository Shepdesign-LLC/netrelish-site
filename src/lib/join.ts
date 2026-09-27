/** /api/join — forwards a beta signup to Bento. All logic lives here so it can be tested without Astro. */
import { bentoClient, type BentoEnv } from './bento';
import { EMAIL, fail, hostAllowed, json, originHost, readFields, seeOther, wantsJson } from './http';

export type JoinEnv = BentoEnv;
export interface JoinDeps { fetch: typeof fetch; env: JoinEnv; allowedHosts: string[] }

const TAGS = 'netrelish-beta,lead';
const SOURCE = 'netrelish.com';

function ok(req: Request): Response {
  return wantsJson(req) ? json({ ok: true }) : seeOther('/thanks');
}

export async function handleJoin(req: Request, deps: JoinDeps): Promise<Response> {
  if (!hostAllowed(originHost(req), deps.allowedHosts)) {
    return new Response('forbidden', { status: 403 });
  }
  const fields = await readFields(req);
  if (fields.website) return ok(req); // honeypot: pretend, record nothing

  const email = (fields.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return fail(req, 400, 'That email doesn’t look right.', '/?join=invalid#join');

  const bento = bentoClient(deps.env, deps.fetch);
  try {
    await bento.post('batch/subscribers', { subscribers: [{ email, tags: TAGS, signup_source: SOURCE }] });
    await bento.post('batch/events', { events: [{ type: '$netrelish_beta_join', email }] });
  } catch (e) {
    console.error('join: bento failed', e instanceof Error ? e.message : e);
    return fail(req, 502, 'Couldn’t reach the list — try again in a minute.', '/?join=error#join');
  }
  return ok(req);
}
