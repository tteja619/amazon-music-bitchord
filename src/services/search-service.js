import { InvalidProviderResponseError } from "../utils/errors.js";
import { toBitChordTrack } from "../mappers/track-mapper.js";

export async function searchCatalog(provider, query, options = {}) {
  if (!provider || typeof provider.searchTracks !== "function") {
    throw new InvalidProviderResponseError("Provider does not implement searchTracks.");
  }

  const result = await provider.searchTracks(query, options);
  if (!result || !Array.isArray(result.tracks)) {
    throw new InvalidProviderResponseError("Provider search result must contain a tracks array.");
  }

  return { tracks: result.tracks.map(toBitChordTrack) };
}
