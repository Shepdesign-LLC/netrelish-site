import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import { ALL, POST } from '../src/pages/api/license';
import {
  BACKOFF, defaultBackoff, defaultLimiter, FIREWALL_RULES, handleLicenseRelay, LIMITS, MAX_BODY_BYTES, RateLimiter,
  UpstreamBackoff, type CheckRateLimit,
} from '../src/lib/license-relay';

const URL_ = 'https://netrelish.com/api/license';
const KEY = 'NRKEY_abcd-1234-EFGH';
const NAME = 'NetRelish-0a1b2c3d'; // what the app sends
const INSTANCE = 'ins_7Xk2pQ';
const EMAIL = 'buyer@example.com';

/** Creem's license object with everything we must not pass on. */
function creemLicense(over: Record<string, unknown> = {}) {
  return {
    id: 'lic_123',
    mode: 'live',
    object: 'license',
    status: 'active',
    key: KEY,
    activation: 1,
    activation_limit: 3,
    expires_at: '2027-11-12T00:00:00.000Z',
    created_at: '2026-11-12T00:00:00.000Z',
    customer: { id: 'cust_1', email: EMAIL, name: 'A Buyer' },
    customer_email: EMAIL,
    product_id: 'prod_1',
    instance: { id: INSTANCE, mode: 'live', object: 'license-instance', name: NAME, status: 'active', created_at: '2026-11-12T00:00:00.000Z' },
    ...over,
  };
}

