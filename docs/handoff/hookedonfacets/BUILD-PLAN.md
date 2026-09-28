# hookedonfacets.com — Build plan (Bricks + Freemius)

**Goal.** Make hookedonfacets.com the single marketing + commerce site for Hooked on Facets, sell Pro through Freemius, and have the whole thing repeatable from a local staging site before the first beta tester touches it.

**Stack decision (Optimal Path)**

| Layer | Choice | Why |
|---|---|---|
| CMS / builder | WordPress + Bricks (already installed) | Site is also the live demo of the plugin. Design system ports 1:1 from `BRAND.md`. |
| Commerce + licensing | **Freemius** (merchant of record) | Checkout, tax/VAT, licenses, activations, updates, refunds, affiliates and the account portal come for free. No Woo, no EDD, no Stripe code to maintain. |
| Demo catalog | WooCommerce + `bin/seed-products.php` (36 products) | Woo is only there to power the `/demo` page. No Woo checkout is exposed. |
| Local staging | Studio (WordPress.com) or LocalWP, mirrored to git via BricksSync JSON | Design lives in a repo, not just a database. |
| Plugin distribution | Freemius deployment → free ZIP (WP.org) + Pro add-on ZIP | Replaces the EDD scaffold and `bin/build-release.sh`'s licensing assumptions. |

> **Stripe note.** Freemius is merchant of record, so the HoF catalog seeded into Stripe account `acct_1UKCieIKm3jFyre7` is redundant for this plan. Leave it dormant (or archive the three `hof_*` products); do not wire a webhook for it. Freemius pays out to a bank/PayPal, not to your Stripe account.

---

## Phase map

```mermaid
gantt
    title hookedonfacets.com runway
    dateFormat  YYYY-MM-DD
    section 0 · Access
    Attach hooked-on-facets-pro repo         :a0, 2026-09-28, 1d
    section 1 · Freemius
    Create product + Pro add-on + plans       :f1, 2026-09-28, 1d
    SDK into core + add-on, delete EDD code   :f2, after f1, 3d
    Deployment pipeline (free + pro ZIPs)     :f3, after f2, 2d
    section 2 · Bricks
    Design system import (tokens, styles)     :b1, 2026-09-29, 1d
    Templates: header, footer, page, docs     :b2, after b1, 2d
    Pages: home, pricing, demo, docs, legal   :b3, after b2, 4d
    section 3 · Staging → prod
    BricksSync export to git, push to prod    :s1, after b3, 1d
    Freemius sandbox purchase + activation QA :s2, after f3, 1d
    section 4 · Beta
    Invite beta testers (founder pricing)     :beta, after s2, 1d
```

---

## Phase 0 · Access (blocked on you, 2 minutes)

`hooked-on-facets-pro` is private and this session has no GitHub credential for it, so the SDK wiring into the add-on can't be committed from here yet. Either:

1. Connect GitHub for this workspace: <https://claude.ai/connect-github>, then start a session with **both** `hooked-on-facets` and `hooked-on-facets-pro` selected, or
2. Start a new Claude Code session with `hooked-on-facets-pro` selected as a source.

Everything in Phases 1–3 that touches the public core repo can proceed without it; the add-on work is the only dependency.

---

## Phase 1 · Freemius (see `FREEMIUS.md` for the click-by-click)

1. **Products.** Create `Hooked on Facets` (free, WP.org-listed) and an **add-on** `Hooked on Facets Pro` under it. The add-on carries all paid plans. This matches the code split that already exists: the core is free on WP.org, the six signature facets ship in the Pro plugin.
2. **Plans** on the add-on (annual, per-site bulk pricing):

   | Plan | Sites | Price / yr | Renewal | Notes |
   |---|---|---|---|---|
   | Personal | 1 | $99 | 50% off (product-level renewals discount) | |
   | Plus | 5 | $199 | 50% off | mark **Featured** |
   | Agency | 25 | $399 | 50% off | |

   Founder pricing for beta = a Freemius **coupon** (`FOUNDER`, e.g. 30% off first year, limited redemptions, expiry) rather than a separate plan, so the public price table never changes.
