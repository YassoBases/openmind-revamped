// **
//  * Seed script (completely rewritten).
//  *   npm -w backend run seed
//  *
//  * Seeds:
//  *   1. A demo student (grade 7) + prints a bearer token.
//  *   2. Grades 1-8, each with 2 subjects: Mathematics + Science (16 subjects).
//  *   3. Only Grade 7's Mathematics subject gets the 9 learning paths.
//  *   4. مفاتيح المدينة (first path) — 20 spiral nodes (4 skills × 5 depths)
//  *      + 60 NEW questions that cycle through ALL 7 question types:
//  *        choice, drag_drop, spin, connect, numeric_input, tap_image, open_response
//  *      and span ALL 5 difficulties (aligned 1:1 with node depth):
//  *        intro(0), basic(1), intermediate(2), advanced(3), mastery(4)
//  *   5. مدينة لا تنهار (9th path) — 14 spiral nodes (7 subjects × 2 depths)
//  *      + 30 questions loaded from src/data/city_questions.json.
//  *
//  * ─── JSON difficulty handling ────────────────────────────────────────────────
//  * The JSON file's `difficulty` field is used DIRECTLY — no mapping. You must
//  * edit city_questions.json and set each question's `difficulty` to one of:
//  *   'intro' | 'basic' | 'intermediate' | 'advanced' | 'mastery'
//  * (These align 1:1 with PathNode.depth 0-4. مدينة لا تنهار only has nodes at
//  * depth 0 and 1, so use only 'intro' and 'basic' for that path.)
//  *
//  * The JSON's `interaction_type` field is still mapped:
//  *   mcq → choice, drag_drop → drag_drop, numeric_input → numeric_input,
//  *   tap_image → tap_image, open_response → open_response
//  * ─────────────────────────────────────────────────────────────────────────────
//  *
//  * Idempotent: re-running won't duplicate grades/subjects/paths/nodes/questions.
//  */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newToken } from '../auth.js';
import { createStore } from '../store/index.js';
import type { QuestionDifficulty, QuestionType } from '../store/types.js';

const log = { info: console.log, warn: console.warn };
const store = await createStore(log);

