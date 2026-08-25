// ─────────────────────────────────────────────────────────────────────────
// Location + historical timezone resolution — entirely client-side, no
// backend and no API key. Two public building blocks:
//
//  1. Open-Meteo's free Geocoding API (https://open-meteo.com) turns a
//     typed city name into lat/lon AND the IANA timezone name for that
//     place, in one call — no separate timezone-boundary lookup needed.
//  2. The browser's own Intl.DateTimeFormat (backed by the ICU tz
//     database bundled with every modern browser) resolves the *historical*
//     UTC offset for that IANA zone at the exact birth date/time, correctly
//     handling DST rules, historical zone changes, etc. — the same
//     approach used by `pytz`/`zoneinfo` in the reference implementations
//     this was cross-checked against.
//
// Birth data itself is never sent anywhere; the only network call is the
// free-text place name typed into the search box.
// ─────────────────────────────────────────────────────────────────────────

const GEOCODE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchPlaces(query, { count = 8 } = {}) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = `${GEOCODE_ENDPOINT}?name=${encodeURIComponent(trimmed)}&count=${count}&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Location search failed (${res.status})`);
  const data = await res.json();
  return (data.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    admin1: r.admin1 ?? "",
    admin2: r.admin2 ?? "",
    country: r.country ?? "",
    countryCode: r.country_code ?? "",
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    elevation: r.elevation,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
  }));
}

/** UTC offset (minutes, positive = east of UTC) of an IANA zone at a given instant. */
export function tzOffsetMinutesAt(timeZone, instant) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(instant).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtcMs - instant.getTime()) / 60000;
}

/**
 * Converts a local wall-clock birth date/time in a given IANA timezone into
 * the correct UTC Date, resolving the historical offset (DST, zone-rule
 * changes, etc.) by fixed-point iteration — the offset function is a step
 * function of time, so this converges in 1-2 passes except within the rare
 * ambiguous/nonexistent hour around a DST transition, where JS's own
 * Intl resolution (which picks one consistent side) is accepted, same as
 * every other Human Design/astrology calculator does for that edge case.
 */
export function localToUtc({ year, month, day, hour, minute }, timeZone) {
  let guessMs = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 4; i++) {
    const offsetMin = tzOffsetMinutesAt(timeZone, new Date(guessMs));
    const nextGuessMs = Date.UTC(year, month - 1, day, hour, minute) - offsetMin * 60000;
    if (nextGuessMs === guessMs) break;
    guessMs = nextGuessMs;
  }
  const finalOffset = tzOffsetMinutesAt(timeZone, new Date(guessMs));
  return { utcDate: new Date(guessMs), offsetMinutes: finalOffset };
}

export function formatOffset(offsetMinutes) {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
