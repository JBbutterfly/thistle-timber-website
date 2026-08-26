// ─────────────────────────────────────────────────────────────────────────
// Pairwise Connection view — the same Connection Theory used in the
// Brotherhood Circle, but focused on exactly two people: their Companionship/
// Dominance/Electromagnetic/Compromise channels, a center-by-center read on
// who carries what between just the two of them, and concrete, two-way
// "how to support each other" guidance built from each person's own
// Type/Strategy/Authority.
// ─────────────────────────────────────────────────────────────────────────
import { CENTER_NAMES } from "./hdData.js";
import { pairwiseConnections } from "./circleEngine.js";
import { TYPE_SUPPORT_TIPS, AUTHORITY_SUPPORT_TIPS } from "./supportTips.js";

/** Companionship/Dominance/Electromagnetic/Compromise between exactly these two people. */
export function computePairConnections(a, b) {
  return pairwiseConnections([a, b])[0];
}

/** Center-by-center read: who carries what between just these two. */
export function computeCenterDynamics(a, b) {
  return CENTER_NAMES.map((center) => {
    const aDef = a.chart.definedCenters.includes(center);
    const bDef = b.chart.definedCenters.includes(center);
    let kind, text;
    if (aDef && bDef) {
      kind = "shared";
      text = `Both of you run ${center} steadily — easy, dependable shared ground between you, not something either of you needs to explain to the other.`;
    } else if (aDef && !bDef) {
      kind = "aAnchors";
      text = `${a.name} runs ${center} steadily; ${b.name} will feel and amplify ${a.name}'s energy here. Genuinely useful in the moment — worth ${b.name} checking afterward what was actually theirs.`;
    } else if (bDef && !aDef) {
      kind = "bAnchors";
      text = `${b.name} runs ${center} steadily; ${a.name} will feel and amplify ${b.name}'s energy here. Genuinely useful in the moment — worth ${a.name} checking afterward what was actually theirs.`;
    } else {
      kind = "sharedOpen";
      text = `Neither of you runs ${center} on your own — together you'll pick up and amplify whatever's around you here, for better or worse. Worth naming as a shared blind spot rather than mistaking it for who either of you is.`;
    }
    return { center, kind, text };
  });
}

function fillName(template, name) {
  return template.replaceAll("{name}", name);
}

/** How `other` can support `person`, from person's own Type + Authority. */
export function supportTextFor(person) {
  const typeTip = TYPE_SUPPORT_TIPS[person.chart.type];
  const authorityTip = AUTHORITY_SUPPORT_TIPS[person.chart.authority.key];
  return {
    type: typeTip ? fillName(typeTip, person.name) : "",
    authority: authorityTip ? fillName(authorityTip, person.name) : "",
  };
}

/** Full two-way connection package for a pair of members ({id, name, chart}). */
export function computeConnection(a, b) {
  return {
    connections: computePairConnections(a, b),
    centerDynamics: computeCenterDynamics(a, b),
    supportForA: supportTextFor(a),
    supportForB: supportTextFor(b),
  };
}
