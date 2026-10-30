import {
  ProviderNotConfiguredError,
  searchTracks,
  resolveStream
} from "./providers/amazon-music.js";
import { AppError } from "./utils/errors.js";
import { isHttpsUrl, validateSearchQuery, validateTrackId } from "./utils/security.js";

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

function json(data, status = 200, method = "GET") {
  return new Response(method === "HEAD" ? null : JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function errorResponse(error, method) {
  if (error instanceof AppError) {
    return json({ error: { code: error.code, message: error.message } }, error.status, method);
  }
  if (error instanceof ProviderNotConfiguredError) {
    return json({
      error: {
        code: error.code,
        message: "Amazon Music API access has not been authorized and configured for this addon."
      }
    }, 503, method);
  }
  return json({
    error: { code: "PROVIDER_ERROR", message: "The music provider request failed." }
  }, 502, method);
}

function notFound(method) {
  return json({ error: { code: "NOT_FOUND", message: "Route or track not found." } }, 404, method);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    if (method !== "GET" && method !== "HEAD") {
      return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405, method);
    }

    if (url.pathname === "/" || url.pathname === "/manifest.json") {
      return json(MANIFEST, 200, method);
    }

    if (url.pathname === "/health") {
      return json({
        status: "ok",
        addon: MANIFEST.id,
        provider: "amazon-music",
        integration: "awaiting-authorized-api-access",
        architecture: "phase-1-modular-backend"
      }, 200, method);
    }

    if (url.pathname === "/search") {
      const validation = validateSearchQuery(url.searchParams.get("q") || "");
      if (!validation.ok) {
        return json({ error: { code: "BAD_REQUEST", message: validation.error } }, 400, method);
      }

      try {
        const result = await searchTracks(validation.value, url.searchParams, env);
        if (!result || !Array.isArray(result.tracks)) {
          return json({ error: { code: "INVALID_PROVIDER_RESPONSE" } }, 502, method);
        }
        return json({ tracks: result.tracks }, 200, method);
      } catch (error) {
        return errorResponse(error, method);
      }
    }

    if (url.pathname.startsWith("/stream/")) {
      let trackId;
      try {
        trackId = decodeURIComponent(url.pathname.slice("/stream/".length));
      } catch {
        return json({ error: { code: "BAD_REQUEST", message: "Invalid track id encoding." } }, 400, method);
      }

      const validation = validateTrackId(trackId);
      if (!validation.ok) {
        return json({ error: { code: "BAD_REQUEST", message: validation.error } }, 400, method);
      }

      try {
        const stream = await resolveStream(validation.value, url.searchParams, env);
        if (!stream || !isHttpsUrl(stream.url)) {
          return json({ error: { code: "INVALID_STREAM_RESPONSE" } }, 502, method);
        }
        if (stream.encrypted === true) {
          return json({ error: { code: "PROTECTED_STREAM_UNSUPPORTED" } }, 422, method);
        }
        return json(stream, 200, method);
      } catch (error) {
        return errorResponse(error, method);
      }
    }

    return notFound(method);
  }
};
