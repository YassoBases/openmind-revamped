import {
  CorrectOrderField,
  ItemsField,
  validateOrderShape,
  verifyOrderPermutation,
  type ToolDescriptor,
} from './types.js';

/**
 * timeline — arrange 3-8 historical/civic events into the correct
 * chronological order, presented as a timeline rather than a plain list.
 * Same permutation mechanic as order_sequence (shares its data shape AND its
 * validate/verifyResult — see types.ts), just a temporal presentation for
 * social studies. v1 deliberately ships without true axis positions (dates
 * live inside each item's label text); a richer place_on_scale variant with
 * real year positions can follow once this proves out
 * (docs/INTERACTIVE_PLATFORM.md §2, §5). Flow follows text direction — in
 * Arabic the timeline reads first-to-last the same way the sentence does,
 * unlike number_line/balance_scale's math-convention LTR axis.
 */
export const timelineTool = {
  id: 'timeline',
  version: 1,
  primitive: 'order',
  subjects: ['social_studies'],
  conceptFamilies: ['historical_sequences', 'national_history'],
  grades: { min: 7, max: 9 },
  stages: ['middle_interactive_learning'],
  interaction: 'tap',
  resultKind: 'checked',
  rtl: 'follows_text',
  a11y: 'Tap-only (tap to place on the timeline, tap a placed event to take it back); every event is a labeled button; placed positions are numbered semantically.',
  flutterRenderer: 'shared/interactive_tools/timeline_core.dart',
  supportsContextVariants: true,
  fallback:
    'If the concept has no meaningful chronological sequence (a single fact, a static description), explain it or ask a guiding question instead.',
  dataFields: {
    items: ItemsField,
    correctOrder: CorrectOrderField,
  },
  validate: validateOrderShape,
  verifyResult: verifyOrderPermutation,
  promptSpec:
    '* "timeline" (version 1) — the student arranges 3-8 historical or civic events into chronological order on a timeline. data: items[{id, label, bucketId:null}] (put the date/era INSIDE the label text, e.g. "١٩٤٦ – الاستقلال"), correctOrder = ALL item ids from earliest to latest. Use for national history, civic milestones, sequences of historical events — not for generic processes (use order_sequence for those).',
  goldens: [
    {
      subject: 'social_studies',
      concept: 'historical_sequences',
      trigger: /الجلاء|الاستقلال|الانتداب|أحداث تاريخية|خط زمني|جدول زمني|تسلسل تاريخي|timeline|independence|historical events/i,
      payload: (ar) => ({
        type: 'timeline',
        version: 1,
        title: ar ? 'رتّب طريق الاستقلال' : 'Order the path to independence',
        instructions: ar
          ? 'المس الأحداث بترتيبها الزمني الصحيح من الأقدم إلى الأحدث.'
          : 'Tap the events in the correct chronological order, earliest first.',
        data: {
          items: [
            { id: 'ottoman_end', label: ar ? '١٩١٨ – انتهاء الحكم العثماني' : '1918 – End of Ottoman rule', bucketId: null },
            { id: 'mandate', label: ar ? '١٩٢٠ – بدء الانتداب الفرنسي' : '1920 – French Mandate begins', bucketId: null },
            { id: 'revolt', label: ar ? '١٩٢٥ – الثورة السورية الكبرى' : '1925 – The Great Syrian Revolt', bucketId: null },
            { id: 'independence', label: ar ? '١٩٤٦ – عيد الجلاء (الاستقلال الكامل)' : '1946 – Evacuation Day (full independence)', bucketId: null },
          ],
          correctOrder: ['ottoman_end', 'mandate', 'revolt', 'independence'],
        },
        expectedLearningAction: ar
          ? 'يبني تسلسل طريق الاستقلال بنفسه'
          : 'Builds the path-to-independence sequence by hand',
        followUpPrompt: ar
          ? 'اسأله لماذا كانت الثورة الكبرى خطوة مهمة نحو الاستقلال'
          : 'Ask why the Great Revolt was an important step toward independence',
      }),
    },
  ],
  available: true,
} satisfies ToolDescriptor<'timeline'>;
