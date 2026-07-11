# Ask Hudhud — Claude-powered interactive tutoring

**Ask → See → Interact → Understand.** A student asks Hudhud a question; Claude
decides whether *doing* would teach better than *reading*; when it would, Claude
returns a **structured interactive spec** (never code); Flutter renders it as a
native manipulable block inside the chat; the student acts; the result flows back
as a real conversation turn and Hudhud responds to what they actually did.

Claude never designs an activity by hand and the product never forces a question
into a template it doesn't fit. Claude *selects* an approved interaction and
fills its validated data — or, when nothing fits, teaches with words and **names
the interaction it wishes it had** so the tool library grows toward real demand.

---

## 1. The loop, end to end

```
 Student (Ask Hudhud chat)
     │  question + learning context (path/step/state/attempts/readiness)
     ▼
 POST /api/v1/tutor/messages                         backend/src/routes/tutor.ts
     │  1. moderate
     │  2. server-side eligibility → availableTools   tools/registry.ts:eligibleTools
     ▼
 Claude (schema-constrained to TutorReplySchema)     tutor/contract.ts
     │  selects ONE tool id + fills flat data, OR
     │  null payload + a named suggestedInteraction, OR
     │  plain text / guiding question
     ▼
 Route gates the reply:
     │  3. validateInteractivePayload (semantic gate) → drop-to-null if not renderable
     │  4. re-check eligibility (a tool never offered can't come back)
     │  5. suggestedInteraction → log + count (never shown as an activity)
     ▼
 TutorReply (JSON)                                   → persisted on the thread
     ▼
 Flutter renders the fields it knows                 features/tutor/tutor_chat.dart
     │  buildTutorBlock(payload) → native widget      blocks/tutor_block_registry.dart
     ▼
 Student acts → structured InteractiveResult
     │  { answer: value|order|placements|wrongTries }
     ▼
 POST /api/v1/tutor/messages (same conversation)
     │  6. result integrity: match to the open instance, RE-COMPUTE outcome
     │     server-side against the original spec (tutor/result.ts) — a claim,
     │     never a trusted verdict
     ▼
 Hudhud reacts to the verified outcome + a per-skill evidence row is written
```

## 2. Design principles (why it is safe)

| Principle | Where | What it buys |
|---|---|---|
| **Spec, not code** | `InteractivePayloadSchema` — a `type` from a closed enum + flat `data` | Claude can never emit Flutter/JS/HTML/markup or drawing instructions. The blast radius of a model mistake is a dropped block, never arbitrary UI. |
| **Closed world on both ends** | `INTERACTIVE_BLOCK_TYPES` (backend) ↔ `buildTutorBlock` switch (Flutter) | The server validates *what* may render; the client decides *how*. An unknown type renders nothing and the text still stands, so a newer server never breaks an older client. |
| **Two-stage gate** | structural schema at generation → `validateInteractivePayload` in the route | A payload that parses but isn't genuinely renderable (bad ranges, non-permutation order, dangling bucket ids) is dropped to null. "A broken activity is never pretended into existence." |
| **Claude chooses the mode** | `TUTOR_SYSTEM_PROMPT` "INTERACTIVE BLOCKS" section | Every turn Claude picks: explain · ask a guiding question · attach one block · open a related experience. No block is attached decoratively. |
| **No forcing** | HONESTY RULE in the prompt | If no tool fits, `interactivePayload = null` and Hudhud teaches with words. |
| **Result integrity** | `tutor/result.ts` + each tool's `verifyResult` | The learner's outcome is recomputed server-side; a wrong or tampered claim is overridden or stripped. |
| **Grows by one file** | `ToolDescriptor` in `tutor/tools/` | Enum, data schema, prompt section, eligibility, semantic gate, and mock goldens are all *derived* from the descriptor. A new interaction = one descriptor + one Flutter renderer. |

## 3. The registry today

Six approved renderers (all middle-stage, grades 7–9), each a `ToolDescriptor`
in `backend/src/tutor/tools/` with a Dart renderer under
`edumind-ui/lib/features/tutor/blocks/`:

`number_line` · `order_sequence` · `sort_buckets` · `match_pairs` ·
`balance_scale` · `timeline`.

Claude is told only the ids approved for *this* student (`availableTools` in the
user message, computed from the authenticated grade + stage + subject), and the
route re-checks the reply against that same list.

## 4. The honest fallback — "suggest the missing interaction" (new)

Before, when no tool fit, the reply degraded to text and the signal was lost —
the platform had no idea *which* interactions students kept needing. Now Claude
completes the loop:

> When acting would teach better than reading but **nothing in the registry can
> render it**, Claude sets `interactivePayload = null` **and** fills
> `suggestedInteraction`.

```jsonc
// TutorReply.suggestedInteraction (nullable)
{
  "mechanic": "plot_graph",        // interaction-mechanic taxonomy (see below)
  "reason": "رؤية المنحنى وهو يتغيّر مع تغيّر الميل تبني الفكرة أفضل من وصفها بالكلمات.",
  "conceptFamily": "تمثيل الدوال الخطية بيانيًا"
}
```

- **It never reaches the student as an activity.** The reply's `message` carries
  the real explanation; `suggestedInteraction` is metadata for the team.
- **The route turns it into a prioritization signal**
  (`backend/src/routes/tutor.ts`): it logs the wish and bumps
  `tutor_interaction_suggested:<mechanic>`, plus `tutor_interaction_gap:<mechanic>`
  when the mechanic maps to **no available tool** — the genuine growth edge.
- **A wish is dropped when a real block shipped** — the two are never both set.

**Mechanic taxonomy** (`INTERACTION_MECHANICS`, `tutor/contract.ts`): the
registry's existing primitives — `place_on_scale, order, classify, match,
compose, adjust_observe, decide` — plus the not-yet-supported growth edge —
`simulate, plot_graph, draw_annotate, locate_map, build_expression, other`.
Naming a *supported* primitive here flags a *selection* gap; naming a growth-edge
one flags a *renderer* gap. Reading the `tutor_interaction_gap:*` counters tells
the team exactly which renderer to build next.

Forward-compatible by construction: `suggestedInteraction` is a server-consumed
signal, so the Flutter client needs no change — its `TutorReply.fromMap` already
ignores fields it doesn't read.

## 5. What is verified here vs. what needs a live key

This environment has **no `ANTHROPIC_API_KEY`**, so the backend runs in mock mode
(`backend/src/llm/mock.ts`). The mock routes real registry specs by keyword and
emits the fallback the same way the live prompt instructs, so the **entire
plumbing** — spec generation shape, semantic gate, eligibility, render, result
integrity, and the new fallback signal — is exercised by the production code path
and covered by tests (`backend/test/tutor.test.ts`, 99 green).

What **only a live key** can verify is the *judgement*: that real Claude picks
the right mode and the right tool, and names a genuinely useful missing
interaction. The contract, prompt, and gates are all in place for that; flip
`MOCK_LLM=false` with a key to exercise it.
