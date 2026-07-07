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
      expect(typeof t.verifyResult).toBe('function');
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
    expect(g7).toEqual([
      'number_line', 'order_sequence', 'sort_buckets', 'match_pairs', 'balance_scale', 'timeline',
    ]);
    expect(eligibleTools({ grade: 5, stage: 'primary_games' })).toHaveLength(0);
  });

  it('narrows by subject when the context names one we recognize', () => {
    const science = eligibleTools({
      grade: 8,
      stage: 'middle_interactive_learning',
      subject: subjectFromLabel('العلوم'),
    }).map((t) => t.id);
    expect(science).not.toContain('number_line'); // math-only
    expect(science).not.toContain('timeline'); // social_studies-only
    expect(science).toContain('order_sequence');
    expect(science).toContain('match_pairs');

    const socialStudies = eligibleTools({
      grade: 8,
      stage: 'middle_interactive_learning',
      subject: subjectFromLabel('اجتماعيات'),
    }).map((t) => t.id);
    expect(socialStudies).toContain('timeline');
    expect(socialStudies).not.toContain('number_line');
    expect(socialStudies).not.toContain('balance_scale');
  });

  it('an unknown subject label never blocks — it just does not narrow', () => {
    expect(subjectFromLabel('فنون تشكيلية')).toBeNull();
    const all = eligibleTools({ grade: 7, stage: 'middle_interactive_learning', subject: null });
    expect(all).toHaveLength(TOOL_REGISTRY.length);
  });
});

describe('matchGolden (deterministic mock routing)', () => {
  const middle = ['number_line', 'order_sequence', 'sort_buckets', 'match_pairs', 'balance_scale', 'timeline'];

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

  it('routes an equation question to balance_scale', () => {
    expect(matchGolden('ساعدني أجد المجهول في هذه المعادلة', middle, true)?.type).toBe('balance_scale');
  });

  it('routes a historical-sequence question to timeline, not order_sequence', () => {
    // Deliberately avoids order_sequence's own trigger words (رتب/ترتيب/…) so
    // this proves timeline's distinct routing, not registry-order luck.
    expect(matchGolden('أخبرني عن أحداث طريق الاستقلال والانتداب', middle, true)?.type).toBe('timeline');
  });

  it('normalizes golden data onto the full flat shape', () => {
    const p = matchGolden('وصل الكلمة بمعناها match', middle, false)!;
    expect(Object.keys(p.data).sort()).toEqual(Object.keys(emptyToolData()).sort());
  });
});

