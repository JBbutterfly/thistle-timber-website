// ─────────────────────────────────────────────────────────────────────────
// Default local-only starter records. Birth date/time/location for each
// comes straight off the cover page of their own Human Design report PDF.
// Coordinates/timezone are city-level (same precision the app's own
// location search would resolve), used to compute exact UTC birth moment.
//
// Only seeded into *local* storage on a fresh browser with no saved people
// yet — never overwrites anything already saved, and has no effect once
// cloud sync (Firebase) is configured and active.
// ─────────────────────────────────────────────────────────────────────────
export const SEED_PEOPLE = [
  {
    id: "seed-jeffery",
    name: "Jeffery",
    createdAt: Date.parse("2026-08-26T00:00:00.000Z"),
    birth: {
      year: 1988, month: 8, day: 3, hour: 17, minute: 3, unknownTime: false,
      locationLabel: "Merrillville, Indiana, United States",
      latitude: 41.4831, longitude: -87.3328,
      timezone: "America/Chicago", utcOffsetMinutes: -300,
      utcISO: "1988-08-03T22:03:00.000Z",
    },
  },
  {
    id: "seed-nathan-riley",
    name: "Nathan Riley",
    createdAt: Date.parse("2026-08-26T00:00:00.000Z"),
    birth: {
      year: 1985, month: 6, day: 24, hour: 6, minute: 10, unknownTime: false,
      locationLabel: "Pittsburgh, Pennsylvania, United States",
      latitude: 40.4406, longitude: -79.9959,
      timezone: "America/New_York", utcOffsetMinutes: -240,
      utcISO: "1985-06-24T10:10:00.000Z",
    },
  },
  {
    id: "seed-eric-anders",
    name: "Eric Anders",
    createdAt: Date.parse("2026-08-26T00:00:00.000Z"),
    birth: {
      year: 1992, month: 7, day: 6, hour: 22, minute: 0, unknownTime: false,
      locationLabel: "Wichita, Kansas, United States",
      latitude: 37.6872, longitude: -97.3301,
      timezone: "America/Chicago", utcOffsetMinutes: -300,
      utcISO: "1992-07-07T03:00:00.000Z",
    },
  },
  {
    id: "seed-ben-roller",
    name: "Ben Roller",
    createdAt: Date.parse("2026-08-26T00:00:00.000Z"),
    birth: {
      year: 1985, month: 9, day: 4, hour: 1, minute: 0, unknownTime: false,
      locationLabel: "Abington, Pennsylvania, United States",
      latitude: 40.1223, longitude: -75.1177,
      timezone: "America/New_York", utcOffsetMinutes: -240,
      utcISO: "1985-09-04T05:00:00.000Z",
    },
  },
  {
    id: "seed-matthew-koman",
    name: "Matthew Koman",
    createdAt: Date.parse("2026-08-26T00:00:00.000Z"),
    birth: {
      year: 1988, month: 8, day: 26, hour: 19, minute: 42, unknownTime: false,
      locationLabel: "Brandon, Florida, United States",
      latitude: 27.9378, longitude: -82.2859,
      timezone: "America/New_York", utcOffsetMinutes: -240,
      utcISO: "1988-08-26T23:42:00.000Z",
    },
  },
  {
    id: "seed-matthew-macpherson",
    name: "Matthew MacPherson",
    createdAt: Date.parse("2026-08-26T00:00:00.000Z"),
    birth: {
      year: 1986, month: 8, day: 27, hour: 13, minute: 20, unknownTime: false,
      locationLabel: "Antigonish, Nova Scotia, Canada",
      latitude: 45.6168, longitude: -61.9973,
      timezone: "America/Halifax", utcOffsetMinutes: -180,
      utcISO: "1986-08-27T16:20:00.000Z",
    },
  },
];

export const SEED_CIRCLES = [
  {
    id: "seed-thursday-morning-circle",
    name: "Thursday Morning Circle",
    memberIds: SEED_PEOPLE.map((p) => p.id),
    createdAt: Date.parse("2026-08-26T00:00:00.000Z"),
  },
];
