import { AppError } from "../utils/errors.js";
import { isHttpsUrl } from "../utils/security.js";

/**
 * Maps the provider-neutral track shape into BitChord's public track shape.
 * The Amazon adapter must first translate its documented response into this
 * canonical shape. This mapper deliberately assumes no undocumented fields.
 */
export function toBitChordTrack(track) {
  if (!track || typeof track !== "object" || Array.isArray(track)) {
    throw new AppError("INVALID_PROVIDER_TRACK", "Provider returned an invalid track.", 502);
  }

  const id = typeof track.id === "string" ? track.id.trim() : "";
  const title = typeof track.title === "string" ? track.title.trim() : "";

  if (!id || !title) {
    throw new AppError("INVALID_PROVIDER_TRACK", "Provider track is missing its id or title.", 502);
  }

  const mapped = { id, title };
  const stringFields = ["artist", "album", "format", "audioQuality"];
  for (const field of stringFields) {
    if (typeof track[field] === "string" && track[field].trim()) {
      mapped[field] = track[field].trim();
    }
  }

  if (Number.isFinite(track.duration) && track.duration >= 0) {
    mapped.duration = Math.round(track.duration);
  }

  if (isHttpsUrl(track.artworkURL)) {
    mapped.artworkURL = track.artworkURL;
  }

  return mapped;
}

export function toBitChordTracks(tracks) {
  if (!Array.isArray(tracks)) {
    throw new AppError("INVALID_PROVIDER_RESPONSE", "Provider search response must contain a track array.", 502);
  }
  return tracks.map(toBitChordTrack);
}
