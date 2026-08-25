// ─────────────────────────────────────────────────────────────────────────
// Brotherhood Circle engine — group-level Human Design analysis for a set
// of charts. Two layers:
//
//  1. Group Composite Definition: pool every member's active gates into one
//     shared gate-set and run the same channel/center logic the single-chart
//     engine uses. This shows which centers the GROUP has reliable, built-in
//     access to as a unit (even if no single member has them individually —
//     a real, recognized HD technique, sometimes called a group/composite
//     chart). It is presented here as a composite snapshot, not the full
//     "Penta" system (which assigns specific roles like Ambassador of
//     Right/Might/Wisdom/Talent/Transference to particular members) — that
//     fuller theory needs its own dedicated ruleset and isn't included here.
//
//  2. Pairwise Connection Theory: for every pair of members and every one of
//     the 36 channels, classify the relationship between their activations
//     into the four standard connection types:
//       - Companionship: both people independently have the full channel.
//       - Dominance: one person has the full channel, the other has none of it.
//       - Electromagnetic: neither has it alone, but together their two
//         halves complete it — a genuinely new circuit that exists only
//         between them.
//       - Compromise: both share the same single incomplete gate (neither
//         has the other half) — a live but never-completed shared theme.
// ─────────────────────────────────────────────────────────────────────────
import { CENTER_NAMES, CHANNELS, GATE_TO_CENTER, MOTOR_CENTERS, TYPE_INFO } from "./hdData.js";

function formedChannelsFromGateSet(gateSet) {
  const formed = [];
  for (const [a, b, name] of CHANNELS) {
    if (gateSet.has(a) && gateSet.has(b)) {
      formed.push({ gates: [a, b], name, centers: [GATE_TO_CENTER[a], GATE_TO_CENTER[b]] });
    }
  }
  return formed;
}

function definedCentersFromChannels(formed) {
  const defined = new Set();
  const adjacency = Object.fromEntries(CENTER_NAMES.map((c) => [c, new Set()]));
  for (const ch of formed) {
    const [c1, c2] = ch.centers;
    defined.add(c1);
    defined.add(c2);
    adjacency[c1].add(c2);
    adjacency[c2].add(c1);
  }
  return { defined, adjacency };
}

/** Pools every member's active gates and computes the resulting composite BodyGraph. */
export function computeGroupComposite(members) {
  const gateSet = new Set();
  for (const m of members) for (const g of m.chart.activeGates) gateSet.add(g);
  const formed = formedChannelsFromGateSet(gateSet);
  const { defined, adjacency } = definedCentersFromChannels(formed);
  return {
    activeGates: [...gateSet].sort((a, b) => a - b),
    formedChannels: formed,
    definedCenters: [...defined],
    undefinedCenters: CENTER_NAMES.filter((c) => !defined.has(c)),
  };
}

/** Per-center tally of how many members have that center defined. */
export function centerDefinitionTally(members) {
  const tally = Object.fromEntries(CENTER_NAMES.map((c) => [c, { count: 0, members: [] }]));
  for (const m of members) {
    for (const c of m.chart.definedCenters) {
      tally[c].count += 1;
      tally[c].members.push(m.name);
    }
  }
  return tally;
}

function channelGateStatus(chart, gate) {
  return chart.activeGates.includes(gate);
}

/** Classifies the connection between two members for a single channel. */
function classifyChannel(a, b, gateA, gateB) {
  const aHasA = channelGateStatus(a, gateA);
  const aHasB = channelGateStatus(a, gateB);
  const bHasA = channelGateStatus(b, gateA);
  const bHasB = channelGateStatus(b, gateB);
  const aFull = aHasA && aHasB;
  const bFull = bHasA && bHasB;

  if (aFull && bFull) return "Companionship";
  if (aFull && !bHasA && !bHasB) return "Dominance";
  if (bFull && !aHasA && !aHasB) return "Dominance";
  if (!aFull && !bFull) {
    const combinedComplete = (aHasA || bHasA) && (aHasB || bHasB);
    if (combinedComplete && ((aHasA && !aHasB && bHasB && !bHasA) || (aHasB && !aHasA && bHasA && !bHasB))) {
      return "Electromagnetic";
    }
    if ((aHasA && bHasA && !aHasB && !bHasB) || (aHasB && bHasB && !aHasA && !bHasA)) {
      return "Compromise";
    }
  }
  return null;
}

/** All pairwise connections for a list of members ({id, name, chart}). */
export function pairwiseConnections(members) {
  const pairs = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      const connections = { Companionship: [], Dominance: [], Electromagnetic: [], Compromise: [] };
      for (const [gA, gB, name] of CHANNELS) {
        const kind = classifyChannel(a.chart, b.chart, gA, gB);
        if (!kind) continue;
        let dominantMember = null;
        if (kind === "Dominance") {
          const aFull = channelGateStatus(a.chart, gA) && channelGateStatus(a.chart, gB);
          dominantMember = aFull ? a.name : b.name;
        }
        connections[kind].push({ gates: [gA, gB], name, dominantMember });
      }
      pairs.push({ a: a.name, b: b.name, aId: a.id, bId: b.id, connections });
    }
  }
  return pairs;
}

