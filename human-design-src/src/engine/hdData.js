// ─────────────────────────────────────────────────────────────────────────
// Human Design reference data
//
// This is the structural "rule book" of the Human Design BodyGraph system as
// synthesized by Ra Uru Hu (1987): the 64 gates mapped around the tropical
// zodiac wheel, the 9 energy centers, the 36 channels that connect them, and
// the naming conventions for profiles and incarnation crosses.
//
// Sourcing / verification notes (checked against multiple independent HD
// reference sources and cross-referenced open-source HD calculators):
//  - Gate wheel sequence + start offset: the wheel is divided into 64 equal
//    slices of 5.625° (360/64), each slice split into 6 lines of 0.9375°.
//    Gate 25 line 2 straddles 0° Aries — the wheel's zero point sits inside
//    Gate 25, not at a gate boundary. That fixes HD_START_DEGREE = 358.25°
//    (28°15' Pisces) as the start of Gate 25 / Line 1.
//  - Centers/channels: corrected against known errors in a public reference
//    implementation (that source misplaced Gate 28 in both Root AND Spleen,
//    and was missing 2 of the 36 channels — 10-34 "Exploration" and 10-57
//    "Perfected Form" — both fixed here).
// ─────────────────────────────────────────────────────────────────────────

// The 64 gates, in order around the zodiac wheel starting at 358.25°
// (28°15' Pisces), running forward through the signs. Index 0 = Gate 25.
export const GATE_WHEEL_SEQUENCE = [
  25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53,
  62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44,
  1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60, 41, 19, 13, 49, 30, 55,
  37, 63, 22, 36,
];

export const WHEEL_START_DEGREE = 358.25; // start of Gate 25 / Line 1
export const GATE_ARC = 360 / 64; // 5.625°
export const LINE_ARC = GATE_ARC / 6; // 0.9375°

// The 9 energy centers and the gates that live on their rim.
export const CENTERS = {
  Head: { gates: [64, 61, 63], type: "pressure", motor: false },
  Ajna: { gates: [47, 24, 4, 17, 43, 11], type: "awareness", motor: false },
  Throat: {
    gates: [62, 23, 56, 35, 12, 45, 33, 8, 31, 20, 16],
    type: "manifestation",
    motor: false,
  },
  G: { gates: [1, 13, 25, 46, 2, 15, 10, 7], type: "identity", motor: false },
  Heart: { gates: [21, 40, 26, 51], type: "motor", motor: true },
  Sacral: { gates: [5, 14, 29, 59, 9, 3, 42, 27, 34], type: "motor", motor: true },
  Spleen: { gates: [48, 57, 44, 50, 32, 28, 18], type: "awareness", motor: false },
  "Solar Plexus": {
    gates: [6, 37, 22, 36, 30, 55, 49],
    type: "motor",
    motor: true,
  },
  Root: {
    gates: [58, 38, 54, 53, 60, 52, 19, 39, 41],
    type: "motor",
    motor: true,
  },
};

export const CENTER_NAMES = Object.keys(CENTERS);

export const MOTOR_CENTERS = CENTER_NAMES.filter((c) => CENTERS[c].motor);

// Lookup: gate number -> center name
export const GATE_TO_CENTER = {};
for (const [center, def] of Object.entries(CENTERS)) {
  for (const gate of def.gates) GATE_TO_CENTER[gate] = center;
}

// The 36 channels, as [gateA, gateB] pairs, with the two centers they bridge
// and their traditional channel name.
export const CHANNELS = [
  [1, 8, "Inspiration"],
  [2, 14, "The Beat"],
  [3, 60, "Mutation"],
  [4, 63, "Logic"],
  [5, 15, "Rhythm"],
  [6, 59, "Mating"],
  [7, 31, "The Alpha"],
  [9, 52, "Concentration"],
  [10, 20, "Awakening"],
  [10, 34, "Exploration"],
  [10, 57, "Perfected Form"],
  [11, 56, "Curiosity"],
  [12, 22, "Openness"],
  [13, 33, "The Prodigal"],
  [16, 48, "Wavelength"],
  [17, 62, "Acceptance"],
  [18, 58, "Judgment"],
  [19, 49, "Synthesis"],
  [20, 34, "Charisma"],
  [20, 57, "The Brain Wave"],
  [21, 45, "Money Line"],
  [23, 43, "Structuring"],
  [24, 61, "Awareness"],
  [25, 51, "Initiation"],
  [26, 44, "Surrender"],
  [27, 50, "Preservation"],
  [28, 38, "Struggle"],
  [29, 46, "Discovery"],
  [30, 41, "Recognition"],
  [32, 54, "Transformation"],
  [34, 57, "Power"],
  [35, 36, "Transitoriness"],
  [37, 40, "Community"],
  [39, 55, "Emoting"],
  [42, 53, "Maturation"],
  [47, 64, "Abstraction"],
];