function creemReply(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const call = (request: Request) => POST({ request } as APIContext) as Promise<Response>;

const activate = { action: 'activate', key: KEY, instance_name: NAME };
const validate = { action: 'validate', key: KEY, instance_id: INSTANCE };
const deactivate = { action: 'deactivate', key: KEY, instance_id: INSTANCE };

let fetchMock: ReturnType<typeof vi.fn>;
let logs: string[];

beforeEach(() => {
  defaultLimiter.reset();
  defaultBackoff.reset();
  fetchMock = vi.fn(async () => creemReply(creemLicense()));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CREEM_API_KEY', 'creem_secret_test');
  vi.stubEnv('CREEM_API_BASE', '');
  logs = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logs.push(args.map(String).join(' ')); });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function forwarded(i = 0) {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
}

function expectNoSecretsLogged() {
  for (const line of logs) {
    for (const secret of [KEY, NAME, INSTANCE, EMAIL, 'creem_secret_test']) expect(line).not.toContain(secret);
  }
}

describe('/api/license — happy paths', () => {
  it('activates: forwards only key + instance_name with the secret, replies with three fields', async () => {
    const res = await call(post(activate));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'active', instance_id: INSTANCE, expires_at: '2027-11-12T00:00:00.000Z' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const f = forwarded();
    expect(f.url).toBe('https://api.creem.io/v1/licenses/activate');
    expect(f.init.method).toBe('POST');
    expect(f.headers).toEqual({ 'x-api-key': 'creem_secret_test', 'content-type': 'application/json', accept: 'application/json' });
    expect(f.body).toEqual({ key: KEY, instance_name: NAME });
    expect(f.init.redirect).toBe('error');
    expect(f.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('validates: forwards only key + instance_id', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ status: 'expired', expires_at: null })));
    const res = await call(post(validate));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'expired', instance_id: INSTANCE, expires_at: null });
    const f = forwarded();
    expect(f.url).toBe('https://api.creem.io/v1/licenses/validate');
    expect(f.body).toEqual({ key: KEY, instance_id: INSTANCE });
    expect(f.init.redirect).toBe('error');
  });

  it('deactivates: forwards only key + instance_id', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ status: 'inactive', instance: { id: INSTANCE, status: 'deactivated' } })));
    const res = await call(post(deactivate));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'inactive', instance_id: INSTANCE, expires_at: '2027-11-12T00:00:00.000Z' });
    const f = forwarded();
    expect(f.url).toBe('https://api.creem.io/v1/licenses/deactivate');
    expect(f.body).toEqual({ key: KEY, instance_id: INSTANCE });
  });

  it('passes the disabled status through', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ status: 'disabled' })));
    expect(await (await call(post(validate))).json()).toMatchObject({ status: 'disabled' });
  });

  it('strips everything else Creem sends: no customer, no email, no key echo', async () => {
    const res = await call(post(activate));
    const text = await res.text();
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['expires_at', 'instance_id', 'status']);
    for (const leak of [EMAIL, KEY, 'cust_1', 'lic_123', 'prod_1', 'A Buyer', NAME]) expect(text).not.toContain(leak);
  });

  it('maps an unknown status to "unknown" and a missing or odd instance to null', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ status: 'paused', instance: undefined, expires_at: null })));
    expect(await (await call(post(validate))).json()).toEqual({ status: 'unknown', instance_id: null, expires_at: null });
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ status: undefined, instance: [{ id: 'ins_someone_else' }] })));
    expect(await (await call(post(validate))).json()).toMatchObject({ status: 'unknown', instance_id: null });
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: { id: 42 } })));
    expect(await (await call(post(validate))).json()).toMatchObject({ instance_id: null });
  });

  it.each([['with a space', 'ins 1'], ['with a slash', '../admin'], ['empty', ''], ['too long', 'a'.repeat(129)]])(
    'drops an instance id the app could never send back (%s)',
    async (_label, id) => {
      fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: { id } })));
      expect(await (await call(post(validate))).json()).toMatchObject({ instance_id: null });
    },
  );

  it('uses test mode when CREEM_API_BASE is the Creem test host', async () => {
    vi.stubEnv('CREEM_API_BASE', 'https://test-api.creem.io');
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ mode: 'test', instance: { id: INSTANCE, mode: 'test', status: 'active' } })));
    expect((await call(post(validate))).status).toBe(200);
    expect(forwarded().url).toBe('https://test-api.creem.io/v1/licenses/validate');
  });

  it('accepts a JSON content type with a charset', async () => {
    expect((await call(post(activate, { 'content-type': 'application/json; charset=utf-8' }))).status).toBe(200);
  });

  it('accepts the edges of every range', async () => {
    const edges = [
      { action: 'activate', key: 'a'.repeat(8), instance_name: 'a' },
      { action: 'activate', key: 'A_-9'.repeat(32), instance_name: 'AZaz09._-'.padEnd(64, 'x') },
      { action: 'validate', key: KEY, instance_id: 'x' },
      { action: 'deactivate', key: KEY, instance_id: 'a-_Z'.repeat(32) },
    ];
    for (const body of edges) expect((await call(post(body))).status, JSON.stringify(body)).toBe(200);
  });

  it('sends no CORS headers', async () => {
    const res = await call(post(activate, { origin: 'https://evil.example' }));
    for (const [name] of res.headers) expect(name.startsWith('access-control-')).toBe(false);
  });

  it('logs only the action and Creem’s status, never the key, instance or body', async () => {
    await call(post(activate));
    await call(post(validate));
    fetchMock.mockResolvedValueOnce(creemReply({ error: `bad key ${KEY}` }, 422));
    await call(post(deactivate));
    expect(logs).toEqual(['license: activate creem 200', 'license: validate creem 200', 'license: deactivate creem 422']);
    expectNoSecretsLogged();
  });
});

