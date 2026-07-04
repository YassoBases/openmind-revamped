import { CorrectOrderField, ItemsField, type ToolDescriptor } from './types.js';

/**
 * order_sequence — arrange 3-8 items into the correct order. Reusable as-is
 * across subjects (the data is just labels); item flow follows text direction.
 */
export const orderSequenceTool = {
  id: 'order_sequence',
  version: 1,
  primitive: 'order',
  subjects: ['*'],
  conceptFamilies: ['processes', 'historical_sequences', 'solution_steps', 'sentence_order'],
  grades: { min: 7, max: 9 },
  stages: ['middle_interactive_learning'],
  interaction: 'tap',
  resultKind: 'checked',
  rtl: 'follows_text',
  a11y: 'Tap-only (tap to place, tap to take back); every item is a labeled button; placed positions are numbered semantically.',
  flutterRenderer: 'blocks/order_sequence_block.dart',
  supportsContextVariants: true,
  fallback:
    'If the concept has no meaningful sequence (a definition, a single fact), explain it or ask a guiding question instead.',
  dataFields: {
    items: ItemsField,
    correctOrder: CorrectOrderField,
  },
  validate: (d) => {
    const items = d.items ?? [];
    const order = d.correctOrder ?? [];
    if (items.length < 3 || items.length > 8) return false;
    const ids = new Set(items.map((i) => i.id));
    if (ids.size !== items.length) return false;
    if (order.length !== items.length || new Set(order).size !== order.length) return false;
    if (!order.every((id) => ids.has(id))) return false;
    return true;
  },
  promptSpec:
    '* "order_sequence" (version 1) — the student arranges 3-8 items into the correct order. data: items[{id, label, bucketId:null}], correctOrder = ALL item ids in the right order. Use for process stages, historical timelines, algorithm/solution steps, sentence or word ordering.',
  goldens: [
    {
      subject: 'science',
      concept: 'processes',
      trigger: /رتب|رتّب|دورة الماء|مراحل|خطوات|ترتيب|order|sequence|water cycle|steps/i,
      payload: (ar) => ({
        type: 'order_sequence',
        version: 1,
        title: ar ? 'رتّب دورة الماء' : 'Order the water cycle',
        instructions: ar
          ? 'المس المراحل بالترتيب الصحيح من البداية إلى النهاية.'
          : 'Tap the stages in the correct order from start to finish.',
        data: {
          items: [
            { id: 'evap', label: ar ? 'تبخر الماء من البحر' : 'Water evaporates from the sea', bucketId: null },
            { id: 'cond', label: ar ? 'تكاثف البخار غيومًا' : 'Vapor condenses into clouds', bucketId: null },
            { id: 'rain', label: ar ? 'هطول المطر' : 'Rain falls', bucketId: null },
            { id: 'flow', label: ar ? 'جريان الماء إلى الأنهار' : 'Water flows back to rivers', bucketId: null },
          ],
          correctOrder: ['evap', 'cond', 'rain', 'flow'],
        },
        expectedLearningAction: ar
          ? 'يبني تسلسل دورة الماء بنفسه'
          : 'Builds the water-cycle sequence by hand',
        followUpPrompt: ar
          ? 'اسأله ماذا يحدث لو ارتفعت حرارة البحر'
          : 'Ask what happens if the sea gets warmer',
      }),
    },
  ],
  available: true,
} satisfies ToolDescriptor<'order_sequence'>;
