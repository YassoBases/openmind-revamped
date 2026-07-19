# DECISIONS.md — OpenMind Game Studio v4

## v4.4 — Scene Play: the generatable living-scene shell + brand palette unification

Approved decisions: the OpenMind primary interactive templates land as a new
GENERATABLE game type, and the app-wide Flutter theme adopts the fixed
OpenMind brand palette.

- **`scene_play` is a new game type, not a Number City extension.** Number
  City's curated identity (districts, goldens, trail-home entry, pinned
  tests) stays untouched; scene_play registers its own four kinds in
  `KINDS_BY_GAME` — exactly what that table exists for — and is the first
  scene-kind game type in `GENERATABLE_GAME_TYPES`. One theme
  (`wonder_world`); visual variety comes from interest kits, not themes.
- **Four new item kinds, AI fills JSON only** (`shared/src/gamespec.ts`):
  `rotation_transform` (turn to match a target pose; check = angle modulo
  360/symmetryFold), `cause_effect` (set ONE variable → run → watch; the
  mapping is a total function, goal reachable but never universal),
  `find_fix` (1-3 mistakes in correct context, each with a real correction
  plus ≥1 distractor correction), `create_express` (open creation with soft
  goals: palette must exceed what requirements consume). Stable issue codes
  (ROTATION_TRIVIAL, CAUSE_MAPPING_INCOMPLETE, CAUSE_TRIVIAL,
  FIX_NO_DISTRACTOR, CREATE_NO_CHOICE…) power targeted repair via a
  SEPARATE lean scene repair schema, keeping the classic one small.
- **Expressive results are celebrated, never scored.** create_express
  resolves `{expressive: true}`: fixed +10 XP, always the celebratory
  frame, and a full bypass of accuracy, mastery, strain and the
  AdaptiveEngine (`session.presented--` heals every ratio downstream).
  Evidence outcome is `explored` — never correct/incorrect. Static tests
  pin the bypass.
- **The ladder is stamped server-side.** scene_play sessions are ALWAYS
  intro + recognize/understand/apply/challenge (sessionLength coerced to 5);
  the assembler stamps `learningLevel` by index, so the LLM can't misorder
  the ladder. The interest kit is picked server-side too
  (`KIT_BY_INTEREST[student.interest]`, deterministic, part of the spec
  cache key) and rides the user message as label flavor only.
- **SceneKit (`shells/src/lib/scenekit.js`) is the living-scene layer** all
  learning shells share: five interest kits (nature / construction / space /
  cars / ocean — colors from the fixed palette only), kit backgrounds with
  2-layer tween-only parallax, ≤6 ambient flecks (no new particle pools),
  a canonical label→visual table (AR+EN keywords → ~29 drawn visuals,
  readable-chip fallback so ANY AI label renders), idle/pulse helpers,
  Hudhud's kit-commentary bubble, and the generic observe/notice beat
  overlays extracted from number_city (which now delegates to them,
  behavior-identical). Kits are presentation-only; their tables never read
  answers.
- **Evidence mapping uses the existing vocabulary** (no enum ripple):
  rotation_transform → construction, cause_effect → prediction, find_fix →
  transfer, create_express → exploration/`explored`.
- **The app theme now carries the OpenMind brand palette.** AppColors /
  MiddlePalette / OnbColors keep their historical token NAMES but hold the
  brand values (Warm Cream #FDF2E2 surfaces, Soft Sand #FAE9D0, Deep Teal
  #19725E ink, Main Teal #079A90 interactive, Bright Orange #EF9722, Soft
  Peach, Deep Green, Soft Sky) — one identity across app chrome and game
  shells, two registers, never two brands. Contrast: body-on-cream ≈4.7:1,
  ink-on-cream ≈5.1:1 (AA).

## v4.3 — Celebration-only bee, game evidence, learning spec contract (primary Phase 2)

Approved decisions: the bee leaves the persistent HUD, and game play feeds
the OpenMind learning-evidence store.

- **Nahla is celebration-only now.** No HUD mounting, no per-answer
  reactions, no menu cameo. She appears exactly twice: a brief non-blocking
  fly-in on level-complete (`EduCore.beeCelebration`, ~2.2s, destroyed after)
  and the summary screen — which is hers ALONE (the Hoopoe no longer stands
  beside her; rewards are hers, guidance is his, and they never share a
  moment). Static tests enforce all of it.