// Lookup helpers built from CHANNELS
export const CHANNEL_KEY = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const CHANNEL_BY_KEY = {};
export const GATE_PARTNERS = {}; // gate -> [gates that complete a channel with it]
for (const [a, b, name] of CHANNELS) {
  const key = CHANNEL_KEY(a, b);
  CHANNEL_BY_KEY[key] = {
    gates: [a, b],
    name,
    centers: [GATE_TO_CENTER[a], GATE_TO_CENTER[b]],
  };
  (GATE_PARTNERS[a] ??= []).push(b);
  (GATE_PARTNERS[b] ??= []).push(a);
}

// The 12 Human Design profiles (Personality Sun line / Design Sun line).
export const PROFILES = {
  "1/3": "Investigator / Martyr",
  "1/4": "Investigator / Opportunist",
  "2/4": "Hermit / Opportunist",
  "2/5": "Hermit / Heretic",
  "3/5": "Martyr / Heretic",
  "3/6": "Martyr / Role Model",
  "4/6": "Opportunist / Role Model",
  "4/1": "Opportunist / Investigator",
  "5/1": "Heretic / Investigator",
  "5/2": "Heretic / Hermit",
  "6/2": "Role Model / Hermit",
  "6/3": "Role Model / Martyr",
};

// Incarnation Cross angle, keyed by profile (Personality Sun line / Design Sun line).
export const RIGHT_ANGLE_PROFILES = new Set([
  "1/3",
  "1/4",
  "2/4",
  "2/5",
  "3/5",
  "3/6",
  "4/6",
]);
export const LEFT_ANGLE_PROFILES = new Set(["5/1", "5/2", "6/2", "6/3"]);
export const JUXTAPOSITION_PROFILES = new Set(["4/1"]);

export function crossAngle(profile) {
  if (JUXTAPOSITION_PROFILES.has(profile)) return "Juxtaposition";
  if (RIGHT_ANGLE_PROFILES.has(profile)) return "Right Angle";
  if (LEFT_ANGLE_PROFILES.has(profile)) return "Left Angle";
  return "Unknown";
}

// Line keynotes (the 6 lines, generic across all gates)
export const LINE_KEYNOTES = {
  1: "Investigator — needs a firm foundation; studies before acting.",
  2: "Hermit — naturally gifted, needs to be called out of solitude.",
  3: "Martyr — learns through trial and error; a resilient experimenter.",
  4: "Opportunist — the networker; influence travels through friendship.",
  5: "Heretic — the practical, projected-upon fixer; seen before known.",
  6: "Role Model — lives three phases: trial (0-30), roof (30-50), and lived example (50+).",
};

// Authority hierarchy, in strict priority order (checked top to bottom).
export const AUTHORITY_ORDER = [
  "Solar Plexus",
  "Sacral",
  "Spleen",
  "Heart",
  "G",
];

