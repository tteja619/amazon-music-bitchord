import * as amazon from "./amazon-music.js";
import * as mock from "./mock-provider.js";

/**
 * Mock catalogue access is opt-in and requires BOTH development flags.
 * Production defaults to the fail-closed Amazon adapter.
 */
export function getProvider(env = {}) {
  if (env.APP_ENV === "development" && env.MUSIC_PROVIDER === "mock") {
    return mock;
  }
  return amazon;
}