- **Game play IS learning evidence.** `recordSession` derives one
  `game_item` evidence row per summary item into the same append-only store
  the learn engine reads (new source in `EVIDENCE_SOURCES`, mirrored in the
  Dart twin): skillId `game:<first concept tag>`, kind recall (mcq) /
  construction (connect), outcome = first-try correctness with `recovered`
  carried, verification `client_reported`, ids derived from the session so
  the log stays idempotent. Client-authored fields are coerced and capped;
  derivation is best-effort and can never fail the session.
- **The spec contract now speaks the learning system's language**
  (`shared/src`): four scene item kinds — `tap_scene`, `drag_collect`,
  `sequence` (array order = canonical answer; shells shuffle presentation),
  `build_complete` (gap pieces answered by matching options + distractors) —
  each with semantic rules and stable repair codes (SCENE_NO_CORRECT,
  SCENE_NO_DISTRACTOR, SEQUENCE_STEPS_NOT_UNIQUE, BUILD_NO_GAP,
  BUILD_ALL_GAPS, BUILD_OPTION_MISSING, BUILD_NO_DISTRACTOR) and the
  hint-reveal check generalized across kinds. Kind eligibility moved from a
  hardcoded ternary to the `KINDS_BY_GAME` table — the Number City shell
  registers its kinds in one place. `meta.conceptId` + `meta.wrapper`
  (nature | construction; presentation-only by doctrine) and
  `level.learningLevel` with the ladder rule: when used, educational levels
  carry exactly recognize → understand → apply → challenge in order.
  GAME_TYPES deliberately unchanged — `number_city` lands with its shell.

## v4.2 — Warm palette + supportive retry + learning-event contract (primary learning-system Phase 1)

Product decisions (approved): remove hearts globally, adopt the warm OpenMind
palette globally, and prepare the engine seams for the Number City learning
world (which will enter as a dedicated trail-home entry, not via the composer).

- **Hearts are gone from the engine — replaced by a supportive retry loop.**
  A wrong answer costs nothing: the learner retries the same item with the
  next hint rung auto-offered (one retry per available hint, so 2–3 attempts),
  then gets a supported reveal + explanation and moves on. Scoring, mastery,
  combos and the AdaptiveEngine all read **first-try correctness only** —
  kindness must not inflate progress or steer difficulty upward. Solving on a
  retry is celebrated as "recovered" (+5 XP, bee reacts, no combo).
  `take a break` survives, now **strain-triggered** (3 consecutive
  not-first-try items) and refills nothing because nothing is lost.
  draw_connect keeps its draw-until-complete semantics (`final: true` tells
  the engine loop not to re-present). MCQ shells reveal the correct option
  only on the **last** attempt, so retries stay honest work.
- **The warm OpenMind palette replaced the dark game-studio palette
  everywhere**: Warm Cream `#FDF2E2` backgrounds, Soft Sand `#FAE9D0` cards,
  Main Teal `#079A90` interactive elements, Deep Teal `#19725E` ink and
  scrims (never heavy black), Bright Orange `#EF9722` + greens for
  success/progress, Berry Pink `#D93B5E` decoration only. Every per-game
  theme was re-tuned to light calm worlds (fantasy dawn, daylight venues,
  light boards; chalkboard keeps a board identity at a calm mid green).
  IntroScene lays a cream wash over any game backdrop so the deep-teal menu
  ink stays readable on every theme. Mirrored in `shared/constants.ts`
  PALETTE, backend thumbnails, and Flutter `Palette` (game flows keep their
  own register, now deep-teal chrome; `kColorChoices` — the child's personal
  accent — intentionally unchanged). Mascot character-art darks (pupils,
  tires, notes) stay: they're drawings, not surfaces. Default accent
  fallback moved `#58CC02` → `#079A90`.
- **The 8-event learning contract rides the existing bridge**:
  `experience_started`, `object_interacted`, `attempt_submitted`,
  `hint_requested`, `hint_shown` (auto-offered hints mark `auto: true`),
  `misconception_detected` (placeholder signal: unresolved after retries),
  `level_completed`, `experience_completed` — all via
  `EduCore.reportLearning`, each carrying `{conceptId, learningLevel,
  templateId, wrapperId}` (null/theme-derived today; real values arrive with
  the Number City spec). `reportScore` gained `attempts`/`recovered`;
  `reportSummary` gained `recovered`. Legacy `hint_used` kept for hosts.
