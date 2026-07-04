# OpenMind Interactive Learning Capability Platform

**Status: approved direction — planning document (v1). The Ask → See → Try
milestone (registry v1: `number_line`, `order_sequence`, `sort_buckets`) is
the first proof of this architecture, not its final scope.**

> **Progress note.** The §3 descriptor foundation is now implemented in
> `backend/src/tutor/tools/` (one `ToolDescriptor` per family; contract enum,
> flat data schema, prompt section, semantic gate, and mock goldens are all
> derived from it), server-side grade/stage/subject eligibility gates the
> route (`availableTools` in the user message, re-checked on the way out),
> per-tool metrics (`tutor_interactive_offered:<type>`) are live, the three
> v1 tools are migrated with no wire change, and `match_pairs` shipped as the
> first descriptor-native Wave 2 tool. Dart mirrors only render-safety
> (`blocks/block_descriptors.dart`); descriptor goldens are exported to
> `edumind-ui/test/fixtures/tool_goldens.json` (staleness-tested on both
> sides) so the two languages cannot drift. Next per §5: `balance_scale`,
> `timeline`.
>
> **Result integrity (follow-up milestone).** A learner result is now a claim
> the server checks, never a verdict it trusts: blocks submit a structured
> `answer` (value / order / placements / wrongTries), `tutor/result.ts`
> matches it to the newest unanswered instance in the persisted thread
> (one-attempt and duplicate rules enforced server-side), and each
> descriptor's `verifyResult` recomputes the outcome against the original
> instance data — wrong claims are overridden, unmatched/tampered submissions
> are stripped safely (the turn and tutor text survive). Every submission
> leaves one minimal `learningSignal` on the student turn's context (tool,
> version, primitive, subject/concept when known, completion, final outcome,
> verification status, reject reason, attempt) for future personalization.

The long-term product: a tutor that helps learners understand any school
subject through a growing library of safe, reusable, subject-appropriate
interactive tools. The AI never generates UI, code, or one-off widgets — it
*selects* an approved tool and fills its validated data.

---

## 1. Audit of the v1 registry

What v1 proved (keep all of it):

| Pillar | Where | Verdict |
|---|---|---|
| Closed world on both ends | `INTERACTIVE_BLOCK_TYPES` (backend) + `buildTutorBlock` switch (Flutter) | Keep — this is the safety foundation |
| Two-stage validation | structural schema at generation → semantic `validateInteractivePayload` in the route, drop-to-null | Keep — "a broken activity is never pretended into existence" |
| Result loop | `interactiveResult` rides a normal tutor message; follow-up is a real conversation turn | Keep |
| Persistence | payload on the tutor turn, result on the student turn, in `TutorMessage.context` | Keep — restoration re-renders interactive moments |
| Honest fallback | null payload → guided text; unknown type → text-only on old clients | Keep |
| Metrics | `tutor_interactive_offered/invalid/result` | Keep, extend per-tool |

What will NOT scale past a handful of tools:

