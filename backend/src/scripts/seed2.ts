/**
 * Seed script.
 *   npm -w backend run seed
 *
 * Seeds:
 *   1. A demo student (grade 7) + prints a bearer token.
 *   2. Grades 1-8, each with 2 subjects: Mathematics + Science (16 subjects).
 *   3. Only Grade 7's Mathematics subject gets the 8 learning paths
 *      (the "math city" narrative paths from the curriculum design).
 *   4. The first learning path — مفاتيح المدينة (Keys of the City) — with
 *      20 path nodes arranged as a SPIRAL across 4 skills × 5 depths:
 *
 *      Skills:  الأعداد (Numbers) · المقارنة (Comparison) ·
 *               العمليات (Operations) · ترتيب العمليات (Order of Operations)
 *
 *      Depths:  0=intro · 1=basic · 2=intermediate · 3=advanced · 4=mastery
 *
 *      The spiral visits each skill at depth 0, then each at depth 1, …
 *      so the student revisits every skill five times at growing depth.
 *
 * Questions are NOT seeded here — the question bank is authored separately
 * via /api/v1/curriculum/learning-paths/:id/questions.
 *
 * Idempotent: re-running won't duplicate grades/subjects/paths that already
 * exist (matched by grade index / subject title / path name / path emptiness).
 */
import 'dotenv/config';
import { newToken } from '../auth.js';
import { createStore } from '../store/index.js';

const log = { info: console.log, warn: console.warn };

const store = await createStore(log);
const { token, hash } = newToken();
const student = await store.createStudent({
  name: 'nawal',
  gender: null,
  grade: 7,
  language: 'ar',
  color: '#1CB0F6',
  interest: 'space',
  learningContext: null,
  interests: [],
  dailyGoal: 3,
  tokenHash: hash,
  installationId: null,
});

console.log('--- demo student seeded ---');
console.log('studentId:', student.id);
console.log('token:    ', token);
console.log(`try: curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/v1/students/me`);

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
  const lps: { id: string; name: string }[] = [];
  for (const lp of await store.listLearningPaths(subjectId)) {
    lps.push({ id: lp.id, name: lp.name });
  }
  const existing = lps.find((lp) => lp.name === name);
  if (existing) return store.getLearningPath(existing.id);
  return store.createLearningPath({ name, description, subjectId });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Grades 1-8 — each with Mathematics + Science
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding grades 1-8 (each with Math + Science) ---');
for (let i = 1; i <= 8; i++) {
  const grade = await findOrCreateGrade(`Grade ${i}`, i);
  await findOrCreateSubject(
    grade.id,
    'Mathematics',
    `Grade ${i} mathematics — number sense, operations, fractions, ratio, geometry, and early algebra.`,
    0,
  );
  await findOrCreateSubject(
    grade.id,
    'Science',
    `Grade ${i} science — observing the natural world: matter, energy, life, and earth.`,
    1,
  );
}
console.log('grades 1-8 ready (8 grades × 2 subjects = 16 subjects)');

// ════════════════════════════════════════════════════════════════════════════
// 2. Grade 7 Mathematics — 8 learning paths
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding Grade 7 Mathematics: 8 learning paths ---');
const grade7 = await store.getGradeByIndex(7);
const grade7Subjects = await store.listSubjects(grade7!.id);
const math = grade7Subjects.find((s) => s.title === 'Mathematics')!;

const LEARNING_PATHS: { name: string; description: string }[] = [
  {
    name: 'مفاتيح المدينة',
    description: 'Keys of the City — the foundational number skills that unlock every other path. Spiral across الأعداد، المقارنة، العمليات، ترتيب العمليات.',
  },
  {
    name: 'سر الرقم المفقود',
    description: 'the secret of the missing number — word problems and multi-step reasoning that weave together the skills from مفاتيح المدينة.',
  },
  {
    name: 'مدينة لا ينهار',
    description: "The city That Won't Collapse — equations and equivalent expressions; the algebraic bridge between arithmetic and algebra.",
  },
  {
    name: 'عالم المرايا',
    description: 'Mirror world — symmetry, reflections, and an introduction to coordinate geometry.',
  },
  {
    name: 'طريق لا يضيع',
    description: 'The Counting Compass — integers, the number line, directed numbers, and absolute value.',
  },
  {
    name: 'أرض تصنع الفرق ',
    description: 'the land that makes a diffrence  — data, statistics, and probability; reading the world through numbers.',
  },
  {
    name: 'ما وراء الجدران',
    description: 'behind the walls — geometry of shapes, angles, area, and perimeter; the visual side of math.',
  },
  {
    name: 'عين المدينة',
    description: 'Eye of the City — patterns, sequences, and an introduction to functions; seeing structure in numbers.',
  },
];