- **`shells/src/lib/interact.js`** — draw_connect's pointer machinery
  extracted into shared primitives (`attachDrag`, `nearest`, `makeTappable`,
  44px floor) so the coming Number City mechanics (tap-scene, drag-collect,
  sequence, build-complete) reuse one tested state machine. draw_connect now
  runs on it; behavior unchanged.
- Playwright note: sessions are longer under the retry loop; on weak/software
  -GL machines run the behavioral suite with `--workers=1`.

## v4.1 — Audience retarget + character duo (post-v4 product pivot)

- **Audience moved from grades 7–12 to elementary school (grades 1–6).** Young
  kids enjoy these game shells even more, and the template architecture didn't
  have to change at all — only `GRADE_MIN/MAX` (now 1–6), the onboarding grade
  picker, the default/demo grades, and the **content prompts**. The three system
  prompts (normalizer, spec, fact-check, feedback, refine) gained explicit
  "writing for young children" rules: short sentences, everyday-word comparisons,
  ≤2 reasoning steps, friendly numbers (no percentages for grades 1–3), nothing
  scary/violent/sad, and per-grade calibration (1–2 picture-recall, 3–4 simple
  why/how, 5–6 light multi-step). The golden demo specs were reworded to match
  (kept the same topics — water cycle, capitals, plant cell — which are all
  elementary-appropriate; just simplified the language and dropped the 71%
  statistic for "covers most of the planet", etc.).
- **Brand renamed EduMind → OpenMind** across user-facing surfaces (app title,
  window titles, OpenAPI title, settings footer). Package/identifier names
  (`@edumind/*`, `edumind_app`, `EduMind` bridge channel, `__EDUMIND_SPEC__`,
  `emt_` token prefix) were intentionally LEFT unchanged — renaming them is
  churn with real breakage risk (the bridge channel name is a contract between
  shells and the Flutter host) and zero user-visible benefit. Documented here so
  it's a decision, not an oversight.
- **Mascot: Finn the fox → a two-character duo.** Splitting the single mascot
  into two specialists makes each emotional beat clearer for young children:
  - **Hudhud the hoopoe** — the *exploration guide*. Owns the journey: presents
    every teach card, fronts the menu/adventure, delivers hints (the famous fan
    crest snaps open when an idea strikes), and handles every gentle moment
    (wrong answers, the take-a-break room, the waiting room, the failure
    apology). The hoopoe is the only character that goes *sad* — consolation is
    a guide's job. Procedural Graphics: buff-orange body, long curved beak,
    black-and-white striped folded wing, fan crest with black-tipped feathers
    whose spread tracks the mood (folded → half → fan → droop), accent-colored
    scarf.
  - **Nahla the bee** — the *rewards partner*. Owns achievement: hovers by the
    XP pill reacting to every correct answer / combo / streak (loop-the-loop on
    combos, spin on level-complete), and headlines the summary screen and the
    profile/feedback surfaces. **Hard design rule: the bee never has a sad
    face** — `setExpression('sad')` is a no-op on the bee. Rewards only.
    Procedural Graphics: round striped body, no stinger (friendly), constantly
    fluttering wings (a bee is never still), accent-colored pollen dot.
  - Both are implemented **twice** (Phaser `Hoopoe`/`Bee` classes in
    `shells/src/lib/mascot.js`; Flutter `_HoopoePainter`/`_BeePainter` in
    `mascot.dart`) — same character, same expression set, same accent rule, the
    same "implemented twice" discipline the original fox followed.
  - EduCore wires the split centrally: `this.guide` (hoopoe) gets `wrong`/`hint`
    reactions, `this.buddy` (bee, mounted by the HUD next to the XP pill) gets
    `correct`/`combo`/`streak`/`levelComplete`. Games only construct the guide;
    the bee is universal HUD furniture.

---

## DECISIONS.md — original v4 build (audience: grades 7–12, mascot: Finn the fox)

> The sections below are the original v4 decision log. Where they say "grade 7"
> or "Finn the fox", read the v4.1 retarget above — the architecture is
> unchanged, only the audience copy and the character art differ.


Running log of every creative and architectural decision, in build order.
(The brief said: make the reasonable call and write it down. These are those calls.)

