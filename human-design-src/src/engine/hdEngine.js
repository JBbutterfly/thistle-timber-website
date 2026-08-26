// ─────────────────────────────────────────────────────────────────────────
// Human Design chart engine — turns two sets of activations (Personality =
// birth moment, Design = 88° of solar arc earlier) into a full BodyGraph:
// active gates, formed channels, defined/open centers, Type, Strategy,
// Authority, Profile, Definition, Incarnation Cross, and signature themes.
// ─────────────────────────────────────────────────────────────────────────
import {
  CENTER_NAMES,
  CENTERS,
  MOTOR_CENTERS,
  GATE_TO_CENTER,
  CHANNELS,
  CHANNEL_KEY,
  CHANNEL_BY_KEY,
  PROFILES,
  crossAngle,
  AUTHORITY_LABELS,
  TYPE_INFO,
  DEFINITION_INFO,
} from "./hdData.js";
import { computeActivations, solveDesignTime, makeAstroTime } from "./ephemeris.js";

const DEFINITION_BY_COUNT = ["None", "Single", "Split", "Triple Split", "Quadruple Split"];

function buildGateSideMap(personality, design) {
  // gate -> { personality: bool, design: bool, lines: { personality: n, design: n } }
  const map = {};
  for (const [key, act] of Object.entries(personality)) {
    const g = act.gate;
    (map[g] ??= { personality: false, design: false, lines: {} });
    map[g].personality = true;
    map[g].lines.personality = act.line;
    (map[g].points ??= []).push({ side: "personality", planet: key, line: act.line });
  }
  for (const [key, act] of Object.entries(design)) {
    const g = act.gate;
    (map[g] ??= { personality: false, design: false, lines: {} });
    map[g].design = true;
    map[g].lines.design = act.line;
    (map[g].points ??= []).push({ side: "design", planet: key, line: act.line });
  }
  return map;
}

function formedChannels(activeGateSet) {
  const formed = [];
  for (const [a, b, name] of CHANNELS) {
    if (activeGateSet.has(a) && activeGateSet.has(b)) {
      formed.push({ gates: [a, b], name, centers: [GATE_TO_CENTER[a], GATE_TO_CENTER[b]] });
    }
  }
  return formed;
}

function centerGraphAndDefinition(formed) {
  const definedCenters = new Set();
  const adjacency = Object.fromEntries(CENTER_NAMES.map((c) => [c, new Set()]));
  for (const ch of formed) {
    const [c1, c2] = ch.centers;
    definedCenters.add(c1);
    definedCenters.add(c2);
    adjacency[c1].add(c2);
    adjacency[c2].add(c1);
  }
  return { definedCenters, adjacency };
}

function bfsReaches(adjacency, start, definedCenters, targetSet) {
  if (!definedCenters.has(start)) return false;
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (targetSet.has(cur) && cur !== start) return true;
    for (const next of adjacency[cur]) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return targetSet.has(start);
}

function connectedComponents(definedCenters, adjacency) {
  const visited = new Set();
  const components = [];
  for (const center of definedCenters) {
    if (visited.has(center)) continue;
    const comp = new Set();
    const queue = [center];
    visited.add(center);
    while (queue.length) {
      const cur = queue.shift();
      comp.add(cur);
      for (const next of adjacency[cur]) {
        if (definedCenters.has(next) && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

function determineType(definedCenters, adjacency) {
  if (definedCenters.size === 0) return "Reflector";
  const hasSacral = definedCenters.has("Sacral");
  const motorSet = new Set(MOTOR_CENTERS);
  const motorToThroat = bfsReaches(adjacency, "Throat", definedCenters, motorSet);
  if (hasSacral && motorToThroat) return "Manifesting Generator";
  if (hasSacral) return "Generator";
  if (motorToThroat) return "Manifestor";
  return "Projector";
}

function determineAuthority(definedCenters, adjacency) {
  if (definedCenters.size === 0) return { key: "Lunar", ...AUTHORITY_LABELS.Lunar };
  if (definedCenters.has("Solar Plexus"))
    return { key: "Solar Plexus", ...AUTHORITY_LABELS["Solar Plexus"] };
  if (definedCenters.has("Sacral")) return { key: "Sacral", ...AUTHORITY_LABELS.Sacral };
  if (definedCenters.has("Spleen")) return { key: "Spleen", ...AUTHORITY_LABELS.Spleen };
  if (definedCenters.has("Heart")) return { key: "Heart", ...AUTHORITY_LABELS.Heart };
  if (definedCenters.has("G") && bfsReaches(adjacency, "G", definedCenters, new Set(["Throat"]))) {
    return { key: "G Self-Projected", ...AUTHORITY_LABELS["G Self-Projected"] };
  }
  return { key: "Mental", ...AUTHORITY_LABELS.Mental };
}

/**
 * Full chart computation from raw birth data.
 * @param {{ year, month, day, hour, minute, utcOffsetHours }} birth
 */
export function computeChartFromUtcParts(utcDate) {
  const personalityTime = makeAstroTime(utcDate);
  const designTime = solveDesignTime(personalityTime);
  return computeChart(personalityTime, designTime);
}

export function computeChart(personalityTime, designTime) {
  const personality = computeActivations(personalityTime);
  const design = computeActivations(designTime);

  const gateSides = buildGateSideMap(personality, design);
  const activeGateSet = new Set(Object.keys(gateSides).map(Number));

  const formed = formedChannels(activeGateSet);
  const { definedCenters, adjacency } = centerGraphAndDefinition(formed);
  const undefinedCenters = CENTER_NAMES.filter((c) => !definedCenters.has(c));

  // For each open center: is it "completely open" (no active gate at all —
  // no filter whatsoever) or does it carry a "hanging gate" flavor (one or
  // more active gates present, just not their channel partner)?
  const openCenterFlavor = {};
  for (const center of undefinedCenters) {
    const hangingGates = CENTERS[center].gates.filter((g) => activeGateSet.has(g));
    openCenterFlavor[center] =
      hangingGates.length === 0
        ? { kind: "completely-open", gates: [] }
        : { kind: "flavored", gates: hangingGates };
  }

  const type = determineType(definedCenters, adjacency);
  const authority = determineAuthority(definedCenters, adjacency);

  const components = connectedComponents(definedCenters, adjacency);
  const definitionLabel = DEFINITION_BY_COUNT[Math.min(components.length, 4)];

  const pSunLine = personality.Sun.line;
  const dSunLine = design.Sun.line;
  const profile = `${pSunLine}/${dSunLine}`;
  const angle = crossAngle(profile);

  const incarnationCross = {
    profile,
    profileName: PROFILES[profile] ?? "Unknown",
    angle,
    personalitySunGate: personality.Sun.gate,
    personalityEarthGate: personality.Earth.gate,
    designSunGate: design.Sun.gate,
    designEarthGate: design.Earth.gate,
    label: `${angle} Cross of Gates ${personality.Sun.gate}/${personality.Earth.gate} | ${design.Sun.gate}/${design.Earth.gate}`,
  };

  return {
    personalityTime,
    designTime,
    personality,
    design,
    gateSides,
    activeGates: [...activeGateSet].sort((a, b) => a - b),
    formedChannels: formed,
    definedCenters: [...definedCenters],
    undefinedCenters,
    openCenterFlavor,
    definitionComponents: components.map((c) => [...c]),
    definition: definitionLabel,
    definitionText: DEFINITION_INFO[definitionLabel],
    type,
    typeInfo: TYPE_INFO[type],
    authority,
    profile,
    incarnationCross,
  };
}

export { CENTERS, CHANNEL_BY_KEY, CHANNEL_KEY };
