import { PairsField, type ToolDescriptor } from './types.js';

/**
 * match_pairs — connect each item to its one true match across two columns.
 * The first descriptor-native tool: reusable as-is across every subject
 * (vocab↔meaning, root↔pattern, concept↔definition, event↔place), tap-only,
 * follows text direction.
 */
export const matchPairsTool = {
  id: 'match_pairs',
  version: 1,
  primitive: 'match',
  subjects: ['*'],
  conceptFamilies: ['vocabulary', 'roots_and_patterns', 'term_definitions', 'event_associations'],
  grades: { min: 7, max: 9 },
  stages: ['middle_interactive_learning'],
  interaction: 'tap',
  resultKind: 'scored',
  rtl: 'follows_text',
  a11y: 'Tap-only (tap a left item, then its match on the right); every item is a labeled button; locked pairs announce themselves as matched.',
  flutterRenderer: 'blocks/match_pairs_block.dart',
  supportsContextVariants: true,
  fallback:
    'If the idea has no clean one-to-one pairing (one item matches several, or the "match" needs explanation to be fair), teach it in text instead.',
  dataFields: {
    pairs: PairsField,
  },
  validate: (d) => {
    const pairs = d.pairs ?? [];
    if (pairs.length < 3 || pairs.length > 6) return false;
    if (new Set(pairs.map((p) => p.id)).size !== pairs.length) return false;
    // Duplicate labels on either side make the match ambiguous → unrenderable.
    if (new Set(pairs.map((p) => p.left.trim())).size !== pairs.length) return false;
    if (new Set(pairs.map((p) => p.right.trim())).size !== pairs.length) return false;
    return true;
  },
  promptSpec:
    '* "match_pairs" (version 1) — the student connects each item to its one true match across two columns. data: pairs[{id, left, right}] (3-6 pairs; left = the prompt side, right = its match; every left label distinct, every right label distinct, exactly one right per left). Use for English vocabulary↔meaning, Arabic root↔word pattern or word↔meaning, science concept↔definition, social-studies event or landmark↔place, person or consequence.',
  goldens: [
    {
      subject: 'english',
      concept: 'vocabulary',
      trigger: /vocabulary|vocab|مفردات|معنى الكلمة|معاني الكلمات|مرادف|طابق|وصّل|وصل الكلم|match/i,
      payload: (ar) => ({
        type: 'match_pairs',
        version: 1,
        title: ar ? 'صِل الكلمة بمعناها' : 'Match the word to its meaning',
        instructions: ar
          ? 'المس الكلمة الإنجليزية ثم المس معناها الصحيح.'
          : 'Tap an English word, then tap its correct meaning.',
        data: {
          pairs: [
            { id: 'p1', left: 'rapid', right: ar ? 'سريع جدًا' : 'very fast' },
            { id: 'p2', left: 'ancient', right: ar ? 'قديم جدًا' : 'very old' },
            { id: 'p3', left: 'assist', right: ar ? 'يساعد' : 'to help' },
            { id: 'p4', left: 'brief', right: ar ? 'قصير ومختصر' : 'short' },
          ],
        },
        expectedLearningAction: ar
          ? 'يربط المفردة الإنجليزية بمعناها بنفسه'
          : 'Connects each English word to its meaning by hand',
        followUpPrompt: ar
          ? 'اطلب منه جملة قصيرة يستعمل فيها إحدى الكلمات'
          : 'Ask for a short sentence using one of the words',
      }),
    },
    {
      subject: 'arabic',
      concept: 'roots_and_patterns',
      trigger: /جذر|الجذور|وزن الكلمة|أوزان|اشتقاق|مشتقات|root|pattern/i,
      payload: (ar) => ({
        type: 'match_pairs',
        version: 1,
        title: ar ? 'صِل الجذر بالكلمة المشتقة منه' : 'Match the root to its derived word',
        instructions: ar
          ? 'المس الجذر ثم المس الكلمة المشتقة منه.'
          : 'Tap a root, then tap the word derived from it.',
        data: {
          pairs: [
            { id: 'r1', left: 'كتب', right: 'مكتبة' },
            { id: 'r2', left: 'علم', right: 'معلّم' },
            { id: 'r3', left: 'درس', right: 'مدرسة' },
            { id: 'r4', left: 'خرج', right: 'مخرج' },
          ],
        },
        expectedLearningAction: ar
          ? 'يكتشف كيف تتولد الكلمات من جذر واحد'
          : 'Discovers how words grow from a single root',
        followUpPrompt: ar
          ? 'اسأله عن كلمة أخرى من جذر كتب'
          : 'Ask for another word from the root كتب',
      }),
    },
    {
      subject: 'science',
      concept: 'term_definitions',
      trigger: /مصطلح|مصطلحات|تعريف|تعاريف|مفهوم|مفاهيم|definition|scientific term/i,
      payload: (ar) => ({
        type: 'match_pairs',
        version: 1,
        title: ar ? 'صِل المصطلح بتعريفه' : 'Match the term to its definition',
        instructions: ar
          ? 'المس المصطلح العلمي ثم المس تعريفه الصحيح.'
          : 'Tap a science term, then tap its correct definition.',
        data: {
          pairs: [
            { id: 's1', left: ar ? 'التبخر' : 'Evaporation', right: ar ? 'تحول السائل إلى غاز' : 'Liquid turns into gas' },
            { id: 's2', left: ar ? 'التكاثف' : 'Condensation', right: ar ? 'تحول الغاز إلى سائل' : 'Gas turns into liquid' },
            { id: 's3', left: ar ? 'الانصهار' : 'Melting', right: ar ? 'تحول الصلب إلى سائل' : 'Solid turns into liquid' },
            { id: 's4', left: ar ? 'التجمد' : 'Freezing', right: ar ? 'تحول السائل إلى صلب' : 'Liquid turns into solid' },
          ],
        },
        expectedLearningAction: ar
          ? 'يميز تحولات المادة بربط كل مصطلح بتعريفه'
          : 'Distinguishes state changes by pairing each term with its definition',
        followUpPrompt: ar
          ? 'اسأله أين يرى التكاثف في بيته'
          : 'Ask where they see condensation at home',
      }),
    },
    {
      subject: 'social_studies',
      concept: 'event_associations',
      trigger: /معالم|معلم أثري|أثري|تراث|حدث تاريخي|أحداث تاريخية|landmark|heritage|historical event/i,
      payload: (ar) => ({
        type: 'match_pairs',
        version: 1,
        title: ar ? 'صِل المَعْلم بمدينته' : 'Match the landmark to its city',
        instructions: ar
          ? 'المس المعلم التاريخي ثم المس المدينة التي يقع فيها.'
          : 'Tap a landmark, then tap the city it belongs to.',
        data: {
          pairs: [
            { id: 'h1', left: ar ? 'القلعة الأثرية' : 'The Citadel', right: ar ? 'حلب' : 'Aleppo' },
            { id: 'h2', left: ar ? 'الجامع الأموي' : 'The Umayyad Mosque', right: ar ? 'دمشق' : 'Damascus' },
            { id: 'h3', left: ar ? 'النواعير' : 'The Norias (waterwheels)', right: ar ? 'حماة' : 'Hama' },
            { id: 'h4', left: ar ? 'المدرج الروماني' : 'The Roman Theatre', right: ar ? 'بصرى' : 'Bosra' },
          ],
        },
        expectedLearningAction: ar
          ? 'يربط المعالم التراثية بأماكنها على خريطة بلده الذهنية'
          : 'Anchors heritage landmarks to their places on a mental map',
        followUpPrompt: ar
          ? 'اسأله أي معلم يود زيارته ولماذا'
          : 'Ask which landmark they would visit and why',
      }),
    },
  ],
  available: true,
} satisfies ToolDescriptor<'match_pairs'>;