## Stage 1 — Contract & scaffold

- **Node 22, not 24.** The dev machine runs Node 22.12 LTS. Everything targets `>=22`;
  nothing used requires 24. Recorded instead of silently requiring an upgrade.
- **Monorepo via npm workspaces** (`shared`, `shells`, `backend`). Flutter lives in
  `flutter_module/` outside the npm workspace. Demo specs live in `samples/` at the
  root because they are shared product content (demos + tests + mock mode), not
  test fixtures of any one package.
- **Item `kind` is an explicit discriminator** (`mcq` | `connect`), required on every
  item. Cheap insurance against shape drift, and it gives Zod a discriminated union.
- **Edge ids are derived, not stored**: a draw_connect edge's id is the canonical
  string `"from->to"`. Connect items reference those. No second id namespace for the
  LLM to get wrong.
- **The LLM generates a ContentSpec, not a GameSpec.** It never sees `meta`,
  `student`, ids, or the intro level. The server assembles:
  `levels = [builtInIntroLevel, ...content.levels]`, assigns deterministic ids
  (`l2_i3`, `l1_t1`), injects the student block, defaults `numerals`. Two ContentSpec
  shapes exist (mcq games vs draw_connect) so each structured-output schema stays
  lean — the API has schema-complexity limits.
- **Fat-finger rule implemented in pixels**: node spacing ≥86px on the 720×1280
  canvas (≈0.12 × 720), computed as `hypot(dx·720, dy·1280)`. The brief's "0.12
  normalized" is ambiguous across non-square axes; pixels are what fingers touch.
- **Hint-reveal check**: a hint fails if it contains the correct option verbatim
  (case-insensitive), skipped when the option is shorter than 3 characters (a hint
  containing "2" is not a reveal). The Haiku fact-check judge covers paraphrase
  reveals; this validator covers the literal case for free.
- **`numerals` field added to meta** (`western` | `arabic_indic`), optional, defaulted
  at assembly to `arabic_indic` for Arabic — the brief's "Arabic-Indic numerals as a
  toggle (default on for AR)" needs a home in the contract.
- **Stub specs are their own schema** (`StubSpecSchema`, `stub: true`, zero levels).
  The full-spec schema cannot describe a half-spec without weakening every rule;
  two strict schemas beat one loose one.
- **Validation issues carry stable codes + targetId** (`HINT_REVEALS_ANSWER`,
  `NODES_TOO_CLOSE`, …) so the pipeline can do targeted repair of individual items
  instead of regenerating whole specs.
- **Demo defaults**: name "Player" / «لاعب», color `#58CC02`, gender null, no
  companion. Demo specs use the exact ids the assembler would produce, so demos and
  generated specs are byte-shape identical.
- **Arabic demo is Quest Path** (water cycle, sessionLength 3): it exercises the
  hardest RTL surfaces — typewriter dialog, teach cards, narrative, option cards —
  in one spec.

## Stage 2 — Shells

### Mascot & companions
- **Mascot is "Finn" the fox** (per the brief's recommendation): wide rounded head,
  big triangular ears with cream inner, cream muzzle, eyes that close to crescents
  when happy, bushy tail with cream tip, and a **scarf tinted the student's favorite
  color** — the personal accent literally worn by the brand character. Blinks every
  4–6s, idle-bobs ~7px, recovers from "sad" within ~1s (gentle-feedback rule).
  Implemented twice by design: Phaser Graphics in shells, CustomPainter in Flutter.
- **10 companions**, one per interest archetype (dino, rocket, football, cat, robot,
  fish, car, crown, palette, music notes) in the same rounded big-eye style family,
  each carrying one accent-colored element. They idle near the HUD and celebrate on
  combos ≥2.

### Phaser 4 facts learned from the installed package (not from memory)
- Phaser 4.1.0 ships official AI skill guides in `node_modules/phaser/skills/` —
  used as the API source of truth throughout.
- **Containers**: `setSize()` + plain `setInteractive()`; explicit
  `Geom.Rectangle` hit areas silently fail on containers in v4 (cost us the first
  input bug).
- **`fillRoundedRect` radius must be ≤ height/2** — larger radii degenerate into
  stray full-height path edges (cost us a ghost vertical line through the scene).
- `type: Phaser.AUTO` (WebGL "Beam", Canvas fallback for old WebViews — Canvas is
  deprecated-but-present in v4).
- No filters/pipelines used anywhere; juice is tweens + particles only. No
  `setTintFill` (removed in v4), no `Math.TAU` (its meaning changed in v4).

### Game design calls
- **Adaptive presentation: 3 items per educational level** drawn from the 4–6 pool,
  picked nearest to the engine's target band (start: easy 1.5 / normal 2.5 / hard
  3.5; ±0.75 after 2-streaks; clamped 1–5; small random jitter breaks ties).
  Confirmed live: a perfect-scoring session visibly escalates item difficulty.
