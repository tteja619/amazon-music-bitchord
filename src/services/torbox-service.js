import { InvalidProviderResponseError, ProviderNotConfiguredError } from "../utils/errors.js";

const API_BASE = "https://api.torbox.app/v1/api";

function requireToken(env) {
  if (!env?.TORBOX_API_TOKEN) {
    throw new ProviderNotConfiguredError("Set the TORBOX_API_TOKEN Cloudflare Worker secret.");
  }
  return env.TORBOX_API_TOKEN;
}

async function apiRequest(env, path, options = {}) {
  const token = requireToken(env);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...options.headers
    }
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new InvalidProviderResponseError("TorBox returned a non-JSON response.");
  }

  if (!response.ok || payload?.success !== true) {
    const error = new Error(payload?.detail || `TorBox request failed with HTTP ${response.status}.`);
    error.code = payload?.error || "TORBOX_API_ERROR";
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

export function extractInfoHash(magnet) {
  if (typeof magnet !== "string" || !magnet.startsWith("magnet:?")) {
    throw new TypeError("A valid magnet URI is required.");
  }
  const params = new URLSearchParams(magnet.slice("magnet:?".length));
  const xt = params.getAll("xt").find(value => value.toLowerCase().startsWith("urn:btih:"));
  const hash = xt?.slice("urn:btih:".length).toLowerCase();
  if (!hash || !/^[a-f0-9]{40}$/.test(hash)) {
    throw new TypeError("The magnet must contain a 40-character hexadecimal BitTorrent info hash.");
  }
  return hash;
}

export async function checkCached(env, hash) {
  const params = new URLSearchParams({ hash, format: "object", list_files: "true" });
  const data = await apiRequest(env, `/torrents/checkcached?${params}`, { method: "GET" });
  return data?.[hash] || null;
}

export async function addMagnet(env, magnet, name) {
  const form = new FormData();
  form.set("magnet", magnet);
  if (name) form.set("name", name);
  return apiRequest(env, "/torrents/createtorrent", { method: "POST", body: form });
}

export async function getTorrent(env, torrentId) {
  const params = new URLSearchParams({ id: String(torrentId), bypass_cache: "true" });
  const data = await apiRequest(env, `/torrents/mylist?${params}`, { method: "GET" });
  const item = Array.isArray(data) ? data[0] : data;
  if (!item || typeof item.id !== "number") {
    throw new InvalidProviderResponseError("TorBox did not return the requested torrent.");
  }
  return item;
}

export async function findTorrentByHash(env, hash) {
  const params = new URLSearchParams({ bypass_cache: "true", limit: "1000" });
  const data = await apiRequest(env, `/torrents/mylist?${params}`, { method: "GET" });
  const items = Array.isArray(data) ? data : [];
  return items.find(item =>
    String(item.hash || "").toLowerCase() === hash ||
    (Array.isArray(item.alternative_hashes) &&
      item.alternative_hashes.some(value => String(value).toLowerCase() === hash))
  ) || null;
}

export async function ensureAirlocked(env, torrent) {
  if (torrent.airlocked === true) {
    return { airlocked: true, changed: false };
  }

  await apiRequest(env, "/torrents/edittorrent", {
    method: "PUT",
    body: JSON.stringify({ torrent_id: torrent.id, airlocked: true })
  });

  const verified = await getTorrent(env, torrent.id);
  if (verified.airlocked !== true) {
    throw new InvalidProviderResponseError("TorBox accepted the AirLock request but did not confirm airlocked=true.");
  }
  return { airlocked: true, changed: true };
}

/**
 * Adds a user-supplied magnet to the authenticated TorBox account.
 * The caller must ensure the user has rights to download and store the content.
 */
export async function submitMagnet(env, magnet, name) {
  const hash = extractInfoHash(magnet);
  const cachedEntry = await checkCached(env, hash);

  // TorBox's create endpoint attaches the item to this account. Cache status is
  // checked first so the UI can distinguish instant cached imports from downloads.
  await addMagnet(env, magnet, name);
  const torrent = await findTorrentByHash(env, hash);

  if (!torrent) {
    return {
      hash,
      cached: Boolean(cachedEntry),
      status: cachedEntry ? "cached_added_pending_account_sync" : "submitted_pending_account_sync",
      torrentId: null,
      airlocked: false
    };
  }

  const ready = torrent.download_finished === true || torrent.cached === true;
  if (!ready) {
    return {
      hash,
      cached: Boolean(cachedEntry),
      status: "downloading",
      torrentId: torrent.id,
      airlocked: false
    };
  }

  const airlock = await ensureAirlocked(env, torrent);
  return {
    hash,
    cached: Boolean(cachedEntry),
    status: "ready",
    torrentId: torrent.id,
    airlocked: airlock.airlocked
  };
}

export async function getStatusAndAirlock(env, hash) {
  if (!/^[a-f0-9]{40}$/.test(String(hash).toLowerCase())) {
    throw new TypeError("A 40-character hexadecimal torrent info hash is required.");
  }
  const torrent = await findTorrentByHash(env, String(hash).toLowerCase());
  if (!torrent) return { hash, status: "not_found", airlocked: false };

  const ready = torrent.download_finished === true || torrent.cached === true;
  if (!ready) {
    return {
      hash,
      torrentId: torrent.id,
      status: torrent.download_state || "downloading",
      airlocked: torrent.airlocked === true
    };
  }

  const airlock = await ensureAirlocked(env, torrent);
  return {
    hash,
    torrentId: torrent.id,
    status: "ready",
    airlocked: airlock.airlocked
  };
}
