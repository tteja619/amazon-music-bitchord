# Amazon Music for BitChord

**Status: Phase 1 architecture implemented. Amazon provider remains disabled pending authorized API access.** This project does not currently search or play Amazon Music Unlimited.

## Current implementation

The Cloudflare Worker exposes:

- `GET /` and `GET /manifest.json`: BitChord addon manifest
- `GET /health`: backend health and integration status
- `GET /search?q=...`: validated catalogue search route
- `GET /stream/{id}`: validated playback route

The backend is now separated into provider adapters, services, mapping, and shared errors:

- `src/index.js`: HTTP routes and error-to-HTTP mapping
- `src/providers/index.js`: provider selection
- `src/providers/amazon-music.js`: Amazon adapter boundary, deliberately fail-closed
- `src/providers/mock-provider.js`: development-only search fixture, not real Amazon data
- `src/services/search-service.js`: catalogue search orchestration
- `src/services/playback-service.js`: strict playback response validation
- `src/mappers/track-mapper.js`: provider-neutral to BitChord track mapping
- `src/utils/errors.js`: typed provider and playback errors
- `test/track-mapper.test.js`: contract and safety tests

## Development fixture

The mock provider is selected only when BOTH Worker environment values are set:

- `APP_ENV=development`
- `MUSIC_PROVIDER=mock`

In that configuration, `/search?q=...` returns a clearly labelled fixture track. It is not Amazon catalogue data. The mock provider does not provide audio playback.

Do not enable these values in production. The default provider is always the fail-closed Amazon adapter.

## Tests

Requires Node.js 20 or later.

```sh
npm test
```

The tests cover track mapping, required metadata, development-only mock selection, and strict playback URL/encryption validation.

## Amazon API access

Amazon's [official Music Developer Portal](https://developer.amazon.com/docs/music/landing_home) describes the Amazon Music Web API as closed beta. A working provider requires Amazon to authorize this application and provide its approved API contract.

Do not put Amazon credentials in source files, GitHub commits, or the manifest. Use Cloudflare Worker secrets for confidential credentials and implement only the documented authorization and refresh flow.

## Playback compatibility and safety

BitChord expects an absolute playable URL. This adapter accepts a stream only when the provider explicitly reports `encrypted: false`. Protected or encrypted streams are rejected. Do not extract private app tokens, reuse session cookies, scrape protected playback sessions, proxy protected streams, or bypass DRM.

Catalogue search and playback are separate capabilities. Authorization for catalogue access must not be assumed to include playback permission.

## Deployment

The existing GitHub Actions workflow deploys changes under `src/**` to Cloudflare Workers. Repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The Worker root URL is the BitChord installation URL. The static GitHub raw manifest URL is not a replacement for the Worker backend.