- **Hearts: 3 per session**, refilled at the take-a-break screen, which also ramps
  the engine down one band. Zero hearts → breathing-circle break, never "game over".
- **XP**: 10/7/5 by hints used, +50 per level (intro included — finishing the
  tutorial deserves juice), +200 mastery. Verified: perfect 5-level run = 570 XP.
- **Quest Path**: answers are 4 stacked candy buttons; the branch gates are the
  story metaphor (glowing fork ahead), not the input surface — 4 readable options
  don't fit on gates. Environments rotate forest → cave → mountain → castle, boss
  chamber is always the final educational level (amber lightning ≤100ms, zoom
  punch, drama sting, boss recoils per correct answer).
- **Goal Shootout**: keeper dives toward wrong shots (save) and the wrong way on
  goals; archery's "keeper" is a drifting shield. Crowd = 3×14 tween-choreographed
  dots in a Mexican wave + ≤100ms camera flashes. Crowd murmur retriggers every
  4.5s; cheer is a band-passed noise swell, never a buzzer anywhere.
- **Draw & Connect**: matching is **undirected** (drawing B→A counts for edge
  A→B) but the snapped curve gets an arrowhead in the canonical direction — flow
  diagrams stay teachable without punishing drawing direction. A wrong drag marks
  the item incorrect (one heart) but the student keeps drawing until complete —
  learning by doing. Completed edges persist as faint lines across items; review
  items clear their own edges so re-connection is real. Diagram board maps
  normalized coords to x∈[30,690], y∈[235,1185]; grab radius 56px, approach-glow
  80px. Guided node tour runs once, on the first educational level.
- **Tutorials** (built-in, zero spec content): QP = two simple choices (one
  free-win, one glowing-path pick with wrong-path demo); GS = ✓/✗ goals then
  find-the-⭐-of-4; DC = circle→circle, square→square with a triangle decoy.
- **Audio** (all Web Audio synthesis): correct chain = C5 base climbing one
  semitone per combo, capped at +12; wrong = soft sine E4→C4; typewriter blips at
  −32dB-ish; per-theme 3-note stings; celebration = C-E-G-C arpeggio.
- **Particles: 3 pooled emitters × 12 maxAliveParticles = hard 36 cap.** Popup
  texts are a 4-deep pool. Liveliness beyond that is tweens on existing objects.
- **contrastOn threshold 190** so Duolingo green gets white button text.
- Teach-card **emphasis terms render as accent-colored chips** in a measured row
  at the card's foot — Phaser Text has no rich spans; chips beat underline hacks.

### Infrastructure
- Fonts: @fontsource woff2 subsets inlined base64 (Nunito 700/800 latin, Tajawal
  700/800 arabic; ~50KB total). Shells are ~1.47MB each, phaser.min.js included.
- Spec slot: `/*__EDUMIND_SPEC_JSON__*/null` in every built shell. **Hosts must
  escape `<` as `<`** when injecting (XSS-safe against LLM/user content).
  Implemented identically in preview server, backend assembler, Flutter player.
- **`window.EduMindDebug`** (state, scene, tappables with correct-flags, bridge
  event mirror, getConnect) is a deliberate, always-on read-only test surface.
  Correctness flags reveal nothing the injected spec doesn't already contain.
- Host→shell channel: postMessage `{source:'EduMindHost', type:'spec'|'generationFailed'|'mute'}`
  plus direct `EduCore.receiveSpec()` for Flutter's runJavaScript.
- `tools/autopilot.mjs` plays entire sessions by reading EduMindDebug — the polish
  loop and the behavioral test engine are the same code path.

## Stage 3 — Shell CI

