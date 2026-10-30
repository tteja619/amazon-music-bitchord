import { getProvider } from "./providers/index.js";
import { searchCatalog } from "./services/search-service.js";
import { resolvePlayback } from "./services/playback-service.js";
import { submitMagnet, getStatusAndAirlock, getPlayableFile, airlockCompletedTorrents, listAudioLibrary, resolveLibraryTrack } from "./services/torbox-service.js";
import {
  ProviderNotConfiguredError,
  InvalidProviderResponseError,
  ProtectedStreamUnsupportedError
} from "./utils/errors.js";

const MANIFEST = {
  id: "in.tteja619.amazon-music-bitchord",
  name: "TorBox Music (personal library)",
  version: "0.6.0",
  settings: [{
    key: "quality",
    type: "select",
    default: "lossless",
    options: [
      { label: "Lossless first", value: "lossless" },
      { label: "High quality", value: "high" },
      { label: "Low bandwidth", value: "low" }
    ]
  }],
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
      code: "MUSIC_CATALOGUE_NOT_CONFIGURED",
      message: "A music catalogue provider has not been configured for this addon."
    }
  }, 503);
}

function notFound() {
  return json({ error: { code: "NOT_FOUND", message: "Route or track not found." } }, 404);
}

function badRequest(message) {
  return json({ error: { code: "BAD_REQUEST", message } }, 400);
}

function requireAddonAccess(request, env) {
  const accessKey = env.ADDON_ACCESS_KEY;
  if (!accessKey) {
    return json({ error: { code: "ADDON_ACCESS_NOT_CONFIGURED" } }, 503);
  }
  if (request.headers.get("authorization") !== `Bearer ${accessKey}`) {
    return json({ error: { code: "UNAUTHORIZED" } }, 401);
  }
  return null;
}

function torboxError(error) {
  if (error instanceof ProviderNotConfiguredError) {
    return json({ error: { code: "TORBOX_NOT_CONFIGURED", message: error.message } }, 503);
  }
  if (error instanceof TypeError) return badRequest(error.message);
  const status = error?.status === 400 ? 400 : error?.status === 403 ? 502 : 502;
  return json({
    error: {
      code: error?.code || "TORBOX_ERROR",
      message: error?.message || "TorBox request failed."
    }
  }, status);
}

function providerError(error) {
  if (error instanceof ProviderNotConfiguredError) return unavailable();
  if (error instanceof ProtectedStreamUnsupportedError) {
    return json({ error: { code: error.code, message: error.message } }, 422);
  }
  if (error instanceof InvalidProviderResponseError) {
    return json({ error: { code: error.code, message: error.message } }, 502);
  }
  return json({ error: { code: "PROVIDER_ERROR", message: "The music provider request failed." } }, 502);
}

