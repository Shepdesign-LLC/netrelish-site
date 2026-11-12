# Deploying netrelish-site

Vercel project: `netrelish` in team Shepdesign (`shepdesign-projects`). One-time setup, all in the Vercel dashboard:

1. **Un-pause.** Project → Settings → Advanced → Pause Project → Resume.
2. **Re-link Git.** Settings → Git → Disconnect `Shepdesign-LLC/NetRelish` → Connect `Shepdesign-LLC/netrelish-site`, production branch `main`.
3. **Root Directory.** Settings → General → Root Directory: leave **blank**. Framework Preset: Astro. Node: 22.x.
4. **Environment variables.** Settings → Environment Variables, for Production and Preview:
   `BENTO_PUBLISHABLE_KEY`, `BENTO_SECRET_KEY`, `BENTO_SITE_UUID` — from Bento → Settings → API keys. Mark them Sensitive.
   For the store: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LICENSE_SECRET` (Sensitive), `STRIPE_PORTAL_CONFIG`, and `PUBLIC_STORE_OPEN=true`
   on Production only when it's time to sell. Setup order is in `docs/STRIPE.md`.
   For the license relay: `CREEM_API_KEY` (Sensitive), and `CREEM_API_BASE` only for test mode. See "License relay" below.
5. **Domain.** Settings → Domains → Add `netrelish.com` (and `www.netrelish.com`, redirect to apex). At the registrar add the records Vercel shows (typically `A @ → 76.76.21.21` and `CNAME www → cname.vercel-dns.com`; Vercel's page is the source of truth).
6. **Web Analytics.** Settings → Analytics → enable Web Analytics. The site already injects the
   script (`webAnalytics: { enabled: true }` on the adapter); without the dashboard toggle the
   beacon is dropped and you get no numbers.
7. Push to `main` deploys. PRs get a preview URL.

**Speed Insights stays off.** It is a separate product and has not been assessed against the
network rule.

Web Analytics was off until 2026-09-23, on the grounds that "the site's network rule forbids
them." That reason was wrong, and it is worth writing down why so it is not re-applied by
reflex. In a production build the adapter injects a **relative** path:

```js
script.src = '/_vercel/insights/script.js';   // same origin, no foreign host
```

`npm run check:network` scans the build for absolute URLs to hosts outside its allowlist, so a
same-origin path was never going to trip it — and doesn't. (The `astro dev` build injects
`https://cdn.vercel-insights.com/...` instead, which never reaches `dist/`.) The rule is about
what a visitor's browser is made to contact, and on that test Web Analytics is clean: no cookie,
no identifier, no cross-site tracking. The data does reach Vercel, who already host the site and
serve every request, and `privacy.astro` says so in plain words.

## License relay (`/api/license`)

The direct build of the app sells Pro through Creem. Creem's license API needs the store's secret key, so the app
can't call it. `/api/license` holds the key and passes on a license key and an instance name or id. Nothing else
reaches it, and it logs only the action and the status Creem returned.

**Set it up.** Vercel → Project → Settings → Environment Variables, for Production and Preview:

- `CREEM_API_KEY`: the secret API key from the Creem dashboard. Mark it Sensitive. Without it, the route answers `503`.
- `CREEM_API_BASE`: leave it unset for live sales. Set it to `https://test-api.creem.io` to use Creem's test mode, with a
  test-mode key. Any other value turns the route off (`503`), so a typo can't send keys to another host.

Redeploy after changing either one.

**Contract.** `POST`, `content-type: application/json`, body at most 2 KB. Exactly one of:

```json
{ "action": "activate",   "key": "…", "instance_name": "…" }
{ "action": "validate",   "key": "…", "instance_id": "…" }
{ "action": "deactivate", "key": "…", "instance_id": "…" }
```

`key` is 8–128 of `A–Z a–z 0–9 _ -`. `instance_name` is 1–64 printable ASCII characters. `instance_id` is 1–128 of
`A–Z a–z 0–9 _ -`. A missing field, an extra field, or an unknown action is a `400`.

| Reply | Means |
| --- | --- |
| `200 {"status", "instance_id", "expires_at"}` | Creem answered. `status` is `active`, `inactive`, `expired`, `disabled` or `unknown`. The other two are strings or `null`. |
| `404 {"status":"invalid"}` | Creem doesn't know that key or instance. |
| `409 {"status":"rejected"}` | Creem refused, for example at the activation limit or on an instance already deactivated. |
| `502 {"error":"upstream"}` | Creem failed, timed out after 10 s, or sent something we can't read. Also Creem `401`, `403` and `429`: those are about our key or our rate, not the buyer's license. The app should keep its last answer and try again later. |
| `503 {"error":"not_configured"}` | `CREEM_API_KEY` is unset or `CREEM_API_BASE` is not a Creem host. |
| `400`, `405`, `413`, `415` | Bad body, wrong method, body over 2 KB, wrong content type. |

Every reply is JSON with `cache-control: no-store`. There are no CORS headers: the caller is the app, not a browser.

**It has to survive the WordPress cutover.** The site moves to WordPress on WP Engine the week of Jan 4, 2027 (ADR 0016
in the app repo). Shipped apps have `https://netrelish.com/api/license` built in. Before the DNS switch, this
relay must answer at that same URL, with the same contract, from wherever the site lives. If it doesn't, every copy of
the direct build in the field loses activation.

**Check it.** A made-up key should come back `404` or `409`. A `502` or `503` means the relay itself isn't set up right.

```
curl -i -X POST -H 'content-type: application/json' \
  -d '{"action":"validate","key":"NOTAREALKEY1","instance_id":"none"}' https://netrelish.com/api/license
```

## Verifying a deploy

```
curl -i -X POST -H 'origin: https://netrelish.com' -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}' https://netrelish.com/api/join
```

Expect `200 {"ok":true}`, then the subscriber in Bento with tag `netrelish-beta` and `signup_source = netrelish.com`.
