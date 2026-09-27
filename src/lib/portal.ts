/** /api/portal — sends a buyer to the Stripe Customer Portal, keyed on the Checkout Session they came back from. */
import type { StripeApi } from './stripe/api';
import { idOf } from './stripe/api';
import { SESSION_ID } from './checkout';
import { fail, hostAllowed, json, originHost, readFields, seeOther, wantsJson } from './http';

export interface PortalDeps {
  stripe: StripeApi;
  allowedHosts: string[];
  siteUrl: string;
  /** Portal configuration to open (`bpc_…`, from scripts/stripe-portal.mjs). Unset opens the account's default one. */
  configuration?: string;
  /** How long after Checkout the session id still opens the portal. Defaults to PORTAL_WINDOW_SECONDS. */
  windowSeconds?: number;
  /** Clock, for tests. */
  now?: () => number;
}

/**
 * A Checkout Session id sits in the done page's URL — browser history, a bookmark, a shared screenshot. It opens billing
 * for a day, not forever; after that the buyer uses the portal login page linked from the license email.
 */
export const PORTAL_WINDOW_SECONDS = 24 * 60 * 60;

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
    const ageSeconds = (deps.now ?? Date.now)() / 1000 - session.created;
    if (ageSeconds > (deps.windowSeconds ?? PORTAL_WINDOW_SECONDS)) {
      return fail(req, 410, 'That link has expired — use the billing link in your license email.', '/?portal=expired#pro');
    }
    const portal = await deps.stripe.billingPortal.sessions.create({
      customer,
      return_url: `${site}/checkout/done?session_id=${encodeURIComponent(sid)}`,
      ...(deps.configuration ? { configuration: deps.configuration } : {}),
    });
    return wantsJson(req) ? json({ ok: true, url: portal.url }) : seeOther(portal.url);
  } catch (e) {
    console.error('portal: stripe failed', e instanceof Error ? e.message : e);
    return fail(req, 502, 'Couldn’t open billing — try again in a minute.', '/?portal=error#pro');
  }
}