describe('/api/license — refusals', () => {
  const bad: [string, unknown][] = [
    ['unknown action', { action: 'refund', key: KEY, instance_id: INSTANCE }],
    ['missing action', { key: KEY, instance_name: NAME }],
    ['non-string action', { action: 1, key: KEY, instance_name: NAME }],
    ['missing key', { action: 'activate', instance_name: NAME }],
    ['missing instance_name', { action: 'activate', key: KEY }],
    ['missing instance_id', { action: 'validate', key: KEY }],
    ['extra field', { ...activate, url: 'https://example.com/page' }],
    ['extra field on validate', { ...validate, email: EMAIL }],
    ['__proto__ field', '{"action":"activate","key":"' + KEY + '","instance_name":"Mac","__proto__":{"x":1}}'],
    ['instance_id on activate', { action: 'activate', key: KEY, instance_id: INSTANCE }],
    ['instance_name on validate', { action: 'validate', key: KEY, instance_name: NAME }],
    ['both instance fields', { action: 'deactivate', key: KEY, instance_id: INSTANCE, instance_name: NAME }],
    ['key too short', { ...activate, key: 'a'.repeat(7) }],
    ['key too long', { ...activate, key: 'a'.repeat(129) }],
    ['key with a space', { ...activate, key: 'abcd efgh' }],
    ['key with a dot', { ...activate, key: 'abcd.efgh' }],
    ['key with a trailing newline', { ...activate, key: KEY + '\n' }],
    ['key not a string', { ...activate, key: 12345678 }],
    ['key null', { ...activate, key: null }],
    ['empty instance_name', { ...activate, instance_name: '' }],
    ['instance_name too long', { ...activate, instance_name: 'x'.repeat(65) }],
    ['non-ASCII instance_name', { ...activate, instance_name: 'Ryan’s Mac' }],
    ['instance_name with a newline', { ...activate, instance_name: 'Mac\nBook' }],
    ['instance_name with DEL', { ...activate, instance_name: 'Mac\x7f' }],
    ['instance_name not a string', { ...activate, instance_name: ['Mac'] }],
    ['empty instance_id', { ...validate, instance_id: '' }],
    ['instance_id too long', { ...validate, instance_id: 'a'.repeat(129) }],
    ['instance_id with a slash', { ...validate, instance_id: '../admin' }],
    ['instance_id not a string', { ...deactivate, instance_id: 7 }],
    ['array body', [activate]],
    ['null body', 'null'],
    ['string body', '"activate"'],
    ['number body', '42'],
    ['invalid JSON', '{"action":"activate",'],
    ['empty body', ''],
  ];

  it.each(bad)('400s on %s without calling Creem', async (_label, body) => {
    const res = await call(post(body));
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'bad_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400s on invalid UTF-8', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('{"action":"activate","key":"'), 0xff, 0xfe, ...new TextEncoder().encode('"}')]);
    const res = await call(new Request(URL_, { method: 'POST', body: bytes, headers: { 'content-type': 'application/json' } }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('413s when content-length says the body is over 2 KB', async () => {
    const res = await call(post(activate, { 'content-length': String(MAX_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'too_large' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('413s on a body over 2 KB that declares no length', async () => {
    const big = JSON.stringify({ ...activate, pad: 'x'.repeat(MAX_BODY_BYTES) });
    const req = post(big);
    expect(req.headers.get('content-length')).toBeNull();
    const res = await call(req);
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('413s on a streamed body over 2 KB whose content-length lies', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    const stream = new ReadableStream<Uint8Array>({
      start(c) { for (let i = 0; i < 4; i++) c.enqueue(chunk); c.close(); },
    });
    const req = new Request(URL_, { method: 'POST', body: stream, duplex: 'half', headers: { 'content-type': 'application/json', 'content-length': '20' } } as RequestInit);
    const res = await call(req);
    expect(res.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('takes a body of exactly 2 KB', async () => {
    const base = JSON.stringify(activate);
    const exact = base.slice(0, -1) + ' '.repeat(MAX_BODY_BYTES - base.length) + '}';
    expect(new TextEncoder().encode(exact).byteLength).toBe(MAX_BODY_BYTES);
    expect((await call(post(exact))).status).toBe(200);
  });

  it('400s on a content-length that is not a number', async () => {
    const res = await call(post(activate, { 'content-length': 'lots' }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('405s on any method but POST, from the route and from the handler', async () => {
    for (const method of ['GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const res = (await ALL({ request: new Request(URL_, { method }) } as APIContext)) as Response;
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'method_not_allowed' });
    }
    const viaHandler = await handleLicenseRelay(new Request(URL_, { method: 'GET' }), { fetch: fetchMock as unknown as typeof fetch, apiKey: 'k', apiBase: '' });
    expect(viaHandler.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['text/plain', 'text/plain'],
    ['a form post', 'application/x-www-form-urlencoded'],
    ['a lookalike', 'application/jsonp'],
  ])('415s on %s', async (_label, ct) => {
    const res = await call(post(activate, { 'content-type': ct }));
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'unsupported_media_type' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('415s with no content type', async () => {
    const req = new Request(URL_, { method: 'POST', body: new Blob([JSON.stringify(activate)]) });
    expect(req.headers.get('content-type')).toBeNull();
    expect((await call(req)).status).toBe(415);
  });
});

describe('/api/license — configuration', () => {
  it('503s when CREEM_API_KEY is not set, without calling anyone', async () => {
    vi.stubEnv('CREEM_API_KEY', '');
    const res = await call(post(activate));
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'https://evil.example',
    'http://api.creem.io',
    'https://api.creem.io/',
    'https://api.creem.io.evil.example',
    'https://api.creem.io/v1',
    ' https://api.creem.io',
  ])('503s when CREEM_API_BASE is %j', async (base) => {
    vi.stubEnv('CREEM_API_BASE', base);
    const res = await call(post(validate));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('/api/license — Creem failures', () => {
  it('404 from Creem → 404 invalid', async () => {
    fetchMock.mockResolvedValueOnce(creemReply({ message: 'License not found' }, 404));
    const res = await call(post(validate));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ status: 'invalid' });
  });

  it.each([400, 409, 410, 422])('%i from Creem on activate → 409 rejected, body not passed on', async (status) => {
    fetchMock.mockResolvedValueOnce(creemReply({ message: 'Activation limit reached', customer_email: EMAIL, key: KEY }, status));
    const res = await call(post(activate));
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: 'rejected' });
    expect(text).not.toContain(EMAIL);
  });

  it.each([409, 410])('%i from Creem on a check or deactivation → 409 rejected', async (status) => {
    for (const body of [validate, deactivate]) {
      fetchMock.mockResolvedValueOnce(creemReply({ message: 'gone' }, status));
      const res = await call(post(body));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ status: 'rejected' });
    }
  });

  it.each([400, 405, 413, 422])(
    '%i from Creem on a check or deactivation is no verdict → 502, so a paying Mac keeps Pro',
    async (status) => {
      for (const body of [validate, deactivate]) {
        fetchMock.mockResolvedValueOnce(creemReply({ message: 'bad request' }, status));
        const res = await call(post(body));
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({ error: 'upstream' });
      }
    },
  );

  it.each([401, 403])('%i from Creem (our key, not the buyer’s license) → 502', async (status) => {
    fetchMock.mockResolvedValueOnce(creemReply({ message: 'nope' }, status));
    const res = await call(post(validate));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream' });
  });

  it.each([500, 502, 503, 504])('%i from Creem → 502 upstream', async (status) => {
    fetchMock.mockResolvedValueOnce(creemReply('<html>oops</html>', status));
    const res = await call(post(validate));
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'upstream' });
  });

  it('fetch throwing → 502, and the error text is not logged', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed for ${KEY}`));
    const res = await call(post(activate));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream' });
    expect(logs).toEqual(['license: activate creem unreachable']);
    expectNoSecretsLogged();
  });

  it('a redirect from Creem (fetch rejects under redirect: "error") → 502', async () => {
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe('error');
      throw new TypeError('fetch failed: unexpected redirect');
    });
    expect((await call(post(validate))).status).toBe(502);
  });

  it('a timeout error → 502', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const res = await call(post(validate));
    expect(res.status).toBe(502);
    expect(logs).toEqual(['license: validate creem timed out']);
  });

  it('really aborts a hung Creem call at the timeout → 502', async () => {
    const hung = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
      }));
    const lines: string[] = [];
    const res = await handleLicenseRelay(post(validate), { fetch: hung as unknown as typeof fetch, apiKey: 'k', apiBase: '', timeoutMs: 20, log: (l) => lines.push(l) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream' });
    expect(lines).toEqual(['license: validate creem timed out']);
  });

  it('non-JSON 200 → 502', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>maintenance</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    const res = await call(post(validate));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream' });
  });

  it.each([['an array', '[]'], ['null', 'null'], ['a string', '"active"'], ['empty', '']])('a 200 whose body is %s → 502', async (_l, body) => {
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }));
    expect((await call(post(validate))).status).toBe(502);
  });
});

describe('/api/license — what reaches the app', () => {
  it('a 2xx activation with no usable instance id is no answer, so no slot sits unreachable', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: { id: 'ins 1' } })));
    const res = await call(post(activate));
    expect(res.status).toBe(502);
    expect(logs).toContain('license: activate creem 2xx without a usable instance');
  });

  it.each([['a number', 12345], ['not a date', 'next year'], ['an impossible date', '2027-13-45T00:00:00Z'], ['too long', `2027-11-12T00:00:00.${'0'.repeat(40)}Z`]])(
    'an end date that is %s is no answer, never "doesn\'t run out"',
    async (_label, expires_at) => {
      fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ expires_at })));
      expect((await call(post(validate))).status).toBe(502);
    },
  );

  it('an end date is passed on in one ISO form', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ expires_at: '2027-11-12T08:30:00+02:00' })));
    expect(await (await call(post(validate))).json()).toMatchObject({ expires_at: '2027-11-12T06:30:00.000Z' });
  });

  it('a license active while this Mac\'s own activation was given back reads as inactive', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: { id: INSTANCE, mode: 'live', status: 'deactivated' } })));
    expect(await (await call(post(validate))).json()).toMatchObject({ status: 'inactive', instance_id: INSTANCE });
  });

  it('a reply in the wrong mode for the host is no answer', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ mode: 'test' })));
    expect((await call(post(validate))).status).toBe(502);
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: { id: INSTANCE, mode: 'test', status: 'active' } })));
    expect((await call(post(validate))).status).toBe(502);
  });

  it('a reply larger than any license object is no answer', async () => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ padding: 'x'.repeat(20_000) })));
    expect((await call(post(validate))).status).toBe(502);
  });

  it('with CREEM_PRODUCT_ID set, only that product\'s keys are known', async () => {
    vi.stubEnv('CREEM_PRODUCT_ID', 'prod_1');
    expect((await call(post(validate))).status).toBe(200);
    vi.stubEnv('CREEM_PRODUCT_ID', 'prod_netrelish');
    const res = await call(post(validate));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ status: 'invalid' });
  });

  it.each([['markup', '<img src=x onerror=alert(1)>'], ['quotes', 'a"b'], ['a space', 'Ryan MacBook'], ['an ampersand', 'a&b']])(
    '400s on an instance name with %s, before Creem stores it',
    async (_label, instance_name) => {
      expect((await call(post({ ...activate, instance_name }))).status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('asks Creem at a fixed path, whatever the action', async () => {
    for (const [body, path] of [[activate, 'activate'], [validate, 'validate'], [deactivate, 'deactivate']] as const) {
      fetchMock.mockClear();
      await call(post(body));
      expect(forwarded().url).toBe(`https://api.creem.io/v1/licenses/${path}`);
    }
  });
});

describe('/api/license — where the live key answers', () => {
  it('production answers only through the live host', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect((await call(post(validate))).status).toBe(200);
    vi.stubEnv('CREEM_API_BASE', 'https://test-api.creem.io');
    fetchMock.mockClear();
    expect((await call(post(validate))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['preview', 'development'])('%s answers only through the test host, so it never spends the live key', async (env) => {
    vi.stubEnv('VERCEL_ENV', env);
    expect((await call(post(validate))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('CREEM_API_BASE', 'https://test-api.creem.io');
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ mode: 'test', instance: { id: INSTANCE, mode: 'test', status: 'active' } })));
    expect((await call(post(validate))).status).toBe(200);
  });
});

describe('/api/license — rate limits', () => {
  const from = (ip: string, body: unknown = validate) => post(body, { 'x-vercel-forwarded-for': ip });

  it(`answers ${LIMITS.ip.max} calls a minute from one IP, then 429s without calling Creem`, async () => {
    for (let i = 0; i < LIMITS.ip.max; i++) expect((await call(from('203.0.113.7', { ...validate, key: `KEY_${i}_abcdefgh` }))).status).toBe(200);
    fetchMock.mockClear();
    const res = await call(from('203.0.113.7', { ...validate, key: 'KEY_last_abcdefgh' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await call(from('198.51.100.2'))).status).toBe(200);
  });

  it(`answers ${LIMITS.key.max} calls an hour for one key, from anywhere`, async () => {
    for (let i = 0; i < LIMITS.key.max; i++) expect((await call(from(`192.0.2.${i}`))).status).toBe(200);
    expect((await call(from('192.0.2.200'))).status).toBe(429);
    expectNoSecretsLogged();
  });

  it('the window passes, and the limit lifts', () => {
    let t = 0;
    const limiter = new RateLimiter(() => t);
    expect(limiter.take('b', 1, 1000)).toBe(true);
    expect(limiter.take('b', 1, 1000)).toBe(false);
    t = 1000;
    expect(limiter.take('b', 1, 1000)).toBe(true);
  });

  it('a flood of distinct callers never grows the limiter past its cap', () => {
    const limiter = new RateLimiter(() => 0, 100);
    for (let i = 0; i < 1000; i++) limiter.take(`ip:${i}`, 10, 60_000);
    expect((limiter as unknown as { hits: Map<string, unknown> }).hits.size).toBeLessThanOrEqual(100);
  });
});

describe('/api/license — the shared Creem budget', () => {
  type Seen = { id: string; rateLimitKey?: string };
  function firewall(limited: Partial<Record<string, { rateLimited: boolean; error?: 'not-found' | 'blocked' }>> = {}) {
    const seen: Seen[] = [];
    const check: CheckRateLimit = async (id, { rateLimitKey }) => {
      seen.push({ id, rateLimitKey });
      return limited[id] ?? { rateLimited: false };
    };
    return { seen, check };
  }
  const relay = (body: unknown, more: Partial<Parameters<typeof handleLicenseRelay>[1]> = {}) =>
    handleLicenseRelay(post(body, { 'x-real-ip': '203.0.113.9' }), {
      fetch: fetchMock as unknown as typeof fetch, apiKey: 'k', apiBase: '',
      limiter: new RateLimiter(), backoff: new UpstreamBackoff(), log: (l) => logs.push(l), ...more,
    });

  it('checks the caller, the key and the global budget at the edge before calling Creem', async () => {
    const fw = firewall();
    expect((await relay(validate, { checkRateLimit: fw.check })).status).toBe(200);
    expect(fw.seen.map((s) => s.id)).toEqual([FIREWALL_RULES.ip, FIREWALL_RULES.key, FIREWALL_RULES.check]);
    expect(fw.seen[0].rateLimitKey).toBeUndefined(); // the caller's IP, as the Firewall sees it
    expect(fw.seen[1].rateLimitKey).toMatch(/^[0-9a-f]{24}$/);
    expect(fw.seen[2].rateLimitKey).toBe('all');
    for (const s of fw.seen) expect(s.rateLimitKey ?? '').not.toContain(KEY); // never the key itself
  });

  it('activations have their own global budget, so checks can never use up theirs', async () => {
    const fw = firewall({ [FIREWALL_RULES.check]: { rateLimited: true } });
    expect((await relay(validate, { checkRateLimit: fw.check })).status).toBe(429);
    expect((await relay(activate, { checkRateLimit: fw.check })).status).toBe(200);
    expect(fw.seen.at(-1)?.id).toBe(FIREWALL_RULES.activate);
  });

  it.each(Object.values(FIREWALL_RULES))('a limited %s answers 429 with Retry-After, and Creem is never called', async (id) => {
    const res = await relay(id === FIREWALL_RULES.activate ? activate : validate, { checkRateLimit: firewall({ [id]: { rateLimited: true } }).check });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a check that fails is no answer: an unchecked call never reaches Creem', async () => {
    const res = await relay(validate, { checkRateLimit: async () => { throw new Error('timeout'); } });
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('production never runs without its budget: a missing Firewall rule is not configured', async () => {
    const missing = firewall({ [FIREWALL_RULES.key]: { rateLimited: false, error: 'not-found' } });
    const res = await relay(validate, { checkRateLimit: missing.check, environment: 'production' });
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs).toContain('license: not configured (firewall rule license-key missing)');
  });

  it('when Creem throttles us, we stop asking until its Retry-After passes', async () => {
    let t = 0;
    const backoff = new UpstreamBackoff(() => t);
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '30' } }));
    const first = await relay(validate, { backoff });
    expect(first.status).toBe(429);
    expect(first.headers.get('retry-after')).toBe('30');
    fetchMock.mockClear();
    t = 29_000;
    const held = await relay(validate, { backoff });
    expect(held.status).toBe(429);
    expect(held.headers.get('retry-after')).toBe('1');
    expect(fetchMock).not.toHaveBeenCalled();
    t = 30_000;
    expect((await relay(validate, { backoff })).status).toBe(200);
  });

  it('with no Retry-After, the wait doubles, within bounds, and starts over once Creem answers', () => {
    let t = 0;
    const backoff = new UpstreamBackoff(() => t);
    expect(backoff.throttled(null)).toBe(BACKOFF.firstMs / 1000);
    t += BACKOFF.firstMs;
    expect(backoff.throttled(null)).toBe((BACKOFF.firstMs * 2) / 1000);
    for (let i = 0; i < 20; i++) { t += BACKOFF.maxMs; backoff.throttled(null); }
    expect(backoff.remainingSeconds()).toBe(BACKOFF.maxMs / 1000);
    t += BACKOFF.maxMs;
    backoff.answered();
    expect(backoff.throttled(null)).toBe(BACKOFF.firstMs / 1000);
    expect(backoff.throttled('999999')).toBe(BACKOFF.maxMs / 1000); // a huge Retry-After is still bounded
  });

  it('the route only uses the Firewall check on Vercel', async () => {
    expect((await call(post(validate))).status).toBe(200); // no VERCEL_ENV: nothing to ask
    expect(logs.some((l) => l.includes('firewallHostForDevelopment'))).toBe(false);
  });
});

describe('/api/license — Creem reply shapes', () => {
  it.each(['live', 'prod', 'production', undefined])('the live host takes mode %s', async (mode) => {
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ mode, instance: { id: INSTANCE, mode, status: 'active' } })));
    expect((await call(post(validate))).status).toBe(200);
  });

  it.each(['test', 'sandbox'])('the test host takes mode %s', async (mode) => {
    vi.stubEnv('CREEM_API_BASE', 'https://test-api.creem.io');
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ mode, instance: { id: INSTANCE, mode, status: 'active' } })));
    expect((await call(post(validate))).status).toBe(200);
  });

  it.each(['live', 'prod'])('the test host refuses mode %s', async (mode) => {
    vi.stubEnv('CREEM_API_BASE', 'https://test-api.creem.io');
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ mode })));
    expect((await call(post(validate))).status).toBe(502);
  });

  it('an instance list: a check reads its own instance, an activation the only one', async () => {
    const list = [{ id: 'ins_other', status: 'active' }, { id: INSTANCE, status: 'deactivated' }];
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: list })));
    expect(await (await call(post(validate))).json()).toMatchObject({ status: 'inactive', instance_id: INSTANCE });
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: [{ id: 'ins_new', status: 'active' }] })));
    expect(await (await call(post(activate))).json()).toMatchObject({ status: 'active', instance_id: 'ins_new' });
  });

  it('with CREEM_PRODUCT_ID set, a reply that names no product goes through, and the log says so', async () => {
    vi.stubEnv('CREEM_PRODUCT_ID', 'prod_netrelish');
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ product_id: undefined })));
    expect((await call(post(validate))).status).toBe(200);
    expect(logs).toContain('license: creem reply names no product');
  });

  it('CREEM_PRODUCT_ID takes a list: yearly and lifetime', async () => {
    vi.stubEnv('CREEM_PRODUCT_ID', 'prod_year, prod_1');
    expect((await call(post(validate))).status).toBe(200);
  });

  it('another product\'s key: the activation Creem just counted is given back, then the key is unknown', async () => {
    vi.stubEnv('CREEM_PRODUCT_ID', 'prod_netrelish');
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense()));
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: { id: INSTANCE, status: 'deactivated' } })));
    const res = await call(post(activate));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ status: 'invalid' });
    const back = forwarded(1);
    expect(back.url).toBe('https://api.creem.io/v1/licenses/deactivate');
    expect(back.body).toEqual({ key: KEY, instance_id: INSTANCE });
    expect(logs).toContain('license: gave back a foreign activation, creem 200');
    expectNoSecretsLogged();
  });
});
