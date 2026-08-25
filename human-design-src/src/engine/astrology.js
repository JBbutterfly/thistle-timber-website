// ─────────────────────────────────────────────────────────────────────────
// Companion tropical (Western) astrology snapshot — Human Design is itself
// built on tropical planetary longitudes, so this reuses the exact same
// geocentric ecliptic positions and adds the pieces classic astrology needs
// that HD doesn't: zodiac sign placements, the Ascendant (rising sign, which
// needs birth time + latitude/longitude), and major aspects between planets.
//
// House system: Whole Sign houses (the Ascendant's whole sign = 1st house,
// the next sign = 2nd, and so on). This is the oldest attested house system
// and needs only the Ascendant degree — no additional intermediate-cusp
// model (Placidus, Koch, etc.) to pick and defend.
// ─────────────────────────────────────────────────────────────────────────
import { Astronomy, norm360, geocentricEclipticLongitude, sunEclipticLongitude } from "./ephemeris.js";

export const ZODIAC_SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

export function signOf(longitude) {
  const lon = norm360(longitude);
  const index = Math.floor(lon / 30);
  const degreeInSign = lon - index * 30;
  return { sign: ZODIAC_SIGNS[index], degreeInSign, index };
}

const PLANET_BODIES = {
  Sun: null, // handled specially via SunPosition
  Moon: Astronomy.Body.Moon,
  Mercury: Astronomy.Body.Mercury,
  Venus: Astronomy.Body.Venus,
  Mars: Astronomy.Body.Mars,
  Jupiter: Astronomy.Body.Jupiter,
  Saturn: Astronomy.Body.Saturn,
  Uranus: Astronomy.Body.Uranus,
  Neptune: Astronomy.Body.Neptune,
  Pluto: Astronomy.Body.Pluto,
};

export function planetLongitudes(time) {
  const out = {};
  for (const [name, body] of Object.entries(PLANET_BODIES)) {
    out[name] = name === "Sun" ? sunEclipticLongitude(time) : geocentricEclipticLongitude(body, time);
  }
  return out;
}

/**
 * Ascendant (rising sign): the ecliptic longitude of the point where the
 * eastern horizon crosses the ecliptic. Derived directly from vector
 * geometry (zenith vector Z at RA=RAMC, Dec=latitude; ecliptic-plane normal
 * N at obliquity ε; the eastern intersection of the two great circles is
 * along N × Z), rather than copied from a memorized closed-form — the
 * commonly-quoted "tan(Asc) = -cos(RAMC) / (...)" form is exactly 180°
 * off (it locates the Descendant) unless its two signs are flipped, which
 * is easy to get backwards, so this was checked against the equatorial
 * case (RAMC=0, lat=0 => Ascendant must be exactly 90° ecliptic longitude,
 * i.e. RA 90 deg east of the meridian) before shipping:
 *   Ascendant = atan2( cos(RAMC), -( sin(RAMC)*cos(ε) + tan(lat)*sin(ε) ) )
 */
export function ascendantLongitude(time, latitude, longitudeEast) {
  const gastHours = Astronomy.SiderealTime(time); // Greenwich Apparent Sidereal Time, hours
  const lstDeg = norm360(gastHours * 15 + longitudeEast);
  const ramc = (lstDeg * Math.PI) / 180;
  const obliquity = (Astronomy.e_tilt(time).tobl * Math.PI) / 180;
  const lat = (latitude * Math.PI) / 180;

  const numerator = Math.cos(ramc);
  const denominator = -(Math.sin(ramc) * Math.cos(obliquity) + Math.tan(lat) * Math.sin(obliquity));
  let asc = (Math.atan2(numerator, denominator) * 180) / Math.PI;
  return norm360(asc);
}

export function wholeSignHouse(planetLon, ascLon) {
  const ascSignIndex = Math.floor(norm360(ascLon) / 30);
  const planetSignIndex = Math.floor(norm360(planetLon) / 30);
  return ((planetSignIndex - ascSignIndex + 12) % 12) + 1;
}

const ASPECTS = [
  { name: "Conjunction", angle: 0, orb: 8, symbol: "☌" },
  { name: "Sextile", angle: 60, orb: 4, symbol: "⚹" },
  { name: "Square", angle: 90, orb: 6, symbol: "□" },
  { name: "Trine", angle: 120, orb: 6, symbol: "△" },
  { name: "Opposition", angle: 180, orb: 8, symbol: "☍" },
];

export function findAspects(longitudes) {
  const names = Object.keys(longitudes);
  const found = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      let diff = Math.abs(longitudes[a] - longitudes[b]) % 360;
      if (diff > 180) diff = 360 - diff;
      for (const aspect of ASPECTS) {
        if (Math.abs(diff - aspect.angle) <= aspect.orb) {
          found.push({
            a,
            b,
            aspect: aspect.name,
            symbol: aspect.symbol,
            exactAngle: aspect.angle,
            orb: +Math.abs(diff - aspect.angle).toFixed(2),
          });
          break; // only the closest-matching aspect per pair
        }
      }
    }
  }
  return found.sort((x, y) => x.orb - y.orb);
}

/**
 * Full natal astrology snapshot for a birth moment + location.
 * @param {AstroTime} time
 * @param {number|null} latitude   Required for Ascendant/houses; pass null to skip.
 * @param {number|null} longitudeEast
 */
export function computeNatalAstrology(time, latitude, longitudeEast) {
  const longitudes = planetLongitudes(time);
  const placements = Object.fromEntries(
    Object.entries(longitudes).map(([name, lon]) => [name, { longitude: lon, ...signOf(lon) }])
  );

  let ascendant = null;
  if (typeof latitude === "number" && typeof longitudeEast === "number") {
    const ascLon = ascendantLongitude(time, latitude, longitudeEast);
    ascendant = { longitude: ascLon, ...signOf(ascLon) };
    for (const [name, p] of Object.entries(placements)) {
      p.house = wholeSignHouse(p.longitude, ascLon);
    }
  }

  const aspects = findAspects(longitudes);

  return { placements, ascendant, aspects };
}