const createdPaths: { name: string; id: string }[] = [];
for (let i = 0; i < LEARNING_PATHS.length; i++) {
  const lp = await findOrCreateLearningPath(math.id, LEARNING_PATHS[i]!.name, LEARNING_PATHS[i]!.description);
  createdPaths.push({ name: lp!.name, id: lp!.id });
  console.log(`  ${i + 1}/8 ${lp!.name}`);
}
console.log('8 learning paths ready under Grade 7 Mathematics');

// ════════════════════════════════════════════════════════════════════════════
// 3. مفاتيح المدينة — 20 spiral nodes (4 skills × 5 depths)
// ════════════════════════════════════════════════════════════════════════════
// Spiral: the student walks the path by revisiting each of the 4 skills at
// growing depth. Five "loops" of 4 nodes each = 20 nodes:
//
//   Loop 1 (depth 0 — intro):          الأعداد → المقارنة → العمليات → ترتيب
//   Loop 2 (depth 1 — basic):          الأعداد → المقارنة → العمليات → ترتيب
//   Loop 3 (depth 2 — intermediate):   الأعداد → المقارنة → العمليات → ترتيب
//   Loop 4 (depth 3 — advanced):       الأعداد → المقارنة → العمليات → ترتيب
//   Loop 5 (depth 4 — mastery):        الأعداد → المقارنة → العمليات → ترتيب
//
// XP scales with depth: 20 / 30 / 40 / 50 / 60.
// ════════════════════════════════════════════════════════════════════════════
console.log('\n--- seeding مفاتيح المدينة: 20 spiral nodes (4 skills × 5 depths) ---');

const keysPath = createdPaths.find((p) => p.name === 'مفاتيح المدينة')!;
const mathSubject = 'Mathematics';

// Per-skill, per-depth content. Indexed [skillIndex][depthIndex].
// Skills: 0=الأعداد, 1=المقارنة, 2=العمليات, 3=ترتيب العمليات
// Depths: 0=intro, 1=basic, 2=intermediate, 3=advanced, 4=mastery
const SKILL_NAMES = ['الأعداد', 'المقارنة', 'العمليات', 'ترتيب العمليات'];

const NODE_CONTENT: { title: string; topic: string }[][] = [
  // ── Skill 0: الأعداد (Numbers) ────────────────────────────────────────────
  [
    {
      title: 'الأعداد: قراءة وكتابة الأعداد حتى المليون',
      topic: 'منازل الأعداد: المئات، الآلاف، عشرات الآلاف، مئات الآلاف، الملايين',
    },
    {
      title: 'الأعداد: قيمة المنزلة ورفع الأساس 10',
      topic: 'قيمة الرقم حسب منزله؛ الضرب والقسمة على 10، 100، 1000',
    },
    {
      title: 'الأعداد: التقريب والتقدير في سياق حقيقي',
      topic: 'تقريب لأقرب 10/100/1000؛ تقدير المجموع قبل الحساب',
    },
    {
      title: 'الأعداد: الأعداد السالبة والخط العددي',
      topic: 'الأعداد الصحيحة، الصفر، الأعداد السالبة، تمثيلها على الخط العددي',
    },
    {
      title: 'الأعداد: الحس العلمي والكسور العشرية الكبيرة والصغيرة',
      topic: 'كتابة الأعداد الكبيرة جدًا والصغيرة جدًا بالصيغة العلمية؛ حس الأعداد في حل المسائل',
    },
  ],
  // ── Skill 1: المقارنة (Comparison) ────────────────────────────────────────
  [
    {
      title: 'المقارنة: مقارنة الأعداد الكلية باستخدام > و < و =',
      topic: 'مقارنة عددين كليين حتى المليون؛ ترتيب ثلاثة أعداد أو أكثر',
    },
    {
      title: 'المقارنة: مقارنة الكسور العشرية حتى ثلاث منازل',
      topic: 'مقارنة 0.5 و 0.05 و 0.50؛ محاذات المنازل العشرية',
    },
    {
      title: 'المقارنة: مقارنة الكسور الاعتيادية ذات المقامات المختلفة',
      topic: 'إيجاد مقام مشترك؛ مقارنة كسورين بتحويلهما إلى مقام موحد',
    },
    {
      title: 'المقارنة: مقارنة الأعداد الصحيحة بما فيها السالبة على الخط العددي',
      topic: '−3 أصغر من −1؛ ترتيب الأعداد الصحيحة؛ القيمة المطلقة',
    },
    {
      title: 'المقارنة: ترتيب كل الأعداد الكسرية (كسور، عشرية، نسب، أعداد صحيحة)',
      topic: 'تحويل بين الصيغ ثم ترتيب مجموعة متنوعة من الأعداد',
    },
  ],
  // ── Skill 2: العمليات (Operations) ─────────────────────────────────────────
  [
    {
      title: 'العمليات: جمع وطرح الأعداد متعددة المنازل',
      topic: 'خوارزميات الجمع والطرح القياسية حتى 6 منازل',
    },
    {
      title: 'العمليات: الضرب والقسمة بما فيها الضرب والقسمة على 10 وأنصافها',
      topic: 'الضرب الطويل؛ القسمة القصيرة والطويلة؛ أنماط ×10 و ÷10',
    },
    {
      title: 'العمليات: العمليات على الكسور العشرية (جمع، طرح، ضرب، قسمة)',
      topic: 'محاذاة الفاصلة عند الجمع والطرح؛ عدد المنازل في ناتج الضرب',
    },
    {
      title: 'العمليات: العمليات على الكسور الاعتيادية',
      topic: 'جمع وطرح الكسور؛ ضرب الكسور؛ قسمة الكسور بقلب الثاني وضرب',
    },
    {
      title: 'العمليات: العمليات على الأعداد الصحيحة (مع السالبة) والأعداد الكسرية المختلطة',
      topic: 'قواعد إشارة الضرب والقسمة؛ تحويل العدد الكسري إلى غير حقيقي قبل العمليات',
    },
  ],
  // ── Skill 3: ترتيب العمليات (Order of Operations) ──────────────────────────
  [
    {
      title: 'ترتيب العمليات: فهم أن للعمليات ترتيبًا (× و ÷ قبل + و −)',
      topic: 'لماذا 2 + 3 × 4 = 14 وليس 20؛ تقديم فكرة الترتيب',
    },
    {
      title: 'ترتيب العمليات: PEMDAS مع الأعداد الكلية بدون أقواس',
      topic: 'تطبيق الترتيب على تعابير بسيطة؛ تدريب على × ÷ قبل + −',
    },
    {
      title: 'ترتيب العمليات: PEMDAS مع الأقواس والمعقوفات',
      topic: '(  ) ثم [  ] ثم العمليات الداخلية؛ تبسيط تعابير بأقواس متداخلة',
    },
    {
      title: 'ترتيب العمليات: PEMDAS مع الأسس والتجميع المتداخل',
      topic: 'الأسس قبل × ÷ ؛ تعابير مثل 3 × (2 + 4²) − [5 − 1]',
    },
    {
      title: 'ترتيب العمليات: PEMDAS مع الكسور والعشرية وتبسيط تعابير جبرية',
      topic: 'تبسيط تعابير بها كسور وعشرية وأقواس؛ مقدمة في التبسيط الجبري',
    },
  ],
];

