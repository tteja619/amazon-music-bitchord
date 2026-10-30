import test from "node:test";
import assert from "node:assert/strict";
import {
  extractInfoHash, submitMagnet, getStatusAndAirlock, getPlayableFile,
  airlockCompletedTorrents, listAudioLibrary, resolveLibraryTrack
} from "../src/services/torbox-service.js";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const MAGNET = "magnet:?xt=urn:btih:" + HASH + "&dn=Test%20Album";

test("extracts a hexadecimal BitTorrent info hash", () => {
  assert.equal(extractInfoHash(MAGNET), HASH);
  assert.throws(() => extractInfoHash("https://example.test/file"), /magnet URI/);
  assert.throws(() => extractInfoHash("magnet:?xt=urn:btih:invalid"), /40-character/);
});

test("automatically AirLocks a cached torrent after adding it to the account", async () => {
  const originalFetch = globalThis.fetch;
  const edits = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/torrents/mylist") && !parsed.searchParams.has("id")) {
      return Response.json({ success: true, data: [] });
    }
    if (parsed.pathname.endsWith("/torrents/checkcached")) {
      return Response.json({ success: true, data: { [HASH]: { hash: HASH, files: [] } } });
    }
    if (parsed.pathname.endsWith("/torrents/createtorrent")) {
      return Response.json({ success: true, data: { hash: HASH, torrent_id: 42 } });
    }
    if (parsed.pathname.endsWith("/torrents/edittorrent")) {
      const body = JSON.parse(options.body);
      edits.push(body);
      return Response.json({ success: true, data: null });
    }
    if (parsed.pathname.endsWith("/torrents/mylist") && parsed.searchParams.get("id") === "42") {
      return Response.json({ success: true, data: {
        id: 42, hash: HASH, name: "Test Album", cached: true, download_finished: true,
        tags: edits.some(edit => Array.isArray(edit.tags) && edit.tags.includes("bitchord-auto-airlock")) ? ["bitchord-auto-airlock"] : [], airlocked: edits.some(edit => edit.airlocked === true)
      } });
    }
    throw new Error("Unexpected request: " + url);
  };
  try {
    const result = await submitMagnet({ TORBOX_API_TOKEN: "test-token" }, MAGNET, "Test Album");
    assert.equal(result.status, "ready");
    assert.equal(result.cached, true);
    assert.equal(result.torrentId, 42);
    assert.equal(result.airlocked, true);
    assert.deepEqual(edits.map(edit => edit.airlocked), [false, true]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not AirLock an unfinished download", async () => {
  const originalFetch = globalThis.fetch;
  const edits = [];
  let tags = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/torrents/mylist") && !parsed.searchParams.has("id")) {
      return Response.json({ success: true, data: [] });
    }
    if (parsed.pathname.endsWith("/torrents/checkcached")) {
      return Response.json({ success: true, data: {} });
    }
    if (parsed.pathname.endsWith("/torrents/createtorrent")) {
      return Response.json({ success: true, data: { hash: HASH, torrent_id: 43 } });
    }
    if (parsed.pathname.endsWith("/torrents/edittorrent")) {
      const body = JSON.parse(options.body);
      edits.push(body);
      tags = body.tags;
      return Response.json({ success: true, data: null });
    }
    if (parsed.pathname.endsWith("/torrents/mylist") && parsed.searchParams.get("id") === "43") {
      return Response.json({ success: true, data: {
        id: 43, hash: HASH, name: "Test Album", cached: false,
        download_finished: false, download_state: "downloading",
        tags, airlocked: false
      } });
    }
    throw new Error("Unexpected request: " + url);
  };
  try {
    const result = await submitMagnet({ TORBOX_API_TOKEN: "test-token" }, MAGNET);
    assert.equal(result.status, "downloading");
    assert.equal(result.airlocked, false);
    assert.equal(result.torrentId, 43);
    assert.equal(edits.length, 1);
    assert.equal(edits[0].airlocked, false);
    assert.deepEqual(edits[0].tags, ["bitchord-auto-airlock"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("status check AirLocks an item after TorBox reports completion", async () => {
  const originalFetch = globalThis.fetch;
  let airlocked = false;
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/torrents/mylist") && !parsed.searchParams.has("id")) {
      return Response.json({ success: true, data: [{
        id: 44, hash: HASH, name: "Test Album", download_finished: true,
        tags: [], airlocked
      }] });
    }
    if (parsed.pathname.endsWith("/torrents/edittorrent")) {
      airlocked = JSON.parse(options.body).airlocked === true || airlocked;
      return Response.json({ success: true, data: null });
    }
    if (parsed.pathname.endsWith("/torrents/mylist") && parsed.searchParams.get("id") === "44") {
      return Response.json({ success: true, data: { id: 44, airlocked } });
    }
    throw new Error("Unexpected request: " + url);
  };
  try {
    const result = await getStatusAndAirlock({ TORBOX_API_TOKEN: "test-token" }, HASH);
    assert.equal(result.status, "ready");
    assert.equal(result.airlocked, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generates a TorBox file link only for a file in the completed torrent", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/torrents/mylist")) {
      return Response.json({ success: true, data: {
        id: 51, hash: HASH, download_finished: true,
        files: [{ id: 7, name: "Track.flac", size: 1000 }]
      } });
    }
    if (parsed.pathname.endsWith("/torrents/requestdl")) {
      assert.equal(parsed.searchParams.get("torrent_id"), "51");
      assert.equal(parsed.searchParams.get("file_id"), "7");
      assert.equal(parsed.searchParams.get("token"), "test-token");
      return Response.json({ success: true, data: "https://cdn.example.test/track.flac" });
    }
    throw new Error("Unexpected request: " + url);
  };
  try {
    const result = await getPlayableFile({ TORBOX_API_TOKEN: "test-token" }, 51, 7);
    assert.equal(result.ready, true);
    assert.equal(result.url, "https://cdn.example.test/track.flac");
    assert.equal(result.file.name, "Track.flac");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects file IDs not present in the user's torrent", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, data: {
    id: 52, download_finished: true, files: [{ id: 1, name: "allowed.flac" }]
  } });
  try {
    await assert.rejects(
      () => getPlayableFile({ TORBOX_API_TOKEN: "test-token" }, 52, 999),
      /does not belong/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduled sweep AirLocks only completed items tagged by this addon", async () => {
  const originalFetch = globalThis.fetch;
  let editCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/torrents/mylist") && !parsed.searchParams.has("id")) {
      return Response.json({ success: true, data: [
        { id: 61, hash: HASH, name: "owned.flac", download_finished: true, airlocked: false, tags: ["bitchord-auto-airlock"] },
        { id: 62, hash: HASH, name: "other.flac", download_finished: true, airlocked: false, tags: ["personal"] },
        { id: 63, hash: HASH, name: "pending.flac", download_finished: false, airlocked: false, tags: ["bitchord-auto-airlock"] }
      ] });
    }
    if (parsed.pathname.endsWith("/torrents/edittorrent")) {
      editCount += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.torrent_id, 61);
      assert.equal(body.airlocked, true);
      assert.deepEqual(body.tags, ["bitchord-auto-airlock"]);
      return Response.json({ success: true, data: null });
    }
    if (parsed.pathname.endsWith("/torrents/mylist") && parsed.searchParams.get("id") === "61") {
      return Response.json({ success: true, data: {
        id: 61, hash: HASH, name: "owned.flac", download_finished: true,
        airlocked: true, tags: ["bitchord-auto-airlock"]
      } });
    }
    if (parsed.pathname.endsWith("/torrents/mylist") && parsed.searchParams.get("id") === "61") {
      return Response.json({ success: true, data: { id: 61, airlocked: true } });
    }
    throw new Error("Unexpected request: " + url);
  };
  try {
    const result = await airlockCompletedTorrents({ TORBOX_API_TOKEN: "test-token" });
    assert.equal(result.checked, 2);
    assert.equal(result.airlocked, 1);
    assert.equal(editCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("lists audio files from completed TorBox torrents and filters by query", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, data: [
    {
      id: 71, name: "Album One", download_finished: true,
      files: [
        { id: 1, name: "Artist - First Song.flac", size: 5000 },
        { id: 2, name: "cover.jpg", size: 1000 }
      ]
    },
    {
      id: 72, name: "Pending Album", download_finished: false,
      files: [{ id: 3, name: "Not Ready.mp3", size: 2000 }]
    }
  ] });
  try {
    const all = await listAudioLibrary({ TORBOX_API_TOKEN: "test-token" });
    assert.equal(all.total, 1);
    assert.equal(all.tracks[0].id, "71:1");
    assert.equal(all.tracks[0].title, "Artist - First Song");
    assert.equal(all.tracks[0].format, "flac");

    const filtered = await listAudioLibrary({ TORBOX_API_TOKEN: "test-token" }, "first song");
    assert.equal(filtered.total, 1);
    assert.equal(filtered.tracks[0].id, "71:1");

    const missing = await listAudioLibrary({ TORBOX_API_TOKEN: "test-token" }, "not present");
    assert.equal(missing.total, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolves a library track to a fresh TorBox URL", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/torrents/mylist")) {
      return Response.json({ success: true, data: {
        id: 81, name: "Album Two", download_finished: true,
        files: [{ id: 9, name: "Track Two.flac", size: 9000 }]
      } });
    }
    if (parsed.pathname.endsWith("/torrents/requestdl")) {
      return Response.json({ success: true, data: "https://cdn.example.test/track-two.flac" });
    }
    throw new Error("Unexpected request: " + url);
  };
  try {
    const result = await resolveLibraryTrack({ TORBOX_API_TOKEN: "test-token" }, "81:9");
    assert.equal(result.ready, true);
    assert.equal(result.url, "https://cdn.example.test/track-two.flac");
    assert.equal(result.title, "Track Two");
    assert.equal(result.format, "flac");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed library track IDs", async () => {
  await assert.rejects(
    () => resolveLibraryTrack({ TORBOX_API_TOKEN: "test-token" }, "81:not-a-file"),
    /numeric torrent and file IDs/
  );
});


test("ranks detected hi-res lossless files ahead of CD lossless and lossy fallbacks", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, data: [
    { id: 91, name: "Album MP3 320kbps", download_finished: true,
      files: [{ id: 1, name: "Song.mp3", size: 1000 }] },
    { id: 92, name: "Album FLAC 16bit-44.1kHz", download_finished: true,
      files: [{ id: 2, name: "Song.flac", size: 2000 }] },
    { id: 93, name: "Album FLAC 24bit-96kHz", download_finished: true,
      files: [{ id: 3, name: "Song.flac", size: 3000 }] }
  ] });
  try {
    const result = await listAudioLibrary({ TORBOX_API_TOKEN: "test-token" }, "song");
    assert.deepEqual(result.tracks.map(track => track.id), ["93:3", "92:2", "91:1"]);
    assert.equal(result.tracks[0].audioQuality, "LOSSLESS");
    assert.equal(result.tracks[0].bitDepth, 24);
    assert.equal(result.tracks[0].sampleRate, 96000);
    assert.equal(result.tracks[2].audioQuality, "HIGH");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
