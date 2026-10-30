/**
 * Amazon Music provider boundary.
 *
 * Do not add undocumented Amazon endpoints, private app APIs, cookie/session
 * extraction, or DRM workarounds here. Implement these functions only against
 * an API contract and credentials Amazon has explicitly authorized for this app.
 */

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("Amazon Music API access is not configured for this addon.");
    this.name = "ProviderNotConfiguredError";
    this.code = "AMAZON_MUSIC_API_NOT_CONFIGURED";
  }
}

/**
 * Expected internal result: { tracks: BitChordTrack[] }
 * BitChordTrack requires id and title. Optional fields include artist, album,
 * duration, artworkURL, format, and audioQuality.
 */
export async function searchTracks(_query, _options, _env) {
  throw new ProviderNotConfiguredError();
}

/**
 * Expected internal result: a BitChord stream descriptor with a directly
 * playable, authorized, unencrypted URL and accurate codec/container metadata.
 */
export async function resolveStream(_trackId, _options, _env) {
  throw new ProviderNotConfiguredError();
}
