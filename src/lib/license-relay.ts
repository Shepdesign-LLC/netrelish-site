/**
 * /api/license — the direct build's license relay to Creem.
 *
 * Creem's license API wants the store's secret key in `x-api-key`, so the Mac app can't call it. This route holds the
 * key and forwards a license key plus an instance name or id, nothing else. Browsing data never leaves the device
 * (NetRelish rule 5): the app sends no URL, no page, no account, and this route would refuse them if it did.
 *
 * It never logs the key, the instance, or Creem's body. At most: the action and the status Creem returned.
 * No CORS headers: the caller is the Mac app, not a page in a browser.
 *
 * The route is public by necessity (a native app has no session to prove), so it guards the store's Creem budget:
 *  - distributed limits through the Vercel Firewall (@vercel/firewall): per IP, per license key (a hash of it), and
 *    a global budget per kind of call, so a flood of checks can't use up the room activations need (DEPLOY.md);
 *  - an in-memory floor per function instance, in front of those;
 *  - when Creem throttles us, a bounded backoff: no calls to Creem until its Retry-After (or a doubling wait) passes;
 *  - the live Creem key only answers in production, and only the test host answers anywhere else;
 *  - Creem's reply is read capped, and only well-formed fields reach the app: a status from a fixed set, an id in
 *    the app's own pattern, an ISO date, and, when CREEM_PRODUCT_ID is set, only NetRelish Pro's own keys.
 *
 * Firewall challenges (Attack Challenge Mode, a Challenge action) can't be solved by URLSession: any edge rule on
 * this path must Deny, never Challenge, or every Mac stops getting answers.
 */

export const CREEM_BASES = ['https://api.creem.io', 'https://test-api.creem.io'] as const;
export const DEFAULT_CREEM_BASE = CREEM_BASES[0];
export const TEST_CREEM_BASE = CREEM_BASES[1];
export const MAX_BODY_BYTES = 2048;
export const MAX_UPSTREAM_BYTES = 16 * 1024;
export const UPSTREAM_TIMEOUT_MS = 10_000;

export const LICENSE_KEY = /^[A-Za-z0-9_-]{8,128}$/;
/** The app sends `NetRelish-` and eight hex digits. Plain characters only: no markup ever reaches Creem's records. */
export const INSTANCE_NAME = /^[A-Za-z0-9._-]{1,64}$/;
export const INSTANCE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Creem's three license endpoints. A fixed table: nothing from the request is ever part of the URL. */
const PATHS = {
  activate: '/v1/licenses/activate',
  validate: '/v1/licenses/validate',
  deactivate: '/v1/licenses/deactivate',
} as const;

/** Per IP: a person activating, checking and deactivating uses three calls. Per key: a leaked key can't be churned. */
export const LIMITS = {
  ip: { max: 10, windowMs: 60_000 },
  key: { max: 10, windowMs: 60 * 60_000 },
} as const;

/**
 * The Vercel Firewall rate-limit rules this route checks, by id. Each must exist in the dashboard as a rule with the
 * condition "@vercel/firewall" equals the id (DEPLOY.md lists the windows). Activations and checks have separate
 * global budgets, so checks can never use up what activations need.
 */
export const FIREWALL_RULES = {
  ip: 'license-ip',
  key: 'license-key',
  activate: 'license-activate',
  check: 'license-check',
} as const;

/** How long to stop calling Creem after it throttles us: its Retry-After, or a doubling wait, within these bounds. */
export const BACKOFF = { minMs: 1_000, firstMs: 5_000, maxMs: 300_000 } as const;

export type CheckRateLimit = (
  id: string,
  options: { request: Request; rateLimitKey?: string; timeout?: number },
) => Promise<{ rateLimited: boolean; error?: 'not-found' | 'blocked' }>;

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
  /**
   * VERCEL_ENV. 'production' answers only through Creem's live host; any other set value only through its test host,
   * so a preview deployment can never spend the live key. Unset (local runs, tests) checks neither.
   */
  environment?: string;
  /** CREEM_PRODUCT_ID. When set, a license for any other product in the store is a key we don't know. */
  productId?: string;
  /** The per-instance limiter. Defaults to the module's own; tests pass a fresh one. */
  limiter?: RateLimiter;
  /** The distributed check (@vercel/firewall's checkRateLimit). Given on Vercel; absent in local runs and tests. */
  checkRateLimit?: CheckRateLimit;
  /** Creem's throttling, remembered. Defaults to the module's own; tests pass a fresh one. */
  backoff?: UpstreamBackoff;
  /** Tests shorten this; production uses UPSTREAM_TIMEOUT_MS. */
  timeoutMs?: number;
  log?: (line: string) => void;
}

