import {
  ProviderNotConfiguredError,
  searchTracks,
  resolveStream
} from "./providers/amazon-music.js";

const MANIFEST = {
  id: "in.tteja619.amazon-music-bitchord",
  name: "Amazon Music (API access required)",
  version: "0.2.0",
  resources: ["search", "stream"],
  allowDownloads: 0,
  checkValidLossless: 0
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function unavailable() {
  return json({
    error: {
      code: "AMAZON_MUSIC_API_NOT_CONFIGURED",
      message: "Amazon Music API access has not been authorized and configured for this addon."
    }
  }, 503);
}

function notFound() {
  return json({ error: { code: "NOT_FOUND", message: "Route or track not found." } }, 404);
}

function badRequest(message) {
  return json({ error: { code: "BAD_REQUEST", message } }, 400);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    }

    if (url.pathname === "/" || url.pathname === "/manifest.json") {
      return json(MANIFEST);
    }

    if (url.pathname === "/health") {
      return json({
        status: "ok",
        addon: MANIFEST.id,
        provider: "amazon-music",
        integration: "awaiting-authorized-api-access"
      });
    }

    if (url.pathname === "/search") {
      const query = (url.searchParams.get("q") || "").trim();
      if (!query) return badRequest("The q query parameter is required.");
      if (query.length > 200) return badRequest("Search query must be 200 characters or fewer.");

      try {
        const result = await searchTracks(query, url.searchParams, env);
        if (!result || !Array.isArray(result.tracks)) {
          return json({ error: { code: "INVALID_PROVIDER_RESPONSE" } }, 502);
        }
        return json({ tracks: result.tracks });
      } catch (error) {
        if (error instanceof ProviderNotConfiguredError) return unavailable();
        return json({ error: { code: "PROVIDER_ERROR", message: "The music provider request failed." } }, 502);
      }
    }

    if (url.pathname.startsWith("/stream/")) {
      let trackId;
      try {
        trackId = decodeURIComponent(url.pathname.slice("/stream/".length));
      } catch {
        return badRequest("Invalid track id encoding.");
      }
      if (!trackId || trackId.length > 512) return badRequest("Invalid track id.");

      try {
        const stream = await resolveStream(trackId, url.searchParams, env);
        if (!stream || typeof stream.url !== "string" || !/^https:\/\//i.test(stream.url)) {
          return json({ error: { code: "INVALID_STREAM_RESPONSE" } }, 502);
        }
        if (stream.encrypted === true) {
          return json({ error: { code: "PROTECTED_STREAM_UNSUPPORTED" } }, 422);
        }
        return json(stream);
      } catch (error) {
        if (error instanceof ProviderNotConfiguredError) return unavailable();
        return json({ error: { code: "PROVIDER_ERROR", message: "The stream provider request failed." } }, 502);
      }
    }

    return notFound();
  }
};
