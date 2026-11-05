# Content Security Policy: report-only, then enforcing

Since 2026-11-05 every page (not `/api`, not `/_next`) sends `Content-Security-Policy-Report-Only`
(`next.config.ts`, `CSP_REPORT_ONLY`). Browsers block nothing; each violation is posted to `/api/csp-report`,
which logs one line `[csp-report] {"page", "directive", "blocked"}` (path only, never the query).

Framing is separate and already enforced: `frame-ancestors` / `X-Frame-Options` come from `src/proxy.ts`
(`src/lib/host-rules.ts`), per public host for the embed feature. Do not add `frame-ancestors` to this policy.

## Watch for a week

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="bill-scanner-app" AND textPayload:"[csp-report]"' --freshness=7d --limit=500 --format="value(textPayload)" | sort | uniq -c | sort -rn
```

For each line: a legitimate source (a Google sign-in host, a font, an image CDN) -> add it to the matching
directive; anything else (an injected script, a browser extension) -> leave it blocked.

## Promote to enforcing

1. In `next.config.ts` change the header key `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.
   The proxy already sends `Content-Security-Policy: frame-ancestors …` on pages: two CSP headers both apply
   (a resource must satisfy both), which is what we want -- do not merge them.
2. Keep `report-uri /api/csp-report` so new violations stay visible.
3. Deploy, sign in, and click through: login (Google popup / redirect), a public registration page embedded
   on the organization's web, the parent portal, the ticket scanner, a PDF preview.

## Known weakness

`script-src` allows `'unsafe-inline'`: Next.js injects inline bootstrap scripts, and a strict policy needs a
per-request nonce (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`), which makes every
page dynamically rendered. Do that (or the experimental SRI hashes) as a separate change if the risk warrants it.
