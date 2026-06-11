# PERF.md — measured numbers and honest estimates

Machine: Windows 11, Node 22.12, Flutter 3.44, headless Chromium (Playwright).
"Measured" = actually observed during this build's test runs. "Estimated" =
computed from token counts and current model pricing — **no live API key was
available during the build**, so live-LLM latencies/costs were not observed.
The backend tracks the real numbers at runtime: `GET /api/v1/health` →
`metrics` (per-stage p50/p95, escalation rate, prompt-cache hit rate, est.
cost per game). Fill the Estimated column from there after your first day of
real traffic.

## Measured — shells

| Metric | Value |
| --- | --- |
| Built shell size (each of 3) | 1.47 MB (Phaser 4.1.0 + fonts inlined) |
| Shell boot → menu (headless) | ~1.1–1.8 s |
| Full Quest Path session, 5 levels (autopilot, instant taps) | ~78 s |
| Full Goal Shootout session, 3 levels | ~40 s |
| Full Draw & Connect session, 3 levels | ~54 s |
| Static-frame test (2 s apart) | >150 px difference in every scene ✓ |
| Replay / demo / review cost | $0 (no LLM call at any point) |

## Measured — backend (MOCK_LLM, in-memory store)

| Stage | Value |
| --- | --- |
| POST /games → 201 + stubSpec (incl. mock normalizer) | ~0.3–0.7 s |
| Pipeline overhead (validators + fact-check orchestration + assembly), excl. LLM | < 100 ms |
| /play assembly (marker replace on 1.47 MB shell) + ETag | < 30 ms; 304 on replays |
| Spec cache hit → ready | < 150 ms (content reused, student re-injected) |
| Mock generation end-to-end (default MOCK_LATENCY_MS=4000) | ~4.3 s |

## Estimated — live LLM (claude-haiku-4-5 default / claude-sonnet-4-6 escalation)

Token counts from the actual prompts/schemas in this repo; prices $1/$5 per
MTok (Haiku), $3/$15 (Sonnet).

| Stage | Tokens (in/out, approx) | Cost | Latency (expected) |
| --- | --- | --- | --- |
| Normalizer (Haiku) | 700 / 150 | ~$0.0015 | 1–2 s |
| Spec generation (Haiku) | 2,500 / 3,000–6,000 | ~$0.018–0.033 | 8–30 s |
| Fact-check judge (Haiku) | 3,500 / 800 | ~$0.008 | 3–6 s |
| Targeted repair (when needed) | 1,500 / 800 | ~$0.006 | 3–6 s |
| Summary enrichment (Haiku) | 900 / 200 | ~$0.002 | 1–2 s |
| Thumbnail (Flux Schnell, flagged) | — | ~$0.002, cached forever | 2–4 s, off the critical path |
| **Fresh game total (Haiku path)** | | **~$0.03–0.045** | **12–40 s absolute** |
| Escalated game (Sonnet spec) | 2,500 / 3,000–6,000 | ~$0.09–0.12 | 15–45 s |
| Cached-topic game | 0 | **$0** | < 0.2 s |

Targets from the brief: ≤$0.05 average ✓ (expected, verify via `/health`),
escalation ≤25% (tracked as `metrics.escalationRate`), $0 replay/review/demo ✓
(by construction), perceived wait ≈ 0 via progressive start ✓ (stub plays
immediately; tutorials run ~30–60 s, comfortably covering generation).

## Honest caveats

- **Prompt caching may be ineffective at current prompt sizes.** Haiku 4.5's
  minimum cacheable prefix is 4,096 tokens and the SPEC system prompt is
  ~1,500 tokens — `cache_control` is in place (env-tunable TTL, default 1h)
  but the cache likely won't engage on Haiku until the prompt grows. Check
  `metrics.promptCacheHitRate`; if it stays 0, that's why, not a bug. Costs
  above assume zero cache benefit, so they're upper bounds.
- Autopilot session durations are a floor for real students (it taps
  instantly and skips every typewriter); real sessions run 4–12 minutes.
- `more_questions` refinement costs ~one spec generation (~$0.02–0.03), more
  than the brief's $0.01 sketch — recorded in DECISIONS.md (harder/easier are
  $0 instead, which more than compensates on the refine mix).
