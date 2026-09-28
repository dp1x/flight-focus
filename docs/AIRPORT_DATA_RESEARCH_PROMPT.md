# Airport dataset research prompt

Hand this to a deep-research agent (Grok / Qwen / GPT with browsing) to expand
the bundled aviation data in `src/data/`.

## Why this exists

The app ships **59 airports across 37 countries** in `src/data/airports.json`.
They are good but sparse: whole regions are missing, and `src/data/countries.json`
holds only 10 entries. The app is offline-only, so the dataset is what the user
gets — it cannot be topped up at runtime.

Run this **after CI is green**, so the returned files are validated on arrival.

## Where the data goes

| File | Target | Currently |
|---|---|---|
| `src/data/airports.json` | 2,000–5,000 airports | 59 |
| `src/data/countries.json` | ~250 ISO 3166-1 countries | 10 |

## Current schema (do not break these fields)

`src/data/airports.json` is an array of objects with exactly these keys:

```json
{
  "code": "ATL",
  "icao": "KATL",
  "name": "Hartsfield-Jackson Atlanta International Airport",
  "city": "Atlanta",
  "country": "United States",
  "countryCode": "US",
  "flag": "🇺🇸",
  "lat": 33.6407,
  "lng": -84.4277,
  "keywords": ["atlanta", "georgia", "delta", "southeast", "hartsfield jackson"]
}
```

`src/data/countries.json` currently uses a reduced shape
`{ "name": "United States", "code": "US" }`.

The TypeScript `Airport` interface lives in `src/map/AirportSearch.tsx`; if the
new data adds fields, that interface and the search index in the same file must
be updated in the same change.

---

# The prompt

Copy everything between the rules into the research agent.

---

**Research task: build a comprehensive, license-clean aviation dataset for an offline desktop application.**

**Context.** "Flight Focus" is a local-first desktop focus timer that runs
entirely offline. A user picks a departure and a destination airport, starts a
timed focus session, and a plane flies the great-circle arc between them on a 3D
globe. The dataset is bundled into the application binary and there are **no
network requests at runtime**, so coverage and correctness are the whole product
experience for this feature.

**Deliverable 1 — `airports.json`.** Target roughly 2,000–5,000 airports: every
airport worldwide with scheduled commercial passenger service, plus notable
reliever and general-aviation fields that a user might plausibly want to search
for. Emit a strict JSON array, one object per airport, using these keys:

| Key | Type | Notes |
|---|---|---|
| `code` | string | IATA code, exactly 3 uppercase letters |
| `icao` | string | ICAO code, exactly 4 uppercase letters |
| `name` | string | Official English name |
| `city` | string | Served city, not the airport's physical locality when they differ |
| `country` | string | English country name |
| `countryCode` | string | ISO 3166-1 alpha-2, uppercase |
| `flag` | string | Regional-indicator emoji flag for `countryCode` |
| `lat` | number | WGS84, 4 decimal places |
| `lng` | number | WGS84, 4 decimal places |
| `keywords` | string[] | Lowercase search aliases |

`keywords` is what makes search feel good. Include, where applicable: former
airport names, local-language names, the metro area, major airlines based there,
nearby well-known landmarks, common abbreviations, and common misspellings.

**Deliverable 2 — `countries.json`.** Every ISO 3166-1 country as strict JSON
with `name`, `code` (alpha-2), `alpha3`, `region`, and `subregion`.

**Deliverable 3 — provenance report.** A markdown file stating, per deliverable,
the upstream source used, its license, and how it was retrieved. Prefer
**OurAirports (public domain)** as the base. Explicitly flag anything derived
from share-alike sources such as OpenFlights (ODbL), because bundling it into a
desktop application creates obligations. Do **not** scrape Google Maps. Do not
include any data whose license forbids redistribution.

**Verification requirements.**

- No duplicate `code`; no duplicate `icao`.
- `lat` and `lng` are within valid ranges, and `lng` is in `[-180, 180]`.
- `countryCode` is a valid ISO 3166-1 alpha-2 code and matches `country`.
- The `flag` emoji matches `countryCode` exactly.
- Independently spot-check at least 30 well-known airports against published
  coordinates and report the maximum observed deviation. Known-good anchors:
  ATL `33.6407, -84.4277` · LHR `51.4700, -0.4543` · NRT `35.7720, 140.3929` ·
  SYD `-33.9399, 151.1753` · JNB `-26.1392, 28.2460` · GRU `-23.4356, -46.4731`
- Preserve all 59 airports already in the existing dataset, because they carry
  hand-curated keywords, and report exactly which of them changed.
- State explicitly how airports without an IATA code are handled. Either omit
  them or synthesise a stable internal code — say which, and why.

**Output format.** Strict JSON with no commentary and no code fences for
`airports.json` and `countries.json`, followed by a `manifest.json` containing:
record counts, a SHA-256 per file, the source citation, and the license for each
file. If a field genuinely cannot be determined for a record, emit `null`
instead of guessing, and state the count of nulls per field in the manifest.

---

# Handling the result

1. Drop the new `airports.json` and `countries.json` into `src/data/`.
2. Update the `Airport` interface in `src/map/AirportSearch.tsx` if fields were
   added. The search filter already indexes every field except `lat`/`lng`.
3. Run `npm run verify`. The integrity, typecheck, lint and unit tests all run
   against the new data — `greatCircleKm` tests in `src/map/geo.test.ts` use
   published distances, so a coordinate mistake in the anchors will surface.
4. Check the app still feels fast: the globe renders one mesh per airport, so a
   5,000-airport dataset means 5,000 meshes. If that is too heavy, add distance
   or hub-tier filtering before the globe renders pins.
5. Keep the provenance report in `docs/` so the licenses stay auditable.
