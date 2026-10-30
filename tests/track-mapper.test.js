import test from "node:test";
import assert from "node:assert/strict";
import { toBitChordTrack, toBitChordTracks } from "../src/mappers/track-mapper.js";

test("maps required and valid optional BitChord track fields", () => {
  const result = toBitChordTrack({
    id: "amazon:123",
    title: "Example",
    artist: "Artist",
    album: "Album",
    duration: 184.6,
    artworkURL: "https://cdn.example.test/art.jpg",
    format: "mp3",
    audioQuality: "HIGH"
  });

  assert.deepEqual(result, {
    id: "amazon:123",
    title: "Example",
    artist: "Artist",
    album: "Album",
    duration: 185,
    artworkURL: "https://cdn.example.test/art.jpg",
    format: "mp3",
    audioQuality: "HIGH"
  });
});

test("rejects tracks without required id and title", () => {
  assert.throws(() => toBitChordTrack({ id: "123" }), {
    code: "INVALID_PROVIDER_TRACK"
  });
});

test("drops non-HTTPS artwork URLs", () => {
  const result = toBitChordTrack({
    id: "123",
    title: "Example",
    artworkURL: "http://insecure.example.test/art.jpg"
  });
  assert.equal("artworkURL" in result, false);
});

test("maps a list of tracks", () => {
  assert.equal(toBitChordTracks([{ id: "1", title: "One" }]).length, 1);
});