/**
 * A fixed-window counter in this function instance's memory. Instances come and go and don't share it, so it's a
 * floor, not a guarantee: Vercel's Firewall rule (DEPLOY.md) is the limit every request meets at the edge.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; until: number }>();
  constructor(private readonly now: () => number = () => Date.now(), private readonly maxEntries = 10_000) {}

  /** Counts one hit on `bucket`. False once it's past `max` in the window. */
  take(bucket: string, max: number, windowMs: number): boolean {
    const t = this.now();
    if (this.hits.size >= this.maxEntries) {
      for (const [k, v] of this.hits) if (v.until <= t) this.hits.delete(k);
      if (this.hits.size >= this.maxEntries) this.hits.clear(); // a flood of distinct buckets: start over
    }
    const hit = this.hits.get(bucket);
    if (!hit || hit.until <= t) {
      this.hits.set(bucket, { count: 1, until: t + windowMs });
      return true;
    }
    hit.count += 1;
    return hit.count <= max;
  }

  reset(): void { this.hits.clear(); }
}

export const defaultLimiter = new RateLimiter();

/** Remembers that Creem throttled us, and for how long not to ask it again. */
export class UpstreamBackoff {
  private until = 0;
  private nextMs: number = BACKOFF.firstMs;
  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Seconds left to wait, or 0 when Creem may be asked. */
  remainingSeconds(): number {
    return Math.max(0, Math.ceil((this.until - this.now()) / 1000));
  }

  /** Creem said 429. Wait its Retry-After if it gave one, else a wait that doubles each time; bounded either way. */
  throttled(retryAfter: string | null): number {
    const asked = retryAfter !== null && /^\d{1,6}$/.test(retryAfter.trim()) ? Number(retryAfter.trim()) * 1000 : null;
    const wait = Math.min(BACKOFF.maxMs, Math.max(BACKOFF.minMs, asked ?? this.nextMs));
    if (asked === null) this.nextMs = Math.min(BACKOFF.maxMs, this.nextMs * 2);
    this.until = Math.max(this.until, this.now() + wait);
    return this.remainingSeconds();
  }

  /** Creem answered without throttling: the doubling starts over. */
  answered(): void { this.nextMs = BACKOFF.firstMs; }

  reset(): void { this.until = 0; this.nextMs = BACKOFF.firstMs; }
}

export const defaultBackoff = new UpstreamBackoff();

/** The caller's IP as Vercel's edge reports it. Vercel sets these itself; a caller can't add its own. */
function clientIp(req: Request): string {
  const first = (h: string | null) => h?.split(',')[0]?.trim() || null;
  return first(req.headers.get('x-vercel-forwarded-for')) ?? first(req.headers.get('x-real-ip'))
    ?? first(req.headers.get('x-forwarded-for')) ?? 'unknown';
}

