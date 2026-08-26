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
  defined: "#A63C06", // ember — the brand's single "on" color
  undefined: "#2A2E1D", // moss-dk — quiet/receded against the moss ground
};
const CENTER_STROKE = "rgba(255,255,255,.28)";

const COLOR_PERSONALITY = "#FFFFFF"; // white — conscious activations
const COLOR_DESIGN = "#C1544C"; // oxblood, lightened for on-dark legibility — unconscious activations
const COLOR_BOTH = "#E4682C"; // ember-lt — activated on both sides

function lerp([x1, y1], [x2, y2], t) {
  return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
}

// ── Decorative background: a soft body silhouette + nested "wiring" loops,
// sitting behind the centers/channels so the graph reads as a figure rather
// than shapes floating in space (matching the look of a printed report).
// Hand-drawn, not traced from any proprietary artwork.
const SILHOUETTE_POINTS = [
  [230, 14], [272, 60], [300, 118], [360, 200], [430, 400], [350, 560],
  [300, 650], [260, 686], [230, 694], [200, 686], [160, 650], [110, 560],
  [30, 400], [100, 200], [160, 118], [188, 60],
];

function mid([x1, y1], [x2, y2]) {
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

// Smooth closed path through a ring of points, rounding every corner.
function smoothClosedPath(points) {
  const n = points.length;
  const start = mid(points[n - 1], points[0]);
  let d = `M ${start[0]},${start[1]} `;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const next = points[(i + 1) % n];
    const m = mid(p, next);
    d += `Q ${p[0]},${p[1]} ${m[0]},${m[1]} `;
  }
  return d + "Z";
}

const SILHOUETTE_PATH = smoothClosedPath(SILHOUETTE_POINTS);

const WIRING_CENTER = [230, 380];
const WIRING_RADII = [
  [60, 69],
  [110, 126],
  [160, 184],
  [205, 236],
  [245, 278],
];

function renderBackgroundWiring() {
  const ellipses = WIRING_RADII.map(
    ([rx, ry]) =>
      `<ellipse cx="${WIRING_CENTER[0]}" cy="${WIRING_CENTER[1]}" rx="${rx}" ry="${ry}" fill="none" stroke="rgba(255,255,255,.11)" stroke-width="1.25" />`
  ).join("\n");
  return `<path d="${SILHOUETTE_PATH}" fill="rgba(255,255,255,.09)" stroke="rgba(255,255,255,.14)" stroke-width="1.5" />\n${ellipses}`;
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
      const color = active ? sideColor(side) : "#5A6140";
      const r = active ? 8 : 5.5;
      const strokeColor = active ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.18)";
      const labelColor = side === "personality" ? "#23251D" : "#FFFFFF";
      const label = `<text x="${p.x}" y="${p.y}" font-size="7.5" font-family="'IBM Plex Mono', monospace" font-weight="600" fill="${labelColor}" text-anchor="middle" dominant-baseline="central">${gate}</text>`;
      return `<g><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}" stroke="${strokeColor}" stroke-width="0.75" /><title>Gate ${gate}${side ? " (" + side + ")" : ""}</title>${active ? label : ""}</g>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title ? title + " " : ""}Human Design BodyGraph">
    ${renderBackgroundWiring()}
    ${channelLines}
    ${centerShapes}
    ${gateDots}
  </svg>`;
}

export { LAYOUT, COLOR_PERSONALITY, COLOR_DESIGN, COLOR_BOTH };