describe('verifyResult (deterministic server-side outcome recomputation)', () => {
  const tool = (id: string) => TOOL_REGISTRY.find((t) => t.id === id)!;
  const data = (partial: Record<string, unknown>) =>
    ({ ...emptyToolData(), ...partial }) as Parameters<(typeof TOOL_REGISTRY)[number]['verifyResult']>[0];

  it('number_line: value vs target within tolerance (default half step)', () => {
    const d = data({ min: 0, max: 1, step: 0.05, target: 0.75, tolerance: 0.05 });
    const v = tool('number_line').verifyResult;
    expect(v(d, { value: 0.75 })).toBe('correct');
    expect(v(d, { value: 0.7 })).toBe('correct'); // inside tolerance
    expect(v(d, { value: 0.5 })).toBe('incorrect');
    expect(v(d, {})).toBe('unverifiable'); // old client, no answer
    expect(v(d, { value: Number.NaN })).toBe('invalid');
    expect(v(d, { value: 7 })).toBe('invalid'); // outside the rendered line
  });

  it('order_sequence: permutation compare, exact / partial / none', () => {
    const d = data({
      items: [
        { id: 'a', label: 'أ', bucketId: null },
        { id: 'b', label: 'ب', bucketId: null },
        { id: 'c', label: 'ج', bucketId: null },
        { id: 'd', label: 'د', bucketId: null },
      ],
      correctOrder: ['a', 'b', 'c', 'd'],
    });
    const v = tool('order_sequence').verifyResult;
    expect(v(d, { order: ['a', 'b', 'c', 'd'] })).toBe('correct');
    expect(v(d, { order: ['a', 'c', 'b', 'd'] })).toBe('partially_correct');
    expect(v(d, { order: ['d', 'a', 'b', 'c'] })).toBe('incorrect');
    expect(v(d, { order: ['a', 'b'] })).toBe('invalid'); // not a full submission
    expect(v(d, { order: ['a', 'b', 'c', 'zzz'] })).toBe('invalid'); // foreign id
    expect(v(d, { order: ['a', 'a', 'b', 'c'] })).toBe('invalid'); // duplicate
    expect(v(d, {})).toBe('unverifiable');
  });

  it('sort_buckets: placements recomputed against the true bucket ids', () => {
    const d = data({
      buckets: [{ id: 'x', label: 'س' }, { id: 'y', label: 'ص' }],
      items: [
        { id: '1', label: 'أ', bucketId: 'x' },
        { id: '2', label: 'ب', bucketId: 'y' },
        { id: '3', label: 'ج', bucketId: 'x' },
      ],
    });
    const v = tool('sort_buckets').verifyResult;
    const all = [
      { itemId: '1', bucketId: 'x' },
      { itemId: '2', bucketId: 'y' },
      { itemId: '3', bucketId: 'x' },
    ];
    expect(v(d, { placements: all })).toBe('correct');
    expect(v(d, { placements: [all[0]!, { itemId: '2', bucketId: 'x' }, all[2]!] })).toBe('partially_correct');
    expect(
      v(d, {
        placements: [
          { itemId: '1', bucketId: 'y' },
          { itemId: '2', bucketId: 'x' },
          { itemId: '3', bucketId: 'y' },
        ],
      }),
    ).toBe('incorrect');
    expect(v(d, { placements: all.slice(0, 2) })).toBe('invalid'); // item unaccounted
    expect(v(d, { placements: [...all.slice(0, 2), { itemId: 'nope', bucketId: 'x' }] })).toBe('invalid');
    expect(v(d, { placements: [...all.slice(0, 2), { itemId: '3', bucketId: 'ghost' }] })).toBe('invalid');
    expect(v(d, {})).toBe('unverifiable');
  });

  it('match_pairs: outcome from the reported mistake count', () => {
    const d = data({
      pairs: [
        { id: 'p1', left: 'a', right: 'م1' },
        { id: 'p2', left: 'b', right: 'م2' },
        { id: 'p3', left: 'c', right: 'م3' },
        { id: 'p4', left: 'd', right: 'م4' },
      ],
    });
    const v = tool('match_pairs').verifyResult;
    expect(v(d, { wrongTries: 0 })).toBe('correct');
    expect(v(d, { wrongTries: 2 })).toBe('partially_correct');
    expect(v(d, { wrongTries: 4 })).toBe('incorrect');
    expect(v(d, {})).toBe('unverifiable');
  });

  it('balance_scale: coefficient*value + constant vs target, within tolerance', () => {
    // x + 3 = 10 → x = 7
    const d = data({ coefficient: 1, constant: 3, target: 10, min: 0, max: 20, step: 1, tolerance: 0 });
    const v = tool('balance_scale').verifyResult;
    expect(v(d, { value: 7 })).toBe('correct');
    expect(v(d, { value: 6 })).toBe('incorrect');
    expect(v(d, {})).toBe('unverifiable');
    expect(v(d, { value: Number.NaN })).toBe('invalid');
    expect(v(d, { value: 99 })).toBe('invalid'); // outside the rendered beam

    // 2x - 1 = 9 → x = 5, tolerance defaults to half a step
    const d2 = data({ coefficient: 2, constant: -1, target: 9, min: 0, max: 10, step: 1 });
    const v2 = tool('balance_scale').verifyResult;
    expect(v2(d2, { value: 5 })).toBe('correct');
    expect(v2(d2, { value: 5.2 })).toBe('correct'); // 2*5.2-1=9.4, within the default half-step (0.5) tolerance
    expect(v2(d2, { value: 4 })).toBe('incorrect');
  });

  it('timeline: reuses the exact order_sequence permutation logic (shared verifyOrderPermutation)', () => {
    const d = data({
      items: [
        { id: 'ottoman_end', label: '١٩١٨', bucketId: null },
        { id: 'mandate', label: '١٩٢٠', bucketId: null },
        { id: 'revolt', label: '١٩٢٥', bucketId: null },
        { id: 'independence', label: '١٩٤٦', bucketId: null },
      ],
      correctOrder: ['ottoman_end', 'mandate', 'revolt', 'independence'],
    });
    expect(tool('timeline').verifyResult).toBe(tool('order_sequence').verifyResult);
    const v = tool('timeline').verifyResult;
    expect(v(d, { order: ['ottoman_end', 'mandate', 'revolt', 'independence'] })).toBe('correct');
    expect(v(d, { order: ['ottoman_end', 'revolt', 'mandate', 'independence'] })).toBe('partially_correct');
    expect(v(d, { order: ['independence', 'revolt', 'mandate', 'ottoman_end'] })).toBe('incorrect');
    expect(v(d, {})).toBe('unverifiable');
  });
});
