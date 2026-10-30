/**
 * Development-only fixture provider. Never returns real Amazon catalogue data
 * or playable media. It exists solely to test the BitChord search contract.
 */
export async function searchTracks(query) {
  const normalized = String(query || "").trim();
  if (!normalized) return { tracks: [] };

  return {
    tracks: [{
      id: "mock:track-001",
      title: "Development Fixture Track",
      artist: "BitChord Test Artist",
      album: "Integration Test Fixtures",
      duration: 180,
      format: "fixture"
    }]
  };
}

export async function resolveStream() {
  throw new Error("Mock provider does not implement audio playback.");
}
