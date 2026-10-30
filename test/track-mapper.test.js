import test from "node:test";
import assert from "node:assert/strict";
import { toBitChordTrack } from "../src/mappers/track-mapper.js";
import { searchCatalog } from "../src/services/search-service.js";
import { resolvePlayback } from "../src/services/playback-service.js";
import { getProvider } from "../src/providers/index.js";
import { ProviderNotConfiguredError } from "../src/utils/errors.js";

test("maps required and optional BitChord track fields", () => {
  const result = toBitChordTrack({
    id: "amazon:123",
    title: "Example",
    artist: "Artist",
    duration: 210,
    artworkURL: "https://cdn.example.test/art.jpg",
    bitDepth: 24
  });
  assert.deepEqual(result, {
    id: "amazon:123",
    title: "Example",
    artist: "Artist",
    duration: 210,
    artworkURL: "https://cdn.example.test/art.jpg"
  });
});

test("rejects tracks without a real id or title", () => {
  assert.throws(() => toBitChordTrack({ title: "Missing ID" }), /id and title/);
  assert.throws(() => toBitChordTrack({ id: "track:1" }), /id and title/);
});

test("development mock provider returns a BitChord-compatible fixture", async () => {
  const provider = getProvider({ APP_ENV: "development", MUSIC_PROVIDER: "mock" });
  const result = await searchCatalog(provider, "fixture");
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].id, "mock:track-001");
});

test("mock provider is not selected without both development flags", async () => {
  const provider = getProvider({ MUSIC_PROVIDER: "mock" });
  await assert.rejects(() => searchCatalog(provider, "fixture"), ProviderNotConfiguredError);
});

test("playback requires HTTPS and explicit unencrypted status", async () => {
  const valid = {
    resolveStream: async () => ({
      url: "https://media.example.test/audio",
      encrypted: false,
      codec: "flac",
      bitDepth: 24
    })
  };
  const stream = await resolvePlayback(valid, "track:1");
  assert.equal(stream.encrypted, false);
  assert.equal(stream.bitDepth, 24);

  await assert.rejects(
    () => resolvePlayback({ resolveStream: async () => ({ url: "https://media.example.test/audio" }) }, "track:1"),
    /explicitly confirm/
  );
  await assert.rejects(
    () => resolvePlayback({ resolveStream: async () => ({ url: "http://media.example.test/audio", encrypted: false }) }, "track:1"),
    /HTTPS/
  );
});
