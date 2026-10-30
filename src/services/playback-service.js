import {
  InvalidProviderResponseError,
  ProtectedStreamUnsupportedError
} from "../utils/errors.js";

const POSITIVE_FIELDS = ["sampleRate", "bitDepth", "bitrate"];

export async function resolvePlayback(provider, trackId, options = {}) {
  if (!provider || typeof provider.resolveStream !== "function") {
    throw new InvalidProviderResponseError("Provider does not implement resolveStream.");
  }

  const stream = await provider.resolveStream(trackId, options);
  if (!stream || typeof stream.url !== "string" || !/^https:\/\//i.test(stream.url)) {
    throw new InvalidProviderResponseError("Playback requires an absolute HTTPS URL.");
  }
  if (stream.encrypted !== false) {
    if (stream.encrypted === true) throw new ProtectedStreamUnsupportedError();
    throw new InvalidProviderResponseError("Provider must explicitly confirm that a stream is unencrypted.");
  }

  const result = { url: stream.url, encrypted: false };
  for (const field of ["codec", "container", "manifest", "format", "audioQuality"]) {
    if (typeof stream[field] === "string" && stream[field].trim()) {
      result[field] = stream[field].trim();
    }
  }
  for (const field of POSITIVE_FIELDS) {
    if (typeof stream[field] === "number" && Number.isFinite(stream[field]) && stream[field] > 0) {
      result[field] = stream[field];
    }
  }
  return result;
}
