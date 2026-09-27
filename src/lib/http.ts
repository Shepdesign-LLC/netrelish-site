/** Request helpers shared by the server routes. Pure functions on the Fetch API, so they test without Astro. */

export function wantsJson(req: Request): boolean {
  return (req.headers.get('content-type') ?? '').includes('application/json');
}

export function originHost(req: Request): string | null {
  const o = req.headers.get('origin') ?? req.headers.get('referer');
  if (!o) return null;
  try { return new URL(o).hostname; } catch { return null; }
}

export function hostAllowed(host: string | null, allowed: string[]): boolean {
  if (!host) return false;
  return allowed.some((a) => host === a || host.endsWith('.' + a));
}

/** Body as a flat string map, whether it arrived as JSON or as a form post. */
export async function readFields(req: Request): Promise<Record<string, string>> {
  if (wantsJson(req)) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? '')]));
  }
  const form = await req.formData().catch(() => new FormData());
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

/** A failure the caller can act on: JSON for fetch(), a redirect back to the form for a plain post. */
export function fail(req: Request, status: number, error: string, redirect: string): Response {
  return wantsJson(req) ? json({ ok: false, error }, status) : seeOther(redirect);
}

/** The route's env isn't set. Same shape as `fail`, but 503 so it reads as "not yet" rather than "you did it wrong". */
export function notConfigured(req: Request, error: string, redirect: string): Response {
  return fail(req, 503, error, redirect);
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
