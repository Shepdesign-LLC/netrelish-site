# Hooked on Facets website — the plain-English guide

Read this top to bottom. Do the steps in order. Every step says **who does it** (you or me) and **how you know it's done**.

The other files in this folder (`BUILD-PLAN.md`, `FREEMIUS.md`, `BRICKS.md`) are the deep-dive versions. You don't need them to follow this one.

---

## The big picture (30 seconds)

You are building **one website**: hookedonfacets.com.

It does three jobs:

| Job | What it means | What powers it |
|---|---|---|
| **Show off the plugin** | Home page, features, live demo, docs | WordPress + Bricks (the page builder you already installed) |
| **Sell the Pro version** | Pricing page with "Buy" buttons | **Freemius** (they take the money, send the license key, handle refunds and taxes) |
| **Give updates to paying customers** | Pro plugin updates itself | Freemius (built in, nothing for you to run) |

**Freemius replaces the Stripe stuff.** You don't need the Hooked on Facets Stripe account for this. Leave it alone.

**Two plugins, not one:**

- `hooked-on-facets` = the **free** plugin. Goes on WordPress.org.
- `hooked-on-facets-pro` = the **paid** add-on with the fancy facets (Ask, Visual DNA, swipe deck, wheel, matrix, comparison bin). Sold through Freemius.

Prices (same as the live site today):

| Plan | Sites | Per year | Renewal price |
|---|---|---|---|
| Free | unlimited | $0 | – |
| Personal | 1 | $99 | $49.50 (half off) |
| Plus | 5 | $199 | $99.50 (half off) |
| Agency | 25 | $399 | $199.50 (half off) |

Beta testers get a **coupon code** (`FOUNDER`) for a discount. The prices above never change.

---

## Step 1 — Give me access to the Pro plugin repo  (YOU · 2 minutes)

**Why:** I can see the free plugin. I can't see `hooked-on-facets-pro` because it's private and this session has no key for it.

**Do this:**

1. Go to <https://claude.ai/connect-github> and connect GitHub if it isn't already.
2. Start a **new Claude Code session** and pick **both** repos as sources: `hooked-on-facets` and `hooked-on-facets-pro`.
3. Paste this folder's files in, or just say "continue the hookedonfacets.com build".

**Done when:** I can read files inside `hooked-on-facets-pro`.

---

## Step 2 — Create the products in Freemius  (YOU · 15 minutes)

**Why:** Freemius needs to know what you're selling before any code or buttons can point at it.

**Do this** at <https://dashboard.freemius.com>:

1. Click **Add product** → **Plugin**.
   - Name: `Hooked on Facets`
   - Slug: `hooked-on-facets`
   - It's the **free** one. Leave "has paid plans" off.
2. Open that product → **Settings → Keys**. Copy the **Product ID** (a number) and the **Public key** (starts with `pk_`). Paste both somewhere safe.
3. Same product → **Add-ons** tab → **Add add-on**.
   - Name: `Hooked on Facets Pro`
   - Slug: `hooked-on-facets-pro`
4. Open the add-on → **Settings → Keys**. Copy its **ID** and **Public key** too.
5. Add-on → **Plans** → create three plans:
   - `Personal` → 1 license → $99 → billing cycle **Annual**
   - `Plus` → 5 licenses → $199 → Annual → tick **Featured**
   - `Agency` → 25 licenses → $399 → Annual
   - For each plan copy the **Plan ID** (a number).
6. Add-on → **Settings** → find **Renewals discount** → set **50%**.
7. Add-on → **Coupons** → **Add coupon**:
   - Code: `FOUNDER`
   - Discount: 30% (or whatever you want beta testers to get)
   - Applies to: first payment only
   - Limit: 50 uses, expiry = end of beta
