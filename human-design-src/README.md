# Born Free Men — Human Design + Brotherhood Circle app

A Human Design + astrology chart calculator (real ephemeris, not lookup
tables) plus a "Brotherhood Circle" tool for group chart analysis, branded
for Born Free Men (palette/type pulled from a brand audit of
bornfreemethod.com — see `src/styles.css` for the sourcing note).

## Develop

```
npm install
npm run dev       # local dev server
npm run build     # builds into ../human-design/ (the static output the site serves)
```

There is no backend. Everything runs client-side:
- **Ephemeris**: `astronomy-engine` (pure JS, no external data files).
- **Geocoding + timezone**: Open-Meteo's free geocoding API for city → lat/lon
  + IANA timezone, then the browser's own `Intl.DateTimeFormat` (ICU tz
  database) resolves the historical UTC offset for that zone/date.
- **Storage**: `localStorage` only. Birth data never leaves the browser
  except the city-name text typed into the location search.

## Structure

- `src/engine/` — pure calculation logic (ephemeris, Human Design engine,
  astrology, geocoding, Brotherhood Circle group logic). No DOM code; unit
  testable directly in Node.
- `src/ui/` — rendering (BodyGraph SVG, localStorage persistence).
- `src/main.js` — the whole app (hash-router + render functions).

## Accuracy notes

See the comments at the top of `src/engine/hdData.js` and
`src/engine/ephemeris.js` for exactly what was verified and how (gate wheel
sequence/offset, the two channels + one miscategorized gate that were
corrected against a buggy public reference implementation, the geocentric-
vs-heliocentric trap in `astronomy-engine`'s own `EclipticLongitude()`, and
the Ascendant formula sign-error that was caught and fixed by deriving it
from vector geometry and checking the equatorial case).

The population-level Type/Definition/Authority distribution this engine
produces (~37% Generator, ~33% Manifesting Generator, ~20% Projector, ~9%
Manifestor, ~1% Reflector; ~40% Single/~45% Split definition; ~50% Emotional
authority) was checked against 600 random birth moments and matches widely
published Human Design population statistics closely — a strong end-to-end
sanity check of the whole pipeline, not just its individual pieces.
