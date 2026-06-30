# Free Cloud Deployment

Axiomic's web app is a fully static PWA, so it can be hosted **free** on any
static host. This feature adds drop-in deployment config and automation, plus a
comprehensive guide.

## What you get

- **One recommended free path:** Cloudflare Pages (PWA) + Cloudflare Workers
  (optional proxy) — both free, one account, native support for the required
  cross-origin-isolation headers.
- **Drop-in host config** committed to the repo:
  - [`web/public/_headers`](../../web/public/_headers) — COOP/COEP + caching
    (Cloudflare Pages & Netlify).
  - [`web/public/_redirects`](../../web/public/_redirects) — SPA fallback.
  - [`web/vercel.json`](../../web/vercel.json) — Vercel build + headers + rewrite.
  - [`web/netlify.toml`](../../web/netlify.toml) — Netlify build + headers.
- **CI workflows** for hands-off deploys:
  - [`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)
    — build WASM + PWA and deploy to Cloudflare Pages on push to `main`.
  - [`.github/workflows/deploy-proxy.yml`](../../.github/workflows/deploy-proxy.yml)
    — deploy the optional proxy when `proxy/**` changes.

## How to use it

Fastest manual deploy:

```bash
cd web && pnpm install && pnpm wasm && pnpm build
npx wrangler pages deploy dist --project-name axiomic
```

Automated: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository
secrets, then push to `main`.

Full walkthrough, free-tier comparison, custom domains, and troubleshooting:
**[docs/DEPLOYMENT.md](../DEPLOYMENT.md)**.

## Why the headers

Cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` +
`Cross-Origin-Embedder-Policy: require-corp`) unlocks `SharedArrayBuffer` / WASM
threads. The app runs fine single-threaded without them, but enabling them on a
free host costs nothing. They're pre-wired for every supported host; GitHub
Pages is the one option that can't set them (documented in the guide).
