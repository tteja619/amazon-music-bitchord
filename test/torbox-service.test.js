import test from "node:test";
import assert from "node:assert/strict";
import {
  extractInfoHash,
  submitMagnet,
  getStatusAndAirlock
} from "../src/services/torbox-service.js";

const HASH = "0123456789abcdef0123456789abcdef01234567";
const MAGNET = `magnet:?xt=urn:btih:${HASH}&dn=Test%20Album`;

test("extracts a hexadecimal BitTorrent info hash", () => {
  assert.equal(extractInfoHash(MAGNET), HASH);
  assert.throws(() => extractInfoHash("https://example.test/file"), /magnet URI/);
  assert.throws(() => extractInfoHash("magnet:?xt=urn:btih:invalid"), /40-character/);
});

test("automatically AirLocks a cached torrent after adding it to the account", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });
    if (parsed.pathname.endsWith("/torrents/checkcached")) {
      return Response.json({ success: true, data: { [HASH]: { hash: HASH, files: [] } } });
    }
    if (parsed.pathname.endsWith("/torrents/createtorrent")) {
      return Response.json({ success: true, data: null });
    }
    if (parsed.pathname.endsWith("/torrents/mylist") && options.method === "GET" && !parsed.searchParams.has("id")) {
      return Response.json({ success: true, data: [{ id: 42, hash: HASH, cached: true, download_finished: true, airlocked: false }] });
    }
    if (parsed.pathname.endsWith("/torrents/edittorrent")) {
      assert.deepEqual(JSON.parse(options.body), { torrent_id: 42, airlocked: true });
      return Response.json({ success: true, data: null });
    }
    if (parsed.pathname.endsWith("/torrents/mylist") && parsed.searchParams.get("id") === "42") {
      return Response.json({ success: true, data: { id: 42, hash: HASH, cached: true, download_finished: true, airlocked: true } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const result = await submitMagnet({ TORBOX_API_TOKEN: "test-token" }, MAGNET, "Test Album");
    assert.deepEqual(result, {
      hash: HASH,
      cached: true,
      status: "ready",
      torrentId: 42,
      airlocked: true
    });
    assert.ok(calls.some(call => call.url.pathname.endsWith("/torrents/edittorrent")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not AirLock an unfinished download", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/torrents/checkcached")) {
      return Response.json({ success: true, data: {} });
    }
    if (parsed.pathname.endsWith("/torrents/createtorrent")) {
      return Response.json({ success: true, data: null });
    }
    if (parsed.pathname.endsWith("/torrents/mylist")) {
      return Response.json({ success: true, data: [{ id: 43, hash: HASH, cached: false, download_finished: false, airlocked: false }] });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const result = await submitMagnet({ TORBOX_API_TOKEN: "test-token" }, MAGNET);
    assert.equal(result.status, "downloading");
    assert.equal(result.airlocked, false);
    assert.equal(result.torrentId, 43);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("status check AirLocks an item after TorBox reports completion", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push(parsed.pathname);
    if (parsed.pathname.endsWith("/torrents/mylist") && !parsed.searchParams.has("id")) {
      return Response.json({ success: true, data: [{ id: 44, hash: HASH, download_finished: true, airlocked: false }] });
    }
    if (parsed.pathname.endsWith("/torrents/edittorrent")) {
      return Response.json({ success: true, data: null });
    }
    if (parsed.pathname.endsWith("/torrents/mylist") && parsed.searchParams.get("id") === "44") {
      return Response.json({ success: true, data: { id: 44, hash: HASH, download_finished: true, airlocked: true } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const result = await getStatusAndAirlock({ TORBOX_API_TOKEN: "test-token" }, HASH);
    assert.equal(result.status, "ready");
    assert.equal(result.airlocked, true);
    assert.ok(calls.some(path => path.endsWith("/torrents/edittorrent")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
