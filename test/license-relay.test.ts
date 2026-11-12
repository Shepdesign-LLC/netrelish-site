import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import { ALL, POST } from '../src/pages/api/license';
import { handleLicenseRelay, MAX_BODY_BYTES } from '../src/lib/license-relay';

const URL_ = 'https://netrelish.com/api/license';
const KEY = 'NRKEY_abcd-1234-EFGH';
const NAME = "Ryan's MacBook Pro"; // printable ASCII only
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
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ status: 'paused', instance: undefined, expires_at: 12345 })));
    expect(await (await call(post(validate))).json()).toEqual({ status: 'unknown', instance_id: null, expires_at: null });
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ status: undefined, instance: [{ id: INSTANCE }] })));
    expect(await (await call(post(validate))).json()).toMatchObject({ status: 'unknown', instance_id: null });
    fetchMock.mockResolvedValueOnce(creemReply(creemLicense({ instance: { id: 42 } })));
    expect(await (await call(post(validate))).json()).toMatchObject({ instance_id: null });
  });

  it('uses test mode when CREEM_API_BASE is the Creem test host', async () => {
    vi.stubEnv('CREEM_API_BASE', 'https://test-api.creem.io');
    expect((await call(post(validate))).status).toBe(200);
    expect(forwarded().url).toBe('https://test-api.creem.io/v1/licenses/validate');
  });

  it('accepts a JSON content type with a charset', async () => {
    expect((await call(post(activate, { 'content-type': 'application/json; charset=utf-8' }))).status).toBe(200);
  });

  it('accepts the edges of every range', async () => {
    const edges = [
      { action: 'activate', key: 'a'.repeat(8), instance_name: ' ' },
      { action: 'activate', key: 'A_-9'.repeat(32), instance_name: ' !"#$%&\'()*+,-./09:;<=>?@AZ[\\]^_`az{|}~'.padEnd(64, 'x') },
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

  it.each([400, 409, 410, 422])('%i from Creem → 409 rejected, body not passed on', async (status) => {
    fetchMock.mockResolvedValueOnce(creemReply({ message: 'Activation limit reached', customer_email: EMAIL, key: KEY }, status));
    const res = await call(post(activate));
    expect(res.status).toBe(409);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: 'rejected' });
    expect(text).not.toContain(EMAIL);
  });

  it.each([401, 403, 429])('%i from Creem (our key or our rate, not the buyer’s license) → 502', async (status) => {
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
