import { NumericField, UnitField, ViewsField, type ToolDescriptor } from './types.js';

/**
 * balance_scale — the first adjust_observe tool: the learner moves the
 * unknown x and watches a balance beam respond to `coefficient*x + constant`
 * versus `target`, until it levels. Grade 7's pivotal concept (an equation IS
 * an equality that must stay balanced) rendered as a live consequence rather
 * than a checked placement. Equation notation stays LTR even in Arabic
 * (mathematical convention, same declared exception as number_line).
 */
export const balanceScaleTool = {
  id: 'balance_scale',
  version: 1,
  primitive: 'adjust_observe',
  subjects: ['math'],
  conceptFamilies: ['linear_equations', 'equality'],
  grades: { min: 7, max: 9 },
  stages: ['middle_interactive_learning'],
  interaction: 'slider',
  resultKind: 'checked',
  rtl: 'axis_ltr',
  a11y: 'x is adjustable by a slider AND nudgeable via +/- step buttons; both sides’ live totals are read out as text; the beam tilt is decorative, never the only signal of state.',
  flutterRenderer: 'shared/interactive_tools/balance_scale_core.dart',
  supportsContextVariants: true,
  fallback:
    'For equations that are really about the PROCEDURE (isolate the term, undo an operation step by step) rather than seeing the two sides balance, explain or ask a guiding question instead.',
  dataFields: {
    coefficient: NumericField,
    constant: NumericField,
    target: NumericField,
    min: NumericField,
    max: NumericField,
    step: NumericField,
    tolerance: NumericField,
    unit: UnitField,
    views: ViewsField,
  },
  validate: (d) => {
    const { coefficient, constant, target, min, max, step } = d;
    if (coefficient == null || constant == null || target == null || min == null || max == null || step == null) {
      return false;
    }
    if (![coefficient, constant, target, min, max, step].every(Number.isFinite)) return false;
    if (coefficient === 0) return false; // not a real unknown otherwise
    if (min >= max || step <= 0) return false;
    if ((max - min) / step > 200) return false; // keep the beam manipulable
    if (d.tolerance != null && (!Number.isFinite(d.tolerance) || d.tolerance < 0)) return false;
    // The true solution must actually sit inside the range the beam renders,
    // or the learner can never level it.
    const solution = (target - constant) / coefficient;
    if (solution < min || solution > max) return false;
    return true;
  },
  verifyResult: (d, answer) => {
    const v = answer.value;
    if (v == null) return 'unverifiable';
    if (!Number.isFinite(v)) return 'invalid';
    const { coefficient, constant, target, min, max, step, tolerance } = d;
    if (coefficient == null || constant == null || target == null || min == null || max == null || step == null) {
      return 'invalid';
    }
    if (v < min || v > max) return 'invalid'; // outside the range the beam renders
    // Mirrors balanceOutcome in block_logic.dart: tolerance defaults to half a
    // step, same "nearest snap wins" convention as number_line.
    const tol = tolerance ?? step / 2;
    const lhs = coefficient * v + constant;
    return Math.abs(lhs - target) <= tol + 1e-9 ? 'correct' : 'incorrect';
  },
  // The procedural-vs-concept discriminator (mirrored in block_logic.dart's
  // balanceDiagnosis). Distinguishes "doesn't see the equation as two sides"
  // from "gets it but fumbled a step", so the two get different support.
  diagnoseError: (d, answer) => {
    const v = answer.value;
    const { coefficient: a, constant: b, target: c, step } = d;
    if (v == null || a == null || b == null || c == null || step == null) return null;
    if (!Number.isFinite(v)) return null;
    // Set x to the whole other side (x = c): doesn't see two sides at all.
    if (v === c) return 'concept_misunderstanding';
    // Undid the constant but forgot to divide by the coefficient (x = c - b).
    if (a !== 1 && v === c - b) return 'procedural_error';
    // Sign flip when undoing the constant (x = (c + b)/a instead of (c - b)/a).
    if (v === (c + b) / a) return 'procedural_error';
    // Landed within a step or two of level: right method, arithmetic slipped.
    if (Math.abs(a * v + b - c) <= 2 * step) return 'calculation_slip';
    return 'concept_misunderstanding';
  },
  promptSpec:
    '* "balance_scale" (version 1) — the student moves the unknown x on a balance beam until coefficient×x + constant equals target, then checks. data: coefficient (non-zero multiplier), constant (added term), target (the equation’s other side), min, max, step (slider bounds/granularity for x, at most 200 steps across), tolerance (accepted distance, usually one step or less), unit (short label or null). The solution (target-constant)/coefficient MUST fall within [min,max]. Use for first linear equations (ax+b=c) and equality/balance intuition.',
  goldens: [
    {
      subject: 'math',
      concept: 'linear_equations',
      trigger: /معادلة|المجهول|الرقم المفقود|ميزان|equation|balance|missing number|solve for x/i,
      payload: (ar) => ({
        type: 'balance_scale',
        version: 1,
        title: ar ? 'وازن الميزان وأوجد المجهول' : 'Balance the scale and find x',
        instructions: ar
          ? 'حرّك x حتى يتساوى طرفا الميزان، ثم تحقق.'
          : 'Move x until both sides of the scale are equal, then check.',
        data: { coefficient: 1, constant: 3, target: 10, min: 0, max: 20, step: 1, tolerance: 0 },
        expectedLearningAction: ar
          ? 'يكتشف أن المعادلة ميزان يجب أن يبقى متوازنًا'
          : 'Discovers that an equation is a balance that must stay level',
        followUpPrompt: ar
          ? 'اسأله ماذا يحدث لو أضفنا نفس العدد لطرفي الميزان'
          : 'Ask what happens if we add the same number to both sides',
      }),
    },
    {
      subject: 'math',
      concept: 'equality',
      trigger: /ضرب.*مجهول|اضرب x|two times x|multiply.*unknown|2x/i,
      payload: (ar) => ({
        type: 'balance_scale',
        version: 1,
        title: ar ? 'كم يساوي x هنا؟' : 'What must x equal here?',
        instructions: ar
          ? 'حرّك x حتى يستقر الميزان أفقيًا، ثم تحقق.'
          : 'Move x until the scale settles level, then check.',
        data: { coefficient: 2, constant: -1, target: 9, min: 0, max: 10, step: 1, tolerance: 0 },
        expectedLearningAction: ar
          ? 'يحل معادلة بمعامل غير واحد ويشاهد النتيجة فورًا'
          : 'Solves an equation with a non-one coefficient and sees the result instantly',
        followUpPrompt: ar
          ? 'اسأله كيف يتحقق من الحل بدون الميزان'
          : 'Ask how they would check the solution without the scale',
      }),
    },
  ],
  available: true,
} satisfies ToolDescriptor<'balance_scale'>;
