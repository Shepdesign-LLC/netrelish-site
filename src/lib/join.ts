/** /api/join — forwards a beta signup to Bento. All logic lives here so it can be tested without Astro. */

export interface JoinEnv { BENTO_PUBLISHABLE_KEY: string; BENTO_SECRET_KEY: string; BENTO_SITE_UUID: string }
export interface JoinDeps { fetch: typeof fetch; env: JoinEnv; allowedHosts: string[] }

const BENTO = 'https://app.bentonow.com/api/v1';
const TAGS = 'netrelish-beta,lead';
const SOURCE = 'netrelish.com';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function wantsJson(req: Request): boolean {
  return (req.headers.get('content-type') ?? '').includes('application/json');
}

function originHost(req: Request): string | null {
  const o = req.headers.get('origin') ?? req.headers.get('referer');
  if (!o) return null;
  try { return new URL(o).hostname; } catch { return null; }
}

function hostAllowed(host: string | null, allowed: string[]): boolean {
  if (!host) return false;
  return allowed.some((a) => host === a || host.endsWith('.' + a));
}

async function readFields(req: Request): Promise<Record<string, string>> {
  if (wantsJson(req)) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? '')]));
  }
  const form = await req.formData().catch(() => new FormData());
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

function reply(req: Request, ok: boolean, status: number, error?: string, redirect?: string): Response {
  if (wantsJson(req)) {
    return new Response(JSON.stringify(ok ? { ok } : { ok, error }), { status, headers: { 'content-type': 'application/json' } });
  }
  return new Response(null, { status: 303, headers: { location: redirect ?? (ok ? '/thanks' : '/?join=error#join') } });
}

export async function handleJoin(req: Request, deps: JoinDeps): Promise<Response> {
  if (!hostAllowed(originHost(req), deps.allowedHosts)) {
    return new Response('forbidden', { status: 403 });
  }
  const fields = await readFields(req);
  if (fields.website) return reply(req, true, 200); // honeypot: pretend, record nothing

  const email = (fields.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return reply(req, false, 400, 'That email doesn’t look right.', '/?join=invalid#join');

  const { BENTO_PUBLISHABLE_KEY: pk, BENTO_SECRET_KEY: sk, BENTO_SITE_UUID: site } = deps.env;
  const headers = {
    'Authorization': 'Basic ' + btoa(`${pk}:${sk}`),
    'User-Agent': 'netrelish-site/1.0',
    'Content-Type': 'application/json',
  };
  const post = (path: string, body: unknown) =>
    deps.fetch(`${BENTO}/${path}?site_uuid=${encodeURIComponent(site)}`, { method: 'POST', headers, body: JSON.stringify(body) });

  try {
    const sub = await post('batch/subscribers', { subscribers: [{ email, tags: TAGS, signup_source: SOURCE }] });
    if (!sub.ok) throw new Error(`bento subscribers ${sub.status}`);
    const ev = await post('batch/events', { events: [{ type: '$netrelish_beta_join', email }] });
    if (!ev.ok) throw new Error(`bento events ${ev.status}`);
  } catch (e) {
    console.error('join: bento failed', e instanceof Error ? e.message : e);
    return reply(req, false, 502, 'Couldn’t reach the list — try again in a minute.');
  }
  return reply(req, true, 200);
}
