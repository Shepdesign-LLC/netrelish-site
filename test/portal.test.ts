import { describe, it, expect, vi } from 'vitest';
import { handlePortal, PORTAL_WINDOW_SECONDS, type PortalDeps } from '../src/lib/portal';
import { fakeStripe, formPost, jsonPost } from './fakes';

const URL_ = 'https://netrelish.com/api/portal';
const deps = (over: Partial<PortalDeps> = {}): PortalDeps => ({ stripe: fakeStripe(), allowedHosts: ['netrelish.com'], siteUrl: 'https://netrelish.com', ...over });
const retrieving = (session: Record<string, unknown>) =>
  fakeStripe({ checkout: { sessions: { retrieve: vi.fn(async () => session) as never, create: vi.fn() as never } } });

describe('handlePortal', () => {
  it('rejects a foreign origin', async () => {
    expect((await handlePortal(formPost(URL_, { session_id: 'cs_test_1' }, 'https://evil.example'), deps())).status).toBe(403);
  });

  it('refuses anything that is not a Checkout Session id', async () => {
    for (const bad of ['', 'cus_1', 'cs_test_1; drop', 'cs_live_']) {
      const res = await handlePortal(jsonPost(URL_, { session_id: bad }), deps());
      expect(res.status).toBe(400);
    }
  });

  it('404s when the session has no customer', async () => {
    const d = deps({ stripe: retrieving({ id: 'cs_test_1', customer: null, created: 1 }) });
    expect((await handlePortal(jsonPost(URL_, { session_id: 'cs_test_1' }), d)).status).toBe(404);
  });

  it('303s to a portal session for the session’s customer, returning to the done page', async () => {
    const d = deps();
    const res = await handlePortal(formPost(URL_, { session_id: 'cs_live_abc123' }), d);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://billing.stripe.com/session/x');
    expect(d.stripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_live_abc123');
    expect(d.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'https://netrelish.com/checkout/done?session_id=cs_live_abc123' });
  });

  it('opens the brand’s own portal configuration when one is given', async () => {
    const d = deps({ configuration: 'bpc_netrelish' });
    await handlePortal(jsonPost(URL_, { session_id: 'cs_live_abc123' }), d);
    expect(d.stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1', configuration: 'bpc_netrelish' }));
  });

  it('lets the session id open billing for a day, then points at the license email', async () => {
    const created = 1_700_000_000;
    const inside = deps({ stripe: retrieving({ id: 'cs_test_1', customer: 'cus_1', created }), now: () => (created + PORTAL_WINDOW_SECONDS - 60) * 1000 });
    expect((await handlePortal(jsonPost(URL_, { session_id: 'cs_test_1' }), inside)).status).toBe(200);

    const late = deps({ stripe: retrieving({ id: 'cs_test_1', customer: 'cus_1', created }), now: () => (created + PORTAL_WINDOW_SECONDS + 60) * 1000 });
    const res = await handlePortal(jsonPost(URL_, { session_id: 'cs_test_1' }), late);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ ok: false, error: expect.stringContaining('license email') });
    expect(late.stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    const form = await handlePortal(formPost(URL_, { session_id: 'cs_test_1' }), late);
    expect(form.headers.get('location')).toBe('/?portal=expired#pro');
  });

  it('502s when Stripe fails', async () => {
    const d = deps({ stripe: fakeStripe({ checkout: { sessions: { retrieve: vi.fn(async () => { throw new Error('boom'); }) as never, create: vi.fn() as never } } }) });
    const res = await handlePortal(formPost(URL_, { session_id: 'cs_test_1' }), d);
    expect(res.headers.get('location')).toBe('/?portal=error#pro');
  });
});
