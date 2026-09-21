# Deploying netrelish-site

Vercel project: `netrelish` in team Shepdesign (`shepdesign-projects`). One-time setup, all in the Vercel dashboard:

1. **Un-pause.** Project → Settings → Advanced → Pause Project → Resume.
2. **Re-link Git.** Settings → Git → Disconnect `Shepdesign-LLC/NetRelish` → Connect `Shepdesign-LLC/netrelish-site`, production branch `main`.
3. **Root Directory.** Settings → General → Root Directory: leave **blank**. Framework Preset: Astro. Node: 22.x.
4. **Environment variables.** Settings → Environment Variables, for Production and Preview:
   `BENTO_PUBLISHABLE_KEY`, `BENTO_SECRET_KEY`, `BENTO_SITE_UUID` — from Bento → Settings → API keys. Mark them Sensitive.
5. **Domain.** Settings → Domains → Add `netrelish.com` (and `www.netrelish.com`, redirect to apex). At the registrar add the records Vercel shows (typically `A @ → 76.76.21.21` and `CNAME www → cname.vercel-dns.com`; Vercel's page is the source of truth).
6. Push to `main` deploys. PRs get a preview URL.

Nothing else. No analytics, no Speed Insights — leave both off; the site's network rule forbids them.

## Verifying a deploy

```
curl -i -X POST -H 'origin: https://netrelish.com' -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}' https://netrelish.com/api/join
```

Expect `200 {"ok":true}`, then the subscriber in Bento with tag `netrelish-beta` and `signup_source = netrelish.com`.