- v3's 18 runtime validators became **33 static assertions** (vitest, once per
  shell change) + **7 Playwright behavioral tests** (mobile emulation, Pixel 5):
  per-shell full sessions with mixed answers, bridge-event verification, RTL
  HUD-swap check, progressive-start stub flow, generation-failure apology +
  retry event, and the **static-frame test** — two canvas screenshots 2s apart
  must differ by >150px in every scene (menu/teach/question/waiting/summary/
  failed), mechanically enforcing "alive, not static".
- Phaser creates small extra `<canvas dir="rtl">` elements for RTL text
  measurement — tests must target `#game-container canvas[width="720"]`.
- Headless-GPU console noise (SwiftShader/WebGL fallback warnings) is filtered
  from the error assertions; real page errors still fail the suite.
- The behavioral driver and the dev autopilot are the same logic; tests retry
  once (timing-sensitive full-session runs on slow CI machines).

## Stage 4 — Backend

- **Storage fallback**: no DATABASE_URL → in-memory store with loud warnings
  (the dev machine has no Docker; `npm run dev` must always work). Prisma 6 +
  Postgres 16 is the real path; docker-compose.yml ships for local PG; Neon
  pooled/direct URL split honored (v3's auto-suspend lesson).
- **Mock is a provider, not a branch**: `ContentProvider` interface with
  LiveProvider (Anthropic) and MockProvider (golden specs + simulated latency).
  Generator, validators, fact-check orchestration, caching, assembly are the
  SAME production code under test in mock mode.
- **Structured outputs**: `output_config.format` (json_schema) on streamed
  calls (`messages.stream().finalMessage()` everywhere). Zod-4 `z.toJSONSchema`
  output is sanitized for the API's schema subset (length/numeric bounds
  stripped — they still run in validateGameSpec — and `additionalProperties:
  false` injected on every object).
- **Prompt-caching reality check**: Haiku 4.5's minimum cacheable prefix is
  4096 tokens; SPEC_SYSTEM_PROMPT (~1.5k tokens) may silently not cache on
  Haiku (it does on Sonnet, min 2048). Recorded honestly in PERF.md; TTL is
  env-configurable (default 1h = 2× write cost, pays off with steady traffic).
- **Escalation ladder**: pre-escalate to Sonnet when normalizer complexity
  >0.7 or confidence <0.6 (or Arabic + ESCALATE_ARABIC=true, default false —
  measure first); otherwise Haiku ×2 then Sonnet. Tracked as
  `escalationRate` in /health metrics.
