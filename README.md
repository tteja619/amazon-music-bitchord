# Amazon Music for BitChord

**Status: Phase 1 modular backend prepared on branch `phase-1-modular-backend`.** The Amazon provider is intentionally not configured. This project does not currently search or play Amazon Music Unlimited.

## Current deployment

The existing production Worker remains unchanged while Phase 1 is reviewed and tested. The Phase 1 branch is not deployed automatically. Merge it into `main` only after tests and review pass.

## What is implemented

The Cloudflare Worker exposes:

- `GET /` and `GET /manifest.json`: BitChord addon manifest
- `GET /search?q=...`: validated catalogue-search route
- `GET /stream/{id}`: validated stream route
- `GET /health`: health and integration status

Phase 1 adds a modular foundation:

- `src/utils/errors.js`: typed application and provider errors
- `src/utils/security.js`: search, track-ID and HTTPS URL validation
- `src/mappers/track-mapper.js`: provider-neutral track mapping to BitChord format
- `src/services/search-service.js`: search orchestration, bounded result limits and optional KV caching
- `src/providers/amazon-music.js`: provider adapter boundary, intentionally not configured
- `tests/`: unit tests for validation, mapping, caching and search orchestration

The search cache is optional. Bind a Workers KV namespace as `CATALOG_CACHE` to enable it. Cache writes are best-effort and use a short 120-second TTL.

## Run tests locally

Requires Node.js 20 or newer.

```sh
npm test
```

The test suite uses Node's built-in test runner and does not require third-party packages.

## Amazon API access

Amazon's official Music Developer Portal currently describes the Amazon Music Web API as closed beta. A working provider adapter requires Amazon to authorize this application and provide the applicable API documentation and credentials.

The adapter must map only documented Amazon response fields into the provider-neutral canonical track shape:

```js
{
  id: "provider-track-id",
  title: "Track title",
  artist: "Artist name",
  album: "Album name",
  duration: 210,
  artworkURL: "https://...",
  format: "documented-format",
  audioQuality: "documented-quality"
}
```

This is an internal normalized shape, not an asserted Amazon response schema.

Do not add undocumented endpoints, private app APIs, cookie/session extraction, or DRM workarounds. Do not claim playback support unless Amazon explicitly authorizes a playback method compatible with the client.

## Credentials

- Keep client secrets and tokens in Cloudflare Worker secrets, never in Git or BitChord manifest fields.
- Do not expose tokens in URLs or API responses.
- Redact authorization headers and tokens from logs.
- For multi-user support, design per-user credential storage and encryption before enabling account linking.
- Fail closed when credentials or authorization are missing.

## BitChord response requirements

Search results are returned as `{ "tracks": [...] }`. Track rows require `id` and `title`. Optional fields include artist, album, duration, artworkURL, format and audioQuality.

Stream responses require an absolute HTTPS URL and accurate metadata. Encrypted/protected streams are rejected. An HTTPS URL alone does not establish that a stream is authorized or compatible.

## Deploy

The GitHub Actions workflow now runs `npm test` before deployment. It deploys only pushes to `main` that match the configured paths, or a manual workflow dispatch.

Required GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Phase 1 branch is not deployed until it is merged into `main`.

## Current checklist

- [x] Existing BitChord Worker route scaffold
- [x] Provider-neutral error types
- [x] Search and track-ID validation
- [x] Canonical BitChord track mapper
- [x] Search orchestration and optional KV cache
- [x] Unit tests
- [x] CI test step before deployment
- [ ] Run CI tests and review Phase 1 branch
- [ ] Merge and deploy Phase 1
- [ ] Amazon grants API access
- [ ] Implement the official Amazon authorization and catalogue adapter
- [ ] Confirm playback permissions and client compatibility
- [ ] End-to-end authorized integration test
