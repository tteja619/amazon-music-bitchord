import { InvalidProviderResponseError, ProviderNotConfiguredError } from "../utils/errors.js";

const API_BASE = "https://api.torbox.app/v1/api";
const AUTO_AIRLOCK_TAG = "bitchord-auto-airlock";

function requireToken(env) {
  if (!env?.TORBOX_API_TOKEN) {
    throw new ProviderNotConfiguredError("Set the TORBOX_API_TOKEN Cloudflare Worker secret.");
  }
  return env.TORBOX_API_TOKEN;
}

async function apiRequest(env, path, options = {}) {
  const token = requireToken(env);
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(isForm ? {} : { "content-type": "application/json" }),
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
  if (!item || Number(item.id) !== Number(torrentId)) {
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

function isReady(torrent) {
  return torrent.download_finished === true ||
    torrent.cached === true ||
    torrent.download_state === "cached";
}

async function updateTorrent(env, torrent, changes = {}) {
  const payload = {
    torrent_id: torrent.id,
    name: typeof torrent.name === "string" ? torrent.name : "BitChord item",
    tags: Array.isArray(torrent.tags) ? torrent.tags : [],
    alternative_hashes: Array.isArray(torrent.alternative_hashes) ? torrent.alternative_hashes : [],
    airlocked: torrent.airlocked === true,
    ...changes
  };
  await apiRequest(env, "/torrents/edittorrent", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return getTorrent(env, torrent.id);
}

async function markForAutoAirlock(env, torrent) {
  if (torrent.airlocked === true) return torrent;
  const tags = Array.isArray(torrent.tags) ? torrent.tags : [];
  if (tags.includes(AUTO_AIRLOCK_TAG)) return torrent;
  return updateTorrent(env, torrent, { tags: [...tags, AUTO_AIRLOCK_TAG] });
}

export async function ensureAirlocked(env, torrent) {
  if (torrent.airlocked === true) return { airlocked: true, changed: false };
  const verified = await updateTorrent(env, torrent, { airlocked: true });
  if (verified.airlocked !== true) {
    throw new InvalidProviderResponseError("TorBox did not confirm airlocked=true after the edit request.");
  }
  return { airlocked: true, changed: true };
}

/**
 * Adds a user-supplied magnet to the authenticated TorBox account.
 * The caller must have the rights to download and store the content.
 */
export async function submitMagnet(env, magnet, name) {
  const hash = extractInfoHash(magnet);
  let torrent = await findTorrentByHash(env, hash);
  let cachedEntry = null;

  if (!torrent) {
    cachedEntry = await checkCached(env, hash);
    const created = await addMagnet(env, magnet, name);
    const torrentId = created?.torrent_id ?? created?.id;
    if (Number.isInteger(Number(torrentId)) && Number(torrentId) > 0) {
      torrent = await getTorrent(env, Number(torrentId));
    } else {
      torrent = await findTorrentByHash(env, hash);
    }
  }

  if (!torrent) {
    return {
      hash,
      cached: Boolean(cachedEntry),
      status: cachedEntry ? "cached_added_pending_account_sync" : "submitted_pending_account_sync",
      torrentId: null,
      airlocked: false
    };
  }

  torrent = await markForAutoAirlock(env, torrent);
  const cached = Boolean(cachedEntry) || torrent.cached === true ||
    torrent.download_state === "cached";

  if (!isReady(torrent)) {
    return {
      hash,
      cached,
      status: torrent.download_state || "downloading",
      torrentId: torrent.id,
      airlocked: torrent.airlocked === true
    };
  }

  const airlock = await ensureAirlocked(env, torrent);
  return {
    hash,
    cached,
    status: "ready",
    torrentId: torrent.id,
    airlocked: airlock.airlocked
  };
}

export async function getStatusAndAirlock(env, hash) {
  const normalizedHash = String(hash || "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(normalizedHash)) {
    throw new TypeError("A 40-character hexadecimal torrent info hash is required.");
  }
  const torrent = await findTorrentByHash(env, normalizedHash);
  if (!torrent) return { hash: normalizedHash, status: "not_found", airlocked: false };

  if (!isReady(torrent)) {
    return {
      hash: normalizedHash,
      torrentId: torrent.id,
      status: torrent.download_state || "downloading",
      airlocked: torrent.airlocked === true
    };
  }

  const airlock = await ensureAirlocked(env, torrent);
  return {
    hash: normalizedHash,
    torrentId: torrent.id,
    status: "ready",
    airlocked: airlock.airlocked
  };
}

/**
 * Generate a short-lived TorBox CDN URL for a file belonging to the user's
 * own torrent. Request it immediately before playback, not as a permanent URL.
 */
export async function getPlayableFile(env, torrentId, fileId) {
  if (!Number.isInteger(Number(torrentId)) || Number(torrentId) <= 0 ||
      !Number.isInteger(Number(fileId)) || Number(fileId) < 0) {
    throw new TypeError("Valid numeric torrent_id and file_id are required.");
  }

  const torrent = await getTorrent(env, Number(torrentId));
  if (!isReady(torrent)) {
    return { status: torrent.download_state || "downloading", ready: false };
  }
  if (!Array.isArray(torrent.files) ||
      !torrent.files.some(file => Number(file.id) === Number(fileId))) {
    throw new TypeError("The requested file does not belong to this TorBox torrent.");
  }

  const params = new URLSearchParams({
    token: requireToken(env),
    torrent_id: String(torrentId),
    file_id: String(fileId),
    redirect: "false",
    append_name: "true"
  });
  const link = await apiRequest(env, `/torrents/requestdl?${params}`, { method: "GET" });
  if (typeof link !== "string" || !/^https:\/\//i.test(link)) {
    throw new InvalidProviderResponseError("TorBox did not return a valid HTTPS download URL.");
  }
  return {
    ready: true,
    url: link,
    file: torrent.files.find(file => Number(file.id) === Number(fileId)),
    torrentName: typeof torrent.name === "string" ? torrent.name : ""
  };
}

/**
 * Cron scans only torrents tagged by this addon's submission flow. It never
 * AirLocks unrelated items in the user's TorBox library.
 */
export async function airlockCompletedTorrents(env) {
  const params = new URLSearchParams({ bypass_cache: "true", limit: "1000" });
  const data = await apiRequest(env, `/torrents/mylist?${params}`, { method: "GET" });
  const items = Array.isArray(data) ? data : [];
  let checked = 0;
  let airlocked = 0;
  const errors = [];

  for (const item of items) {
    if (!Array.isArray(item.tags) || !item.tags.includes(AUTO_AIRLOCK_TAG)) continue;
    checked += 1;
    if (!isReady(item) || item.airlocked === true) continue;
    try {
      await ensureAirlocked(env, item);
      airlocked += 1;
    } catch (error) {
      errors.push({ torrentId: item.id, message: error?.message || "AirLock failed" });
    }
  }
  return { checked, airlocked, errors };
}


const AUDIO_EXTENSIONS = new Set(["flac", "mp3", "m4a", "aac", "alac", "wav", "aiff", "aif", "opus", "ogg", "oga", "wma"]);
const LOSSLESS_FORMATS = new Set(["flac", "alac", "wav", "aiff", "aif"]);

function audioProfile(filename, torrentName = "") {
  const text = String(filename || "") + " " + String(torrentName || "");
  const normalized = text.toLowerCase();
  const ext = audioExtension(filename);
  const explicitAlac = /\balac\b/.test(normalized);
  const lossless = LOSSLESS_FORMATS.has(ext) || (ext === "m4a" && explicitAlac);
  const depthMatch = normalized.match(/(?:24|32|16|8)\s*[- ]?bit/);
  const rateMatch = normalized.match(/(\d{2,3}(?:\.\d+)?)\s*k(?:hz)?/);
  const bitDepth = depthMatch ? Number(depthMatch[0].match(/\d+/)[0]) : undefined;
  const sampleRate = rateMatch ? Math.round(Number(rateMatch[1]) * 1000) : undefined;
  const bitrateMatch = normalized.match(/(\d{2,4})\s*kbps/);
  const bitrate = bitrateMatch ? Number(bitrateMatch[1]) : undefined;
  let audioQuality;
  if (lossless) audioQuality = "LOSSLESS";
  else if (bitrate !== undefined) audioQuality = bitrate >= 256 ? "HIGH" : "LOW";
  return { format: ext, lossless, audioQuality, bitDepth, sampleRate, bitrate };
}
function qualityScore(track) {
  const lossless = track.audioQuality === "LOSSLESS" ? 1 : 0;
  const depth = Number(track.bitDepth) || 0;
  const rate = Number(track.sampleRate) || 0;
  const formatRank = ({ flac: 4, alac: 3, wav: 2, aiff: 1, aif: 1 })[track.format] || 0;
  const bitrate = Number(track.bitrate) || 0;
  return [lossless, depth, rate, formatRank, bitrate];
}

function compareQuality(a, b) {
  const left = qualityScore(a);
  const right = qualityScore(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return right[i] - left[i];
  }
  return a.title.localeCompare(b.title);
}

function audioExtension(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(String(filename || ""));
  const extension = match?.[1]?.toLowerCase();
  return extension && AUDIO_EXTENSIONS.has(extension) ? extension : null;
}

function displayTitle(filename) {
  const base = String(filename || "").split("/").pop() || "Unknown track";
  return base.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Unknown track";
}

/** Returns audio files from the authenticated user's completed TorBox torrents. */
export async function listAudioLibrary(env, query = "") {
  const params = new URLSearchParams({ bypass_cache: "true", limit: "1000" });
  const data = await apiRequest(env, "/torrents/mylist?" + params, { method: "GET" });
  const torrents = Array.isArray(data) ? data : [];
  const needle = String(query || "").trim().toLocaleLowerCase();
  const tracks = [];

  for (const torrent of torrents) {
    if (!isReady(torrent) || !Array.isArray(torrent.files)) continue;
    for (const file of torrent.files) {
      const extension = audioExtension(file.name);
      if (!extension) continue;
      const title = displayTitle(file.name);
      const haystack = [title, torrent.name, file.name].filter(Boolean).join(" ").toLocaleLowerCase();
      if (needle && !haystack.includes(needle)) continue;
      if (file.id === undefined || file.id === null) continue;
      const profile = audioProfile(file.name, torrent.name);
      tracks.push({
        id: String(torrent.id) + ":" + String(file.id),
        title,
        album: typeof torrent.name === "string" ? torrent.name : undefined,
        format: extension,
        audioQuality: profile.audioQuality,
        ...(profile.bitDepth ? { bitDepth: profile.bitDepth } : {}),
        ...(profile.sampleRate ? { sampleRate: profile.sampleRate } : {}),
        ...(profile.bitrate ? { bitrate: profile.bitrate } : {}),
        torrentId: torrent.id,
        fileId: file.id,
        size: typeof file.size === "number" ? file.size : undefined,
        _qualitySort: qualityScore({ ...profile, title })
      });
    }
  }
  tracks.sort(compareQuality);
  for (const track of tracks) delete track._qualitySort;
  return { tracks, total: tracks.length };
}

export async function resolveLibraryTrack(env, trackId) {
  const match = /^(\d+):(\d+)$/.exec(String(trackId || ""));
  if (!match) throw new TypeError("Track ID must contain numeric torrent and file IDs.");
  const torrentId = Number(match[1]);
  const fileId = Number(match[2]);
  const result = await getPlayableFile(env, torrentId, fileId);
  if (!result.ready) return result;
  return {
    ready: true,
    url: result.url,
    title: displayTitle(result.file.name),
    format: audioExtension(result.file.name) || undefined,
    audioQuality: audioProfile(result.file.name, result.torrentName || "").audioQuality,
    ...(() => {
      const profile = audioProfile(result.file.name, result.torrentName || "");
      return {
        ...(profile.sampleRate ? { sampleRate: profile.sampleRate } : {}),
        ...(profile.bitDepth ? { bitDepth: profile.bitDepth } : {}),
        ...(profile.bitrate ? { bitrate: profile.bitrate } : {})
      };
    })(),
    size: typeof result.file.size === "number" ? result.file.size : undefined
  };
}
