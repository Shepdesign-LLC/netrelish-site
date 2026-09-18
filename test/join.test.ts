import { describe, it, expect, vi } from 'vitest';
import { handleJoin, type JoinDeps } from '../src/lib/join';

const env = { BENTO_PUBLISHABLE_KEY: 'pk', BENTO_SECRET_KEY: 'sk', BENTO_SITE_UUID: 'uuid' };

function deps(fetchImpl: JoinDeps['fetch'] = vi.fn(async () => new Response('{"results":1}', { status: 200 }))): JoinDeps {
  return { fetch: fetchImpl, env, allowedHosts: ['netrelish.com', 'localhost'] };
}

function formPost(fields: Record<string, string>, origin = 'https://netrelish.com') {
  const body = new URLSearchParams(fields);
  return new Request('https://netrelish.com/api/join', {
    method: 'POST', body,
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
  });
}

function jsonPost(fields: Record<string, string>, origin = 'https://netrelish.com') {
  return new Request('https://netrelish.com/api/join', {
    method: 'POST', body: JSON.stringify(fields),
    headers: { 'content-type': 'application/json', origin },
  });
}

describe('handleJoin', () => {
  it('rejects a foreign origin', async () => {
    const res = await handleJoin(formPost({ email: 'a@b.co' }, 'https://evil.example'), deps());
    expect(res.status).toBe(403);
  });

  it('treats a filled honeypot as success without calling Bento', async () => {
    const f = vi.fn();
    const res = await handleJoin(formPost({ email: 'a@b.co', website: 'spam' }), deps(f as any));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/thanks');
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects a bad email with 400 for JSON', async () => {
    const res = await handleJoin(jsonPost({ email: 'nope' }), deps());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false });
  });

  it('redirects a bad email back to the form for form posts', async () => {
    const res = await handleJoin(formPost({ email: 'nope' }), deps());
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/?join=invalid#join');
  });

  it('subscribes with the beta tag and source, then emits the join event', async () => {
    const f = vi.fn(async () => new Response('{"results":1}', { status: 200 }));
    const res = await handleJoin(jsonPost({ email: 'Ryan@Example.com' }), deps(f as any));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
    const [subUrl, subInit] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(subUrl).toBe('https://app.bentonow.com/api/v1/batch/subscribers?site_uuid=uuid');
    expect((subInit.headers as Record<string, string>)['User-Agent']).toBe('netrelish-site/1.0');
    expect((subInit.headers as Record<string, string>)['Authorization']).toBe('Basic ' + btoa('pk:sk'));
    expect(JSON.parse(subInit.body as string)).toEqual({
      subscribers: [{ email: 'ryan@example.com', tags: 'netrelish-beta,lead', signup_source: 'netrelish.com' }],
    });
    const [evUrl, evInit] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(evUrl).toBe('https://app.bentonow.com/api/v1/batch/events?site_uuid=uuid');
    expect(JSON.parse(evInit.body as string)).toEqual({ events: [{ type: '$netrelish_beta_join', email: 'ryan@example.com' }] });
  });

  it('returns 502 when Bento fails, never a silent success', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 500 }));
    const res = await handleJoin(jsonPost({ email: 'a@b.co' }), deps(f as any));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: expect.stringContaining('list') });
  });

  it('sends a no-JS form post back with the error when Bento is unreachable', async () => {
    const f = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const res = await handleJoin(formPost({ email: 'a@b.co' }), deps(f as any));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/?join=error#join');
  });

  it('303s to /thanks on a successful form post', async () => {
    const res = await handleJoin(formPost({ email: 'a@b.co' }), deps());
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/thanks');
  });
});
