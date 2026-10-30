# TorBox Music for BitChord

**Status: TorBox cache/download/AirLock backend implemented. A music catalogue source and final playback integration are still required.** This addon does not yet provide searchable music results.

## Worker routes

- `GET /` and `GET /manifest.json`: BitChord addon manifest
- `GET /health`: Worker and TorBox configuration status
- `POST /torbox/submit`: add a user-supplied magnet to the user's TorBox account
- `GET /torbox/status?hash={infohash}`: inspect download status and automatically AirLock once complete
- `GET /search?q=...`: catalogue route, not yet connected to a music catalogue
- `GET /stream/{id}`: playback route, not yet connected to TorBox file resolution

## Automatic cache and AirLock workflow

1. Validate the supplied magnet URI and extract its 40-character hexadecimal BitTorrent info hash.
2. Check TorBox cache availability using `GET /torrents/checkcached`.
3. Add the magnet to the authenticated TorBox account using `POST /torrents/createtorrent`.
4. Look up the user's torrent entry using `GET /torrents/mylist`.
5. If TorBox reports `download_finished: true` or `cached: true`, set `airlocked: true` using `PUT /torrents/edittorrent`.
6. Verify the change by fetching the torrent entry again and requiring `airlocked: true`.
7. If the download is still in progress, call the status route again later. It will AirLock automatically after completion.

Already-AirLocked items are left unchanged. An AirLock request is never reported as successful unless TorBox confirms the resulting `airlocked: true` state.

The integration uses TorBox's documented API routes and fields. See the [TorBox API documentation](https://api-docs.torbox.app/) and [TorBox AirLock help article](https://support.torbox.app/en/articles/15417147-torbox-airlock).

## API configuration

Set the following as a Cloudflare Worker secret, not as a plaintext Worker variable:

```sh
npx wrangler secret put TORBOX_API_TOKEN
```

Paste the TorBox API token into the secure prompt. Never commit the token, place it in the manifest, or expose it in a response URL.

### Submit a magnet

```sh
curl -X POST "https://YOUR-WORKER.workers.dev/torbox/submit" \
  -H "content-type: application/json" \
  -d '{"magnet":"magnet:?xt=urn:btih:YOUR_40_CHARACTER_HEX_HASH"}'
```

The endpoint returns the hash, whether TorBox reported a cache hit, the TorBox item ID when available, current status, and AirLock confirmation.

### Check status and trigger automatic AirLock

```sh
curl "https://YOUR-WORKER.workers.dev/torbox/status?hash=YOUR_40_CHARACTER_HEX_HASH"
```

Call this again while the item is downloading. When TorBox reports completion, the route enables and verifies AirLock automatically.

## Important limitations

- This implementation accepts a magnet supplied by the caller. It does not search the internet for music torrents.
- A separate catalogue/index provider is required to search for releases and return magnet links.
- The BitChord search and playback routes are not yet connected to this TorBox workflow. File selection and TorBox download-link resolution must be integrated before in-app playback works.
- TorBox's torrent API downloads all files in a torrent. Check the release contents and size before submitting it.
- Use only torrents and files you own, are licensed to download, or are otherwise legally permitted to access and store. AirLock does not grant copyright permission.
- AirLock availability and storage are subject to the user's TorBox plan and quota.

## Tests

Requires Node.js 20 or later.

```sh
npm test
```

Tests cover track mapping, provider selection, playback validation, info-hash parsing, cached and uncached submission states, and automatic AirLock verification.

## Deployment

GitHub Actions runs tests before deploying the Cloudflare Worker. Repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The TorBox token is configured separately as the Worker secret `TORBOX_API_TOKEN`. The Worker root URL remains the BitChord installation URL.
