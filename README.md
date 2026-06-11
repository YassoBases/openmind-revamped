# OpenMind Game Studio

**A revamp of [EduMind Game Studio](https://github.com/YassoBases/edumind-game-studio).**
Same north star — a kid types what they want to learn and is playing a custom,
adaptive, bilingual game seconds later — rebuilt around a safer, cheaper, more
consistent architecture, and **retargeted to elementary school (grades 1–6)**.

Children describe what they want to learn, answer a few playful personalization
questions, and within seconds are playing a custom Phaser 4 game themed to their
preferences — one that **teaches before it quizzes**, adapts to their
performance across levels, and ends with a structured learning summary. Games
save locally and replay **offline, forever, for $0**. Full English + Arabic with
RTL. Two animated buddies travel through every game: **Hudhud the hoopoe** (your
exploration guide) and **Nahla the bee** (your rewards partner).

**The architecture in one sentence:** the LLM never writes game code — the three
games are hand-built, polished, parameterized Phaser 4.1 template shells, and the
LLM generates only the content spec (JSON) that drives them. Demo specs and
AI-generated specs are the *same format* injected into *identical shells*: if the
demo plays perfectly, generated games render identically.

```
questionnaire → Normalizer (Haiku) → moderation → Spec gen (Haiku, Sonnet escalation)
   → validators → fact-check judge (Haiku) → targeted repair → moderation
   → GameSpec (Postgres) → injected into a template shell at serve time
                              ↑
              the same shells, bundled in the app, replay specs offline
```

> **Integrating from another app?** OpenMind is a documented HTTP API first, a
> Flutter app second. Any client can drive the whole pipeline over REST. See
> **[docs/API.md](docs/API.md)** for the full endpoint reference, auth, the
> progressive-start flow, and copy-paste examples (curl / JS / Dart / Python).

---

## Why this is a revamp (vs. the original EduMind)

The original [EduMind Game Studio](https://github.com/YassoBases/edumind-game-studio)
was a genuinely impressive system: it had the LLM **write the inner Phaser script
for each game**, backed by 18 validators, a repair loop, and a Playwright
"does-it-actually-boot" check to catch the variance. It worked — but generating
runnable game code per request is expensive, slow, variable, and means
model-written code executes inside a kids' app. OpenMind keeps everything that
was good about EduMind and changes the one thing that made it expensive and
risky.

| | **EduMind (original)** | **OpenMind (this repo)** |
|---|---|---|
| **What the LLM produces** | The **game code** (Sonnet writes a Phaser script per game) | Only a **content spec** (JSON). No model-written code ever executes. |
| **Game catalog** | 6 pedagogical templates + 4 archetypes (10 mechanics) the model learns from | **3 hand-built, deeply-polished template shells** (Quest Path, Goal Shootout, Draw & Connect) |
| **Consistency** | Two generations of the "same" game could look/behave differently | **Identical by construction** — same shell every time; variance is impossible |
| **Validation** | 18 validators + repair + Playwright boot **per generation** (runtime) | Validators became a **CI suite run once per shell change**; runtime only validates spec *semantics* + a fact-check gate |
| **Default model** | Sonnet 4.6 for specs **and** code | **Haiku 4.5 by default**, Sonnet 4.6 only on escalation (target ≤25%) |
| **Cost / game** | Higher (code-gen is the expensive call) | **Target ≤ $0.05**; cached topics, replays, reviews, demos are **$0** |
| **Latency** | ~15–90 s depending on cache | 10–45 s generation, **~0 perceived** (play the tutorial while it generates) |
| **Security surface** | Generated JS runs in the WebView | **Zero** model-authored code in the app — real attack-surface reduction |
| **Audience** | Grades 7–12 | **Elementary school, grades 1–6** — content prompts tuned for young children |
| **Characters** | Single mascot | **Two animated buddies** with distinct roles: Hudhud (guide) + Nahla (rewards) |
| **Offline replay** | — | Saved games replay with **zero network** (bundled shell + local spec, KBs not MBs) |
| **Stack** | Node 24, Sonnet+Haiku, Postgres, Flutter | Node 22+, Haiku+Sonnet, Postgres **or in-memory fallback**, Flutter; boots with **zero config** |

**The payoff in one line:** consistency becomes a *build property* instead of a
runtime gamble, per-game cost drops to a fraction, replays are free, and **no
model-written code ever runs inside a child's app.**

> Lineage note: this codebase descends from the same lineage of iterations the
> original repo documents (its `WHATS_NEW*.md` history). OpenMind is the "v4"
> architectural turn — the LLM stops writing code — plus the elementary-school
> and two-character product pivot.

---

## What's inside

| Surface | Stack |
|---|---|
| **Shared contract** | Zod 4 `GameSpec` schema + semantic validators + structured-output JSON schemas, shared by backend, shells and tests |
| **Game shells** | Phaser **4.1.0 "Salusa"** (no `setTintFill`, Filter system, no v3 pipelines), inlined into single-file HTML; `EduCore` / `GameFeel` / `Mascot` runtime libs |
| **Backend** | Node 22+, Fastify 5, TypeScript 5 strict, Zod 4, Prisma 6 + Postgres 16 (or in-memory fallback), OpenAPI 3.1 + Swagger UI, pino |
| **Generation** | Claude **Haiku 4.5** default + **Sonnet 4.6** escalation, structured outputs + prompt caching; OpenAI omni-moderation; optional Flux Schnell thumbnails |
| **App** | Flutter 3.x / Dart 3.x, `webview_flutter` (native) + iframe `srcdoc` (web), Drift 2.33 (native) / IndexedDB (web), google_fonts, flutter_animate |

---

## Zero-key smoke test (do this first)

No API keys, no database, no account — the games must stand on their own:

```bash
npm install
npm run build          # builds the shared lib + the three shells
npm run preview        # → http://localhost:8765
```

Open the harness, click a demo spec (Water Cycle quest / World Capitals shootout
/ Plant Cell draw-board / Arabic quest), and play end to end: tutorial level,
teach cards, questions with two-stage hints, explanations on right *and* wrong
answers, summary screen. The harness also simulates progressive start (boot with
a stub, deliver the spec N seconds later) and generation failure (mascot
apology + retry).

Same thing inside the app, fully offline: `cd flutter_module && flutter run -d
chrome` → complete onboarding (choose "continue offline" if asked) → **Demo
Games** (on the dashboard in debug builds, also under Settings).

---

## Backend

```bash
cd backend
npm run dev            # http://0.0.0.0:8080  — LAN-reachable by default
```

Boots with **zero configuration**: no `DATABASE_URL` → in-memory store (loudly
logged, data dies on restart); no `ANTHROPIC_API_KEY` → MOCK_LLM mode (golden
specs with simulated latency). Add keys in `.env` (see `.env.example`) to go
live:

| Env | Effect |
| --- | --- |
| `ANTHROPIC_API_KEY` | live generation — `claude-haiku-4-5` default, `claude-sonnet-4-6` escalation |
| `OPENAI_API_KEY` | content moderation (omni-moderation-latest); skipped with a warning if unset |
| `DATABASE_URL` / `DIRECT_URL` | Postgres 16 (Neon: pooled + direct URLs; local: `docker compose up -d`) then `npm run prisma:migrate` |
| `IMAGE_PROVIDER_API_KEY` + `IMAGE_PROVIDER_URL` | Tier-2 AI thumbnails (Flux Schnell); otherwise programmatic SVG thumbnails |

- **API docs:** Swagger UI at `http://localhost:8080/api/docs` (OpenAPI 3.1
  generated from the Zod schemas). Full written reference: **[docs/API.md](docs/API.md)**.
- **Health:** `GET /api/v1/health` — version, uptime, db status, and live
  pipeline metrics (per-stage latency, escalation rate, cache hit rates,
  estimated cost per game).
- **Auth:** `POST /api/v1/students` returns `{ studentId, token }`; everything
  else takes `Authorization: Bearer <token>`. Nickname-only accounts.
- Seed a demo student: `npm run seed` (prints a usable token).

---

## Flutter app

```bash
cd flutter_module
flutter pub get
flutter run -d chrome        # web
flutter run                  # connected Android/iOS device
```

Onboarding (Hudhud-guided: nickname, grade 1–6, optional gender for Arabic
grammar, language, favorite color, interest companion, daily goal) → dashboard
(XP bar, streak flame, goal ring, daily Review tile) → composer (subject,
free-text topic, game type, theme, length, difficulty) → **play the tutorial
within ~3 seconds** while the real spec generates and hot-loads → the game lands
in the library with a thumbnail and replays offline from Drift (native) /
IndexedDB (web).

---

## Connect your phone (the physical-phone test)

1. **Find your laptop's LAN IP**
   - Windows: `ipconfig` → Wi-Fi adapter → IPv4 Address (e.g. `192.168.1.50`)
   - macOS: `ipconfig getifaddr en0`
2. **Start the backend** — it already binds `0.0.0.0:8080`. Allow Node through
   the Windows firewall if prompted (or: Settings → Firewall → Allow an app).
3. **Run the app on the phone** (`flutter run` with the device plugged in), open
   **Settings** in the app, enter `http://192.168.1.50:8080`, tap **TEST
   CONNECTION** — it hits `/api/v1/health` and shows db + llm status.
4. Plain HTTP works out of the box in dev builds:
   - **Android**: cleartext is enabled via
     `android/app/src/main/res/xml/network_security_config.xml`. Emulator note:
     use `http://10.0.2.2:8080` to reach the host machine.
   - **iOS**: an ATS exception (`NSAllowsArbitraryLoads` +
     `NSAllowsLocalNetworking`) is set in `ios/Runner/Info.plist`.

   Tighten both before any production release.
5. Onboard on the phone → create a game → the tutorial starts immediately,
   educational levels arrive seamlessly when generation finishes → results sync
   back → the game appears in the library. **Turn on airplane mode and replay
   it** — bundled shell + locally saved spec, zero network.

---

## The two buddies

Splitting the original single mascot into two specialists makes each emotional
beat clearer for young children. Both are drawn entirely with code (Phaser
Graphics in the shells, `CustomPainter` in Flutter — the same character,
implemented twice) and both wear the student's favorite color.

- **🦜 Hudhud the hoopoe — the exploration guide.** Leads the mission, presents
  every teach card, and gives hints — his signature fan crest snaps open when an
  idea strikes. He's there for every gentle moment too: a wrong answer, the
  take-a-break breather, the "I'm finding your questions" waiting room. (The
  hoopoe is the only one who ever looks sad — comfort is a guide's job.)
- **🐝 Nahla the bee — the rewards partner.** Hovers by the XP counter and
  celebrates everything you earn: correct answers, combos, streaks, level
  completions, and the end-of-game summary. She loops the loop on a combo and
  spins on a level-up. **By design, the bee never has a sad face** — she's pure
  encouragement.

---

## Tests

```bash
npm test               # shared schema tests + shell static validators + backend API tests
npm run test:e2e       # Playwright behavioral suite (boots every shell, plays sessions,
                       # RTL checks, progressive start, static-frame "alive" test)
cd flutter_module && flutter test && flutter analyze
```

---

## Performance & cost

Honest numbers (measured vs. estimated, plus the prompt-cache caveat) live in
[PERF.md](PERF.md). Short version: the tutorial covers the 10–45 s generation
window so perceived wait ≈ 0; fresh games target ≤ $0.05 (Haiku path
~$0.03–0.045 estimated); cached topics, replays, reviews and demos are $0.

---

## Data minimization (minors)

Nickname only — no email or real-name fields anywhere. The optional gender field
exists exclusively for Arabic gendered grammar and is never used otherwise. No
analytics SDKs. Nothing personal leaves the backend except as task content to
Anthropic / OpenAI-moderation. Nothing about the student is ever sent to the
image provider. Branded/licensed characters are never accepted — the normalizer
maps such requests to original archetypes (COPPA / GDPR-K awareness; a
production deployment for children still needs its own legal review, verifiable
parental-consent flow, and a retention policy).

---

## Repo layout

```
shared/           GameSpec contract: Zod schemas, validators, assembly, JSON schemas for structured outputs
samples/          golden demo specs (EN ×3 + AR) — demos, tests and mock mode all eat the same files
shells/           the product: EduCore/GameFeel/Mascot libs, 3 games, build, preview harness, CI tests
backend/          Fastify 5 API: pipeline, validators, fact-check, storage, OpenAPI docs
flutter_module/   the app: onboarding, composer, player (progressive start), library, dashboard
scripts/          Kenney CC0 asset fetchers (optional enhancement — see scripts/KENNEY_README.md)
docs/API.md       complete REST API reference for integrating OpenMind into another app
DECISIONS.md      every creative/architectural decision, in build order (incl. the v4.1 pivot)
PERF.md           measured numbers + honest estimates
```

---

## License

MIT — see [LICENSE](LICENSE).
