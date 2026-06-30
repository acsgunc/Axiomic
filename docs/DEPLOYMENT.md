# Deploying Axiomic for Free

Axiomic's web app is a **fully static PWA** — the build output in `web/dist` is
just HTML, JS, CSS and a `.wasm` blob. That means it can be hosted **free**, with
no server, on any static host. The only special requirement is two HTTP response
headers (explained [below](#why-the-coopcoep-headers-matter)).

This guide covers:

- [TL;DR — fastest free deploy](#tldr--fastest-free-deploy)
- [Choosing a host (free-tier comparison)](#choosing-a-host-free-tier-comparison)
- [Recommended: Cloudflare Pages](#recommended-cloudflare-pages)
- [Automated deploys with GitHub Actions](#automated-deploys-with-github-actions)
- [Alternative: Vercel](#alternative-vercel)
- [Alternative: Netlify](#alternative-netlify)
- [Alternative: GitHub Pages (with caveats)](#alternative-github-pages-with-caveats)
- [Optional: deploy the live-data proxy](#optional-deploy-the-live-data-proxy)
- [Why the COOP/COEP headers matter](#why-the-coopcoep-headers-matter)
- [Custom domain](#custom-domain)
- [Troubleshooting](#troubleshooting)

---

## TL;DR — fastest free deploy

```bash
# from the repo root
cd web
pnpm install
pnpm wasm          # build the Rust core → WebAssembly (needs Rust + wasm-pack)
pnpm build         # → web/dist (static PWA)

# deploy the folder to Cloudflare Pages (free, no credit card)
npx wrangler pages deploy dist --project-name axiomic
```

Your app is now live at `https://axiomic.pages.dev`. The COOP/COEP headers are
applied automatically from [`web/public/_headers`](../web/public/_headers).

**Prerequisites for any build:** Rust + `wasm-pack` (`rustup target add
wasm32-unknown-unknown && cargo install wasm-pack`), Node 18+, and pnpm 9+.
See the [README prerequisites](../README.md#prerequisites).

---

## Choosing a host (free-tier comparison)

All four options below have a genuinely free tier suitable for this app.

| Host | Free tier | Custom HTTP headers (COOP/COEP) | Same account as proxy | Best for |
| --- | --- | --- | --- | --- |
| **Cloudflare Pages** ⭐ | Unlimited sites, unlimited bandwidth, 500 builds/mo | ✅ `_headers` file | ✅ Workers proxy lives here too | **Recommended** — one provider for app + proxy |
| **Vercel** | Hobby: 100 GB bandwidth/mo | ✅ `vercel.json` | ❌ (proxy stays on Cloudflare) | Great DX, instant previews |
| **Netlify** | 100 GB bandwidth/mo, 300 build-min/mo | ✅ `netlify.toml` / `_headers` | ❌ | Simple drag-and-drop deploys |
| **GitHub Pages** | Unlimited public repos | ❌ **cannot set COOP/COEP** | ❌ | Only if you accept single-threaded (see caveats) |

**Recommendation: Cloudflare Pages.** It is free with no bandwidth cap, supports
the required headers via a simple `_headers` file, and is the **same platform as
the optional data proxy** (a Cloudflare Worker) — so the whole stack lives in one
free account with one set of credentials.

The repo already ships ready-to-use config for the first three:

- [`web/public/_headers`](../web/public/_headers) + [`web/public/_redirects`](../web/public/_redirects) → Cloudflare Pages & Netlify
- [`web/vercel.json`](../web/vercel.json) → Vercel
- [`web/netlify.toml`](../web/netlify.toml) → Netlify

---

## Recommended: Cloudflare Pages

### One-time setup

1. Create a free account at <https://dash.cloudflare.com/sign-up> (no card required).
2. Install the CLI (bundled via `npx`, nothing to install globally):
   ```bash
   npx wrangler login        # opens a browser to authorize
   ```

### Deploy manually (Direct Upload)

```bash
cd web
pnpm install
pnpm wasm
pnpm build
npx wrangler pages deploy dist --project-name axiomic
```

The first run creates the `axiomic` project and prints the live URL
(`https://axiomic.pages.dev`). Re-run the same command to publish updates.

> The `_headers` and `_redirects` files in `web/public/` are copied into
> `dist/` by Vite, and Cloudflare Pages applies them automatically — no extra
> dashboard configuration is needed.

### Deploy via Git integration (no CLI)

Alternatively connect the repo in the dashboard
(**Workers & Pages → Create → Pages → Connect to Git**) with:

| Setting | Value |
| --- | --- |
| Build command | `cd web && pnpm install && pnpm wasm && pnpm build` |
| Build output directory | `web/dist` |
| Root directory | `/` (repo root) |

Cloudflare's build image includes Rust; add `cargo install wasm-pack` to the
build command if `pnpm wasm` reports `wasm-pack: not found`.

---

## Automated deploys with GitHub Actions

A ready-made workflow at
[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)
builds the WASM core + PWA and deploys to Cloudflare Pages on every push to
`main` (and on manual dispatch).

**Set up once:**

1. Create a Cloudflare API token: **My Profile → API Tokens → Create Token →**
   use the **"Cloudflare Pages — Edit"** template (add **"Workers Scripts —
   Edit"** too if you also use the proxy workflow).
2. Find your **Account ID** on the Cloudflare dashboard home (right sidebar).
3. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret** and add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

Push to `main` and the app deploys itself. The workflow caches the Cargo build
so subsequent runs are fast.

---

## Alternative: Vercel

The repo includes [`web/vercel.json`](../web/vercel.json) with the build command,
SPA rewrite, and COOP/COEP headers.

```bash
cd web
npx vercel            # first run links/creates the project (set root to web/)
npx vercel --prod     # production deploy
```

When prompted, set the **Root Directory** to `web`. Vercel reads `vercel.json`
for the build command (`pnpm wasm && pnpm build`), output (`dist`), and headers.
If the build can't find `wasm-pack`, prepend `cargo install wasm-pack &&` to the
`buildCommand` in `vercel.json`.

---

## Alternative: Netlify

The repo includes [`web/netlify.toml`](../web/netlify.toml).

```bash
cd web
npx netlify deploy            # draft URL
npx netlify deploy --prod     # production
```

Set the site's **base directory** to `web` (or deploy from inside `web/`).
Netlify honours both `netlify.toml` and the `web/public/_headers` /
`web/public/_redirects` files.

---

## Alternative: GitHub Pages (with caveats)

GitHub Pages is free but **cannot set custom HTTP response headers**, so the
COOP/COEP cross-origin-isolation headers will be **absent**.

- ✅ The app **still works** — it runs single-threaded by default and does not
  require `SharedArrayBuffer`.
- ❌ You lose the ability to ever enable WASM-thread parallelism, and some PWA
  features behave more conservatively.

If that trade-off is acceptable, build and push `web/dist` to a `gh-pages`
branch (or use `actions/deploy-pages`). A common workaround for the missing
headers is the [`coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker)
shim, which fakes cross-origin isolation from a service worker — but for a
zero-friction isolated deploy, prefer Cloudflare Pages / Vercel / Netlify.

---

## Optional: deploy the live-data proxy

The proxy is **optional**. Axiomic works fully offline with CSV upload and
built-in sample data. Deploy the proxy only if you want **in-browser live
quotes** (Yahoo Finance — free, **no API key**).

It is a [Cloudflare Worker](../proxy/README.md) and deploys free
(100k requests/day on the Workers free plan):

```bash
cd proxy
pnpm install
npx wrangler deploy            # → https://axiomic-proxy.<account>.workers.dev
```

Then point the web app at it by setting `VITE_PROXY_URL` **before building**
(see [`web/.env.example`](../web/.env.example)):

```bash
# web/.env
VITE_PROXY_URL=https://axiomic-proxy.<account>.workers.dev
```

Rebuild and redeploy the PWA so the value is baked in. Lock down who may call
the proxy by setting `ALLOWED_ORIGINS` to your PWA origin in
[`proxy/wrangler.toml`](../proxy/wrangler.toml):

```toml
[vars]
ALLOWED_ORIGINS = "https://axiomic.pages.dev"
```

CI for the proxy lives in
[`.github/workflows/deploy-proxy.yml`](../.github/workflows/deploy-proxy.yml)
(runs only when `proxy/**` changes; reuses the same Cloudflare secrets).

---

## Why the COOP/COEP headers matter

For WASM threads (`SharedArrayBuffer`) the browser requires the page to be
**cross-origin isolated**, which means the HTML document must be served with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are configured for **every** environment:

| Environment | Where the headers come from |
| --- | --- |
| `pnpm dev` / `pnpm preview` | Vite middleware in [`web/vite.config.ts`](../web/vite.config.ts) |
| Cloudflare Pages / Netlify | [`web/public/_headers`](../web/public/_headers) |
| Vercel | [`web/vercel.json`](../web/vercel.json) |

> The app **runs fine without them** (single-threaded). They are only needed to
> unlock parallelism, and enabling them on a free static host costs nothing.

If you ever load **cross-origin** resources (images, fonts, scripts) into the
isolated page, `require-corp` will block them unless they send
`Cross-Origin-Resource-Policy` / proper CORS. Axiomic loads everything
same-origin and fetches market data via the proxy (CORS), so this is a
non-issue out of the box. If it becomes one, switch `require-corp` to the softer
`credentialless` in the header files.

---

## Custom domain

All three recommended hosts attach a custom domain free:

- **Cloudflare Pages:** project → **Custom domains → Set up a domain**. If the
  domain's DNS is on Cloudflare, it's automatic; otherwise add the shown CNAME.
- **Vercel / Netlify:** project settings → **Domains** → add and follow the DNS
  records.

HTTPS certificates are provisioned automatically and free on every option.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `wasm-pack: not found` during build | Install it: `cargo install wasm-pack`, or prepend it to the host's build command. |
| Blank page, console: *"both async and sync fetching of the wasm failed"* | The `.wasm` wasn't deployed or got a wrong MIME type. Ensure `pnpm wasm` ran before `pnpm build` and that the whole `dist/` folder (including `assets/*.wasm`) was uploaded. |
| `crossOriginIsolated` is `false` in the console | The COOP/COEP headers aren't being served. Confirm `_headers` (Pages/Netlify) or `vercel.json` (Vercel) shipped, and that you're on HTTPS. GitHub Pages can't set them — see [caveats](#alternative-github-pages-with-caveats). |
| Live fetch fails: *"Network error contacting the data proxy"* | The proxy isn't deployed or `VITE_PROXY_URL` wasn't set **before** the build. Set it in `web/.env` and rebuild. |
| Proxy returns CORS error | Set `ALLOWED_ORIGINS` in `proxy/wrangler.toml` to your exact PWA origin (scheme + host, no trailing slash) and redeploy. |
| Deep-link / refresh shows 404 | The SPA fallback isn't active. Confirm `_redirects` (Pages/Netlify) or the `rewrites` in `vercel.json` shipped. |
| Stale app after deploy | The service worker caches aggressively. The PWA uses `autoUpdate`; a second reload (or closing all tabs) picks up the new version. `sw.js` is sent with `no-cache` to speed this up. |

---

## Summary

- **Cheapest, simplest, single-provider path:** Cloudflare Pages for the PWA +
  Cloudflare Worker for the optional proxy — both free, one account.
- The repo ships drop-in config for Cloudflare, Vercel, and Netlify plus two
  GitHub Actions workflows for hands-off deploys.
- The only non-default requirement is the COOP/COEP headers, and those are
  pre-wired for every supported host.