/** A short, one-way name for a license key, so the limiter never holds the key itself. */
async function keyBucket(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
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
const rateLimited = (seconds = 60) => reply({ error: 'rate_limited' }, 429, { 'retry-after': String(Math.max(1, seconds)) });
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
async function readCapped(from: { body: ReadableStream<Uint8Array> | null }, max: number): Promise<Uint8Array | 'too_large' | 'bad'> {
  if (!from.body) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = from.body.getReader();
  } catch {
    return 'bad';
  }
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

type Summary = { status: string; instance_id: string | null; expires_at: string | null };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Creem's license object, cut down to the three fields the app reads. Null when it isn't one we can stand behind:
 * not an object, the wrong mode for the host asked, or an end date that can't be read (null there means "never").
 * 'foreign' when it's a license for another product in the store.
 */
function summarize(raw: unknown, mode: 'live' | 'test', productId: string): Summary | 'foreign' | null {
  if (!isObject(raw)) return null;
  if (raw.mode !== undefined && raw.mode !== mode) return null;
  if (productId && raw.product_id !== productId && !(isObject(raw.product) && raw.product.id === productId)) return 'foreign';
  let status = typeof raw.status === 'string' && STATUSES.has(raw.status) ? raw.status : 'unknown';
  const inst = isObject(raw.instance) ? raw.instance : undefined;
  if (inst?.mode !== undefined && inst.mode !== mode) return null;
  // The license can be active while this Mac's own activation was given back: that Mac's answer is inactive.
  if (inst?.status === 'deactivated' && status === 'active') status = 'inactive';
  let expires_at: string | null = null;
  if (raw.expires_at !== undefined && raw.expires_at !== null) {
    if (typeof raw.expires_at !== 'string' || raw.expires_at.length > 40 || !ISO_DATE.test(raw.expires_at)) return null;
    const t = Date.parse(raw.expires_at);
    if (Number.isNaN(t)) return null;
    expires_at = new Date(t).toISOString();
  }
  return {
    status,
    // Only an id the app could send back. Anything else is dropped, and the app treats no id as no activation.
    instance_id: typeof inst?.id === 'string' && INSTANCE_ID.test(inst.id) ? inst.id : null,
    expires_at,
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
  // Live sales answer only in production; every other deployment answers only through Creem's test host.
  if (deps.environment && (deps.environment === 'production') !== (base === DEFAULT_CREEM_BASE)) {
    log(`license: not configured (${deps.environment} must use Creem's ${deps.environment === 'production' ? 'live' : 'test'} host)`);
    return notConfigured();
  }

  const { action } = forward;

  // Creem throttled us a moment ago: don't ask again until it said to (or our own wait passes).
  const backoff = deps.backoff ?? defaultBackoff;
  const waiting = backoff.remainingSeconds();
  if (waiting > 0) {
    log(`license: ${action} held back, creem throttled`);
    return rateLimited(waiting);
  }

  // A free floor in this instance's memory first, then the distributed limits every instance shares.
  const limiter = deps.limiter ?? defaultLimiter;
  const bucket = await keyBucket(forward.body.key);
  if (!limiter.take(`ip:${clientIp(req)}`, LIMITS.ip.max, LIMITS.ip.windowMs)
    || !limiter.take(`key:${bucket}`, LIMITS.key.max, LIMITS.key.windowMs)) {
    log(`license: ${action} rate limited`);
    return rateLimited();
  }
  if (deps.checkRateLimit) {
    const checks: Array<[string, string | undefined]> = [
      [FIREWALL_RULES.ip, undefined], // keyed on the caller's IP
      [FIREWALL_RULES.key, bucket], // keyed on the license key's hash, never the key
      [action === 'activate' ? FIREWALL_RULES.activate : FIREWALL_RULES.check, 'all'], // the global budget
    ];
    for (const [id, rateLimitKey] of checks) {
      let result: Awaited<ReturnType<CheckRateLimit>>;
      try {
        result = await deps.checkRateLimit(id, { request: req, rateLimitKey, timeout: 2_000 });
      } catch {
        log(`license: ${action} rate limit check failed`);
        return upstream(); // fail closed: an unchecked call never reaches Creem
      }
      if (result.error === 'not-found' && deps.environment === 'production') {
        log(`license: not configured (firewall rule ${id} missing)`);
        return notConfigured(); // production never runs without its budget
      }
      if (result.rateLimited) {
        log(`license: ${action} rate limited (${id})`);
        return rateLimited();
      }
    }
  }

  let res: Response;
  try {
    res = await deps.fetch(new URL(PATHS[action], base).toString(), {
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

  if (res.status === 429) {
    const seconds = backoff.throttled(res.headers.get('retry-after'));
    await res.body?.cancel().catch(() => {});
    return rateLimited(seconds);
  }
  backoff.answered();

  if (res.status >= 200 && res.status < 300) {
    const bytes = await readCapped(res, MAX_UPSTREAM_BYTES);
    if (bytes === 'too_large' || bytes === 'bad') return upstream();
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return upstream();
    }
    const out = summarize(body, base === DEFAULT_CREEM_BASE ? 'live' : 'test', deps.productId ?? '');
    if (out === 'foreign') return reply({ status: 'invalid' }, 404);
    if (!out) return upstream();
    // An activation the app gets no usable id for would sit in the store, counted and unreachable.
    if (action === 'activate' && (out.status === 'active' || out.status === 'expired') && !out.instance_id) {
      log('license: activate creem 2xx without a usable instance');
      return upstream();
    }
    return reply(out, 200);
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
