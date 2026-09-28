/** Origins that may post to the server routes: production, local dev, and Vercel previews. */
export const ALLOWED_HOSTS = ['netrelish.com', 'localhost', 'vercel.app'];

/**
 * This site's brand tag. Every Checkout Session and subscription this site creates carries `metadata.site = SITE`, and the
 * webhook ignores anything without it. On NetRelish's own Stripe account that is insurance — a Dashboard test charge or a
 * future second product never becomes a Pro license by accident. Fixed, not derived from the request origin, so a preview
 * deployment's purchases are still ours.
 */
export const SITE = 'netrelish.com';
