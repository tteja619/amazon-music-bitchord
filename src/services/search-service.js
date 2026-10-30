import { AppError } from "../utils/errors.js";
import { toBitChordTracks } from "../mappers/track-mapper.js";
import { validateSearchQuery } from "../utils/security.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function readLimit(options) {
  const raw = Number(options?.get?.("limit"));
  if (!Number.isInteger(raw) || raw < 1) return DEFAULT_LIMIT;
  return Math.min(raw, MAX_LIMIT);
}

/**
 * Provider-neutral search orchestration.
 * adapter.searchCatalog(query, { limit }, env) must return canonical tracks.
 * An optional KV-compatible binding may cache serialized canonical results.
 */
export async function searchCatalog(queryInput, options, env, adapter) {
  const validated = validateSearchQuery(queryInput);
  if (!validated.ok) {
    throw new AppError("BAD_REQUEST", validated.error, 400);
  }

  if (!adapter || typeof adapter.searchCatalog !== "function") {
    throw new AppError("PROVIDER_NOT_IMPLEMENTED", "Catalogue adapter is not implemented.", 503);
  }

  const query = validated.value;
  const limit = readLimit(options);
  const cacheKey = `catalog:v1:${encodeURIComponent(query.toLowerCase())}:${limit}`;
  const cache = env?.CATALOG_CACHE;

  if (cache && typeof cache.get === "function" && typeof cache.put === "function") {
    try {
      const cached = await cache.get(cacheKey, "json");
      if (cached && Array.isArray(cached.tracks)) {
        return { tracks: toBitChordTracks(cached.tracks), cached: true };
      }
    } catch {
      // Cache failures must not make catalogue search unavailable.
    }
  }

  const result = await adapter.searchCatalog(query, { limit }, env);
  if (!result || !Array.isArray(result.tracks)) {
    throw new AppError("INVALID_PROVIDER_RESPONSE", "Catalogue adapter returned an invalid response.", 502);
  }

  const tracks = toBitChordTracks(result.tracks).slice(0, limit);
  if (cache) {
    try {
      await cache.put(cacheKey, JSON.stringify({ tracks }), { expirationTtl: 120 });
    } catch {
      // A cache write is best-effort only.
    }
  }

  return { tracks, cached: false };
}
