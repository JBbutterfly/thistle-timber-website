// ─────────────────────────────────────────────────────────────────────────
// Ephemeris layer — wraps `astronomy-engine` (a pure-JS, VSOP87/ELP2000-class
// analytical ephemeris, no external data files needed) to produce apparent
// geocentric ecliptic-of-date longitudes for the Sun, Moon, the eight
// planets, and the Moon's true (osculating) lunar node.
//
// IMPORTANT: `astronomy-engine`'s own `EclipticLongitude()` function returns
// HELIOCENTRIC longitude (verified against its source doc — a common trap).
// For Human Design and tropical astrology we need GEOCENTRIC apparent
// ecliptic-of-date longitude, so this module builds it manually from
// `GeoVector()` (geocentric position, light-time + aberration corrected)
// rotated into the "true ecliptic of date" (ECT) frame. This was verified
// against `SunPosition()` (which IS geocentric) to within ~0.005°, i.e.
// consistent with the light-time-correction convention difference alone.
// ─────────────────────────────────────────────────────────────────────────
import * as Astronomy from "astronomy-engine";
import {
  GATE_WHEEL_SEQUENCE,
  WHEEL_START_DEGREE,
  GATE_ARC,
  LINE_ARC,
} from "./hdData.js";

const norm360 = (deg) => ((deg % 360) + 360) % 360;

function geocentricEclipticLongitude(body, time) {
  const rot = Astronomy.Rotation_EQJ_ECT(time);
  const vecEQJ = Astronomy.GeoVector(body, time, true);
  const vecECT = Astronomy.RotateVector(rot, vecEQJ);
  return norm360((Math.atan2(vecECT.y, vecECT.x) * 180) / Math.PI);
}

function sunEclipticLongitude(time) {
  return norm360(Astronomy.SunPosition(time).elon);
}

// True (osculating) lunar node: computed from the Moon's instantaneous
// geocentric orbital-plane angular momentum vector, h = r × v — the plane's
// normal direction defines the line of nodes exactly, with no truncated
// perturbation series needed. This matches the astrological/HD convention
// of the "True Node" (as opposed to the smoothed 18.6-year "Mean Node").
function trueNodeLongitude(time) {
  const rot = Astronomy.Rotation_EQJ_ECT(time);
  const state = Astronomy.RotateState(rot, Astronomy.GeoMoonState(time));
  const hx = state.y * state.vz - state.z * state.vy;
  const hy = state.z * state.vx - state.x * state.vz;
  // Ascending node direction n = zHat × h = (-hy, hx, 0)
  return norm360((Math.atan2(hx, -hy) * 180) / Math.PI);
}

export function degreeToGateLine(degreeRaw) {
  const degree = norm360(degreeRaw);
  const adjusted = norm360(degree - WHEEL_START_DEGREE);
  const index = Math.min(63, Math.floor(adjusted / GATE_ARC));
  const withinGate = adjusted - index * GATE_ARC;
  const line = Math.min(6, Math.floor(withinGate / LINE_ARC) + 1);
  return { gate: GATE_WHEEL_SEQUENCE[index], line, degree };
}

const PLANET_BODIES = {
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

// Canonical activation-point order used by nearly all HD software / charts.
export const ACTIVATION_ORDER = [
  "Sun",
  "Earth",
  "NorthNode",
  "SouthNode",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
];

export const ACTIVATION_LABELS = {
  Sun: "Sun",
  Earth: "Earth",
  NorthNode: "North Node",
  SouthNode: "South Node",
  Moon: "Moon",
  Mercury: "Mercury",
  Venus: "Venus",
  Mars: "Mars",
  Jupiter: "Jupiter",
  Saturn: "Saturn",
  Uranus: "Uranus",
  Neptune: "Neptune",
  Pluto: "Pluto",
};

/**
 * Computes all 13 HD "activations" (Sun, Earth, Nodes, and the planets)
 * for a given moment in time, each carrying its ecliptic longitude, gate,
 * and line.
 */
export function computeActivations(time) {
  const sunLon = sunEclipticLongitude(time);
  const earthLon = norm360(sunLon + 180);
  const nnLon = trueNodeLongitude(time);
  const snLon = norm360(nnLon + 180);

  const out = {
    Sun: degreeToGateLine(sunLon),
    Earth: degreeToGateLine(earthLon),
    NorthNode: degreeToGateLine(nnLon),
    SouthNode: degreeToGateLine(snLon),
  };
  for (const [name, body] of Object.entries(PLANET_BODIES)) {
    out[name] = degreeToGateLine(geocentricEclipticLongitude(body, time));
  }
  return out;
}

/**
 * Given a birth AstroTime ("personality" moment), finds the "design" moment:
 * the point at which the Sun's ecliptic longitude was exactly 88.0 degrees
 * less than at birth (the classic Human Design "88 degrees of solar arc"
 * rule for the unconscious/biological imprint). Solved by bisection on the
 * continuous, monotonic solar-longitude function — the Sun always moves
 * forward through the zodiac, so this always converges to a single root in
 * the ~85-92 day window before birth (accounting for Earth's varying
 * orbital speed near perihelion/aphelion).
 */
export function solveDesignTime(personalityTime) {
  const targetLon = norm360(sunEclipticLongitude(personalityTime) - 88);

  // Sun's daily motion ranges ~0.953-1.019 deg/day across the year
  // (perihelion/aphelion), so 88 degrees of arc always falls within
  // 83-95 days before birth. Window padded to guarantee the bisection
  // brackets a sign change in every season.
  let lowUt = personalityTime.ut - 95;
  let highUt = personalityTime.ut - 83;

  const diffAt = (ut) => {
    const t = new Astronomy.AstroTime(ut);
    const lon = sunEclipticLongitude(t);
    // signed shortest angular difference, in (-180, 180]
    return (((lon - targetLon + 180) % 360) + 360) % 360 - 180;
  };

  let lowDiff = diffAt(lowUt);
  let highDiff = diffAt(highUt);
  // Both should already bracket a root (sun moves ~0.95-1.02 deg/day, so 85-92
  // days back always covers exactly one crossing of a target 88 degrees back).
  for (let i = 0; i < 60; i++) {
    const midUt = (lowUt + highUt) / 2;
    const midDiff = diffAt(midUt);
    if (Math.abs(midDiff) < 1e-7) {
      lowUt = highUt = midUt;
      break;
    }
    if (Math.sign(midDiff) === Math.sign(lowDiff)) {
      lowUt = midUt;
      lowDiff = midDiff;
    } else {
      highUt = midUt;
      highDiff = midDiff;
    }
  }
  return new Astronomy.AstroTime((lowUt + highUt) / 2);
}

export function makeAstroTime(utcDate) {
  return new Astronomy.AstroTime(utcDate);
}

export { Astronomy, norm360, geocentricEclipticLongitude, sunEclipticLongitude, trueNodeLongitude };