3. **SDK.** `vendor/freemius/` in the core; `fs_dynamic_init()` in `hooked-on-facets.php` (parent) and in the add-on's main file with `parent.id` set. Delete `src/Licensing/` from the pro repo, the `HOF_LICENSE_*` constants and the EDD updater; the React `LicenseSettings.jsx` screen becomes a link to Freemius' Account page.
4. **Deployment.** Upload one ZIP per release to Freemius; it produces the free and premium builds. `bin/build-release.sh` keeps building the core ZIP; the pro repo gets a sibling script that builds the add-on ZIP.
5. **Sandbox QA.** Sandbox checkout → license → activate on staging → auto-update from Freemius CDN.

---

## Phase 2 · Bricks (see `BRICKS.md`)

1. **Design system in.** Import `hof-tokens.css` as Bricks global variables + global classes; set Theme Styles (typography, colors, buttons, forms, radii) from `BRAND.md`.
2. **Templates.** Header, Footer, Single page, Docs single (with left nav), 404.
3. **Pages** (copying the live hookedonfacets.com layout and the launch-checklist outline):
   - `/` Home: hero, problem, speed proof (54 ms p95, 16 facet types, 0 frameworks), facet showcase, builder support, sources, pricing teaser, FAQ.
   - `/pricing` Free / Personal / Plus / Agency, Freemius checkout buttons, "Renewals at half price", founder-pricing banner.
   - `/demo` Woo shop archive with the plugin's own facets on the seeded catalog.
   - `/docs/*` Getting started, facets, builders, sources, Pro, FAQ (imported from `docs/*.md`).
   - `/account` → Freemius account portal link (license keys, invoices, cancel).
   - `/privacy`, `/terms`, `/refunds` (Freemius' 7-day refund default).
4. **Checkout wiring.** Buy buttons use the Freemius Checkout JS overlay (inline on `/pricing`) with hosted checkout URLs as the no-JS fallback.

---

## Phase 3 · Local staging → production

1. Local: Studio/LocalWP site `hookedonfacets.local` with WordPress, Bricks, WooCommerce, HoF core (from the repo), HoF Pro (from the repo), Freemius-for-WordPress plugin, BricksSync.
2. Git: a new repo `hookedonfacets-site` holding `bricks/` (BricksSync JSON exports), `hof-tokens.css`, the child theme, and `docs/` content source. The plugin repos stay separate.
3. Promote: BricksSync import on production, or Bricks Global Import/Export ZIP for the one-time first cut, then WP Migrate/Duplicator for the Woo demo catalog.
4. Production checklist: Freemius live mode, `FS__DEV_MODE` off, SSL, Bricks license active on prod domain, uptime + error monitoring, backups.

---

## Phase 4 · Beta readiness ("make HoF legit")

- [ ] Freemius Pro add-on in **live** mode with the three plans and the `FOUNDER` coupon.
- [ ] A real purchase (your own card, then refund) proves checkout → email → license → activation → update.
- [ ] `/pricing`, `/docs`, `/demo` all pass Lighthouse ≥ 90 on mobile.
- [ ] Support inbox (`support@hookedonfacets.com`) wired to Freemius' contact form or a shared inbox.
- [ ] Legal pages published; AI "Ask" facet disclosure present (queries go to Anthropic).
- [ ] WP.org submission of the free core (see `docs/wporg-submission.md`) with the Freemius SDK included and opt-in enabled.
- [ ] Beta invite email with the founder coupon, feedback form, and the demo link.

---

## What I need from you to keep moving

| # | Item | Why |
|---|---|---|
| 1 | Attach `hooked-on-facets-pro` (Phase 0) | Freemius SDK into the add-on, delete `src/Licensing/` |
| 2 | Freemius **product ID**, **public key**, **add-on ID** after you create them | Fill the `fs_dynamic_init()` snippet and the checkout buttons |
| 3 | Bricks staging site export (Global Export ZIP) or SSH/WP-CLI access to the local | So I can hand you importable JSON instead of screenshots |
