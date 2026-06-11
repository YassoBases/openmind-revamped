# OpenMind REST API

OpenMind is an **API-first** product: the Flutter app is just one client of a
documented HTTP backend. Any application — web, mobile, server, another game —
can drive the entire pipeline (create a personalized game, poll it to ready,
fetch the spec or fully-assembled HTML, record play sessions, read progress)
over plain REST.

- **Base URL:** `http://<host>:8080` (binds `0.0.0.0` by default, so it is
  reachable from other devices on the LAN). All endpoints are under `/api/v1`.
- **Format:** JSON in, JSON out (the one exception is `GET …/play`, which
  returns `text/html`).
- **Interactive docs:** Swagger UI at `/api/docs`, OpenAPI 3.1 JSON generated
  from the same Zod schemas that validate requests at runtime.
- **Versioning:** the path carries the version (`/api/v1/…`). Breaking changes
  bump the prefix.

> **Quickest possible check:** `curl http://localhost:8080/api/v1/health`

---

## Table of contents

1. [Authentication](#authentication)
2. [Error format](#error-format)
3. [The core integration flow](#the-core-integration-flow)
4. [Endpoint reference](#endpoint-reference)
   - [System](#system)
   - [Students & auth](#students--auth)
   - [Games](#games)
   - [Play sessions](#play-sessions)
   - [Review mode](#review-mode)
   - [Progress & stats](#progress--stats)
5. [The GameSpec object](#the-gamespec-object)
6. [Progressive start in depth](#progressive-start-in-depth)
7. [Rendering a game in your own client](#rendering-a-game-in-your-own-client)
8. [Full worked examples](#full-worked-examples)
9. [Rate limits, moderation & safety](#rate-limits-moderation--safety)

---

## Authentication

OpenMind uses **lightweight device tokens** — there are no passwords or emails
(the audience is children; this is deliberate data minimization).

1. Create a student profile once: `POST /api/v1/students`. The response contains
   a `studentId` and an opaque bearer `token` (prefix `emt_`).
2. Store the token on the device.
3. Send it on **every** other request:

   ```http
   Authorization: Bearer emt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

Tokens are stored only as a SHA-256 hash on the server. Every game/library/stats
route is scoped to the authenticated student — you can only see and mutate your
own data. There is no token-refresh endpoint; the token is long-lived and lives
on the device (regenerate by creating a new profile).

---

## Error format

Every error uses one consistent envelope:

```json
{
  "error": {
    "code": "THEME_INVALID",
    "message": "theme \"football\" is not valid for quest_path",
    "requestId": "req-a1b2c3"
  }
}
```

| HTTP | Typical `code`s | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST`, `THEME_INVALID` | malformed body or invalid field |
| 401 | `UNAUTHORIZED` | missing / invalid bearer token |
| 404 | `NOT_FOUND` | resource doesn't exist or isn't yours |
| 409 | `NOT_READY`, `NOT_FAILED` | wrong state for the operation |
| 410 | `GENERATION_FAILED`, `PARAMS_LOST` | generation failed (retry) or server restarted |
| 422 | `TOPIC_REJECTED` | topic blocked by moderation |
| 429 | `RATE_LIMITED` | too many generations this hour |

`requestId` is also emitted in the server's pino logs — quote it when debugging.

---

## The core integration flow

This is the whole loop, the way the Flutter app does it. Steps 4–5 are the
**progressive start** that makes generation feel instant.

```
1. POST /students                         → { studentId, token }          (once)
2. POST /games {topic, gameType, theme…}  → { gameId, status:"generating", stubSpec }
3. Render the stubSpec NOW                → child plays the built-in tutorial immediately
4. Poll GET /games/:id every ~2s          → until status == "ready" (or "failed")
5. GET /games/:id/spec                    → the full GameSpec; hot-load it into the running game
6. (game finishes)
7. POST /games/:id/sessions {summary}     → XP, streak, enriched feedback
8. GET /games/library                     → list saved games, replay any offline
```

If you don't want to manage the shell yourself, replace steps 3–5 with a single
`GET /games/:id/play` once the game is ready — the server returns the
fully-assembled, ready-to-display HTML.

---

## Endpoint reference

### System

#### `GET /api/v1/health`
Unauthenticated. Liveness + diagnostics. This is what the app's **Test
Connection** button calls.

```json
{
  "name": "openmind-backend",
  "version": "4.0.0",
  "uptimeSec": 142,
  "db": "memory",                 // "postgres" | "memory" | "down"
  "llm": "mock",                  // "live" | "mock"
  "mockReason": "no ANTHROPIC_API_KEY set — serving golden specs with simulated latency",
  "metrics": {
    "stages": { "spec": { "count": 12, "p50": 4100, "p95": 9800, "avgMs": 5200 } },
    "escalationRate": 0.08,
    "promptCacheHitRate": 0.41,
    "estCostPerGameUsd": 0.037
  }
}
```

---

### Students & auth

#### `POST /api/v1/students`
Create a profile (onboarding). **Unauthenticated.**

Request:
```json
{
  "name": "Sami",                 // nickname only, 1–24 chars (required)
  "grade": 3,                     // 1–6 (required, elementary)
  "language": "en",               // "en" | "ar"   (default "en")
  "color": "#1CB0F6",             // favorite color, #RRGGBB (default #58CC02)
  "interest": "space",            // archetype id (optional, → companion sprite)
  "gender": null,                 // "m" | "f" | null — Arabic grammar ONLY (optional)
  "dailyGoal": 3                  // 1 | 3 | 5 (default 3)
}
```

Response `201`:
```json
{
  "studentId": "clx…",
  "token": "emt_…",               // store this; send as Bearer on every other call
  "student": { "id": "clx…", "name": "Sami", "grade": 3, "xp": 0, "streakCount": 0, … }
}
```

Valid `interest` ids: `dinosaurs`, `space`, `football`, `cats`, `robots`,
`ocean`, `cars`, `royalty`, `art`, `music`.

#### `GET /api/v1/students/me`
Returns the authenticated student's profile (the `student` shape above).

#### `PATCH /api/v1/students/me`
Partial update — any of `name`, `color`, `interest`, `language`, `dailyGoal`,
`grade`, `gender`. Returns the updated profile.

---

### Games

#### `POST /api/v1/games`
Create a game. **Returns immediately** — generation runs in the background.

Request:
```json
{
  "topic": "The Water Cycle",     // free text, required (what to learn)
  "subject": "Science",           // optional; the normalizer infers one if omitted
  "gameType": "quest_path",       // "quest_path" | "goal_shootout" | "draw_connect"
  "theme": "fantasy",             // must belong to the gameType (see table below)
  "sessionLength": 5,             // 3 | 5 | 7  (intro + 2/4/6 educational levels)
  "difficulty": "normal",         // "easy" | "normal" | "hard" (starting baseline)
  "language": "en"                // optional; defaults to the student's language
}
```

Valid `theme`s per `gameType`:

| gameType | themes |
|---|---|
| `quest_path` | `fantasy`, `sci_fi`, `detective`, `anime` |
| `goal_shootout` | `football`, `basketball`, `hockey`, `archery` |
| `draw_connect` | `blueprint`, `notebook`, `whiteboard`, `chalkboard` |

**Two possible responses:**

`201` — generation started (the normal case):
```json
{
  "gameId": "clx…",
  "status": "generating",
  "clarifyingQuestion": null,
  "stubSpec": { "specVersion": 1, "stub": true, "meta": {…}, "student": {…}, "levels": [] }
}
```
Render `stubSpec` immediately — it contains everything the built-in tutorial
needs (meta + student). The child plays the tutorial while the real spec
generates.

`200` — the topic was too vague and the normalizer wants **one** clarification
(no game was created):
```json
{
  "gameId": null,
  "status": "clarify",
  "clarifyingQuestion": "Ooh, animals! Which ones — dinosaurs, ocean animals, or pets?",
  "stubSpec": null
}
```
Show the question, let the child refine the topic, and `POST /games` again.

#### `GET /api/v1/games/:id`
Game status + metadata. Poll this during generation.

```json
{
  "id": "clx…",
  "gameType": "quest_path",
  "theme": "fantasy",
  "subject": "Science",
  "topic": "The Water Cycle",
  "language": "en",
  "status": "ready",              // "generating" | "ready" | "failed"
  "error": null,
  "shellVersion": "862e4dbd411131f7",
  "thumbnailUrl": "data:image/svg+xml;base64,…",
  "bestScore": 0,
  "playCount": 0,
  "lastPlayedAt": null,
  "createdAt": "2026-06-12T…"
}
```

#### `GET /api/v1/games/:id/spec`
The full [GameSpec](#the-gamespec-object) once ready.

- `200` → the GameSpec JSON.
- `202` + `Retry-After: 2` → still generating; poll again.
- `410` `GENERATION_FAILED` → generation failed; call `POST …/retry`.

#### `GET /api/v1/games/:id/play`
The **fully-assembled, ready-to-display HTML** (the template shell with the spec
already injected). Use this if you don't want to assemble the shell yourself.

- `Content-Type: text/html`
- `ETag: "<gameId>-<shellVersion>"` and long `Cache-Control` — send
  `If-None-Match` to get a `304` when nothing changed.
- `202` while generating, `410` if failed.

#### `PATCH /api/v1/games/:id`
Update play metadata.
```json
{ "bestScore": 80, "played": true }   // bestScore only rises; played bumps playCount + lastPlayedAt
```

#### `DELETE /api/v1/games/:id`
Soft-delete (removes it from the library). `204`.

#### `POST /api/v1/games/:id/retry`
Retry a `failed` generation (same parameters). `409` if the game isn't failed;
`410 PARAMS_LOST` if the server restarted since creation (just `POST /games`
again).

#### `POST /api/v1/games/:id/refine`
Cheap, mostly-free refinements on a `ready` game:
```json
{ "op": "theme", "theme": "detective" }   // $0, instant — re-themes the same content
{ "op": "harder" }                        // $0 — shifts the adaptive baseline up
{ "op": "easier" }                        // $0 — shifts it down
{ "op": "more_questions" }                // ~$0.01 — appends fresh items (Haiku)
```
Returns the updated game metadata.

---

### Play sessions

#### `POST /api/v1/games/:id/sessions`
Record a completed play session. The body is the **`reportSummary` payload the
game shell emits** over its bridge (see
[Rendering a game](#rendering-a-game-in-your-own-client)). Awards XP, advances
the streak, and returns enriched feedback.

Request:
```json
{
  "summary": {
    "xp": 320,
    "accuracy": 0.75,
    "mastery": false,
    "maxCombo": 4,
    "presented": 8,
    "items": [
      { "id": "l1_i1", "levelIndex": 1, "correct": true,  "hintsUsed": 0, "concepts": ["evaporation"], "difficulty": 2 },
      …
    ],
    "concepts": { "evaporation": { "correct": 2, "total": 2, "hints": 0 } }
  }
}
```

Response `201`:
```json
{
  "sessionId": "clx…",
  "xpAwarded": 345,
  "streak": { "count": 3, "extendedToday": true, "bonusXp": 25 },
  "enrichedFeedback": {
    "headline": "Water-cycle hero, Sami! 🌧️",
    "body": "You nailed evaporation. Let's explore condensation again next time!",
    "reviewSuggestions": ["condensation"]
  }
}
```

The per-item results feed **Review mode** (spaced repetition).

---

### Review mode

#### `GET /api/v1/review/today`
Synthesizes a quick-fire **Goal Shootout** GameSpec from the student's recently
**missed** items — zero LLM cost, genuine spaced repetition. Returns a full
GameSpec you render like any other game. `404 NOT_ENOUGH_DATA` until the child
has played enough to miss a few questions.

#### `POST /api/v1/review/sessions`
Same body/response as `POST /games/:id/sessions`, but for a review session (no
backing game row). Counts toward the streak and daily goal.

---

### Progress & stats

#### `GET /api/v1/students/me/stats`
```json
{
  "xp": 1240, "streakCount": 3, "dailyGoal": 3,
  "todaySessions": 2, "todayXp": 180, "goalMetToday": false,
  "league": "silver",            // "bronze" | "silver" (≥500) | "gold" (≥2000)
  "gamesCount": 7
}
```

#### `POST /api/v1/students/me/streak-check`
Call on app open. Lapses the flame if a day was missed.
```json
{ "streakCount": 0, "lapsed": true, "playedToday": false }
```

#### `GET /api/v1/students/me/xp-events?limit=50`
Recent XP events `{ items: [{ id, amount, reason, createdAt }] }`.

#### `GET /api/v1/games/library?limit=50&offset=0`
Paginated saved games, newest-played first:
```json
{ "items": [ { …gameView… } ], "total": 7, "limit": 50, "offset": 0 }
```

---

## The GameSpec object

The GameSpec is **the contract** — the same JSON shape whether it came from the
LLM, the demo files, or Review synthesis. It is validated by one Zod schema
(`shared/src/gamespec.ts`) on the server, in the shells, and in tests.

```jsonc
{
  "specVersion": 1,
  "meta": {
    "gameType": "quest_path",
    "theme": "fantasy",
    "subject": "Science",
    "topic": "The Water Cycle",
    "language": "en",            // "en" | "ar"
    "grade": 4,                  // 1–6
    "difficulty": "normal",      // starting baseline only; the engine adapts from here
    "sessionLength": 5,          // 3 | 5 | 7
    "numerals": "western"        // "western" | "arabic_indic"
  },
  "student": {
    "name": "Sami",
    "gender": null,              // Arabic grammar only
    "color": "#1CB0F6",          // the accent injected everywhere
    "interest": "space"          // → companion sprite
  },
  "narrative": {                 // quest_path heavy; light on others; absent on draw_connect
    "intro": "…", "outro": "…",
    "perLevel": ["…"]            // one line per educational level
  },
  "levels": [
    { "index": 0, "isIntro": true,  "title": "…", "teaching": [], "items": [] },   // tutorial, always empty
    { "index": 1, "isIntro": false, "title": "…",
      "teaching": [ { "id": "l1_t1", "text": "≤280 chars", "emphasis": ["key term"] } ],
      "items": [
        { "kind": "mcq", "id": "l1_i1",
          "prompt": "…", "options": ["a","b","c","d"], "correctIndex": 0,
          "explanation": "shown on right AND wrong (≤220 chars)",
          "hints": ["nudge", "narrow"],         // 1–2; never reveal the answer
          "concepts": ["evaporation"], "difficulty": 2 }
      ]
    }
  ],
  "diagram": { … },              // draw_connect ONLY: nodes, valid edges, distractors
  "summaryHints": { "concepts": ["…"], "nextTopics": ["…"] }
}
```

Key invariants (enforced server-side, safe to rely on as a client):
- `levels[0]` is **always** the intro tutorial: `isIntro:true`, no teaching, no
  items. It needs only `meta` + `student` — which is why the **stub** spec can
  render it instantly.
- `levels.length === meta.sessionLength`.
- Each educational level has 1–3 teach cards and 4–6 items spanning ≥2
  difficulty bands.
- `draw_connect` items are `{ kind:"connect", edgeIds:[…] }` and reference the
  `diagram.edges`; all other games use `{ kind:"mcq", options, correctIndex }`.

A **stub spec** (returned by `POST /games`) is the same shape with
`"stub": true` and `"levels": []`.

---

## Progressive start in depth

The trick that makes a 10–45 s generation feel instant: **the tutorial level
needs no generated content** (it teaches the mechanic, not the topic), and
everything it needs — `meta` + `student` — is known the moment the request is
accepted.

```
POST /games ───► 201 { gameId, status:"generating", stubSpec }
                          │
   render stubSpec ◄──────┘     child is playing the tutorial within ~1–3 s
        │
        │   ...meanwhile poll every ~2 s...
        ▼
GET /games/:id  ──► status:"generating" (×N) ──► status:"ready"
        │
        ▼
GET /games/:id/spec ──► full GameSpec ──► hot-load educational levels into the running game
```

If your client renders the official shells, the shell exposes
`window.EduCore.receiveSpec(spec)` for exactly this hot-load (see below). If you
render games your own way, just fetch the spec when `status:"ready"` and proceed.

If generation **fails**, `GET …/spec` returns `410`; show a friendly retry and
call `POST /games/:id/retry`.

---

## Rendering a game in your own client

You have three options, easiest first:

**A. Let the server assemble it.** `GET /games/:id/play` → drop the returned
HTML into an iframe (`srcdoc`) or a WebView. Done. The shell handles
everything internally.

**B. Assemble it yourself from a bundled shell.** The three shell templates
(`quest_path.html`, `goal_shootout.html`, `draw_connect.html`) are versioned,
self-contained single files with a spec slot:

```
/*__EDUMIND_SPEC_JSON__*/null
```

Replace that exact marker with your spec JSON — **escaping `<` as `<`** so
spec content can never break out of the `<script>` tag — and serve/inject the
result. This is what the Flutter app does for offline replay (bundled shell +
locally stored spec, zero network). The build emits a `manifest.json` mapping
each `gameType` to its `shellVersion` (content hash).

**C. Render games entirely your own way.** The GameSpec is plain, documented
JSON — nothing forces you to use the Phaser shells. Read `levels`, `items`,
`diagram`, etc. and present them however you like.

### The shell bridge (for A and B)

A running shell reports progress to its host on two channels (whichever exists):

- **native:** `window.EduMind.postMessage(JSON.stringify(msg))`
- **web iframe:** `window.parent.postMessage({ source:'EduMind', …msg }, '*')`

Messages: `reportScore`, `reportLevel`, `reportSummary`, `reportComplete`,
`reportEvent`. The `reportSummary` payload is exactly what you POST back to
`/games/:id/sessions`.

Host → shell (progressive start):
- deliver the full spec: call `window.EduCore.receiveSpec(spec)` (native) or
  `postMessage({source:'EduMindHost', type:'spec', payload: spec}, '*')` (web).
- signal failure: `EduCore.generationFailed()` /
  `{source:'EduMindHost', type:'generationFailed'}`.

---

## Full worked examples

### curl (mock mode, no keys needed)

```bash
BASE=http://localhost:8080

# 1. create a student
TOKEN=$(curl -s -X POST $BASE/api/v1/students \
  -H 'content-type: application/json' \
  -d '{"name":"Sami","grade":3,"language":"en","color":"#1CB0F6","interest":"space","dailyGoal":3}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 2. create a game
GID=$(curl -s -X POST $BASE/api/v1/games \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"topic":"The Water Cycle","subject":"Science","gameType":"quest_path","theme":"fantasy","sessionLength":5,"difficulty":"normal"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["gameId"])')

# 3. poll until ready
until [ "$(curl -s -H "authorization: Bearer $TOKEN" $BASE/api/v1/games/$GID | python -c 'import sys,json;print(json.load(sys.stdin)["status"])')" = ready ]; do sleep 2; done

# 4. fetch the spec (or: GET .../play for ready-made HTML)
curl -s -H "authorization: Bearer $TOKEN" $BASE/api/v1/games/$GID/spec | head -c 400
```

### JavaScript / TypeScript (fetch)

```ts
const BASE = 'http://localhost:8080';

async function api(path: string, init: RequestInit = {}, token?: string) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error((await res.json()).error?.message ?? res.statusText);
  return res.status === 204 ? null : res.json();
}

const { token } = await api('/api/v1/students', {
  method: 'POST',
  body: JSON.stringify({ name: 'Sami', grade: 3, language: 'en', color: '#1CB0F6' }),
});

const { gameId, stubSpec } = await api('/api/v1/games', {
  method: 'POST',
  body: JSON.stringify({
    topic: 'Dinosaurs', subject: 'Science',
    gameType: 'quest_path', theme: 'fantasy', sessionLength: 5, difficulty: 'normal',
  }),
}, token);

// render stubSpec now (tutorial plays immediately), then poll:
let status = 'generating';
while (status === 'generating') {
  await new Promise(r => setTimeout(r, 2000));
  ({ status } = await api(`/api/v1/games/${gameId}`, {}, token));
}
if (status === 'failed') throw new Error('generation failed');
const spec = await api(`/api/v1/games/${gameId}/spec`, {}, token);
// hot-load `spec` into the running game (EduCore.receiveSpec) — done.
```

### Dart (the pattern the Flutter app uses)

```dart
final base = Uri.parse('http://192.168.1.50:8080');
Map<String,String> h(String? t) => {
  'content-type': 'application/json',
  if (t != null) 'authorization': 'Bearer $t',
};

final reg = jsonDecode((await http.post(
  base.replace(path: '/api/v1/students'),
  headers: h(null),
  body: jsonEncode({'name': 'Sami', 'grade': 3, 'language': 'en', 'color': '#1CB0F6'}),
)).body);
final token = reg['token'] as String;

final created = jsonDecode((await http.post(
  base.replace(path: '/api/v1/games'),
  headers: h(token),
  body: jsonEncode({
    'topic': 'The Water Cycle', 'gameType': 'quest_path',
    'theme': 'fantasy', 'sessionLength': 5, 'difficulty': 'normal',
  }),
)).body);
// render created['stubSpec'] immediately; poll /games/:id until ready; fetch /spec.
```

### Python

```python
import requests, time
BASE = "http://localhost:8080"

tok = requests.post(f"{BASE}/api/v1/students",
    json={"name": "Sami", "grade": 3, "language": "en", "color": "#1CB0F6"}).json()["token"]
H = {"authorization": f"Bearer {tok}"}

gid = requests.post(f"{BASE}/api/v1/games", headers=H, json={
    "topic": "The Water Cycle", "gameType": "quest_path",
    "theme": "fantasy", "sessionLength": 5, "difficulty": "normal"}).json()["gameId"]

while requests.get(f"{BASE}/api/v1/games/{gid}", headers=H).json()["status"] == "generating":
    time.sleep(2)
spec = requests.get(f"{BASE}/api/v1/games/{gid}/spec", headers=H).json()
print(spec["meta"]["topic"], "→", len(spec["levels"]), "levels")
```

---

## Rate limits, moderation & safety

- **Generation rate limit:** per student, `MAX_GENERATIONS_PER_HOUR` (default
  20). Exceeding it returns `429 RATE_LIMITED`. Replays, reviews, refinements
  and demo games do **not** count.
- **Moderation:** the topic is checked before generation (OpenAI
  omni-moderation) and every generated text field is checked after; a flagged
  topic returns `422 TOPIC_REJECTED`. If no `OPENAI_API_KEY` is configured,
  moderation is skipped with a server warning (acceptable for local dev only —
  enable it for anything reaching real children).
- **Fact-check gate:** every generated spec passes a Haiku judge that reviews
  teach cards, items and hints for factual correctness and grade-appropriateness
  before it is ever served. Failed items are repaired or dropped.
- **No model-written code** is ever returned or executed — `/play` HTML is a
  fixed, audited shell with only data injected.
- **Branded/licensed characters** are never produced — the normalizer remaps
  such requests to original archetypes.

For the measured latency/cost of each stage, see [../PERF.md](../PERF.md). For
the design rationale behind every choice here, see
[../DECISIONS.md](../DECISIONS.md).
