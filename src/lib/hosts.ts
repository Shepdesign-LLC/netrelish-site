/** Origins that may post to the server routes: production, local dev, and Vercel previews. */
export const ALLOWED_HOSTS = ['netrelish.com', 'localhost', 'vercel.app'];

/**
 * This site's brand tag. The Stripe account is shared across Shepdesign brands, so every Checkout Session and
 * subscription this site creates carries `metadata.site = SITE`, and the webhook ignores anything without it.
 * Fixed, not derived from the request origin, so a preview deployment's purchases are still ours.
 */
export const SITE = 'netrelish.com';
