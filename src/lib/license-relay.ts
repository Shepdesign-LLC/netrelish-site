/**
 * /api/license — the direct build's license relay to Creem.
 *
 * Creem's license API wants the store's secret key in `x-api-key`, so the Mac app can't call it. This route holds the
 * key and forwards a license key plus an instance name or id, nothing else. Browsing data never leaves the device
 * (NetRelish rule 5): the app sends no URL, no page, no account, and this route would refuse them if it did.
 *
 * It never logs the key, the instance, or Creem's body. At most: the action and the status Creem returned.
 * No CORS headers: the caller is the Mac app, not a page in a browser.
 */

export const CREEM_BASES = ['https://api.creem.io', 'https://test-api.creem.io'] as const;
export const DEFAULT_CREEM_BASE = CREEM_BASES[0];
export const MAX_BODY_BYTES = 2048;
export const UPSTREAM_TIMEOUT_MS = 10_000;

export const LICENSE_KEY = /^[A-Za-z0-9_-]{8,128}$/;
export const INSTANCE_NAME = /^[\x20-\x7E]{1,64}$/;
export const INSTANCE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const STATUSES = new Set(['active', 'inactive', 'expired', 'disabled']);

type Action = 'activate' | 'validate' | 'deactivate';
type Forward =
  | { action: 'activate'; body: { key: string; instance_name: string } }
  | { action: 'validate' | 'deactivate'; body: { key: string; instance_id: string } };

/** The exact field set each action takes. Anything more or less is a bad request. */
const FIELDS: Record<Action, readonly string[]> = {
  activate: ['action', 'instance_name', 'key'],
  validate: ['action', 'instance_id', 'key'],
  deactivate: ['action', 'instance_id', 'key'],
};

export interface LicenseRelayDeps {
  fetch: typeof fetch;
  /** CREEM_API_KEY. Empty means not configured. */
  apiKey: string;
  /** CREEM_API_BASE as set. Empty means production; anything off the allowlist means not configured. */
  apiBase: string;
  /** Tests shorten this; production uses UPSTREAM_TIMEOUT_MS. */
  timeoutMs?: number;
  log?: (line: string) => void;
}

function reply(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });
}

const badRequest = () => reply({ error: 'bad_request' }, 400);
const tooLarge = () => reply({ error: 'too_large' }, 413);
const upstream = () => reply({ error: 'upstream' }, 502);
const notConfigured = () => reply({ error: 'not_configured' }, 503);
export const methodNotAllowed = () => reply({ error: 'method_not_allowed' }, 405, { allow: 'POST' });

/** The Creem base to call, or null when CREEM_API_BASE names anything but Creem's own two hosts. */
export function creemBase(raw: string): string | null {
  if (raw === '') return DEFAULT_CREEM_BASE;
  return (CREEM_BASES as readonly string[]).includes(raw) ? raw : null;
}

function isJsonContentType(req: Request): boolean {
  const ct = req.headers.get('content-type') ?? '';
  return ct.split(';')[0].trim().toLowerCase() === 'application/json';
}

/** The body, or 'too_large' past `max` bytes, or 'bad' when the stream breaks. Never reads more than max + one chunk. */
async function readCapped(req: Request, max: number): Promise<Uint8Array | 'too_large' | 'bad'> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        return 'too_large';
      }
      chunks.push(value);
    }
  } catch {
    return 'bad';
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

/** Exactly the allowed fields for a known action, each a string in range — or null. */
export function parseLicenseRequest(raw: unknown): Forward | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const action = o.action;
  if (action !== 'activate' && action !== 'validate' && action !== 'deactivate') return null;

  const keys = Object.keys(o).sort();
  const want = FIELDS[action];
  if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) return null;
  if (!Object.values(o).every((v) => typeof v === 'string')) return null;

  const key = o.key as string;
  if (!LICENSE_KEY.test(key)) return null;
  if (action === 'activate') {
    const instance_name = o.instance_name as string;
    return INSTANCE_NAME.test(instance_name) ? { action, body: { key, instance_name } } : null;
  }
  const instance_id = o.instance_id as string;
  return INSTANCE_ID.test(instance_id) ? { action, body: { key, instance_id } } : null;
}

/** Creem's license object, cut down to the three fields the app reads. Null when it isn't an object. */
function summarize(raw: unknown): { status: string; instance_id: string | null; expires_at: string | null } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const status = typeof o.status === 'string' && STATUSES.has(o.status) ? o.status : 'unknown';
  const inst = o.instance;
  const id =
    typeof inst === 'object' && inst !== null && !Array.isArray(inst) ? (inst as Record<string, unknown>).id : undefined;
  return {
    status,
    // Only an id the app could send back. Anything else is dropped, and the app treats no id as no activation.
    instance_id: typeof id === 'string' && INSTANCE_ID.test(id) ? id : null,
    expires_at: typeof o.expires_at === 'string' ? o.expires_at : null,
  };
}

export async function handleLicenseRelay(req: Request, deps: LicenseRelayDeps): Promise<Response> {
  const log = deps.log ?? ((line: string) => console.info(line));

  if (req.method !== 'POST') return methodNotAllowed();
  if (!isJsonContentType(req)) return reply({ error: 'unsupported_media_type' }, 415);

  const declared = req.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d{1,10}$/.test(declared.trim())) return badRequest();
    if (Number(declared.trim()) > MAX_BODY_BYTES) return tooLarge();
  }
  const bytes = await readCapped(req, MAX_BODY_BYTES);
  if (bytes === 'too_large') return tooLarge();
  if (bytes === 'bad') return badRequest();

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return badRequest();
  }
  const forward = parseLicenseRequest(parsed);
  if (!forward) return badRequest();

  const base = creemBase(deps.apiBase);
  if (!deps.apiKey || !base) {
    log('license: not configured (CREEM_API_KEY unset or CREEM_API_BASE not a Creem host)');
    return notConfigured();
  }

  const { action } = forward;
  let res: Response;
  try {
    res = await deps.fetch(`${base}/v1/licenses/${action}`, {
      method: 'POST',
      headers: { 'x-api-key': deps.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(forward.body),
      redirect: 'error',
      signal: AbortSignal.timeout(deps.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    log(`license: ${action} creem ${timedOut ? 'timed out' : 'unreachable'}`);
    return upstream();
  }

  log(`license: ${action} creem ${res.status}`);

  if (res.status >= 200 && res.status < 300) {
    let body: unknown;
    try {
      body = JSON.parse(await res.text());
    } catch {
      return upstream();
    }
    const out = summarize(body);
    return out ? reply(out, 200) : upstream();
  }

  await res.body?.cancel().catch(() => {});
  return verdict(action, res.status);
}

/**
 * What a non-2xx from Creem means for the app. Only a clear verdict on the buyer's license becomes one: anything
 * else is an upstream failure, which changes nothing on the Mac.
 *
 * 401/403 are our secret key and 429 our rate limit, so they never say anything about the license. Past that, an
 * activation refused with a 4xx is a refusal (too many Macs, say). A check or a deactivation is stricter, since a
 * wrong "rejected" there locks a paying Mac or makes it forget an activation the store still counts: only 404
 * (unknown key or instance) and 409/410 (gone) are verdicts.
 */
export function verdict(action: Action, status: number): Response {
  if (status === 404) return reply({ status: 'invalid' }, 404);
  if (status === 401 || status === 403 || status === 429) return upstream();
  if (status < 400 || status >= 500) return upstream();
  if (action === 'activate') return reply({ status: 'rejected' }, 409);
  return status === 409 || status === 410 ? reply({ status: 'rejected' }, 409) : upstream();
}
