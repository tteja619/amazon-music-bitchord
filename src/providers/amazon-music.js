/**
 * Amazon Music provider boundary.
 *
 * Implement only against an API contract and credentials Amazon has explicitly
 * authorized for this application. Do not add undocumented endpoints, private
 * app APIs, cookie/session extraction, or DRM workarounds.
 */
import { ProviderNotConfiguredError } from "../utils/errors.js";

export { ProviderNotConfiguredError } from "../utils/errors.js";

/**
 * Expected provider-neutral result: { tracks: Array<ProviderTrack> }.
 * Required fields: id and title. Optional metadata must be sourced accurately.
 */
export async function searchTracks(_query, _options, _env) {
  throw new ProviderNotConfiguredError(
    "Amazon Music catalogue access has not been authorized for this application."
  );
}

/**
 * Expected result: an authorized, directly playable HTTPS URL and accurate
 * metadata. The playback service requires encrypted === false explicitly.
 */
export async function resolveStream(_trackId, _options, _env) {
  throw new ProviderNotConfiguredError(
    "Amazon Music playback access has not been authorized for this application."
  );
}
