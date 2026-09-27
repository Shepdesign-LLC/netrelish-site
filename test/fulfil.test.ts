import { describe, it, expect, vi } from 'vitest';
import { bentoFulfiller } from '../src/lib/fulfil';
import { bentoClient } from '../src/lib/bento';

const env = { BENTO_PUBLISHABLE_KEY: 'pk', BENTO_SECRET_KEY: 'sk', BENTO_SITE_UUID: 'uuid' };

describe('bentoFulfiller', () => {
  it('stores the key on the subscriber, tags them, then fires the issued event', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await bentoFulfiller(bentoClient(env, f as never))({ type: 'license.issued', email: 'a@b.co', plan: 'pro-year', key: 'NR-1', customer: 'cus_1', subject: 'sub_1' });
    expect(f).toHaveBeenCalledTimes(2);
    const [subUrl, subInit] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(subUrl).toBe('https://app.bentonow.com/api/v1/batch/subscribers?site_uuid=uuid');
    expect(JSON.parse(subInit.body as string)).toEqual({ subscribers: [{ email: 'a@b.co', tags: 'netrelish-pro', license_key: 'NR-1', license_plan: 'pro-year', stripe_customer: 'cus_1' }] });
    const [, evInit] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(evInit.body as string)).toEqual({ events: [{ type: '$netrelish_license_issued', email: 'a@b.co', details: { plan: 'pro-year', key: 'NR-1', customer: 'cus_1', subject: 'sub_1' } }] });
  });

  it('fires one event for everything else', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await bentoFulfiller(bentoClient(env, f as never))({ type: 'payment.failed', email: 'a@b.co', plan: 'pro-year', customer: 'cus_1', payUrl: 'https://invoice.stripe.com/i/x' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).events[0].type).toBe('$netrelish_payment_failed');
  });

  it('throws when Bento rejects, so the webhook returns 500 and Stripe retries', async () => {
    const f = vi.fn(async () => new Response('nope', { status: 500 }));
    await expect(bentoFulfiller(bentoClient(env, f as never))({ type: 'license.ended', email: 'a@b.co', plan: 'x', customer: 'cus_1', subscription: 'sub_1' })).rejects.toThrow(/bento/);
  });
});
