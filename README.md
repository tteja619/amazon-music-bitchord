# Amazon Music for BitChord

**Status: backend scaffold deployed from source, Amazon provider not configured.** This repository does not currently search or play Amazon Music Unlimited.

## What is implemented

A Cloudflare Worker backend implementing BitChord's three routes:

- `GET /` and `GET /manifest.json`: addon manifest
- `GET /search?q=...`: validated BitChord search route
- `GET /stream/{id}`: validated BitChord stream route
- `GET /health`: backend health and integration status

The Amazon provider adapter is deliberately fail-closed. Until Amazon grants this app API access and supplies an approved API contract, search and stream return HTTP 503 with `AMAZON_MUSIC_API_NOT_CONFIGURED`. The Worker does not extract cookies, reuse private app tokens, scrape protected sessions, or bypass DRM.

## Amazon API access

Amazon's [official Music Developer Portal](https://developer.amazon.com/docs/music/landing_home) currently describes the Amazon Music Web API as closed beta. A working provider adapter requires Amazon to authorize this app and provide the applicable API documentation and credentials.

Do not put Amazon credentials in source files, GitHub commits, or the manifest. When an approved integration is available, use Cloudflare Worker secrets for credentials and implement the documented authorization and refresh flow in `src/providers/amazon-music.js`.

## Deploy to Cloudflare Workers

1. Create or sign in to a Cloudflare account.
2. Create an API token with permission to deploy Workers for the target account.
3. In this GitHub repository, open **Settings → Secrets and variables → Actions**.
4. Add repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. Open **Actions → Deploy BitChord Worker → Run workflow**, or push a change under `src/` to `main`.
6. After deployment, Cloudflare will show a Worker URL similar to:
   `https://amazon-music-bitchord.<your-workers-subdomain>.workers.dev`

The exact hostname depends on your Cloudflare account. Do not guess it.

## Install in BitChord

Add the **Worker root URL** shown by Cloudflare as the addon URL. BitChord will request `/manifest.json` from that root and then call `/search` and `/stream/{id}`.

The GitHub raw URL for `manifest.json` is only a static JSON file. It is not the install URL for the full backend.

## Verify after deployment

Open these URLs, replacing the hostname with the actual Worker URL:

- `/health`: should report `status: "ok"` and `integration: "awaiting-authorized-api-access"`
- `/manifest.json`: should return the addon manifest
- `/search?q=test`: should return HTTP 503 until the authorized provider adapter is implemented

## BitChord response requirements

The [BitChord addon protocol](https://bitchord.kushagrasingh.in/docs) expects search results as `{ "tracks": [...] }`. Track rows require `id` and `title`. Stream responses require an absolute playable `url`; codec, container, manifest type, encryption state, sample rate, and bit depth should be supplied accurately when known. Protected/encrypted streams are not supported.

## Repository layout

- `src/index.js`: Worker HTTP routes and response validation
- `src/providers/amazon-music.js`: provider adapter boundary, currently disabled
- `wrangler.toml`: Cloudflare Worker configuration
- `.github/workflows/deploy-worker.yml`: GitHub Actions deployment
- `manifest.json`: static copy of the addon manifest for inspection

## Current checklist

- [x] BitChord-compatible Worker route scaffold
- [x] Manifest served dynamically by Worker
- [x] Fail-closed handling when provider is not configured
- [x] Stream URL and encrypted-stream response checks
- [x] GitHub Actions deployment workflow
- [ ] Cloudflare account secrets configured
- [ ] Worker deployed and hostname verified
- [ ] Amazon grants API access
- [ ] Official Amazon API adapter implemented
- [ ] End-to-end search and playback test
