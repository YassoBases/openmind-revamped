/**
 * The controlled tool registry — the single source of truth for approved
 * interactive tool families. Everything the platform needs is DERIVED from
 * the descriptors here: the structural schema fields (contract.ts), the
 * prompt section (prompts.ts), server-side eligibility (routes/tutor.ts),
 * the semantic gate (contract.ts), and the mock's golden payloads (mock.ts).
 * Adding a tool family = one descriptor file + one Flutter renderer; nothing
 * else changes shape.
 */
import type { z } from 'zod';
import type { LearningStage } from '../../learning/stage.js';
import { matchPairsTool } from './match_pairs.js';
import { numberLineTool } from './number_line.js';
import { orderSequenceTool } from './order_sequence.js';
import { sortBucketsTool } from './sort_buckets.js';
import { SUBJECTS, type GoldenPayload, type Subject, type ToolDataView, type ToolDescriptor } from './types.js';

/** Registry order is also mock golden-matching priority (v1 tools first). */
export const TOOL_REGISTRY: readonly ToolDescriptor[] = [
  numberLineTool,
  orderSequenceTool,
  sortBucketsTool,
  matchPairsTool,
];

/** Wire ids as a literal tuple — contract.ts builds its z.enum from this. */
export const INTERACTIVE_BLOCK_TYPES = [
  numberLineTool.id,
  orderSequenceTool.id,
  sortBucketsTool.id,
  matchPairsTool.id,
] as const;

const byId = new Map(TOOL_REGISTRY.map((t) => [t.id, t]));
if (byId.size !== TOOL_REGISTRY.length) throw new Error('tool registry: duplicate tool id');

export function getTool(id: string): ToolDescriptor | undefined {
  return byId.get(id);
}

/**
 * The merged flat data fields (one object shape for every tool — structured
 * outputs handle flat optionals far better than unions). Tools sharing a key
 * must share the schema OBJECT; a mismatch is a registration bug, not data.
 */
export function mergedDataFields(): Record<string, z.ZodType> {
  const merged: Record<string, z.ZodType> = {};
  for (const tool of TOOL_REGISTRY) {
    for (const [key, schema] of Object.entries(tool.dataFields)) {
      if (merged[key] && merged[key] !== schema) {
        throw new Error(`tool registry: field "${key}" declared with different schemas`);
      }
      merged[key] = schema as z.ZodType;
    }
  }
  return merged;
}

/** Every flat data key set to null — goldens fill only the keys they own. */
export function emptyToolData(): ToolDataView {
  const empty = Object.fromEntries(Object.keys(mergedDataFields()).map((k) => [k, null]));
  return empty as unknown as ToolDataView;
}

/**
 * Server-side eligibility (INTERACTIVE_PLATFORM.md §4 step 1): which tools may
 * this learner be offered at all? Grade and stage come from the authenticated
 * student row; subject (when the context names one we recognize) narrows
 * further; `available` is the per-tool kill switch. The route passes the
 * surviving ids to the model AND re-checks the reply against them.
 */
export function eligibleTools(learner: {
  grade: number;
  stage: LearningStage;
  subject?: Subject | null;
}): ToolDescriptor[] {
  return TOOL_REGISTRY.filter(
    (t) =>
      t.available &&
      t.stages.includes(learner.stage) &&
      learner.grade >= t.grades.min &&
      learner.grade <= t.grades.max &&
      (learner.subject == null || t.subjects.includes('*') || t.subjects.includes(learner.subject)),
  );
}

/**
 * Maps a free-text subject label (client context strings are display text,
 * often Arabic) onto a registry subject. Unknown labels return null — which
 * means "don't narrow", never "block".
 */
export function subjectFromLabel(label?: string | null): Subject | null {
  if (!label) return null;
  const l = label.toLowerCase();
  const patterns: Array<[Subject, RegExp]> = [
    ['math', /math|رياضيات|حساب|هندسة|جبر/],
    ['science', /science|علوم|فيزياء|كيمياء|أحياء/],
    ['arabic', /arabic|عربي|لغتي|قواعد اللغة/],
    ['english', /english|إنجليزي|انجليزي|إنكليزي|انكليزي/],
    ['geography', /geography|جغرافيا/],
    ['social_studies', /social|اجتماعيات|تاريخ|وطنية/],
    ['future_skills', /future|مهارات المستقبل|برمجة|تقنية/],
  ];
  for (const [subject, re] of patterns) if (re.test(l)) return subject;
  return null;
}

/**
 * The INTERACTIVE BLOCKS registry section of the tutor system prompt —
 * generated once at import from the descriptors (a static string, so prompt
 * caching still holds; per-learner filtering rides the user message as
 * availableTools, never here).
 */
export function buildToolsPromptSection(): string {
  const specs = TOOL_REGISTRY.filter((t) => t.available).map((t) => `  ${t.promptSpec}`);
  return [
    '- Registry (each tool names its exact required version):',
    ...specs,
    '  * Fields for every block: title (short, inviting), instructions (ONE sentence telling the student what to do), expectedLearningAction (what acting should teach), followUpPrompt (how you intend to follow up on their result). Unused data fields are null.',
    '- The user message carries availableTools: the tool ids approved for THIS student. Select ONLY from that list; when it is empty, interactivePayload must be null.',
  ].join('\n');
}

/**
 * Deterministic golden routing for the mock provider: first available tool
 * (registry order) whose golden trigger matches the question wins; data is
 * normalized onto the full flat shape. Every golden passes the production
 * semantic gate — enforced by test/tools.test.ts.
 */
export function matchGolden(
  question: string,
  availableTools: readonly string[],
  ar: boolean,
): GoldenPayload | null {
  for (const tool of TOOL_REGISTRY) {
    if (!tool.available || !availableTools.includes(tool.id)) continue;
    for (const golden of tool.goldens) {
      if (!golden.trigger.test(question)) continue;
      const p = golden.payload(ar);
      return { ...p, data: { ...emptyToolData(), ...p.data } };
    }
  }
  return null;
}

/** All goldens, fully normalized — drives the exported Flutter fixture. */
export function allGoldens(): Array<{ tool: string; subject: Subject; concept: string; language: 'ar' | 'en'; payload: GoldenPayload }> {
  const out = [];
  for (const tool of TOOL_REGISTRY) {
    for (const golden of tool.goldens) {
      for (const language of ['ar', 'en'] as const) {
        const p = golden.payload(language === 'ar');
        out.push({
          tool: tool.id,
          subject: golden.subject,
          concept: golden.concept,
          language,
          payload: { ...p, data: { ...emptyToolData(), ...p.data } },
        });
      }
    }
  }
  return out;
}

export { SUBJECTS };
export type { Subject, ToolDescriptor, GoldenPayload, ToolDataView };