1. **One flat `data` object shared by all types.** Every new tool adds fields
   to a single schema; the structured-output schema (and its token cost, and
   the model's confusion surface) grows with the whole catalog, not with the
   chosen tool.
2. **Tool knowledge lives only in prose.** Subjects, grade ranges, data rules
   and examples are hand-written into `TUTOR_SYSTEM_PROMPT`; nothing machine-
   readable drives selection, filtering, or docs.
3. **One global registry version.** Bumping `INTERACTIVE_REGISTRY_VERSION`
   invalidates every tool at once; tools need independent versions.
4. **No server-side eligibility.** The model sees all tools for all learners;
   grade-inappropriate selections are only caught by prompt discipline.
5. **Validators are hand-fanned switches** in two places (contract.ts and the
   Dart `_renderable` getter) — correct today, unmaintainable at 20 tools.
6. **Single attempt per block**; retry loops exist only through chat text.

## 2. Taxonomy: primitives → tool families → instances

Three layers. Growth happens by adding **tool families**; the tutor
architecture (contract, route, prompt assembly, Flutter dispatch) never
changes shape again.

**Layer 1 — Interaction primitives** (the mechanic; cross-subject by nature):

| Primitive | Learner action | Covers |
|---|---|---|
| `place_on_scale` | position value(s) on an axis | number lines, timelines, probability scales, measurement |
| `order` | arrange items in sequence | processes, historical events, algorithm/solution steps, sentence order |
| `classify` | put items into groups | grammar categories, taxonomies, states of matter, source types |
| `match` | connect item pairs | vocab↔meaning, root↔pattern, event↔place, term↔definition |
| `compose` | build a whole from parts under slot rules | sentence building, equation building, concept maps, circuits |
| `adjust_observe` | change variables, watch a live consequence | algebra balance, geometry manipulatives, simulations, graphs |
| `decide` | choose between consequential options | prediction, dialogue choices, civic scenarios, cause-and-effect |

**Layer 2 — Tool families** (a primitive + presentation semantics + one data
schema + one Flutter widget). This is what the registry lists and the model
selects. E.g. `number_line` and `timeline` are both `place_on_scale`, but a
timeline has temporal labels, era bands, and RTL flow in Arabic — different
family, shared mechanics.

**Layer 3 — Instances** (the validated payload the model authors per
question). Never stored in the registry; always validated against the
family's schema.

**Reusable across subjects as-is** (one widget serves all subjects; the data
is just labels): `order_sequence`, `sort_buckets`, `match_pairs`,
`decision_scenario`, `concept_map`, `step_builder`.

**Subject-specific visual behavior required** (numbers, axes, geometry,
science semantics — the widget must *render meaning*, not labels):
`number_line`, `fraction_bars`, `balance_scale`, `timeline`, `chart_builder`,
`variable_lab`, `geometry_planner` (promote the lesson engine's
`triangle_planner` pattern), `circuit_builder`, `map_pins`. Note on RTL:
**numeric axes stay LTR even in Arabic** (mathematical convention);
**timelines and sentence builders follow text direction** — this is a
per-family declaration, not a global rule.

## 3. Tool descriptor (the registry contract)

Every family registers one descriptor in a new `backend/src/tutor/tools/`
module; the registry is the single source from which the system derives the
prompt section, the structural schema, the semantic gate, eligibility
filtering, docs, and the mock's golden examples.

```ts
interface ToolDescriptor {
  id: string;                    // 'balance_scale'
  version: number;               // per-tool, replaces the global version
  primitive: Primitive;          // taxonomy layer 1
  subjects: Subject[];           // ['math'] or ['*']
  conceptFamilies: string[];     // ['linear_equations', 'equality']
  grades: { min: number; max: number };
  dataSchema: z.ZodType;         // per-tool Zod (structural + semantic refine)
  interaction: 'tap' | 'drag' | 'slider' | 'mixed';   // a11y planning
  resultKind: 'checked' | 'explored' | 'scored';      // how outcomes read
  rtl: 'mirrors' | 'axis_ltr' | 'follows_text';       // declared, tested
  supportsContextVariants: boolean;  // lens may flavor labels
  fallback: string;              // guidance the prompt gives when unsuitable
  promptSpec: string;            // the exact block injected into the prompt
  goldenExample: InteractivePayload; // drives mock + docs + tests
}
```

Derivations (this is what makes growth cheap):
- **Prompt assembly**: the INTERACTIVE BLOCKS section of `TUTOR_SYSTEM_PROMPT`
  is generated from `promptSpec` of the tools eligible for *this* learner —
  the prompt stops growing with the catalog.
- **Structural schema**: stays the flat-merged shape v1 uses (structured
  outputs handle flat optionals far better than unions) but is *generated*
  from descriptors; the per-tool `dataSchema` runs server-side as the real
  gate. Revisit unions if/when structured outputs support them reliably.
- **Eligibility**: the route filters by `grades` (server-trusted grade) and
  passes `availableTools: [...]` in the user message; the model may only
  select from that list, and the semantic gate re-checks it.
- **Flutter mirror**: `tutor_block_registry.dart` keeps the type→builder map;
  each block co-locates its own parse/renderable check (refactor the
  `_renderable` switch into the blocks). Unknown type still renders nothing.

## 4. Selection model (subject × concept × grade × context)

Decision ladder, encoded partly in the prompt and partly server-side:

1. **Server**: filter tools by grade → `availableTools` in the user message.
   (Hard gate; also re-validated on the way out.)
2. **Model**: infer subject + concept from the question and history; no
   subject picker is required of the learner. Optional lightweight subject
   chips remain a UI affordance, never a prerequisite.
3. **Model**: choose the response mode in priority order —
   short explanation (interaction adds nothing) → guiding question (learner
   should think first) → **interactive tool** (acting genuinely builds the
   idea) → `open_related_experience` (a real catalog experience exists,
   signalled via `context.completedExperiences` + a future catalog manifest).
4. **Model**: within tools, prefer the family whose *primitive matches the
   cognitive act* the concept needs (compare → `place_on_scale`/`match`;
   process → `order`; category rule → `classify`; equality/covariance →
   `adjust_observe`), and honor `learningContext` for label flavoring only.
5. **History-aware pacing**: after an `incorrect` result — consolidate in
   text or offer a *simpler* instance, never a new harder tool; after
   `correct` — consolidate, then optionally the next concept step. At most
   one block per reply (v1 rule, keep), and avoid consecutive block replies.
6. **Server**: semantic gate per tool; grade re-check; drop-to-null on any
   violation with `tutor_interactive_invalid` metric.

## 5. Grade 7 roadmap (curriculum-grounded priority)

Grounding: the existing Grade 7 catalog paths (مهندس الحيّ — geometry &
measurement; حسابات السوق — percentages & proportion; طرق ومسافات —
speed/time/distance; الماء والكهرباء — consumption data) plus the Grade 7
staples: rational numbers, proportion, first equations, geometry, data;
science cycles/states/circuits; Arabic parsing (إعراب), roots & patterns;
English sentence order & vocabulary; social-studies timelines and maps.

**Wave 2 — next three tools (highest value ÷ cost):**

| Tool | Primitive | Subjects | Why now |
|---|---|---|---|
| `match_pairs` | match | all (reusable as-is) | Biggest cross-subject coverage per widget: EN vocab↔meaning, AR root↔pattern, science term↔definition, event↔place. Simple, tap-only, RTL-safe. |
| `balance_scale` | adjust_observe | math | Grade 7's pivotal concept (equations as balance). Subject-specific visual; the "see the consequence" flagship. Pairs with حسابات السوق lens. |
| `timeline` | place_on_scale / order | social studies, science | Unlocks social studies entirely (currently uncovered); reuses number-line mechanics with temporal presentation; RTL flow declared per family. |

**Wave 3:** `variable_lab` (speed/time/distance, evaporation factors —
generalizes the triangle-planner pattern into the tutor), `chart_builder`
(data unit + water/energy lens synergy), `sentence_builder` (slot-based
compose; Arabic إعراب-lite and English word order — `order_sequence` covers
linear order today, slots add grammar semantics).

**Wave 4:** `fraction_bars`/ratio table, `concept_map` (connect), 
`decision_scenario` (civic/prediction branching), `geometry_planner`
(promote `triangle_planner` into the shared registry so tutor and lesson
engine use one widget), `map_pins`, `circuit_builder`.

**Platform work items ride the waves** (each wave ships some):
descriptor module + generated prompt/schema (Wave 2, prerequisite);
server-side grade eligibility (Wave 2); per-tool metrics
(`tutor_interactive_offered:<type>`) (Wave 2); second-attempt support inside
blocks with attempt count in the result (Wave 3); catalog manifest for
honest `open_related_experience` (Wave 3); listening/audio interactions
(English) explicitly deferred until the asset pipeline exists.

## 6. Invariants (never relaxed as the catalog grows)

1. The model selects and fills; it never emits code, markup, drawing
   instructions, or unregistered types.
2. Every payload passes structural validation at generation AND per-tool
   semantic Zod in the route; failures drop to null, text still ships.
3. Flutter renders only registered builders; unknown → nothing.
4. Results return through the real tutor conversation; both sides persist in
   `TutorMessage.context` (existing storage & privacy model, no new stores).
5. Tool use is optional pedagogy: explanation, guiding question, and related
   catalog experiences remain first-class response modes; no tool when none
   fits (the honesty rule).
6. Identity, grade, stage, and lens come from the authenticated student row,
   never the client or the model.
7. Per-tool versions; a version mismatch invalidates one tool, not the
   registry.
8. RTL/a11y behavior is a declared, tested property of each family
   (axis direction, tap-first interactions, semantic labels for every
   actionable element).