export const AUTHORITY_LABELS = {
  "Solar Plexus": {
    name: "Emotional Authority",
    guidance:
      "There is no truth in the now. Ride the emotional wave — clarity, not the initial high or low, is what to decide from.",
  },
  Sacral: {
    name: "Sacral Authority",
    guidance:
      "A gut response, felt in the moment. Listen for the body's uh-huh / un-uh in response to something real in front of you.",
  },
  Spleen: {
    name: "Splenic Authority",
    guidance:
      "Quiet, instant, and easy to talk yourself out of. Spontaneous in-the-moment awareness about health, safety, and timing.",
  },
  Heart: {
    name: "Ego Authority",
    guidance:
      "Willpower speaking through the body — what do I have the appetite and drive to commit to?",
  },
  "G Self-Projected": {
    name: "Self-Projected Authority",
    guidance:
      "Clarity found out loud. Talk it through with someone you trust and listen for where your own voice lands.",
  },
  Mental: {
    name: "Mental (Environmental) Authority",
    guidance:
      "No inner authority of the body. Clarity is found by processing out loud in the right environment, then sleeping on it — never deciding alone or under pressure.",
  },
  Lunar: {
    name: "Lunar Authority",
    guidance:
      "The Reflector's authority: sample a full lunar cycle (about 28 days) before committing to anything major, watching how the decision feels as the Moon moves through your whole chart.",
  },
};

// Type definitions
export const TYPE_INFO = {
  Manifestor: {
    strategy: "Inform before you act",
    signature: "Peace",
    notSelfTheme: "Anger",
    population: "~9%",
    summary:
      "Built to initiate. Manifestors are here to start things independently — the friction in their lives usually comes from not telling the people they impact before they act.",
  },
  Generator: {
    strategy: "Respond",
    signature: "Satisfaction",
    notSelfTheme: "Frustration",
    population: "~37%",
    summary:
      "Built with sustainable life-force energy, but not to initiate. Generators thrive by responding to what's in front of them rather than pushing to make things happen.",
  },
  "Manifesting Generator": {
    strategy: "Respond, then inform",
    signature: "Satisfaction",
    notSelfTheme: "Frustration",
    population: "~33%",
    summary:
      "A faster, multi-track Generator. Still here to respond, not initiate — but once in motion, moves, skips steps, and juggles more than a Generator, and does best informing others once committed.",
  },
  Projector: {
    strategy: "Wait for the invitation",
    signature: "Success",
    notSelfTheme: "Bitterness",
    population: "~20%",
    summary:
      "Built to guide, focus, and see others clearly — not to grind out sustained energy. Projectors thrive when recognized and invited into the right roles, and burn out trying to keep pace with Generator energy.",
  },
  Reflector: {
    strategy: "Wait a full lunar cycle",
    signature: "Surprise",
    notSelfTheme: "Disappointment",
    population: "~1%",
    summary:
      "Rare and entirely open in every center. Reflectors are mirrors and barometers for the health of the people and communities around them, and need real time — a full moon cycle — before committing to big decisions.",
  },
};

// Definition types (how the defined centers cluster into connected groups)
export const DEFINITION_INFO = {
  None: "No definition — a Reflector, whose chart is entirely open, sampling and reflecting the design of whoever and whatever is around them.",
  Single:
    "Single Definition — every defined center connects into one continuous circuit. The most internally consistent and self-contained definition type.",
  Split:
    "Split Definition — definition falls into two separate circuits, bridged only by outside people, timing, or the transits of the day. Relationships that bridge the split can feel unusually significant.",
  "Triple Split":
    "Triple Split Definition — three separate circuits of definition. Needs more from the outside world to feel whole, and can be unusually flexible once the right bridges show up.",
  "Quadruple Split":
    "Quadruple Split Definition — four separate circuits, the rarest definition type. Highly dependent on, and enriched by, a wide range of other people.",
};

export const CENTER_DESCRIPTIONS = {
  Head: "Pressure center — inspiration, questions, mental pressure to make sense of things. Not a place decisions should be made from.",
  Ajna: "Awareness center — the mind: certainty, opinion, and how you process and conceptualize information.",
  Throat: "The center of manifestation — action, communication, and expression all pass through here.",
  G: "Identity, direction, and love — the seat of who you are and where you're headed in life.",
  Heart: "Willpower, ego, and material drive — the capacity to make promises to yourself and others, and keep them.",
  Sacral: "Life-force energy — the body's motor for work, sustainability, and sexuality.",
  Spleen: "Awareness center — instinctive, in-the-moment intuition about health, safety, and what belongs.",
  "Solar Plexus": "Awareness center and motor — emotions, moods, and the wave that turns feeling into truth over time.",
  Root: "Pressure center and motor — the drive of stress, adrenaline, and the push to get things done.",
};
