import test from "node:test";
import assert from "node:assert/strict";
import { isHttpsUrl, validateSearchQuery, validateTrackId } from "../src/utils/security.js";

test("accepts trimmed bounded search terms", () => {
  assert.deepEqual(validateSearchQuery("  jazz  "), { ok: true, value: "jazz" });
});

test("rejects blank and oversized search terms", () => {
  assert.equal(validateSearchQuery(" ").ok, false);
  assert.equal(validateSearchQuery("x".repeat(201)).ok, false);
});

test("validates track identifiers", () => {
  assert.equal(validateTrackId("amazon:abc").ok, true);
  assert.equal(validateTrackId("").ok, false);
});

test("accepts only absolute HTTPS URLs", () => {
  assert.equal(isHttpsUrl("https://media.example.test/a"), true);
  assert.equal(isHttpsUrl("http://media.example.test/a"), false);
  assert.equal(isHttpsUrl("/relative/path"), false);
});
