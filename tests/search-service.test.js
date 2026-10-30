import test from "node:test";
import assert from "node:assert/strict";
import { searchCatalog } from "../src/services/search-service.js";

test("validates search input before calling the provider", async () => {
  let called = false;
  await assert.rejects(
    searchCatalog("   ", new URLSearchParams(), {}, {
      async searchCatalog() { called = true; return { tracks: [] }; }
    }),
    { code: "BAD_REQUEST" }
  );
  assert.equal(called, false);
});

test("normalizes provider results and applies a bounded limit", async () => {
  const provider = {
    async searchCatalog(query, options) {
      assert.equal(query, "blue train");
      assert.equal(options.limit, 2);
      return {
        tracks: [
          { id: "1", title: "One" },
          { id: "2", title: "Two" },
          { id: "3", title: "Three" }
        ]
      };
    }
  };

  const result = await searchCatalog(
    " blue train ",
    new URLSearchParams("limit=2"),
    {},
    provider
  );

  assert.deepEqual(result.tracks.map(track => track.id), ["1", "2"]);
  assert.equal(result.cached, false);
});

test("uses KV cache when a valid cached result exists", async () => {
  let providerCalled = false;
  const cache = {
    async get() { return { tracks: [{ id: "cached", title: "Cached result" }] }; },
    async put() {}
  };
  const result = await searchCatalog("test", new URLSearchParams(), { CATALOG_CACHE: cache }, {
    async searchCatalog() { providerCalled = true; return { tracks: [] }; }
  });

  assert.equal(providerCalled, false);
  assert.equal(result.cached, true);
  assert.equal(result.tracks[0].id, "cached");
});
