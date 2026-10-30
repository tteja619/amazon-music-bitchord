# TorBox Music for BitChord

**Status: TorBox cache/download/AirLock and file-link backend implemented. A music catalogue source and final BitChord playback integration are still required.** Searchable music results are not available yet.

## Worker routes

- `GET /` and `GET /manifest.json`: BitChord addon manifest
- `GET /health`: Worker and TorBox configuration status
- `POST /torbox/submit`: add a user-supplied magnet to the user's TorBox account
- `GET /torbox/status?hash={infohash}`: inspect download status and automatically AirLock once complete
- `GET /torbox/file?torrent_id={id}&file_id={id}`: validate file ownership and obtain a fresh TorBox download URL
- `GET /torbox/library?q=...`: search audio files in the authenticated TorBox library
- `GET /torbox/play?id={torrent_id}:{file_id}`: resolve a library track to a fresh playback URL
- `GET /search?q=...`: catalogue route, not yet connected to a music catalogue
- `GET /stream/{id}`: playback route, not yet connected to a music catalogue or TorBox file resolution

## Automatic cache and AirLock workflow

1. Validate the supplied magnet URI and extract its 40-character hexadecimal BitTorrent info hash.
2. Check whether the torrent already exists in the user's TorBox account to avoid duplicate submissions.
3. If it does not exist, check TorBox cache availability using `GET /torrents/checkcached`.
4. Add the magnet to the authenticated TorBox account using `POST /torrents/createtorrent`.
5. Look up the user's torrent entry using `GET /torrents/mylist`.
6. Once TorBox reports completion, set `airlocked: true` using `PUT /torrents/edittorrent`.
7. Verify the change by fetching the torrent entry again and requiring `airlocked: true`.

Already-AirLocked items are left unchanged. An AirLock request is never reported as successful unless TorBox confirms the resulting `airlocked: true` state. The status route can be called again while a download is in progress, and it will AirLock automatically after completion.

The integration uses TorBox's documented API routes and fields. See the [TorBox API documentation](https://api-docs.torbox.app/) and [TorBox AirLock help article](https://support.torbox.app/en/articles/15417147-torbox-airlock).

## API configuration

Set both values as Cloudflare Worker secrets, not as plaintext Worker variables:

```sh
npx wrangler secret put TORBOX_API_TOKEN
npx wrangler secret put ADDON_ACCESS_KEY
```

Paste your TorBox API token into the first secure prompt. For the second, generate a strong random key locally, for example `openssl rand -hex 32`, and paste it into the prompt. Never commit either secret or put them in the manifest. All TorBox submit, status, and file-link routes require an `Authorization: Bearer YOUR_ADDON_ACCESS_KEY` header. This prevents strangers from consuming your TorBox quota or obtaining your file links through the public Worker.

### Submit a magnet

```sh
curl -X POST "https://YOUR-WORKER.workers.dev/torbox/submit" \
  -H "content-type: application/json" \
  -H "authorization: Bearer YOUR_ADDON_ACCESS_KEY" \
  -d '{"magnet":"magnet:?xt=urn:btih:YOUR_40_CHARACTER_HEX_HASH"}'
```

### Check status and trigger automatic AirLock

```sh
curl "https://YOUR-WORKER.workers.dev/torbox/status?hash=YOUR_40_CHARACTER_HEX_HASH" \
  -H "authorization: Bearer YOUR_ADDON_ACCESS_KEY"
```

The Cloudflare Cron Trigger also checks tagged items every five minutes, so AirLock does not depend on you reopening the status endpoint.

### Search your TorBox audio library

```sh
curl "https://YOUR-WORKER.workers.dev/torbox/library?q=artist%20or%20track" \\
  -H "authorization: Bearer YOUR_ADDON_ACCESS_KEY"
```

Only completed torrents are searched. Audio extensions are filtered, and each result has an opaque `torrentId:fileId` identifier. The library route does not search public torrent indexes.

### Resolve a library track for playback

```sh
curl "https://YOUR-WORKER.workers.dev/torbox/play?id=TORRENT_ID:FILE_ID" \\
  -H "authorization: Bearer YOUR_ADDON_ACCESS_KEY"
```

This verifies file ownership and requests a fresh temporary TorBox CDN URL. Request the URL immediately before playback.

### Resolve a file link

```sh
curl "https://YOUR-WORKER.workers.dev/torbox/file?torrent_id=TORRENT_ID&file_id=FILE_ID" \
  -H "authorization: Bearer YOUR_ADDON_ACCESS_KEY"
```

The endpoint verifies that the requested file belongs to the specified torrent and obtains a fresh HTTPS download URL. Treat that URL as temporary and do not store or publish it.

## Important limitations

- This implementation accepts a magnet supplied by the caller. It does not search the internet for music torrents.
- A separate catalogue/index provider is required to search for releases and return magnet links.
- The private TorBox library and playback routes now map completed audio files to TorBox file IDs. They require the addon's Bearer access key. The public BitChord `/search` and `/stream/{id}` routes are not connected yet because BitChord's ability to attach a private Bearer header must be confirmed before exposing a personal library.
- TorBox's torrent API downloads all files in a torrent. Check the release contents and size before submitting it.
- Use only torrents and files you own, are licensed to download, or are otherwise legally permitted to access and store. AirLock does not grant copyright permission.
- AirLock availability and storage are subject to the user's TorBox plan and quota.

## Tests

Requires Node.js 20 or later.

```sh
npm test
```

Tests cover track mapping, provider selection, playback validation, info-hash parsing, cached and uncached submission states, automatic AirLock verification, audio-library filtering, and playback URL resolution.

## Deployment

GitHub Actions runs tests before deploying the Cloudflare Worker. Repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The TorBox API token and addon access key are separate Cloudflare Worker secrets: `TORBOX_API_TOKEN` and `ADDON_ACCESS_KEY`. The Worker root URL remains the BitChord installation URL.