/** Builds the narrative synthesis: strengths, blind spots, and how the group's mix of types/authorities plays out. */
export function buildCircleNarrative(members, composite, tally, pairs) {
  const n = members.length;
  const notes = [];

  // Centers unanimously defined / unanimously open
  const rockSolid = CENTER_NAMES.filter((c) => tally[c].count === n);
  const collectiveBlindSpots = CENTER_NAMES.filter((c) => tally[c].count === 0);
  const mixed = CENTER_NAMES.filter((c) => tally[c].count > 0 && tally[c].count < n);

  if (rockSolid.length) {
    notes.push({
      kind: "strength",
      title: "Shared bedrock",
      text: `Every man in this circle has ${rockSolid.join(", ")} defined. This is group-wide, dependable territory — ${rockSolid.length === 1 ? "a theme" : "themes"} the whole circle can operate from without needing outside input.`,
    });
  }
  if (collectiveBlindSpots.length) {
    const compensated = collectiveBlindSpots.filter((c) => composite.definedCenters.includes(c));
    const trueOpen = collectiveBlindSpots.filter((c) => !composite.definedCenters.includes(c));
    if (trueOpen.length) {
      notes.push({
        kind: "watch",
        title: "Collective blind spot",
        text: `Nobody in the circle has ${trueOpen.join(", ")} defined, and the group's combined gates don't cover it either. As a group you'll tend to absorb and amplify whatever energy shows up here from outside (a guest, a stressful season, the room you're in) rather than generating it yourselves — worth naming out loud so it doesn't get mistaken for "who we are."`,
      });
    }
    if (compensated.length) {
      notes.push({
        kind: "info",
        title: "Nobody carries it alone, but the circle covers it",
        text: `No one man individually has ${compensated.join(", ")} defined — but pooled together, gates spread across different members complete the channels that define ${compensated.length === 1 ? "it" : "them"} for the group as a whole. This kind of center tends to show up only when enough of the circle is actually in the room together.`,
      });
    }
  }
  for (const c of mixed) {
    const t = tally[c];
    notes.push({
      kind: "info",
      title: `${c} — carried by some, not all`,
      text: `${t.members.join(", ")} bring${t.count === 1 ? "s" : ""} ${c} definition to the group (${t.count}/${n}). ${t.count === 1 ? t.members[0] : "They"} naturally anchor${t.count === 1 ? "s" : ""} this theme for everyone else when it's needed.`,
    });
  }

  // Type distribution narrative
  const typeCounts = {};
  for (const m of members) typeCounts[m.chart.type] = (typeCounts[m.chart.type] || 0) + 1;
  const typeLines = [];
  if (typeCounts["Generator"] || typeCounts["Manifesting Generator"]) {
    const gCount = (typeCounts["Generator"] || 0) + (typeCounts["Manifesting Generator"] || 0);
    typeLines.push(
      `${gCount} of ${n} are Generators or Manifesting Generators — the circle's engine runs on response, not top-down mandates. Bring the group something real and specific to react to (a task, a plan, a question) rather than asking "what should we do"; watch for frustration if members keep saying yes to things that don't actually light them up.`
    );
  }
  if (typeCounts["Projector"]) {
    const names = members.filter((m) => m.chart.type === "Projector").map((m) => m.name);
    typeLines.push(
      `${names.join(", ")} ${names.length === 1 ? "is" : "are"} Projector${names.length === 1 ? "" : "s"} — built to see the group clearly and guide it, not to grind alongside it. ${names.length === 1 ? "He" : "They"} will function best when explicitly invited and recognized for insight, and can burn out fast if expected to keep pace like a Generator.`
    );
  }
  if (typeCounts["Manifestor"]) {
    const names = members.filter((m) => m.chart.type === "Manifestor").map((m) => m.name);
    typeLines.push(
      `${names.join(", ")} ${names.length === 1 ? "is" : "are"} Manifestor${names.length === 1 ? "" : "s"} — the circle's natural initiator${names.length === 1 ? "" : "s"}. The friction to watch for isn't willingness, it's communication: things go smoother when ${names.length === 1 ? "he tells" : "they tell"} the group what's about to happen before it happens, and worse when ${names.length === 1 ? "he's" : "they're"} blocked outright.`
    );
  }
  if (typeCounts["Reflector"]) {
    const names = members.filter((m) => m.chart.type === "Reflector").map((m) => m.name);
    typeLines.push(
      `${names.join(", ")} ${names.length === 1 ? "is" : "are"} a Reflector — rare, and a genuine barometer for the health of this circle. If ${names.length === 1 ? "he's" : "they're"} consistently having a hard time around the group, take it seriously as a signal about the group itself, not just about ${names.length === 1 ? "him" : "them"}.`
    );
  }

  // Authority mix
  const emotionalCount = members.filter((m) => m.chart.authority.key === "Solar Plexus").length;
  if (emotionalCount >= Math.ceil(n / 2)) {
    typeLines.push(
      `${emotionalCount} of ${n} run on Emotional Authority — big group decisions should never get made in a single sitting. Float the decision, let it breathe, and decide in a follow-up once the initial wave has passed.`
    );
  }

  // Notable pairwise connections (electromagnetic first — usually the most interesting to surface)
  const highlights = [];
  for (const p of pairs) {
    if (p.connections.Electromagnetic.length) {
      highlights.push(
        `${p.a} & ${p.b} have an Electromagnetic connection through ${p.connections.Electromagnetic.map((c) => `${c.gates.join("-")} (${c.name})`).join(", ")} — a circuit that only exists when the two of them are together, worth noticing since it can create a pull neither of them fully explains alone.`
      );
    }
  }

  return { rockSolid, collectiveBlindSpots, mixed, notes, typeLines, highlights, typeCounts };
}

export { CENTER_NAMES, MOTOR_CENTERS, TYPE_INFO };
