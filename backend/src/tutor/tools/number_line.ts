import { z } from 'zod';
import type { ToolDescriptor } from './types.js';

/**
 * number_line — place a value on a bounded numeric axis. Subject-specific
 * visual (the widget renders numeric meaning, not labels), so the axis stays
 * LTR even in Arabic — mathematical convention (INTERACTIVE_PLATFORM.md §2).
 */
export const numberLineTool = {
  id: 'number_line',
  version: 1,
  primitive: 'place_on_scale',
  subjects: ['math'],
  conceptFamilies: ['fractions', 'decimals', 'negatives', 'estimation', 'magnitude_comparison'],
  grades: { min: 7, max: 9 },
  stages: ['middle_interactive_learning'],
  interaction: 'slider',
  resultKind: 'checked',
  rtl: 'axis_ltr',
  a11y: 'Marker is draggable AND nudgeable via +/- step buttons; value read out as text; axis labels are semantic text.',
  flutterRenderer: 'blocks/number_line_block.dart',
  supportsContextVariants: true,
  fallback:
    'For numeric ideas that are not about POSITION on a scale (e.g. operations practice), explain or ask a guiding question instead.',
  dataFields: {
    min: z.number().nullable(),
    max: z.number().nullable(),
    step: z.number().nullable(),
    target: z.number().nullable(),
    tolerance: z.number().nullable(),
    unit: z.string().max(60).nullable(),
  },
  validate: (d) => {
    const { min, max, step, target } = d;
    if (min == null || max == null || step == null || target == null) return false;
    if (![min, max, step, target].every(Number.isFinite)) return false;
    if (min >= max || step <= 0) return false;
    if ((max - min) / step > 200) return false; // keep the line manipulable
    if (target < min || target > max) return false;
    if (d.tolerance != null && (!Number.isFinite(d.tolerance) || d.tolerance < 0)) return false;
    return true;
  },
  verifyResult: (d, answer) => {
    const v = answer.value;
    if (v == null) return 'unverifiable';
    if (!Number.isFinite(v)) return 'invalid';
    const { min, max, step, target, tolerance } = d;
    if (min == null || max == null || step == null || target == null) return 'invalid';
    if (v < min || v > max) return 'invalid'; // outside the line the widget renders
    // Mirrors numberLineOutcome in block_logic.dart: tolerance defaults to
    // half a step ("the nearest snap wins").
    const tol = tolerance ?? step / 2;
    return Math.abs(v - target) <= tol + 1e-9 ? 'correct' : 'incorrect';
  },
  promptSpec:
    '* "number_line" (version 1) — the student places a value on a number line and checks. data: min, max, step (>0, at most 200 steps across), target (within [min,max]), tolerance (accepted distance, usually one step or less), unit (short axis label or null). Use for fractions, decimals, negatives, estimation, comparing magnitudes.',
  goldens: [
    {
      subject: 'math',
      concept: 'fractions',
      trigger: /كسر|كسور|خط الأعداد|المستقيم|عدد سالب|fraction|number line|decimal/i,
      payload: (ar) => ({
        type: 'number_line',
        version: 1,
        title: ar ? 'ضع الكسر في مكانه' : 'Place the fraction',
        instructions: ar
          ? 'حرّك المؤشر حتى يقف على قيمة ثلاثة أرباع، ثم تحقق.'
          : 'Move the marker until it stands on three quarters, then check.',
        data: {
          min: 0, max: 1, step: 0.05, target: 0.75, tolerance: 0.05,
          unit: ar ? 'من 0 إلى 1' : 'from 0 to 1',
        },
        expectedLearningAction: ar
          ? 'يحدد موضع كسر بين عددين صحيحين بنفسه'
          : 'Locates a fraction between two whole numbers by hand',
        followUpPrompt: ar
          ? 'اسأله أين يقع ٣/٤ بالنسبة إلى النصف'
          : 'Ask where 3/4 sits relative to one half',
      }),
    },
  ],
  available: true,
} satisfies ToolDescriptor<'number_line'>;