export default {
  async scheduled(_controller, env = {}, _ctx) {
    try {
      const result = await airlockCompletedTorrents(env);
      if (result.errors.length) console.error("TorBox automatic AirLock errors", result.errors);
      console.log("TorBox automatic AirLock sweep", result);
    } catch (error) {
      console.error("TorBox automatic AirLock sweep failed", error);
    }
  },

  async fetch(request, env = {}) {
    const url = new URL(request.url);
    let routePath = url.pathname;
    let privateAddonRequest = false;
    const configuredKey = env.ADDON_ACCESS_KEY;
    if (configuredKey) {
      const privateBase = `/a/${configuredKey}`;
      if (routePath === privateBase || routePath.startsWith(privateBase + "/")) {
        privateAddonRequest = true;
        routePath = routePath.slice(privateBase.length) || "/";
      }
    }
    if (routePath.startsWith("/a/") && !privateAddonRequest) return notFound();

    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
      return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    }

    if (routePath === "/" || routePath === "/manifest.json") {
      return json(MANIFEST);
    }

    if (routePath === "/health") {
      return json({
        status: "ok",
        addon: MANIFEST.id,
        provider: "torbox",
        integration: env.TORBOX_API_TOKEN ? "torbox-api-configured" : "awaiting-torbox-api-token"
      });
    }

    if (routePath === "/torbox/submit" && request.method === "POST") {
      const denied = requireAddonAccess(request, env);
      if (denied) return denied;
      try {
        const body = await request.json();
        if (!body || typeof body.magnet !== "string") {
          return badRequest("JSON body must contain a magnet string.");
        }
        if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 180)) {
          return badRequest("name must be a string of 180 characters or fewer.");
        }
        const result = await submitMagnet(env, body.magnet, body.name);
        return json(result, 202);
      } catch (error) {
        return torboxError(error);
      }
    }

    if (routePath === "/torbox/library" && request.method === "GET") {
      const denied = requireAddonAccess(request, env);
      if (denied) return denied;
      const query = (url.searchParams.get("q") || "").trim();
      if (query.length > 200) return badRequest("Search query must be 200 characters or fewer.");
      try {
        return json(await listAudioLibrary(env, query));
      } catch (error) {
        return torboxError(error);
      }
    }

    if (routePath === "/torbox/play" && request.method === "GET") {
      const denied = requireAddonAccess(request, env);
      if (denied) return denied;
      const trackId = url.searchParams.get("id") || "";
      try {
        return json(await resolveLibraryTrack(env, trackId));
      } catch (error) {
        return torboxError(error);
      }
    }

    if (routePath === "/torbox/file" && request.method === "GET") {
      const denied = requireAddonAccess(request, env);
      if (denied) return denied;
      try {
        const torrentId = url.searchParams.get("torrent_id");
        const fileId = url.searchParams.get("file_id");
        const result = await getPlayableFile(env, torrentId, fileId);
        return json(result);
      } catch (error) {
        return torboxError(error);
      }
    }

    if (routePath === "/torbox/status" && request.method === "GET") {
      const denied = requireAddonAccess(request, env);
      if (denied) return denied;
      const hash = (url.searchParams.get("hash") || "").toLowerCase();
      try {
        const result = await getStatusAndAirlock(env, hash);
        return json(result);
      } catch (error) {
        return torboxError(error);
      }
    }

    if (routePath === "/search" && privateAddonRequest) {
      const query = (url.searchParams.get("q") || "").trim();
      if (!query) return badRequest("The q query parameter is required.");
      if (query.length > 200) return badRequest("Search query must be 200 characters or fewer.");
      try {
        const result = await listAudioLibrary(env, query);
        return json({ tracks: result.tracks });
      } catch (error) {
        return torboxError(error);
      }
    }

    if (routePath.startsWith("/stream/") && privateAddonRequest) {
      let trackId;
      try {
        trackId = decodeURIComponent(routePath.slice("/stream/".length));
      } catch {
        return badRequest("Invalid track id encoding.");
      }
      if (!trackId || trackId.length > 512) return badRequest("Invalid track id.");
      try {
        const stream = await resolveLibraryTrack(env, trackId);
        if (!stream.ready) return json({ error: "Track is not ready." }, 404);
        return json({
          url: stream.url,
          format: stream.format,
          codec: stream.format,
          container: stream.format,
          manifest: "none",
          encrypted: false,
          ...(stream.audioQuality ? { quality: stream.audioQuality, audioQuality: stream.audioQuality } : {}),
          ...(stream.sampleRate ? { sampleRate: stream.sampleRate } : {}),
          ...(stream.bitDepth ? { bitDepth: stream.bitDepth } : {})
        });
      } catch (error) {
        return torboxError(error);
      }
    }

    const provider = getProvider(env);

    if (routePath === "/search") {
      const query = (url.searchParams.get("q") || "").trim();
      if (!query) return badRequest("The q query parameter is required.");
      if (query.length > 200) return badRequest("Search query must be 200 characters or fewer.");

      try {
        const result = await searchCatalog(provider, query, url.searchParams);
        return json(result);
      } catch (error) {
        return providerError(error);
      }
    }

    if (routePath.startsWith("/stream/")) {
      let trackId;
      try {
        trackId = decodeURIComponent(routePath.slice("/stream/".length));
      } catch {
        return badRequest("Invalid track id encoding.");
      }
      if (!trackId || trackId.length > 512) return badRequest("Invalid track id.");

      try {
        const stream = await resolvePlayback(provider, trackId, url.searchParams);
        return json(stream);
      } catch (error) {
        return providerError(error);
      }
    }

    return notFound();
  }
};