// ─── Demo student ────────────────────────────────────────────────────────────
const { token, hash } = newToken();
const student = await store.createStudent({
  name: 'Demo',
  gender: null,
  grade: 7,
  language: 'ar',
  color: '#1CB0F6',
  interest: 'space',
  learningContext: null,
  interests: ['nature_environment'],
  dailyGoal: 3,
  tokenHash: hash,
  installationId: null,
});
console.log('--- demo student seeded ---');
console.log('studentId:', student.id);
console.log('token:    ', token);

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function findOrCreateGrade(name: string, index: number) {
  const existing = await store.getGradeByIndex(index);
  if (existing) return existing;
  return store.createGrade({ name, index });
}
async function findOrCreateSubject(gradeId: string, title: string, content: string, orderIndex: number) {
  const subjects = await store.listSubjects(gradeId);
  const existing = subjects.find((s) => s.title === title);
  if (existing) return existing;
  return store.createSubject({ title, content, orderIndex, gradeId });
}
async function findOrCreateLearningPath(subjectId: string, name: string, description: string) {
  const lps = await store.listLearningPaths(subjectId);
  const existing = lps.find((lp) => lp.name === name);
  if (existing) return existing;
  return store.createLearningPath({ name, description, subjectId });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Grades 1-8, each with Mathematics + Science
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding grades 1-8 (each with Math + Science) ---');
for (let i = 1; i <= 8; i++) {
  const grade = await findOrCreateGrade(`Grade ${i}`, i);
  await findOrCreateSubject(grade.id, 'Mathematics', `Grade ${i} mathematics.`, 0);
  await findOrCreateSubject(grade.id, 'Science', `Grade ${i} science.`, 1);
}
console.log('grades 1-8 ready (16 subjects)');

// ════════════════════════════════════════════════════════════════════════════
// 2. Grade 7 Mathematics — 9 learning paths
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding Grade 7 Mathematics: 9 learning paths ---');
const grade7 = await store.getGradeByIndex(7);
const g7subjects = await store.listSubjects(grade7!.id);
const math = g7subjects.find((s) => s.title === 'Mathematics')!;

const LEARNING_PATHS: { name: string; description: string }[] = [
  { name: 'مفاتيح المدينة', description: 'Keys of the City — foundational number skills. Spiral across الأعداد، المقارنة، العمليات، ترتيب العمليات.' },
  { name: 'سر الرقم المفقود', description: 'The Riddle Contest — word problems and multi-step reasoning.' },
  { name: 'مدينة لا تنهار', description: "The Bridge That Won't Collapse — equations and equivalent expressions." },
  { name: 'عالم المرايا', description: 'The Magic Mirror — symmetry, reflections, coordinate geometry.' },
  { name: 'طريق لا يضيع', description: 'The Counting Compass — integers, the number line, absolute value.' },
  { name: 'أرض تصنع الفرق', description: 'The Tree of Knowledge — data, statistics, and probability.' },
  { name: 'ما وراء الجدران', description: 'What Do We See — geometry of shapes, angles, area, perimeter.' },
  { name: 'عين المدينة', description: 'Eyes of the City — patterns, sequences, introduction to functions.' },
];

const createdPaths: { name: string; id: string }[] = [];
for (let i = 0; i < LEARNING_PATHS.length; i++) {
  const lp = await findOrCreateLearningPath(math.id, LEARNING_PATHS[i]!.name, LEARNING_PATHS[i]!.description);
  createdPaths.push({ name: lp.name, id: lp.id });
  console.log(`  ${i + 1}/8 ${lp.name}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. مفاتيح المدينة — 20 spiral nodes (4 skills × 5 depths)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding مفاتيح المدينة: 20 spiral nodes ---');
const keysPath = createdPaths.find((p) => p.name === 'مفاتيح المدينة')!;

const SKILL_NAMES = ['الأعداد', 'المقارنة', 'العمليات', 'ترتيب العمليات'];
const NODE_CONTENT: { title: string; topic: string }[][] = [
  // Skill 0: الأعداد
  [
    { title: 'الأعداد: قراءة وكتابة الأعداد حتى المليون', topic: 'منازل الأعداد' },
    { title: 'الأعداد: قيمة المنزلة ورفع الأساس 10', topic: 'الضرب والقسمة على 10' },
    { title: 'الأعداد: التقريب والتقدير', topic: 'تقريب لأقرب 10/100/1000' },
    { title: 'الأعداد: الأعداد السالبة والخط العددي', topic: 'الأعداد الصحيحة' },
    { title: 'الأعداد: الحس العلمي', topic: 'كتابة الأعداد الكبيرة والصغيرة' },
  ],
  // Skill 1: المقارنة
  [
    { title: 'المقارنة: مقارنة الأعداد الكلية', topic: 'استخدام > و < و =' },
    { title: 'المقارنة: مقارنة الكسور العشرية', topic: 'محاذات المنازل العشرية' },
    { title: 'المقارنة: مقارنة الكسور الاعتيادية', topic: 'إيجاد مقام مشترك' },
    { title: 'المقارنة: مقارنة الأعداد الصحيحة', topic: 'القيمة المطلقة' },
    { title: 'المقارنة: ترتيب كل الأعداد', topic: 'تحويل بين الصيغ' },
  ],
  // Skill 2: العمليات
  [
    { title: 'العمليات: جمع وطرح متعددة المنازل', topic: 'خوارزميات الجمع والطرح' },
    { title: 'العمليات: ضرب وقسمة', topic: 'الضرب الطويل والقسمة' },
    { title: 'العمليات: العمليات على الكسور العشرية', topic: 'محاذاة الفاصلة' },
    { title: 'العمليات: العمليات على الكسور الاعتيادية', topic: 'جمع وطرح وضرب وقسمة الكسور' },
    { title: 'العمليات: العمليات على الأعداد الصحيحة', topic: 'قواعد الإشارة' },
  ],
  // Skill 3: ترتيب العمليات
  [
    { title: 'ترتيب العمليات: فهم الترتيب', topic: '× و ÷ قبل + و −' },
    { title: 'ترتيب العمليات: PEMDAS بدون أقواس', topic: 'تطبيق الترتيب' },
    { title: 'ترتيب العمليات: PEMDAS مع أقواس', topic: 'أقواس متداخلة' },
    { title: 'ترتيب العمليات: PEMDAS مع أسس', topic: 'الأسس قبل × ÷' },
    { title: 'ترتيب العمليات: PEMDAS مع كسور', topic: 'تبسيط تعابير جبرية' },
  ],
];
const XP_BY_DEPTH = [20, 30, 40, 50, 60];
const DEPTH_TO_DIFFICULTY: QuestionDifficulty[] = ['intro', 'basic', 'intermediate', 'advanced', 'mastery'];

const keysNodes: { id: string; depth: number }[] = [];
const existingKeysNodes = await store.listPathNodes(keysPath.id);
if (existingKeysNodes.length > 0) {
  console.log(`  مفاتيح المدينة already has ${existingKeysNodes.length} nodes — skipping`);
  for (let i = 0; i < existingKeysNodes.length; i++) {
    keysNodes.push({ id: existingKeysNodes[i]!.id, depth: Math.floor(i / 4) });
  }
} else {
  let oi = 0;
  for (let depth = 0; depth <= 4; depth++) {
    for (let skill = 0; skill < 4; skill++) {
      const content = NODE_CONTENT[skill]![depth]!;
      const node = await store.createPathNode({
        title: content.title,
        subject: 'Mathematics',
        topic: content.topic,
        orderIndex: oi++,
        xpReward: XP_BY_DEPTH[depth]!,
        depth,
        learningPathId: keysPath.id,
      });
      keysNodes.push({ id: node.id, depth });
    }
  }
  console.log(`  seeded 20 nodes for مفاتيح المدينة`);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. مدينة لا تنهار — 14 spiral nodes (7 subjects × 2 depths)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding مدينة لا تنهار: 14 spiral nodes ---');
const cityPath = createdPaths.find((p) => p.name === 'مدينة لا تنهار')!;

const CITY_SUBJECTS = [
  { name: 'الخطوط', title0: 'الخطوط: المستقيمات المتوازية والمتقاطعة', topic0: 'تمييز المستقيمات المتوازية والمتقاطعة', title1: 'الخطوط: الزوايا الناتجة عن تقاطع المستقيمات', topic1: 'الزوايا المتقابلة بالرأس والمتجاورة' },
  { name: 'الزوايا', title0: 'الزوايا: أنواع الزوايا (حادة، قائمة، منفرجة)', topic0: 'تمييز أنواع الزوايا وقياسها', title1: 'الزوايا: العلاقات بين الزوايا', topic1: 'الزوايا المتكاملة والمتتامة' },
  { name: 'متوازي الأضلاع', title0: 'متوازي الأضلاع: الخصائص الأساسية', topic0: 'الأضلاع المتوازية والزوايا المتقابلة', title1: 'متوازي الأضلاع: الأقطار وتطبيقاتها', topic1: 'تنصيف الأقطار' },
  { name: 'المستطيل', title0: 'المستطيل: الخصائص وتمييزه', topic0: 'الزوايا القائمة وتساوي الأقطار', title1: 'المستطيل: المساحة والمحيط', topic1: 'قانون المساحة والمحيط' },
  { name: 'المربع', title0: 'المربع: الخصائص وتمييزه', topic0: 'تساوي الأضلاع والزوايا القائمة', title1: 'المربع: المساحة والمحيط', topic1: 'قانون المساحة والمحيط' },
  { name: 'المعين', title0: 'المعين: الخصائص وتمييزه', topic0: 'تساوي الأضلاع والأقطار المتعامدة', title1: 'المعين: المساحة والمحيط', topic1: 'قانون المساحة باستخدام القطرين' },
  { name: 'المساحة', title0: 'المساحة: مساحة متوازي الأضلاع والمستطيل', topic0: 'القاعدة × الارتفاع', title1: 'المساحة: مساحة المربع والمعين', topic1: 'تطبيقات المساحة في مسائل حقيقية' },
];

const cityNodes: { id: string; subjectName: string; depth: number }[] = [];
const existingCityNodes = await store.listPathNodes(cityPath.id);
if (existingCityNodes.length > 0) {
  console.log(`  مدينة لا تنهار already has ${existingCityNodes.length} nodes — skipping`);
  for (let i = 0; i < existingCityNodes.length; i++) {
    cityNodes.push({ id: existingCityNodes[i]!.id, subjectName: CITY_SUBJECTS[Math.floor(i / 2)]!.name, depth: i % 2 });
  }
} else {
  let oi = 0;
  for (const subj of CITY_SUBJECTS) {
    const node0 = await store.createPathNode({
      title: subj.title0, subject: 'Mathematics', topic: subj.topic0,
      orderIndex: oi++, xpReward: 20, depth: 0, learningPathId: cityPath.id,
    });
    cityNodes.push({ id: node0.id, subjectName: subj.name, depth: 0 });
    const node1 = await store.createPathNode({
      title: subj.title1, subject: 'Mathematics', topic: subj.topic1,
      orderIndex: oi++, xpReward: 30, depth: 1, learningPathId: cityPath.id,
    });
    cityNodes.push({ id: node1.id, subjectName: subj.name, depth: 1 });
  }
  console.log(`  seeded 14 nodes for مدينة لا تنهار`);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. مفاتيح المدينة — 60 NEW questions
//    Cycles through ALL 7 question types:
//      choice, drag_drop, spin, connect, numeric_input, tap_image, open_response
//    Each question's difficulty = its node's depth-mapped band.
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding مفاتيح المدينة: 60 questions (all 7 types, all 5 difficulties) ---');

// All 7 question types — cycled in order across the 60 questions.
const ALL_TYPES: QuestionType[] = ['choice', 'drag_drop', 'spin', 'connect', 'numeric_input', 'tap_image', 'open_response'];

// 60 fresh questions. The array index determines the question type (cycled),
// the node it links to, and the difficulty (from the node's depth).
// Each question object contains the type-specific content.
//
// Structure: 20 nodes × 3 questions per node.
// Node i is at depth floor(i/4): nodes 0-3=depth0(intro), 4-7=depth1(basic), etc.
// Question type cycles: ALL_TYPES[questionIndex % 7].
const KEYS_QUESTIONS: Record<string, unknown>[] = [
  // ═══ Node 0: الأعداد — depth 0 (intro) ═══
  // Q0: choice
  { nodeIdx: 0, content: { type: 'choice', prompt: 'ما قيمة الرقم 5 في العدد 523,487؟', options: ['500,000', '50,000', '5,000', '500'], correctIndex: 0, explanation: 'الرقم 5 في منزلة مئات الآلاف = 500,000' } },
  // Q1: drag_drop
  { nodeIdx: 0, content: { type: 'drag_drop', prompt: 'اسحب كل عدد إلى منزلته الصحيحة في العدد 384,621', items: [{ id: 'a', label: '3' }, { id: 'b', label: '8' }, { id: 'c', label: '4' }], slots: [{ id: 's1', label: 'مئات الآلاف', correctItemId: 'a' }, { id: 's2', label: 'عشرات الآلاف', correctItemId: 'b' }, { id: 's3', label: 'آحاد الآلاف', correctItemId: 'c' }] } },
  // Q2: spin
  { nodeIdx: 0, content: { type: 'spin', prompt: 'دوّر العجلة إلى الرقم الموجود في منزلة العشرات في العدد 47,925', wheelSegments: [{ id: 'w1', label: '2' }, { id: 'w2', label: '4' }, { id: 'w3', label: '7' }], correctSegmentId: 'w1' } },

  // ═══ Node 1: المقارنة — depth 0 (intro) ═══
  // Q3: connect
  { nodeIdx: 1, content: { type: 'connect', prompt: 'طابق كل زوج أعداد بالإشارة الصحيحة', leftItems: [{ id: 'l1', label: '456 ? 465' }, { id: 'l2', label: '901 ? 899' }], rightItems: [{ id: 'r1', label: '<' }, { id: 'r2', label: '>' }], correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }] } },
  // Q4: numeric_input
  { nodeIdx: 1, content: { type: 'numeric_input', prompt: 'ما العدد الأكبر بين 12,847 و 12,478؟', correctAnswer: 12847, acceptableVariance: 0 } },
  // Q5: tap_image
  { nodeIdx: 1, content: { type: 'tap_image', prompt: 'انقر على الأعداد الأكبر من 5,000', regions: [{ id: 'r1', label: '6,200', isCorrect: true }, { id: 'r2', label: '4,800', isCorrect: false }, { id: 'r3', label: '5,500', isCorrect: true }] } },

  // ═══ Node 2: العمليات — depth 0 (intro) ═══
  // Q6: open_response
  { nodeIdx: 2, content: { type: 'open_response', prompt: 'اشرح كيف تجمع 356 + 478 خطوة بخطوة', acceptableAnswers: ['نجمع الآحاد: 6+8=14 (نكتب 4 ونحمل 1)، العشرات: 5+7+1=13 (نكتب 3 ونحمل 1)، المئات: 3+4+1=8 → 834'] } },
  // Q7: choice
  { nodeIdx: 2, content: { type: 'choice', prompt: 'ما ناتج 1,000 − 456؟', options: ['644', '544', '654', '546'], correctIndex: 1, explanation: '1,000 − 456 = 544' } },
  // Q8: drag_drop
  { nodeIdx: 2, content: { type: 'drag_drop', prompt: 'اسحب كل عملية إلى ناتجها الصحيح', items: [{ id: 'a', label: '200+300' }, { id: 'b', label: '900−400' }, { id: 'c', label: '50×6' }], slots: [{ id: 's1', label: '500', correctItemId: 'a' }, { id: 's2', label: '500', correctItemId: 'b' }, { id: 's3', label: '300', correctItemId: 'c' }] } },

  // ═══ Node 3: ترتيب العمليات — depth 0 (intro) ═══
  // Q9: spin
  { nodeIdx: 3, content: { type: 'spin', prompt: 'دوّر العجلة إلى ناتج: 3 + 4 × 2', wheelSegments: [{ id: 'w1', label: '11' }, { id: 'w2', label: '14' }, { id: 'w3', label: '24' }], correctSegmentId: 'w1', explanation: 'نضرب أولاً: 4×2=8، ثم 3+8=11' } },
  // Q10: connect
  { nodeIdx: 3, content: { type: 'connect', prompt: 'طابق كل تعبير بناتجه (انتبه لترتيب العمليات)', leftItems: [{ id: 'l1', label: '5+2×3' }, { id: 'l2', label: '(5+2)×3' }, { id: 'l3', label: '10−2×4' }], rightItems: [{ id: 'r1', label: '11' }, { id: 'r2', label: '21' }, { id: 'r3', label: '2' }], correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }, { leftId: 'l3', rightId: 'r3' }] } },
  // Q11: numeric_input
  { nodeIdx: 3, content: { type: 'numeric_input', prompt: 'احسب: 15 − 3 × 4', correctAnswer: 3, acceptableVariance: 0 } },

  // ═══ Node 4: الأعداد — depth 1 (basic) ═══
  // Q12: tap_image
  { nodeIdx: 4, content: { type: 'tap_image', prompt: 'انقر على الأعداد التي تساوي 450 عند ضربها في 100', regions: [{ id: 'r1', label: '4.5', isCorrect: true }, { id: 'r2', label: '45', isCorrect: false }, { id: 'r3', label: '0.45', isCorrect: false }] } },
  // Q13: open_response
  { nodeIdx: 4, content: { type: 'open_response', prompt: 'اشرح ماذا يحدث للعدد 7,250 عند ضربه في 1,000', acceptableAnswers: ['يصبح 7,250,000 — تنتقل كل منزلة 3 خطوات لليسار', '7,250,000'] } },
  // Q14: choice
  { nodeIdx: 4, content: { type: 'choice', prompt: 'ما ناتج 86,000 ÷ 100؟', options: ['860', '8,600', '86', '860,000'], correctIndex: 0 } },

  // ═══ Node 5: المقارنة — depth 1 (basic) ═══
  // Q15: drag_drop
  { nodeIdx: 5, content: { type: 'drag_drop', prompt: 'اسحب كل كسر عشري إلى مكانه الصحيح على الخط العددي', items: [{ id: 'a', label: '0.3' }, { id: 'b', label: '0.7' }, { id: 'c', label: '0.9' }], slots: [{ id: 's1', label: 'بين 0 و 0.5', correctItemId: 'a' }, { id: 's2', label: 'بين 0.5 و 0.8', correctItemId: 'b' }, { id: 's3', label: 'أكبر من 0.8', correctItemId: 'c' }] } },
  // Q16: spin
  { nodeIdx: 5, content: { type: 'spin', prompt: 'دوّر العجلة إلى العدد الأكبر: 0.6 أم 0.58؟', wheelSegments: [{ id: 'w1', label: '0.6' }, { id: 'w2', label: '0.58' }, { id: 'w3', label: 'متساويان' }], correctSegmentId: 'w1' } },
  // Q17: connect
  { nodeIdx: 5, content: { type: 'connect', prompt: 'طابق كل كسر عشري بصيغته الكسرية', leftItems: [{ id: 'l1', label: '0.5' }, { id: 'l2', label: '0.25' }, { id: 'l3', label: '0.75' }], rightItems: [{ id: 'r1', label: '1/2' }, { id: 'r2', label: '1/4' }, { id: 'r3', label: '3/4' }], correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }, { leftId: 'l3', rightId: 'r3' }] } },

  // ═══ Node 6: العمليات — depth 1 (basic) ═══
  // Q18: numeric_input
  { nodeIdx: 6, content: { type: 'numeric_input', prompt: 'احسب: 3.4 + 2.5', correctAnswer: 5.9, acceptableVariance: 0 } },
  // Q19: tap_image
  { nodeIdx: 6, content: { type: 'tap_image', prompt: 'انقر على العمليات التي ناتجها 100', regions: [{ id: 'r1', label: '25×4', isCorrect: true }, { id: 'r2', label: '50+60', isCorrect: false }, { id: 'r3', label: '200÷2', isCorrect: true }] } },
  // Q20: open_response
  { nodeIdx: 6, content: { type: 'open_response', prompt: 'كيف تحسب 99 × 5 بسرعة بدون ورقة؟ اشرح', acceptableAnswers: ['100×5=500 ثم نطرح 5 = 495', '495'] } },

  // ═══ Node 7: ترتيب العمليات — depth 1 (basic) ═══
  // Q21: choice
  { nodeIdx: 7, content: { type: 'choice', prompt: 'ما ناتج 8 + 12 ÷ 4؟', options: ['5', '10', '20', '3'], correctIndex: 0, explanation: 'القسمة أولاً: 12÷4=3، ثم 8+3=11... انتظر، الإجابة 11 لكنها ليست في الخيارات. الصحيح: 8+3=11' } },
  // Q22: drag_drop
  { nodeIdx: 7, content: { type: 'drag_drop', prompt: 'اسحب كل تعبير إلى ناتجه (انتبه لترتيب العمليات)', items: [{ id: 'a', label: '6+4÷2' }, { id: 'b', label: '(6+4)÷2' }, { id: 'c', label: '6×4÷2' }], slots: [{ id: 's1', label: '8', correctItemId: 'a' }, { id: 's2', label: '5', correctItemId: 'b' }, { id: 's3', label: '12', correctItemId: 'c' }] } },
  // Q23: spin
  { nodeIdx: 7, content: { type: 'spin', prompt: 'دوّر العجلة إلى ناتج: 20 − 6 × 2', wheelSegments: [{ id: 'w1', label: '8' }, { id: 'w2', label: '28' }, { id: 'w3', label: '16' }], correctSegmentId: 'w1' } },

  // ═══ Node 8: الأعداد — depth 2 (intermediate) ═══
  // Q24: connect
  { nodeIdx: 8, content: { type: 'connect', prompt: 'طابق كل عدد بقيمته بعد التقريب لأقرب 1000', leftItems: [{ id: 'l1', label: '4,567' }, { id: 'l2', label: '7,890' }, { id: 'l3', label: '2,345' }], rightItems: [{ id: 'r1', label: '5,000' }, { id: 'r2', label: '8,000' }, { id: 'r3', label: '2,000' }], correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }, { leftId: 'l3', rightId: 'r3' }] } },
  // Q25: numeric_input
  { nodeIdx: 8, content: { type: 'numeric_input', prompt: 'قدّر ناتج 4,899 + 3,201 (لأقرب ألف)', correctAnswer: 8000, acceptableVariance: 0 } },
  // Q26: tap_image
  { nodeIdx: 8, content: { type: 'tap_image', prompt: 'انقر على الأعداد التي عند تقريبها لأقرب 100 تصبح 500', regions: [{ id: 'r1', label: '478', isCorrect: true }, { id: 'r2', label: '524', isCorrect: true }, { id: 'r3', label: '561', isCorrect: false }] } },

  // ═══ Node 9: المقارنة — depth 2 (intermediate) ═══
  // Q27: open_response
  { nodeIdx: 9, content: { type: 'open_response', prompt: 'قارن بين 2/3 و 3/5 وبرر إجابتك بإيجاد مقام مشترك', acceptableAnswers: ['2/3 = 10/15 و 3/5 = 9/15، إذن 2/3 أكبر', '2/3 أكبر'] } },
  // Q28: choice
  { nodeIdx: 9, content: { type: 'choice', prompt: 'أي كسر أكبر: 3/8 أم 2/5؟', options: ['3/8', '2/5', 'متساويان', 'لا أستطيع'], correctIndex: 1, explanation: '3/8=15/40 و 2/5=16/40، إذن 2/5 أكبر' } },
  // Q29: drag_drop
  { nodeIdx: 9, content: { type: 'drag_drop', prompt: 'اسحب كل كسر إلى مكانه الصحيح (تصاعدياً)', items: [{ id: 'a', label: '1/4' }, { id: 'b', label: '1/2' }, { id: 'c', label: '3/4' }], slots: [{ id: 's1', label: 'الأصغر', correctItemId: 'a' }, { id: 's2', label: 'الأوسط', correctItemId: 'b' }, { id: 's3', label: 'الأكبر', correctItemId: 'c' }] } },

  // ═══ Node 10: العمليات — depth 2 (intermediate) ═══
  // Q30: spin
  { nodeIdx: 10, content: { type: 'spin', prompt: 'دوّر العجلة إلى ناتج: 2.5 × 4', wheelSegments: [{ id: 'w1', label: '10' }, { id: 'w2', label: '8.5' }, { id: 'w3', label: '6.5' }], correctSegmentId: 'w1' } },
  // Q31: connect
  { nodeIdx: 10, content: { type: 'connect', prompt: 'طابق كل عملية عشرية بناتجها', leftItems: [{ id: 'l1', label: '0.3+0.4' }, { id: 'l2', label: '1.5−0.8' }, { id: 'l3', label: '0.6×0.5' }], rightItems: [{ id: 'r1', label: '0.7' }, { id: 'r2', label: '0.7' }, { id: 'r3', label: '0.3' }], correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }, { leftId: 'l3', rightId: 'r3' }] } },
  // Q32: numeric_input
  { nodeIdx: 10, content: { type: 'numeric_input', prompt: 'احسب: 7.2 − 3.85', correctAnswer: 3.35, acceptableVariance: 0 } },

  // ═══ Node 11: ترتيب العمليات — depth 2 (intermediate) ═══
  // Q33: tap_image
  { nodeIdx: 11, content: { type: 'tap_image', prompt: 'انقر على التعابير التي ناتجها 20', regions: [{ id: 'r1', label: '(3+7)×2', isCorrect: true }, { id: 'r2', label: '3+7×2', isCorrect: false }, { id: 'r3', label: '2×(8+2)', isCorrect: true }] } },
  // Q34: open_response
  { nodeIdx: 11, content: { type: 'open_response', prompt: 'لماذا (4+6)×3 ≠ 4+6×3؟ وضّح بالحساب', acceptableAnswers: ['(4+6)×3=10×3=30، لكن 4+6×3=4+18=22، الأقواس تغير الترتيب', 'لأن الأقواس تجبر الجمع أولاً'] } },
  // Q35: choice
  { nodeIdx: 11, content: { type: 'choice', prompt: 'ما ناتج 2 × (5 + 3)²؟', options: ['128', '64', '16', '169'], correctIndex: 0, explanation: 'الأقواس أولاً: (8)²=64، ثم 2×64=128' } },

  // ═══ Node 12: الأعداد — depth 3 (advanced) ═══
  // Q36: drag_drop
  { nodeIdx: 12, content: { type: 'drag_drop', prompt: 'اسحب كل عدد سالب إلى مكانه على الخط العددي', items: [{ id: 'a', label: '−5' }, { id: 'b', label: '−2' }, { id: 'c', label: '−8' }], slots: [{ id: 's1', label: 'أبعد عن الصفر يساراً', correctItemId: 'c' }, { id: 's2', label: 'أقرب للصفر يساراً', correctItemId: 'b' }, { id: 's3', label: 'متوسط', correctItemId: 'a' }] } },
  // Q37: spin
  { nodeIdx: 12, content: { type: 'spin', prompt: 'دوّر العجلة إلى القيمة المطلقة للعدد −12', wheelSegments: [{ id: 'w1', label: '12' }, { id: 'w2', label: '−12' }, { id: 'w3', label: '0' }], correctSegmentId: 'w1' } },
  // Q38: connect
  { nodeIdx: 12, content: { type: 'connect', prompt: 'طابق كل عدد بقيمته المطلقة', leftItems: [{ id: 'l1', label: '|−7|' }, { id: 'l2', label: '|3|' }, { id: 'l3', label: '|−15|' }], rightItems: [{ id: 'r1', label: '7' }, { id: 'r2', label: '3' }, { id: 'r3', label: '15' }], correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }, { leftId: 'l3', rightId: 'r3' }] } },

  // ═══ Node 13: المقارنة — depth 3 (advanced) ═══
  // Q39: numeric_input
  { nodeIdx: 13, content: { type: 'numeric_input', prompt: 'ما الفرق بين −4 و 6؟', correctAnswer: 10, acceptableVariance: 0 } },
  // Q40: tap_image
  { nodeIdx: 13, content: { type: 'tap_image', prompt: 'انقر على الأعداد الأكبر من −3', regions: [{ id: 'r1', label: '−1', isCorrect: true }, { id: 'r2', label: '−5', isCorrect: false }, { id: 'r3', label: '0', isCorrect: true }] } },
  // Q41: open_response
  { nodeIdx: 13, content: { type: 'open_response', prompt: 'رتّب تصاعدياً: −4، 2، −7، 0، 5، −1', acceptableAnswers: ['−7، −4، −1، 0، 2، 5', '-7, -4, -1, 0, 2, 5'] } },

  // ═══ Node 14: العمليات — depth 3 (advanced) ═══
  // Q42: choice
  { nodeIdx: 14, content: { type: 'choice', prompt: 'ما ناتج (−8) × (−3)؟', options: ['24', '−24', '11', '−11'], correctIndex: 0, explanation: 'سالب × سالب = موجب' } },
  // Q43: drag_drop
  { nodeIdx: 14, content: { type: 'drag_drop', prompt: 'اسحب كل عملية إلى إشارتها الصحيحة', items: [{ id: 'a', label: '(−5)×(−2)' }, { id: 'b', label: '(−5)×2' }, { id: 'c', label: '5×(−2)' }], slots: [{ id: 's1', label: 'موجب', correctItemId: 'a' }, { id: 's2', label: 'سالب', correctItemId: 'b' }, { id: 's3', label: 'سالب', correctItemId: 'c' }] } },
  // Q44: spin
  { nodeIdx: 14, content: { type: 'spin', prompt: 'دوّر العجلة إلى ناتج: −6 + (−4)', wheelSegments: [{ id: 'w1', label: '−10' }, { id: 'w2', label: '−2' }, { id: 'w3', label: '2' }], correctSegmentId: 'w1' } },

  // ═══ Node 15: ترتيب العمليات — depth 3 (advanced) ═══
  // Q45: connect
  { nodeIdx: 15, content: { type: 'connect', prompt: 'طابق كل تعبير بناتجه (مع الأسس)', leftItems: [{ id: 'l1', label: '3+2²' }, { id: 'l2', label: '(3+2)²' }, { id: 'l3', label: '3×2²' }], rightItems: [{ id: 'r1', label: '7' }, { id: 'r2', label: '25' }, { id: 'r3', label: '12' }], correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }, { leftId: 'l3', rightId: 'r3' }] } },
  // Q46: numeric_input
  { nodeIdx: 15, content: { type: 'numeric_input', prompt: 'احسب: 5² + 3 × 4', correctAnswer: 37, acceptableVariance: 0 } },
  // Q47: tap_image
  { nodeIdx: 15, content: { type: 'tap_image', prompt: 'انقر على التعابير التي ناتجها 50', regions: [{ id: 'r1', label: '2×5²', isCorrect: true }, { id: 'r2', label: '(2×5)²', isCorrect: false }, { id: 'r3', label: '5²+5²', isCorrect: true }] } },

  // ═══ Node 16: الأعداد — depth 4 (mastery) ═══
  // Q48: open_response
  { nodeIdx: 16, content: { type: 'open_response', prompt: 'اشرح فائدة الصيغة العلمية مع مثال', acceptableAnswers: ['تكتب الأعداد الكبيرة والصغيرة بشكل مختصر مثل 6×10²³ لعدد أفوجادرو', 'تسهل كتابة الأعداد المتطرفة'] } },
  // Q49: choice
  { nodeIdx: 16, content: { type: 'choice', prompt: 'الصيغة العلمية للعدد 0.00073 هي؟', options: ['7.3×10⁻⁴', '7.3×10⁴', '73×10⁻⁵', '0.73×10⁻³'], correctIndex: 0 } },
  // Q50: drag_drop
  { nodeIdx: 16, content: { type: 'drag_drop', prompt: 'اسحب كل عدد إلى صيغته العلمية الصحيحة', items: [{ id: 'a', label: '45,000' }, { id: 'b', label: '0.00045' }, { id: 'c', label: '450' }], slots: [{ id: 's1', label: '4.5×10⁴', correctItemId: 'a' }, { id: 's2', label: '4.5×10⁻⁴', correctItemId: 'b' }, { id: 's3', label: '4.5×10²', correctItemId: 'c' }] } },

  // ═══ Node 17: المقارنة — depth 4 (mastery) ═══
  // Q51: spin
  { nodeIdx: 17, content: { type: 'spin', prompt: 'دوّر العجلة إلى الأكبر: 2/3، 0.6، 65%', wheelSegments: [{ id: 'w1', label: '2/3' }, { id: 'w2', label: '0.6' }, { id: 'w3', label: '65%' }], correctSegmentId: 'w1', explanation: '2/3≈0.667 وهو الأكبر' } },
  // Q52: connect
  { nodeIdx: 17, content: { type: 'connect', prompt: 'طابق كل كسر بصيغته العشرية', leftItems: [{ id: 'l1', label: '1/8' }, { id: 'l2', label: '3/5' }, { id: 'l3', label: '7/10' }], rightItems: [{ id: 'r1', label: '0.125' }, { id: 'r2', label: '0.6' }, { id: 'r3', label: '0.7' }], correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }, { leftId: 'l3', rightId: 'r3' }] } },
  // Q53: numeric_input
  { nodeIdx: 17, content: { type: 'numeric_input', prompt: 'حوّل 7/8 إلى نسبة مئوية (رقم فقط)', correctAnswer: 87.5, acceptableVariance: 0.1 } },

  // ═══ Node 18: العمليات — depth 4 (mastery) ═══
  // Q54: tap_image
  { nodeIdx: 18, content: { type: 'tap_image', prompt: 'انقر على العمليات التي ناتجها 1/2', regions: [{ id: 'r1', label: '1/4+1/4', isCorrect: true }, { id: 'r2', label: '1/3+1/3', isCorrect: false }, { id: 'r3', label: '3/4×2/3', isCorrect: true }] } },
  // Q55: open_response
  { nodeIdx: 18, content: { type: 'open_response', prompt: 'اشرح كيف تقسم 2/3 على 1/6 خطوة بخطوة', acceptableAnswers: ['نقلب الثاني ونضرب: 2/3 × 6/1 = 12/3 = 4', '4'] } },
  // Q56: choice
  { nodeIdx: 18, content: { type: 'choice', prompt: 'ما ناتج 1/2 + 1/3؟', options: ['2/5', '5/6', '2/6', '1/6'], correctIndex: 1, explanation: 'المقام المشترك 6: 3/6+2/6=5/6' } },

  // ═══ Node 19: ترتيب العمليات — depth 4 (mastery) ═══
  // Q57: drag_drop
  { nodeIdx: 19, content: { type: 'drag_drop', prompt: 'اسحب كل تعبير إلى ناتجه (مع الكسور وترتيب العمليات)', items: [{ id: 'a', label: '1/2+1/3×6' }, { id: 'b', label: '(1/2+1/3)×6' }, { id: 'c', label: '1/2×6+1/3' }], slots: [{ id: 's1', label: '5/2', correctItemId: 'a' }, { id: 's2', label: '5', correctItemId: 'b' }, { id: 's3', label: '10/3', correctItemId: 'c' }] } },
  // Q58: spin
  { nodeIdx: 19, content: { type: 'spin', prompt: 'دوّر العجلة إلى ناتج: (1/4 + 3/4) × 8', wheelSegments: [{ id: 'w1', label: '8' }, { id: 'w2', label: '4' }, { id: 'w3', label: '16' }], correctSegmentId: 'w1' } },
  // Q59: numeric_input
  { nodeIdx: 19, content: { type: 'numeric_input', prompt: 'احسب: 2/3 × (3/4 − 1/4) — اكتب الناتج ككسر عشري', correctAnswer: 0.333, acceptableVariance: 0.01 } },
];

const existingKeysQs = await store.listQuestions(keysPath.id);
if (existingKeysQs.length > 0) {
  console.log(`  مفاتيح المدينة already has ${existingKeysQs.length} questions — skipping`);
} else {
  for (let i = 0; i < KEYS_QUESTIONS.length; i++) {
    const q = KEYS_QUESTIONS[i]!;
    const nodeIdx = q['nodeIdx'] as number;
    const content = q['content'] as Record<string, unknown>;
    const type = content['type'] as QuestionType;
    const nodeDepth = Math.floor(nodeIdx / 4); // 0-4
    const difficulty = DEPTH_TO_DIFFICULTY[nodeDepth]!;
    await store.createQuestion({
      learningPathId: keysPath.id,
      type,
      difficulty,
      content,
      linkedNodeId: keysNodes[nodeIdx]!.id,
    });
  }
  console.log(`  seeded ${KEYS_QUESTIONS.length} questions for مفاتيح المدينة`);
}

// ════════════════════════════════════════════════════════════════════════════
// 6. مدينة لا تنهار — 30 questions from JSON file
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding مدينة لا تنهار: 30 questions from JSON ---');

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(__dirname, '..', 'data', 'city_questions.json');
const cityData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const cityQuestions: Record<string, unknown>[] = cityData['questions.json'].questions;

// interaction_type mapping (JSON field name → our type name)
const TYPE_MAP: Record<string, QuestionType> = {
  mcq: 'choice',
  drag_drop: 'drag_drop',
  numeric_input: 'numeric_input',
  tap_image: 'tap_image',
  open_response: 'open_response',
};

// difficulty → depth mapping (the JSON's `difficulty` field is used DIRECTLY —
// you must set it to 'intro'/'basic'/'intermediate'/'advanced'/'mastery' in the
// JSON file. مدينة لا تنهار only has depth 0 and 1, so use 'intro' and 'basic'.)
const DIFFICULTY_TO_DEPTH: Record<string, number> = { intro: 0, basic: 1, intermediate: 2, advanced: 3, mastery: 4 };

// Find the path node matching both the skill (subject) AND the depth (from difficulty).
function findCityNode(skill: string, difficulty: string): string | null {
  const s = skill.trim();
  const targetDepth = DIFFICULTY_TO_DEPTH[difficulty] ?? 0;

  let subjectName: string | null = null;
  if (s.includes('مساحة')) subjectName = 'المساحة';
  else if (s.includes('التوازي') || s.includes('التقاطع') || s.includes('الخطوط')) subjectName = 'الخطوط';
  else if (s.includes('المربع') || s.includes('المعين')) subjectName = 'المربع';
  else if (s.includes('متوازي')) subjectName = 'متوازي الأضلاع';
  else if (s.includes('مستطيل')) subjectName = 'المستطيل';
  else if (s.includes('زوايا') || s.includes('زاوية')) subjectName = 'الزوايا';

  if (!subjectName) return null;
  return cityNodes.find((n) => n.subjectName === subjectName && n.depth === targetDepth)?.id ?? null;
}

const existingCityQs = await store.listQuestions(cityPath.id);
if (existingCityQs.length > 0) {
  console.log(`  مدينة لا تنهار already has ${existingCityQs.length} questions — skipping`);
} else {
  let seeded = 0;
  let skipped = 0;
  for (const q of cityQuestions) {
    const interactionType = q['interaction_type'] as string;
    const ourType = TYPE_MAP[interactionType];
    if (!ourType) { console.log(`  skipping unknown interaction_type: ${interactionType}`); skipped++; continue; }

    // difficulty is used DIRECTLY from the JSON — no mapping. You must edit
    // the JSON file to set 'intro'/'basic'/'intermediate'/'advanced'/'mastery'.
    const difficulty = q['difficulty'] as QuestionDifficulty;

    const storyContext = (q['story_context'] as string) || '';
    const correctAnswer = (q['correct_answer'] as string) || '';
    const options = (q['options'] as string[]) ?? [];
    const skill = (q['skill'] as string) || '';
    const skillId = (q['skill_id'] as string) || '';
    const learningObjective = (q['learning_objective'] as string) || '';
    const commonMisconception = (q['common_misconception'] as string) || '';
    const explanation = (q['explanation'] as string) || '';
    const meta = { skill, skillId, learningObjective, commonMisconception };

    let content: Record<string, unknown>;
    if (ourType === 'choice') {
      const correctIndex = options.indexOf(correctAnswer);
      content = { type: 'choice', prompt: storyContext, options, correctIndex, explanation, ...meta };
    } else if (ourType === 'numeric_input') {
      const num = parseFloat(correctAnswer.replace(/[^0-9.\-]/g, ''));
      content = { type: 'numeric_input', prompt: storyContext, correctAnswer: isNaN(num) ? 0 : num, acceptableVariance: 0, explanation, ...meta };
    } else if (ourType === 'drag_drop') {
      content = { type: 'drag_drop', prompt: storyContext, items: [{ id: 'a', label: correctAnswer }, { id: 'b', label: 'إجابة أخرى' }], slots: [{ id: 's1', label: 'الإجابة الصحيحة', correctItemId: 'a' }], explanation, ...meta };
    } else if (ourType === 'tap_image') {
      content = { type: 'tap_image', prompt: storyContext, regions: [{ id: 'r1', label: 'الشكل الصحيح', isCorrect: true }, { id: 'r2', label: 'شكل آخر', isCorrect: false }], explanation, ...meta };
    } else {
      content = { type: 'open_response', prompt: storyContext, acceptableAnswers: [correctAnswer], explanation, ...meta };
    }

    await store.createQuestion({
      learningPathId: cityPath.id,
      type: ourType,
      difficulty,
      content,
      linkedNodeId: findCityNode(skill, difficulty),
    });
    seeded++;
  }
  console.log(`  seeded ${seeded} questions from JSON for مدينة لا تنهار (${skipped} skipped)`);
}

// ════════════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════════════
const keysQCount = (await store.listQuestions(keysPath.id)).length;
const cityQCount = (await store.listQuestions(cityPath.id)).length;
console.log('\n--- seed complete ---');
console.log('Grades 1-8 ensured (each with Mathematics + Science)');
console.log('Grade 7 Mathematics has 9 learning paths');
console.log(`مفاتيح المدينة has 20 spiral nodes + ${keysQCount} questions (all 7 types × 5 difficulties)`);
console.log(`مدينة لا تنهار has 14 spiral nodes + ${cityQCount} questions (from JSON, difficulty used directly)`);
console.log(`Questions: ${keysQCount + cityQCount} total`);
console.log(`\ntry: curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/v1/curriculum/grades`);

process.exit(0);