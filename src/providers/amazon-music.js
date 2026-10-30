/**
 * Amazon Music provider boundary.
 *
 * Implement searchCatalog only against the API contract Amazon explicitly
 * authorizes for this application. The adapter must normalize official
 * response fields into the provider-neutral track shape documented in
 * src/mappers/track-mapper.js. No undocumented endpoints, private app APIs,
 * cookie/session extraction, or DRM workarounds.
 */
import { ProviderNotConfiguredError } from "../utils/errors.js";
import { searchCatalog } from "../services/search-service.js";

export { ProviderNotConfiguredError };

/**
 * Provider-neutral contract:
 * searchCatalog(query, { limit }, env) -> { tracks: CanonicalTrack[] }
 *
 * CanonicalTrack: { id, title, artist?, album?, duration?, artworkURL?,
 * format?, audioQuality? }. The exact Amazon response mapping is intentionally
 * unimplemented until Amazon supplies an approved API contract.
 */
async function amazonCatalogueAdapter(_query, _options, _env) {
  throw new ProviderNotConfiguredError();
}

export async function searchTracks(query, options, env) {
  return searchCatalog(query, options, env, {
    searchCatalog: (normalizedQuery, searchOptions) =>
      amazonCatalogueAdapter(normalizedQuery, searchOptions, env)
  });
}

/**
 * Return only an authorized, directly playable, unencrypted stream descriptor.
 * Amazon playback remains unavailable until the approved integration confirms
 * that this client and playback method are permitted.
 */
export async function resolveStream(_trackId, _options, _env) {
  throw new ProviderNotConfiguredError();
}
