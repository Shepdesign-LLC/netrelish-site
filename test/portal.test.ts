import { describe, it, expect, vi } from 'vitest';
import { handlePortal, type PortalDeps } from '../src/lib/portal';
import { fakeStripe, formPost, jsonPost } from './fakes';

const URL_ = 'https://netrelish.com/api/portal';
const deps = (over: Partial<PortalDeps> = {}): PortalDeps => ({ stripe: fakeStripe(), allowedHosts: ['netrelish.com'], siteUrl: 'https://netrelish.com', ...over });

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
    const d = deps({ stripe: fakeStripe({ checkout: { sessions: { retrieve: vi.fn(async () => ({ id: 'cs_test_1', customer: null })) as never, create: vi.fn() as never } } }) });
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

  it('502s when Stripe fails', async () => {
    const d = deps({ stripe: fakeStripe({ checkout: { sessions: { retrieve: vi.fn(async () => { throw new Error('boom'); }) as never, create: vi.fn() as never } } }) });
    const res = await handlePortal(formPost(URL_, { session_id: 'cs_test_1' }), d);
    expect(res.headers.get('location')).toBe('/?portal=error#pro');
  });
});
