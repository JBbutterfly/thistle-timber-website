// ─────────────────────────────────────────────────────────────────────────
// BodyGraph SVG renderer. Draws the classic 9-center Human Design shape:
// centers positioned in their standard relative layout (Head/Ajna/Throat/
// G/Heart/Spleen-SolarPlexus/Sacral/Root), gate numbers distributed along
// each center's outer edge, and formed channels drawn as lines connecting
// the exact two gate points that complete them.
//
// This is a from-scratch layout (not traced from any proprietary chart) —
// visually in the standard BodyGraph arrangement, but the gate positions
// along each center's edge are evenly distributed rather than hand-tuned
// to match any particular commercial software pixel-for-pixel. The DATA
// (which gates belong to which center, which channels connect them) is
// exact; only the cosmetic micro-positioning of gate dots within a center
// is a clean approximation.
// ─────────────────────────────────────────────────────────────────────────
import { CENTERS, GATE_TO_CENTER } from "../engine/hdData.js";

const W = 460;
const H = 700;

// Each center: shape polygon points (for fill), and a "label edge" — the
// two endpoints along which its gates are evenly distributed as dots.
const LAYOUT = {
  Head: {
    poly: [[230, 26], [270, 96], [190, 96]],
    labelEdge: [[196, 90], [264, 90]],
    centroid: [230, 73],
  },
  Ajna: {
    poly: [[230, 176], [190, 106], [270, 106]],
    labelEdge: [[264, 112], [196, 112]],
    centroid: [230, 129],
  },
  Throat: {
    poly: [[160, 196], [300, 196], [300, 286], [160, 286]],
    labelEdge: [[168, 202], [292, 202]],
    centroid: [230, 241],
  },
  G: {
    poly: [[230, 306], [300, 376], [230, 446], [160, 376]],
    labelEdge: [[172, 364], [288, 364]],
    centroid: [230, 376],
  },
  Heart: {
    poly: [[318, 350], [366, 376], [318, 402]],
    labelEdge: [[326, 358], [326, 394]],
    centroid: [335, 376],
  },
  Spleen: {
    poly: [[70, 420], [140, 456], [70, 522]],
    labelEdge: [[80, 434], [80, 508]],
    centroid: [93, 466],
  },
  "Solar Plexus": {
    poly: [[390, 420], [320, 456], [390, 522]],
    labelEdge: [[380, 434], [380, 508]],
    centroid: [367, 466],
  },
  Sacral: {
    poly: [[168, 466], [292, 466], [292, 546], [168, 546]],
    labelEdge: [[176, 472], [284, 472]],
    centroid: [230, 506],
  },
  Root: {
    poly: [[168, 576], [292, 576], [292, 656], [168, 656]],
    labelEdge: [[176, 582], [284, 582]],
    centroid: [230, 616],
  },
};

const CENTER_FILL = {
  defined: "#8C4A2B",
  undefined: "#FFFDF8",
};
const CENTER_STROKE = "#4A2E1A";

const COLOR_PERSONALITY = "#362A1E"; // ink — conscious activations
const COLOR_DESIGN = "#B23A2E"; // red — unconscious activations
const COLOR_BOTH = "#9B5FA8"; // purple — activated on both sides

function lerp([x1, y1], [x2, y2], t) {
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

function gatePointsForCenter(centerName) {
  const gates = [...CENTERS[centerName].gates].sort((a, b) => a - b);
  const [p1, p2] = LAYOUT[centerName].labelEdge;
  const n = gates.length;
  const points = {};
  gates.forEach((g, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const [x, y] = lerp(p1, p2, t);
    points[g] = { x, y, center: centerName };
  });
  return points;
}

export function computeGatePositions() {
  const all = {};
  for (const center of Object.keys(CENTERS)) {
    Object.assign(all, gatePointsForCenter(center));
  }
  return all;
}

function polyPoints(pts) {
  return pts.map((p) => p.join(",")).join(" ");
}

function gateSide(chart, gate) {
  const g = chart.gateSides[gate];
  if (!g) return null;
  if (g.personality && g.design) return "both";
  if (g.personality) return "personality";
  return "design";
}

function sideColor(side) {
  if (side === "both") return COLOR_BOTH;
  if (side === "design") return COLOR_DESIGN;
  return COLOR_PERSONALITY;
}

/**
 * Renders an SVG string for the given chart (as returned by
 * hdEngine.computeChart / computeChartFromUtcParts).
 */
export function renderBodyGraphSvg(chart, { title = "" } = {}) {
  const positions = computeGatePositions();
  const definedSet = new Set(chart.definedCenters);

  const centerShapes = Object.entries(LAYOUT)
    .map(([name, layout]) => {
      const isDefined = definedSet.has(name);
      const fill = isDefined ? CENTER_FILL.defined : CENTER_FILL.undefined;
      return `<polygon points="${polyPoints(layout.poly)}" fill="${fill}" stroke="${CENTER_STROKE}" stroke-width="1.5" opacity="${isDefined ? 0.92 : 1}" />`;
    })
    .join("\n");

  const channelLines = chart.formedChannels
    .map((ch) => {
      const [a, b] = ch.gates;
      const pa = positions[a];
      const pb = positions[b];
      if (!pa || !pb) return "";
      const sa = gateSide(chart, a);
      const sb = gateSide(chart, b);
      const bothSame = sa === sb ? sa : "both";
      const color = sideColor(bothSame);
      return `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="${color}" stroke-width="3.5" stroke-linecap="round"><title>${a}-${b} ${ch.name}</title></line>`;
    })
    .join("\n");

  const activeGateSet = new Set(chart.activeGates);
  const gateDots = Object.entries(positions)
    .map(([gateStr, p]) => {
      const gate = Number(gateStr);
      const active = activeGateSet.has(gate);
      const side = active ? gateSide(chart, gate) : null;
      const color = active ? sideColor(side) : "#C9BFA6";
      const r = active ? 8 : 5.5;
      const label = `<text x="${p.x}" y="${p.y}" font-size="7.5" font-family="Inter, sans-serif" font-weight="${active ? 700 : 400}" fill="${active ? "#FFFDF8" : "#7A6E58"}" text-anchor="middle" dominant-baseline="central">${gate}</text>`;
      return `<g><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}" stroke="#FFFDF8" stroke-width="0.75" /><title>Gate ${gate}${side ? " (" + side + ")" : ""}</title>${active ? label : ""}</g>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title ? title + " " : ""}Human Design BodyGraph">
    ${channelLines}
    ${centerShapes}
    ${gateDots}
  </svg>`;
}

export { LAYOUT, COLOR_PERSONALITY, COLOR_DESIGN, COLOR_BOTH };
