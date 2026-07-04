import { BucketsField, ItemsField, type ToolDescriptor } from './types.js';

/**
 * sort_buckets — classify 3-8 items into 2-4 labeled groups. Reusable as-is
 * across subjects; layout follows text direction.
 */
export const sortBucketsTool = {
  id: 'sort_buckets',
  version: 1,
  primitive: 'classify',
  subjects: ['*'],
  conceptFamilies: ['grammar_categories', 'taxonomies', 'states_of_matter', 'source_types'],
  grades: { min: 7, max: 9 },
  stages: ['middle_interactive_learning'],
  interaction: 'tap',
  resultKind: 'scored',
  rtl: 'follows_text',
  a11y: 'One item shown at a time; buckets are labeled buttons with immediate right/wrong feedback naming the truth.',
  flutterRenderer: 'blocks/sort_buckets_block.dart',
  supportsContextVariants: true,
  fallback:
    'If the items do not fall into clean, defensible categories, do not force groups — explain the distinction in text instead.',
  dataFields: {
    items: ItemsField,
    buckets: BucketsField,
  },
  validate: (d) => {
    const items = d.items ?? [];
    const buckets = d.buckets ?? [];
    if (buckets.length < 2 || buckets.length > 4) return false;
    const bucketIds = new Set(buckets.map((b) => b.id));
    if (bucketIds.size !== buckets.length) return false;
    if (items.length < 3 || items.length > 8) return false;
    if (new Set(items.map((i) => i.id)).size !== items.length) return false;
    if (!items.every((i) => i.bucketId != null && bucketIds.has(i.bucketId))) return false;
    return true;
  },
  verifyResult: (d, answer) => {
    const placements = answer.placements;
    if (placements == null) return 'unverifiable';
    const items = d.items ?? [];
    const bucketIds = new Set((d.buckets ?? []).map((b) => b.id));
    // Exactly one placement per instance item, into a real bucket.
    if (placements.length !== items.length) return 'invalid';
    if (new Set(placements.map((p) => p.itemId)).size !== placements.length) return 'invalid';
    const truth = new Map(items.map((i) => [i.id, i.bucketId]));
    let correctCount = 0;
    for (const p of placements) {
      if (!truth.has(p.itemId) || !bucketIds.has(p.bucketId)) return 'invalid';
      if (truth.get(p.itemId) === p.bucketId) correctCount++;
    }
    // Mirrors sortOutcome in block_logic.dart.
    if (correctCount === items.length) return 'correct';
    return correctCount > 0 ? 'partially_correct' : 'incorrect';
  },
  promptSpec:
    '* "sort_buckets" (version 1) — the student classifies 3-8 items into 2-4 groups. data: buckets[{id, label}], items[{id, label, bucketId: the correct bucket\'s id}]. Use for grammar categories (اسم/فعل/حرف, noun/verb/adjective), classification in science or geography.',
  goldens: [
    {
      subject: 'arabic',
      concept: 'grammar_categories',
      trigger: /صنف|صنّف|اسم|فعل|حرف|أقسام الكلام|قواعد|grammar|noun|verb|sort|classify/i,
      payload: (ar) => ({
        type: 'sort_buckets',
        version: 1,
        title: ar ? 'اسم أم فعل أم حرف؟' : 'Noun, verb, or particle?',
        instructions: ar
          ? 'ضع كل كلمة في مجموعتها الصحيحة.'
          : 'Put each word into its correct group.',
        data: {
          items: [
            { id: 'w1', label: ar ? 'سوقٌ' : 'market', bucketId: 'noun' },
            { id: 'w2', label: ar ? 'يبني' : 'builds', bucketId: 'verb' },
            { id: 'w3', label: ar ? 'إلى' : 'to', bucketId: 'part' },
            { id: 'w4', label: ar ? 'ماءٌ' : 'water', bucketId: 'noun' },
            { id: 'w5', label: ar ? 'سافرَ' : 'traveled', bucketId: 'verb' },
            { id: 'w6', label: ar ? 'مِن' : 'from', bucketId: 'part' },
          ],
          buckets: [
            { id: 'noun', label: ar ? 'اسم' : 'Noun' },
            { id: 'verb', label: ar ? 'فعل' : 'Verb' },
            { id: 'part', label: ar ? 'حرف' : 'Particle' },
          ],
        },
        expectedLearningAction: ar
          ? 'يميز أقسام الكلام بالتصنيف العملي'
          : 'Distinguishes parts of speech by hands-on sorting',
        followUpPrompt: ar
          ? 'اطلب منه جملة من عنده فيها الأقسام الثلاثة'
          : 'Ask for their own sentence using all three',
      }),
    },
  ],
  available: true,
} satisfies ToolDescriptor<'sort_buckets'>;