8. Freemius **Settings → Payouts**: add bank/PayPal and fill the tax form. (They can't pay you without it.)

**Send me:** the core Product ID + public key, the add-on ID + public key, and the three Plan IDs. Six numbers, two keys.

**Done when:** you see three plans under the add-on and I have those IDs.

---

## Step 3 — Put Freemius inside the plugins  (ME · after steps 1 & 2)

**Why:** The plugin has to "phone home" to Freemius to check the license and get updates. Today it has an old Easy Digital Downloads license system that was never finished. That gets deleted.

**I do this:**

- Add the Freemius SDK to the free plugin (`freemius-bootstrap.php` in this folder is the code, just needs your IDs pasted in).
- Add it to the Pro add-on and delete the old license code (`src/Licensing/`, the `HOF_LICENSE_*` settings, the old updater, the license screen).
- Lock the six Pro facets behind "does this site have a valid license?" Unlicensed sites still work, they just see a notice and don't get updates.
- Open pull requests in both repos for you to merge.

**Done when:** both PRs are merged and the plugin's admin shows a Freemius "Account" page.

---

## Step 4 — Upload the plugins to Freemius  (YOU · 5 minutes, repeat every release)

**Why:** Freemius is also the download server. Customers get the Pro ZIP from Freemius, not from you.

**Do this:**

1. In the free plugin repo run `bin/build-release.sh`. You get `dist/hooked-on-facets-<version>.zip`.
2. In the Pro repo run its `bin/build-release.sh` (I'll add it in step 3). You get `dist/hooked-on-facets-pro-<version>.zip`.
3. Freemius → Hooked on Facets → **Deployment** → upload the free ZIP → **Release**.
4. Freemius → Hooked on Facets Pro → **Deployment** → upload the Pro ZIP → **Release**.

**Done when:** both show a version number under Deployment.

---

## Step 5 — Build the site locally  (YOU + ME · a few sessions)

**Why:** Build and break things on your laptop, not on the live domain.

**You set up (once):**

1. Install **Studio** (free, from WordPress.com) or **LocalWP**. Make a site called `hookedonfacets`.
2. Install these plugins on it: **Bricks** (theme), **WooCommerce**, **Hooked on Facets**, **Hooked on Facets Pro**, **BricksSync** (saves Bricks designs as files so we can put them in git).
3. In `wp-config.php` add one line so Freemius lets you make fake test purchases:
   ```php
   define( 'WP_FS__DEV_MODE', true );
   ```
4. Run the plugin's `bin/seed-products.sh` so the demo shop has 36 products.

**I do:**

- Give you the design system for Bricks. `hof-tokens.css` in this folder is the colours, fonts, spacing and button styles from `BRAND.md`. You paste it into **Bricks → Settings → Custom code → Custom CSS**.
- Give you the page-by-page layout to build (it's in `BRICKS.md`). Short version, the pages are:

| Page | What's on it |
|---|---|
| **Home** | Big headline "Filters your visitors will actually use.", "Get hooked" button, speed numbers, facet examples, builder logos, pricing teaser, FAQ |
| **Pricing** | The 4 plans with Buy buttons that open Freemius checkout |
| **Demo** | The WooCommerce shop with all the facets turned on |
| **Docs** | The plugin's docs (I convert the `docs/*.md` files into pages) |
| **Thanks** | "Check your email for the license key" after a purchase |
| **Privacy / Terms / Refunds** | Legal. Refunds = 7 days (Freemius default) |

- Write the Buy button code. Each button opens the Freemius checkout popup. If JavaScript is off it just links to Freemius' own checkout page. Both are in `FREEMIUS.md` section 5.

**Done when:** you can click Buy on the local pricing page, do a fake purchase, get a license key by email, paste it into the plugin, and see "Pro active".

---

## Step 6 — Move it to the live site  (YOU + ME · 1 session)

**Do this:**

1. On the local site: **Bricks → Settings → Global Import/Export → Export** everything. Commit the BricksSync files to git too.
2. On hookedonfacets.com: same screen → **Import** that file.
3. Copy the demo shop products and images over (Duplicator or WP Migrate, either is fine).
4. Make sure the live `wp-config.php` does **not** have `WP_FS__DEV_MODE`.
5. Buy Personal with your own card on the live site. Then refund yourself in Freemius. If the key arrived and activated, the store works.

**Done when:** the live pricing page sells, and you got a real license email.

---

## Step 7 — Let beta testers in  (YOU · when step 6 is done)

Checklist. Tick every box before you send the invite:

- [ ] Real purchase + refund worked (step 6.5)
- [ ] `FOUNDER` coupon works at `https://hookedonfacets.com/pricing/?coupon=FOUNDER`
- [ ] Privacy page says the "Ask" facet sends the typed question to Anthropic (legally required)
- [ ] `support@hookedonfacets.com` exists and you check it
- [ ] Home, Pricing and Demo score 90+ on Google PageSpeed (mobile)
- [ ] Free plugin submitted to WordPress.org (see `docs/wporg-submission.md` in the plugin repo)

Then send the invite email with: the coupon code, the demo link, and a feedback form.

---

## Cheat sheet — who does what

| Step | Who | Blocked until |
|---|---|---|
| 1. Repo access | You | – |
| 2. Freemius products | You | – |
| 3. Freemius in the code | Me | 1 and 2 |
| 4. Upload ZIPs | You | 3 |
| 5. Build local site | Both | 2 |
| 6. Go live | Both | 4 and 5 |
| 7. Beta | You | 6 |

Steps 1, 2 and 5-setup can all happen today, in any order.

---

## Words you'll see, explained

- **Freemius** – a company that sells WordPress plugins for you. They run the checkout, collect tax, email the license, host the download, and pay you out. In exchange they take a cut.
- **Merchant of record** – the legal seller. Freemius is it, so refunds, VAT and chargebacks are their problem, not yours.
- **SDK** – a small folder of code you put inside the plugin so it can talk to Freemius.
- **Add-on** – Freemius' word for a paid plugin that plugs into a free one. Ours is Hooked on Facets Pro.
- **Plan** – one pricing option (Personal, Plus, Agency).
- **License / activation** – the key a customer pastes in. "Activation" is using it on a site. Personal = 1 site, Plus = 5, Agency = 25.
- **Bricks** – the page builder theme already on your site.
- **BricksSync** – a helper plugin that saves Bricks designs as text files so they can live in git and be copied to another site.
- **Theme Styles / Global classes** – Bricks' way of setting fonts, colours and reusable styles once instead of on every page.
- **Staging / local** – a copy of the site on your computer where nothing you break matters.
- **WP.org** – WordPress.org's free plugin directory. The free plugin lives there; the Pro one never does.
