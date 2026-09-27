# netrelish-site

The site for NetRelish, a Mac browser with a pantry. One page, Astro, plain CSS on the design tokens from the app repo. Deployed to netrelish.com on Vercel.

- `design/` is a byte-for-byte copy of `Shepdesign-LLC/NetRelish/design` at the commit in `design/SOURCE`. Never edit it here; bump `SOURCE` and copy.
- `npm run ci` is what CI runs: design drift, type check, tests, build, network rule, relish audit.
- `/api/join` forwards a beta signup to Bento. It needs `BENTO_PUBLISHABLE_KEY`, `BENTO_SECRET_KEY`, `BENTO_SITE_UUID` in the environment.
- `/api/checkout`, `/api/portal` and `/api/stripe/webhook` are the store: Stripe-hosted Checkout and Portal, license keys on payment. They need `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LICENSE_SECRET`; `PUBLIC_STORE_OPEN=true` at build time shows the buy buttons. See `docs/STRIPE.md`.

Code is MIT. The NetRelish name, `logo.svg`, and `logo-cog.svg` are all rights reserved and excluded from the license.
