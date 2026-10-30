const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function validateSearchQuery(value) {
  if (typeof value !== "string") {
    return { ok: false, error: "The q query parameter is required." };
  }

  const query = value.trim();
  if (!query) return { ok: false, error: "The q query parameter is required." };
  if (query.length > 200) {
    return { ok: false, error: "Search query must be 200 characters or fewer." };
  }
  if (CONTROL_CHARACTERS.test(query)) {
    return { ok: false, error: "Search query contains unsupported control characters." };
  }

  return { ok: true, value: query };
}

export function validateTrackId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 512) {
    return { ok: false, error: "Invalid track id." };
  }
  if (CONTROL_CHARACTERS.test(value)) {
    return { ok: false, error: "Invalid track id." };
  }
  return { ok: true, value };
}

export function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