- **Fact-check repair granularity**: failed ITEMS get targeted repair (max 2
  rounds), then get DROPPED if every level keeps ≥4 items across ≥2 bands;
  failed TEACH CARDS fail the whole attempt (an explanation built on a wrong
  card can't be patched item-wise). Re-judge only repaired pieces.
- **refine harder/easier is $0 by design**: it shifts `meta.difficulty` (the
  adaptive baseline) — the over-provisioned 4-6 item pools already span the
  bands, so the engine genuinely serves harder/easier material without
  regeneration. `more_questions` is the only refine op that calls the LLM.
- **POST /games returns the stubSpec** alongside gameId — the client may
  build its own stub (it can), but serving it removes a class of client/server
  drift. Clarifying questions return `status:'clarify'` with NO game row.
- **Catalog additions** (documented in OpenAPI): `POST /games/:id/retry`
  (one-tap retry; 410 if the server restarted since — recreate), and
  `POST /games/:id/sessions` (reportSummary ingestion → XP, streak, enriched
  feedback; PlaySession rows feed Review mode).
- **Review synthesis rules**: mcq items only (connect items can't ride a
  shootout), missed OR 2-hint items, deduped, re-id'd (`r1_i3`) so global id
  uniqueness holds, pool cycled to fill 2×4-6, one difficulty nudged when a
  level would be single-band. Validated against the production schema before
  serving — a review session is a first-class GameSpec.
- **Auth**: `emt_` random 256-bit tokens, sha256-hashed at rest, Bearer header,
  every game/library/stats route scoped to the authenticated student.
- Per-student generation rate limit (default 20/h, env-tunable) — kids tap
  buttons fast and Sonnet escalations cost real money.

## Stage 5 — Flutter

- **Offline store is platform-conditional**: Drift 2.x/sqlite on Android+iOS,
  IndexedDB via idb_shim on web (the brief's exact split). One `GameStore`
  interface, conditional import on `dart.library.js_interop`. Drift's
  generated row class collides with the app's `SavedGame` model by default —
  solved with `@DataClassName('SavedGameRow')`.
- **Shell hosting is platform-conditional too**: webview_flutter
  `loadHtmlString` + a JS channel named `EduMind` on native; iframe `srcdoc`
  + postMessage on web. Both inject the spec with the same marker/escaping
  logic as the backend (`SpecAssembler`). Spec push to native uses
  `runJavaScript('EduCore.receiveSpec(...)')` with U+2028/2029 escaped (the
  only JSON-vs-JS-literal divergence).
- **The server returns `stubSpec` on POST /games** and the app uses it —
  composer → player hand-off is one navigation with zero extra requests; the
  tutorial is on screen ~2–3 s after the tap.
- **Offline-resilient onboarding**: if registration fails the student can
  open Settings (server URL + Test Connection) or continue offline with
  demos only; the cached profile registers later.
- **Offline replay summaries queue locally** (`pendingSummaryJson` on the
  saved game) and sync on the next dashboard load — "scores update locally
  first, then sync" with the smallest possible machinery.
- Backend's SVG data-URI thumbnails render as a color-matched tile + game
  emoji in Flutter (no SVG dependency for a decorative 64×44 thumbnail);
  HTTP thumbnails (Tier 2) use Image.network.
- Mascot parity: the Flutter `Mascot` CustomPainter mirrors the Phaser fox's
  geometry (same head/ears/scarf proportions at 140px design size) with 5
  expressions, blink Timer (cancellable — pending-timer test failures
  taught us), and bob controller.
- Demo Games surface is `kDebugMode`-gated (dashboard tile + settings row),
  per the brief's "debug builds / behind a debug flag".
- Android cleartext + iOS ATS exceptions are committed for dev (documented
  in README with a tighten-for-prod note); `10.0.2.2` documented for the
  Android emulator.

## Tier 3 — full AI background sets (designed, NOT built; flag only)

Per the brief, the design is recorded and only the flag exists
(`IMAGE_PROVIDER_API_KEY` powers Tier 2; Tier 3 stays off in v1):

- **Unit of generation**: a background *set* per (theme, topic) — 5 images
  for quest_path (one per environment: forest/cave/mountain/castle/boss
  reinterpreted through the topic), 1 stadium backdrop for goal_shootout,
  1 board texture for draw_connect.
- **Style lock**: one frozen style prompt per theme family ("flat vector
  illustration, rounded shapes, soft gradients, painterly parallax layers,
  no text, no people, no UI" + theme palette hexes), versioned as
  `stylePromptVersion` — bumping it invalidates the cache deliberately.
- **Per-level prompts**: `{style lock} + {environment descriptor} + {topic
  motif}` where topic motifs come from a Haiku call that extracts 3 visual
  motifs from the topic ("water cycle" → "clouds, rivers, rain"). Student
  data never enters prompts (same privacy rule as Tier 2).
- **Cache**: sha256(theme|topic|envIndex|stylePromptVersion) → object
  storage, cached forever; expected hit rate high because topics repeat.
- **Delivery**: background URLs ride a new optional `spec.assets.backgrounds`
  array; shells already layer procedural parallax and would put the image at
  depth 0 with procedural ambient on top. Moderation on every output; any
  flag → procedural background (current behavior) as fallback.
- **Why not in v1**: cost is fine (~$0.01/set) but review surface isn't —
  image QA for kids needs human spot-checking we can't automate yet, and the
  procedural themes already clear the "alive, not static" bar.

## Stage 6 — wrap-up

- Kenney scripts download into `scripts/downloads/` (gitignored), copy per
  `kenney_mapping.json`, and print exact manual-download instructions when
  kenney.nl changes its URLs (it does). The shells deliberately keep
  programmatic art as the only render path in v4.0 — the mapping/scripts are
  the ready-made pipeline for when a theme wants bitmaps.
- PERF.md separates measured (mock pipeline, shells, autopilot sessions)
  from estimated (live LLM — no API key was present during the build) and
  documents the Haiku 4096-token cache-minimum caveat honestly.
- `more_questions` refine costs ~a spec generation (~$0.02–0.03), above the
  brief's $0.01 sketch; `harder`/`easier` are $0 (baseline shift) instead of
  the sketched ~$0.01 regeneration. Net refine cost is lower than sketched.