// XP reward by depth: 0→20, 1→30, 2→40, 3→50, 4→60
const XP_BY_DEPTH = [20, 30, 40, 50, 60];

// Build the 20 nodes in spiral order: loop over depth, then over skills.
const NODES: { title: string; topic: string; orderIndex: number; xpReward: number; depth: number; skill: string }[] = [];
let orderIndex = 0;
for (let depth = 0; depth <= 4; depth++) {
  for (let skill = 0; skill < 4; skill++) {
    const content = NODE_CONTENT[skill]![depth]!;
    NODES.push({
      title: content.title,
      topic: content.topic,
      orderIndex,
      xpReward: XP_BY_DEPTH[depth]!,
      depth,
      skill: SKILL_NAMES[skill]!,
    });
    orderIndex++;
  }
}

// Idempotency: only seed nodes if the path is currently empty.
const existingNodes = await store.listPathNodes(keysPath.id);
if (existingNodes.length > 0) {
  console.log(`  مفاتيح المدينة already has ${existingNodes.length} node(s) — skipping`);
} else {
  for (const node of NODES) {
    await store.createPathNode({
      title: node.title,
      subject: mathSubject,
      topic: node.topic,
      orderIndex: node.orderIndex,
      xpReward: node.xpReward,
      depth: node.depth,
      learningPathId: keysPath.id,
    });
  }
  console.log(`  seeded ${NODES.length} nodes for مفاتيح المدينة`);
}

// ─── Summary ─────────────────────────────────────────────────────────────────
const depthCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
for (const n of NODES) depthCounts[n.depth]!++;
console.log('\n--- seed complete ---');
console.log('Grades 1-8 ensured (each with Mathematics + Science)');
console.log('Only Grade 7 Mathematics has the 8 learning paths');
console.log(`مفاتيح المدينة has ${NODES.length} spiral nodes across 4 skills × 5 depths:`);
console.log(`  depth 0 (intro):          ${depthCounts[0]} nodes`);
console.log(`  depth 1 (basic):          ${depthCounts[1]} nodes`);
console.log(`  depth 2 (intermediate):   ${depthCounts[2]} nodes`);
console.log(`  depth 3 (advanced):       ${depthCounts[3]} nodes`);
console.log(`  depth 4 (mastery):        ${depthCounts[4]} nodes`);
console.log('Skills: الأعداد · المقارنة · العمليات · ترتيب العمليات');
console.log('Questions: NOT seeded (author via /api/v1/curriculum/learning-paths/:id/questions)');
console.log(`\ntry: curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/v1/curriculum/grades`);
console.log(`try: curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/v1/curriculum/learning-paths/${keysPath.id}?withNodes=true`);

process.exit(0);
