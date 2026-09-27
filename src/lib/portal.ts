/** /api/portal — sends a buyer to the Stripe Customer Portal, keyed on the Checkout Session they came back from. */
import type { StripeApi } from './stripe/api';
import { idOf } from './stripe/api';
import { SESSION_ID } from './checkout';
import { fail, hostAllowed, json, originHost, readFields, seeOther, wantsJson } from './http';

export interface PortalDeps { stripe: StripeApi; allowedHosts: string[]; siteUrl: string }

export async function handlePortal(req: Request, deps: PortalDeps): Promise<Response> {
  if (!hostAllowed(originHost(req), deps.allowedHosts)) {
    return new Response('forbidden', { status: 403 });
  }
  const { session_id: sid = '' } = await readFields(req);
  if (!SESSION_ID.test(sid)) return fail(req, 400, 'That link has expired.', '/?portal=invalid#pro');

  const site = deps.siteUrl.replace(/\/$/, '');
  try {
    const session = await deps.stripe.checkout.sessions.retrieve(sid);
    const customer = idOf(session.customer);
    if (!customer) return fail(req, 404, 'No billing account for that purchase.', '/?portal=invalid#pro');
    const portal = await deps.stripe.billingPortal.sessions.create({
      customer,
      return_url: `${site}/checkout/done?session_id=${encodeURIComponent(sid)}`,
    });
    return wantsJson(req) ? json({ ok: true, url: portal.url }) : seeOther(portal.url);
  } catch (e) {
    console.error('portal: stripe failed', e instanceof Error ? e.message : e);
    return fail(req, 502, 'Couldn’t open billing — try again in a minute.', '/?portal=error#pro');
  }
}
