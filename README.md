# Amazon Music for BitChord

**Status: manifest scaffold only. This is not a working Amazon Music Unlimited source.**

## Manifest hosting

The manifest is at:

`https://raw.githubusercontent.com/tteja619/amazon-music-bitchord/main/manifest.json`

The manifest follows BitChord's documented identity/capability format. It declares `search` and `stream`, but those routes are not implemented in this repository yet.

## Why playback is not available

BitChord expects a server with three routes:

- `GET /manifest.json`
- `GET /search?q=...`
- `GET /stream/{id}`

Search must return real catalogue metadata. Stream must return an absolute, directly playable media URL. BitChord refuses encrypted/protected renditions.

Amazon Music Unlimited playback is controlled by Amazon's authorized playback and content-protection systems. This project does not extract app tokens/cookies, scrape private sessions, bypass DRM, or represent an Amazon subscription as permission to access protected streams through an unrelated player. A usable Amazon catalogue/playback integration requires an authorized interface from Amazon.

A static GitHub-hosted JSON manifest cannot implement the search and stream routes. Adding the manifest URL to BitChord alone will therefore not create working Amazon Music search or playback.

## BitChord developer contract

See the [BitChord addon developer guide](https://bitchord.kushagrasingh.in/docs) for the current manifest, search response, and stream response schemas.

## Current status

- [x] Manifest JSON scaffold
- [ ] HTTPS backend implementing BitChord routes
- [ ] Authorized Amazon catalogue access
- [ ] Authorized playable stream resolution
- [ ] End-to-end BitChord playback test
