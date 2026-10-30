import { InvalidProviderResponseError } from "../utils/errors.js";

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Maps a provider-neutral catalogue record to BitChord's track shape.
 * Provider adapters must supply real identifiers and metadata; this mapper
 * deliberately does not invent missing IDs, titles, formats, or quality.
 */
export function toBitChordTrack(record) {
  if (!record || typeof record !== "object") {
    throw new InvalidProviderResponseError("Track record must be an object.");
  }

  const id = cleanString(record.id);
  const title = cleanString(record.title);
  if (!id || !title) {
    throw new InvalidProviderResponseError("Every track requires a non-empty id and title.");
  }

  const track = { id, title };
  for (const field of ["artist", "album", "format", "audioQuality"]) {
    const value = cleanString(record[field]);
    if (value) track[field] = value;
  }

  for (const field of ["sampleRate", "bitDepth", "bitrate"]) {
    const value = positiveNumber(record[field]);
    if (value !== undefined) track[field] = value;
  }

  const duration = positiveNumber(record.duration);
  if (duration !== undefined) track.duration = duration;

  const artworkURL = cleanString(record.artworkURL);
  if (artworkURL && /^https:\/\//i.test(artworkURL)) {
    track.artworkURL = artworkURL;
  }

  return track;
}
