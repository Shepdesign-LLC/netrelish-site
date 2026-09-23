# Deploying netrelish-site

Vercel project: `netrelish` in team Shepdesign (`shepdesign-projects`). One-time setup, all in the Vercel dashboard:

1. **Un-pause.** Project → Settings → Advanced → Pause Project → Resume.
2. **Re-link Git.** Settings → Git → Disconnect `Shepdesign-LLC/NetRelish` → Connect `Shepdesign-LLC/netrelish-site`, production branch `main`.
3. **Root Directory.** Settings → General → Root Directory: leave **blank**. Framework Preset: Astro. Node: 22.x.
4. **Environment variables.** Settings → Environment Variables, for Production and Preview:
   `BENTO_PUBLISHABLE_KEY`, `BENTO_SECRET_KEY`, `BENTO_SITE_UUID` — from Bento → Settings → API keys. Mark them Sensitive.
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

## Verifying a deploy

```
curl -i -X POST -H 'origin: https://netrelish.com' -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}' https://netrelish.com/api/join
```

Expect `200 {"ok":true}`, then the subscriber in Bento with tag `netrelish-beta` and `signup_source = netrelish.com`.
