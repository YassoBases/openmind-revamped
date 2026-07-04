/**
 * Tool registry invariants — the descriptor system's self-tests. Every
 * approved family must be fully declared, every golden must survive the REAL
 * production gates (structural schema + semantic validate + its own
 * eligibility), and the committed Flutter fixture must not drift from the
 * registry.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  InteractivePayloadSchema,
  validateInteractivePayload,
  type InteractivePayload,
} from '../src/tutor/contract.js';
import { buildGoldenFixture } from '../src/tutor/tools/fixture.js';
import {
  TOOL_REGISTRY,
  allGoldens,
  eligibleTools,
  emptyToolData,
  matchGolden,
  subjectFromLabel,
} from '../src/tutor/tools/registry.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('tool registry (descriptor invariants)', () => {
  it('declares unique ids, sane grades, and complete descriptors', () => {
    const ids = TOOL_REGISTRY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOOL_REGISTRY) {
      expect(t.version).toBeGreaterThanOrEqual(1);
      expect(t.grades.min).toBeLessThanOrEqual(t.grades.max);
      expect(t.stages.length).toBeGreaterThan(0);
      expect(t.subjects.length).toBeGreaterThan(0);
      expect(t.conceptFamilies.length).toBeGreaterThan(0);
      expect(t.promptSpec).toContain(`"${t.id}"`);
      expect(t.promptSpec).toContain(`version ${t.version}`);
      expect(t.flutterRenderer).toMatch(/\.dart$/);
      expect(t.fallback.length).toBeGreaterThan(0);
      expect(t.a11y.length).toBeGreaterThan(0);
      expect(t.goldens.length).toBeGreaterThan(0);
      expect(Object.keys(t.dataFields).length).toBeGreaterThan(0);
    }
  });

  it('every golden passes the structural schema AND the semantic gate, in both languages', () => {
    for (const g of allGoldens()) {
      const parsed = InteractivePayloadSchema.parse(g.payload);
      expect(parsed.type).toBe(g.tool);
      expect(validateInteractivePayload(parsed), `${g.tool}/${g.concept}/${g.language}`).not.toBeNull();
    }
  });

  it('match_pairs proves cross-subject coverage: english, arabic, science, social studies', () => {
    const subjects = new Set(
      allGoldens().filter((g) => g.tool === 'match_pairs').map((g) => g.subject),
    );
    for (const s of ['english', 'arabic', 'science', 'social_studies']) {
      expect(subjects.has(s as never), `match_pairs golden for ${s}`).toBe(true);
    }
  });

  it('the committed Flutter fixture matches the registry (run npm -w backend run export:goldens)', () => {
    const committed = readFileSync(
      join(here, '..', '..', 'edumind-ui', 'test', 'fixtures', 'tool_goldens.json'),
      'utf8',
    );
    expect(committed).toBe(buildGoldenFixture());
  });
});

describe('eligibleTools (server-side hard gate)', () => {
  it('grade 7-9 middle stage gets the full catalog; primary gets nothing', () => {
    const g7 = eligibleTools({ grade: 7, stage: 'middle_interactive_learning' }).map((t) => t.id);
    expect(g7).toEqual(['number_line', 'order_sequence', 'sort_buckets', 'match_pairs']);
    expect(eligibleTools({ grade: 5, stage: 'primary_games' })).toHaveLength(0);
  });

  it('narrows by subject when the context names one we recognize', () => {
    const science = eligibleTools({
      grade: 8,
      stage: 'middle_interactive_learning',
      subject: subjectFromLabel('العلوم'),
    }).map((t) => t.id);
    expect(science).not.toContain('number_line'); // math-only
    expect(science).toContain('order_sequence');
    expect(science).toContain('match_pairs');
  });

  it('an unknown subject label never blocks — it just does not narrow', () => {
    expect(subjectFromLabel('فنون تشكيلية')).toBeNull();
    const all = eligibleTools({ grade: 7, stage: 'middle_interactive_learning', subject: null });
    expect(all).toHaveLength(TOOL_REGISTRY.length);
  });
});

describe('matchGolden (deterministic mock routing)', () => {
  const middle = ['number_line', 'order_sequence', 'sort_buckets', 'match_pairs'];

  it('routes each subject example to a valid match_pairs payload', () => {
    const cases: Array<[string, string]> = [
      ['ساعدني في مفردات الإنجليزية ومعانيها', 'vocabulary'],
      ['ما جذر كلمة مدرسة؟', 'roots_and_patterns'],
      ['اشرح لي تعريف التبخر والتكاثف كمصطلحات', 'term_definitions'],
      ['حدثني عن معالم بلادي التاريخية', 'event_associations'],
    ];
    for (const [question, concept] of cases) {
      const p = matchGolden(question, middle, true);
      expect(p?.type, question).toBe('match_pairs');
      const parsed = InteractivePayloadSchema.parse(p);
      expect(validateInteractivePayload(parsed as InteractivePayload), concept).not.toBeNull();
    }
  });

  it('never offers a tool outside availableTools', () => {
    expect(matchGolden('ضع الكسر على خط الأعداد', [], true)).toBeNull();
    expect(matchGolden('ضع الكسر على خط الأعداد', ['match_pairs'], true)).toBeNull();
  });

  it('keeps v1 keyword routing intact (registry order priority)', () => {
    expect(matchGolden('كيف أضع الكسر ٣/٤ على خط الأعداد؟', middle, true)?.type).toBe('number_line');
    expect(matchGolden('رتب لي مراحل دورة الماء', middle, true)?.type).toBe('order_sequence');
    expect(matchGolden('صنف الكلمات: اسم أم فعل أم حرف؟', middle, true)?.type).toBe('sort_buckets');
    expect(matchGolden('لماذا نرى البرق قبل الرعد؟', middle, true)).toBeNull();
  });

  it('normalizes golden data onto the full flat shape', () => {
    const p = matchGolden('وصل الكلمة بمعناها match', middle, false)!;
    expect(Object.keys(p.data).sort()).toEqual(Object.keys(emptyToolData()).sort());
  });
});
