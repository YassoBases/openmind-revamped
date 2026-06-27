/**
 * Seed a demo student (Postgres only — memory mode reseeds on boot anyway).
 *   npm -w backend run seed
 * Prints the bearer token to use from the app/curl.
 */
import 'dotenv/config';
import { newToken } from "../auth.js";
import { createStore } from "../store/index.js";

const log = { info: console.log, warn: console.warn };

const store = await createStore(log);
const { token, hash } = newToken();
const student = await store.createStudent({
  name: "Demo",
  gender: null,
  grade: 3,
  language: "en",
  color: "#1CB0F6",
  interest: "space",
  dailyGoal: 3,
  tokenHash: hash,
});

console.log("--- demo student seeded ---");
console.log("studentId:", student.id);
console.log("token:    ", token);
console.log(
  `try: curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/v1/students/me`,
);
// if (store.kind === "memory") {
//   console.log(
//     "(memory store: this student only exists for this process — set DATABASE_URL for persistence)",
//   );
// }

// ─── Sample curriculum graph ────────────────────────────────────────────────
// Idempotent: skip grades that already exist (by index) so re-running the seed
// doesn't duplicate data.
console.log("\n--- seeding curriculum ---");
let seeded = 0;
for (let i = 1; i <= 6; i++) {
  const existing = await store.getGradeByIndex(i);
  if (existing) {
    continue;
  }
  const grade = await store.createGrade({ name: `Grade ${i}`, index: i });

  
   // Give Grade 3 a richer sample tree (matches the demo student's grade).
  if (i === 3) {
    const math = await store.createSubject({
      title: 'Mathematics',
      content: 'Numbers, operations, and early problem solving for Grade 3.',
      orderIndex: 0,
      gradeId: grade.id,
    });
    const science = await store.createSubject({
      title: 'Science',
      content: 'Observing the natural world: plants, water, and the sky.',
      orderIndex: 1,
      gradeId: grade.id,
    });

    const numbersPath = await store.createLearningPath({
      name: 'Numbers to 1000',
      description: 'Place value, comparing, and ordering three-digit numbers.',
      subjectId: math.id,
    });
    const placeValueNode = await store.createPathNode({
      title: 'Place value',
      subject: 'Mathematics',
      topic: 'hundreds, tens, ones',
      orderIndex: 0,
      xpReward: 20,
      learningPathId: numbersPath.id,
    });
    const compareNode = await store.createPathNode({
      title: 'Compare numbers',
      subject: 'Mathematics',
      topic: 'greater than / less than up to 1000',
      orderIndex: 1,
      xpReward: 25,
      learningPathId: numbersPath.id,
    });

    // ── Question bank for "Numbers to 1000" ──────────────────────────────
    // 4 easy + 4 medium + 4 hard = 12 questions, covering all 4 interactivity
    // types, each linked to a path node for precise placement.
    // Easy (choice + connect + drag_drop + spin)
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'choice', difficulty: 'easy',
      linkedNodeId: placeValueNode.id,
      content: {
        type: 'choice',
        prompt: 'In 345, which digit is in the tens place?',
        promptAr: 'في العدد ٣٤٥، ما الرقم في منزلة العشرات؟',
        options: ['3', '4', '5'],
        optionsAr: ['٣', '٤', '٥'],
        correctIndex: 1,
        explanation: '345 = 3 hundreds, 4 tens, 5 ones.',
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'connect', difficulty: 'easy',
      linkedNodeId: placeValueNode.id,
      content: {
        type: 'connect',
        prompt: 'Match each number to its number of tens.',
        promptAr: 'طابق كل عدد مع عدد العشرات فيه.',
        leftItems: [
          { id: 'l1', label: '40', labelAr: '٤٠' },
          { id: 'l2', label: '70', labelAr: '٧٠' },
        ],
        rightItems: [
          { id: 'r1', label: '4 tens', labelAr: '٤ عشرات' },
          { id: 'r2', label: '7 tens', labelAr: '٧ عشرات' },
        ],
        correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }],
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'drag_drop', difficulty: 'easy',
      linkedNodeId: placeValueNode.id,
      content: {
        type: 'drag_drop',
        prompt: 'Drag each number to its place-value column.',
        promptAr: 'اسحب كل عدد إلى عمود منزله الصحيح.',
        items: [
          { id: 'a', label: '200', labelAr: '٢٠٠' },
          { id: 'b', label: '50', labelAr: '٥٠' },
        ],
        slots: [
          { id: 's1', label: 'Hundreds', labelAr: 'المئات', correctItemId: 'a' },
          { id: 's2', label: 'Tens', labelAr: 'العشرات', correctItemId: 'b' },
        ],
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'spin', difficulty: 'easy',
      linkedNodeId: compareNode.id,
      content: {
        type: 'spin',
        prompt: 'Spin to the bigger number.',
        promptAr: 'دوّر إلى العدد الأكبر.',
        wheelSegments: [
          { id: 'w1', label: '120', labelAr: '١٢٠' },
          { id: 'w2', label: '210', labelAr: '٢١٠' },
          { id: 'w3', label: '102', labelAr: '١٠٢' },
        ],
        correctSegmentId: 'w2',
      },
    });
    // Medium
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'choice', difficulty: 'medium',
      linkedNodeId: compareNode.id,
      content: {
        type: 'choice',
        prompt: 'Which is greater: 478 or 487?',
        promptAr: 'أيّ أكبر: ٤٧٨ أم ٤٨٧؟',
        options: ['478', '487', 'They are equal'],
        optionsAr: ['٤٧٨', '٤٨٧', 'متساويان'],
        correctIndex: 1,
        explanation: 'Both have 4 hundreds. 487 has more tens (8 > 7).',
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'drag_drop', difficulty: 'medium',
      linkedNodeId: placeValueNode.id,
      content: {
        type: 'drag_drop',
        prompt: 'Build 536 by dragging digits to the right columns.',
        promptAr: 'كوّن ٥٣٦ بسحب الأرقام إلى الأعمدة الصحيحة.',
        items: [
          { id: 'a', label: '5', labelAr: '٥' },
          { id: 'b', label: '3', labelAr: '٣' },
          { id: 'c', label: '6', labelAr: '٦' },
        ],
        slots: [
          { id: 's1', label: 'Hundreds', labelAr: 'المئات', correctItemId: 'a' },
          { id: 's2', label: 'Tens', labelAr: 'العشرات', correctItemId: 'b' },
          { id: 's3', label: 'Ones', labelAr: 'الآحاد', correctItemId: 'c' },
        ],
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'connect', difficulty: 'medium',
      linkedNodeId: compareNode.id,
      content: {
        type: 'connect',
        prompt: 'Match each pair with the correct sign.',
        promptAr: 'طابق كل زوج بالإشارة الصحيحة.',
        leftItems: [
          { id: 'l1', label: '301 ? 299', labelAr: '٣٠١ ؟ ٢٩٩' },
          { id: 'l2', label: '560 ? 650', labelAr: '٥٦٠ ؟ ٦٥٠' },
        ],
        rightItems: [
          { id: 'r1', label: '>', labelAr: '>' },
          { id: 'r2', label: '<', labelAr: '<' },
        ],
        correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }],
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'spin', difficulty: 'medium',
      linkedNodeId: placeValueNode.id,
      content: {
        type: 'spin',
        prompt: 'Spin to the number with 7 hundreds.',
        promptAr: 'دوّر إلى العدد الذي يحتوي على ٧ مئات.',
        wheelSegments: [
          { id: 'w1', label: '725', labelAr: '٧٢٥' },
          { id: 'w2', label: '275', labelAr: '٢٧٥' },
          { id: 'w3', label: '572', labelAr: '٥٧٢' },
        ],
        correctSegmentId: 'w1',
      },
    });
    // Hard
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'choice', difficulty: 'hard',
      linkedNodeId: placeValueNode.id,
      content: {
        type: 'choice',
        prompt: 'What is the value of the digit 8 in 846?',
        promptAr: 'ما قيمة الرقم ٨ في العدد ٨٤٦؟',
        options: ['8', '80', '800', '8000'],
        optionsAr: ['٨', '٨٠', '٨٠٠', '٨٠٠٠'],
        correctIndex: 2,
        explanation: '8 is in the hundreds place → 8 × 100 = 800.',
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'drag_drop', difficulty: 'hard',
      linkedNodeId: compareNode.id,
      content: {
        type: 'drag_drop',
        prompt: 'Order these from smallest to largest.',
        promptAr: 'رتّب هذه الأعداد من الأصغر إلى الأكبر.',
        items: [
          { id: 'a', label: '642', labelAr: '٦٤٢' },
          { id: 'b', label: '426', labelAr: '٤٢٦' },
          { id: 'c', label: '264', labelAr: '٢٦٤' },
        ],
        slots: [
          { id: 's1', label: '1st', labelAr: 'الأول', correctItemId: 'c' },
          { id: 's2', label: '2nd', labelAr: 'الثاني', correctItemId: 'b' },
          { id: 's3', label: '3rd', labelAr: 'الثالث', correctItemId: 'a' },
        ],
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'connect', difficulty: 'hard',
      linkedNodeId: placeValueNode.id,
      content: {
        type: 'connect',
        prompt: 'Match each expanded form to its number.',
        promptAr: 'طابق كل صيغة موسّعة مع عددها.',
        leftItems: [
          { id: 'l1', label: '900 + 40 + 3', labelAr: '٩٠٠ + ٤٠ + ٣' },
          { id: 'l2', label: '400 + 90 + 3', labelAr: '٤٠٠ + ٩٠ + ٣' },
          { id: 'l3', label: '300 + 90 + 4', labelAr: '٣٠٠ + ٩٠ + ٤' },
        ],
        rightItems: [
          { id: 'r1', label: '943', labelAr: '٩٤٣' },
          { id: 'r2', label: '493', labelAr: '٤٩٣' },
          { id: 'r3', label: '394', labelAr: '٣٩٤' },
        ],
        correctPairs: [
          { leftId: 'l1', rightId: 'r1' },
          { leftId: 'l2', rightId: 'r2' },
          { leftId: 'l3', rightId: 'r3' },
        ],
      },
    });
    await store.createQuestion({
      learningPathId: numbersPath.id, type: 'spin', difficulty: 'hard',
      linkedNodeId: compareNode.id,
      content: {
        type: 'spin',
        prompt: 'Spin to the smallest number.',
        promptAr: 'دوّر إلى أصغر عدد.',
        wheelSegments: [
          { id: 'w1', label: '871', labelAr: '٨٧١' },
          { id: 'w2', label: '817', labelAr: '٨١٧' },
          { id: 'w3', label: '781', labelAr: '٧٨١' },
        ],
        correctSegmentId: 'w3',
      },
    });

    const waterPath = await store.createLearningPath({
      name: 'The Water Cycle',
      description: 'How water moves between the earth and the sky.',
      subjectId: science.id,
    });
    const evapNode = await store.createPathNode({
      title: 'Evaporation',
      subject: 'Science',
      topic: 'the sun heats water into vapor',
      orderIndex: 0,
      xpReward: 20,
      learningPathId: waterPath.id,
    });
    const condNode = await store.createPathNode({
      title: 'Condensation & precipitation',
      subject: 'Science',
      topic: 'clouds form and rain falls',
      orderIndex: 1,
      xpReward: 30,
      learningPathId: waterPath.id,
    });

    // ── Question bank for "The Water Cycle" (12 questions) ───────────────
    // easy ×4
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'choice', difficulty: 'easy',
      linkedNodeId: evapNode.id,
      content: {
        type: 'choice',
        prompt: 'What heats water into vapor?',
        promptAr: 'ما الذي يسخّن الماء ليصبح بخارًا؟',
        options: ['The sun', 'The wind', 'The moon'],
        optionsAr: ['الشمس', 'الريح', 'القمر'],
        correctIndex: 0,
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'drag_drop', difficulty: 'easy',
      linkedNodeId: evapNode.id,
      content: {
        type: 'drag_drop',
        prompt: 'Drag vapor to where it goes.',
        promptAr: 'اسحب البخار إلى المكان الذي يذهب إليه.',
        items: [{ id: 'a', label: 'vapor', labelAr: 'بخار' }],
        slots: [{ id: 's1', label: 'Up into the sky', labelAr: 'إلى السماء', correctItemId: 'a' }],
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'spin', difficulty: 'easy',
      linkedNodeId: condNode.id,
      content: {
        type: 'spin',
        prompt: 'Spin to what falls from clouds.',
        promptAr: 'دوّر إلى ما يسقط من السحب.',
        wheelSegments: [
          { id: 'w1', label: 'Rain', labelAr: 'مطر' },
          { id: 'w2', label: 'Sand', labelAr: 'رمل' },
          { id: 'w3', label: 'Rocks', labelAr: 'صخور' },
        ],
        correctSegmentId: 'w1',
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'connect', difficulty: 'easy',
      linkedNodeId: evapNode.id,
      content: {
        type: 'connect',
        prompt: 'Match each stage to its meaning.',
        promptAr: 'طابق كل مرحلة بمعناها.',
        leftItems: [
          { id: 'l1', label: 'Evaporation', labelAr: 'التبخر' },
          { id: 'l2', label: 'Rain', labelAr: 'المطر' },
        ],
        rightItems: [
          { id: 'r1', label: 'water turns to vapor', labelAr: 'الماء يتحول إلى بخار' },
          { id: 'r2', label: 'water falls down', labelAr: 'الماء يسقط' },
        ],
        correctPairs: [{ leftId: 'l1', rightId: 'r1' }, { leftId: 'l2', rightId: 'r2' }],
      },
    });
    // medium ×4
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'choice', difficulty: 'medium',
      linkedNodeId: condNode.id,
      content: {
        type: 'choice',
        prompt: 'What forms when vapor cools high in the sky?',
        promptAr: 'ما الذي يتكوّن عندما يبرد البخار عاليًا في السماء؟',
        options: ['A cloud', 'A river', 'A rock'],
        optionsAr: ['سحابة', 'نهر', 'صخرة'],
        correctIndex: 0,
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'connect', difficulty: 'medium',
      linkedNodeId: condNode.id,
      content: {
        type: 'connect',
        prompt: 'Order the water cycle stages (match left = step number to right = name).',
        promptAr: 'رتّب مراحل دورة الماء (طابق اليسار = رقم الخطوة مع اليمين = الاسم).',
        leftItems: [
          { id: 'l1', label: 'Step 1', labelAr: 'الخطوة ١' },
          { id: 'l2', label: 'Step 2', labelAr: 'الخطوة ٢' },
          { id: 'l3', label: 'Step 3', labelAr: 'الخطوة ٣' },
        ],
        rightItems: [
          { id: 'r1', label: 'Evaporation', labelAr: 'التبخر' },
          { id: 'r2', label: 'Condensation', labelAr: 'التكاثف' },
          { id: 'r3', label: 'Precipitation', labelAr: 'الهطول' },
        ],
        correctPairs: [
          { leftId: 'l1', rightId: 'r1' },
          { leftId: 'l2', rightId: 'r2' },
          { leftId: 'l3', rightId: 'r3' },
        ],
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'drag_drop', difficulty: 'medium',
      linkedNodeId: evapNode.id,
      content: {
        type: 'drag_drop',
        prompt: 'Put the water cycle in order.',
        promptAr: 'ضع دورة الماء في الترتيب الصحيح.',
        items: [
          { id: 'a', label: 'Rain falls', labelAr: 'المطر يسقط' },
          { id: 'b', label: 'Water heats up', labelAr: 'الماء يسخن' },
          { id: 'c', label: 'Cloud forms', labelAr: 'تتكوّن السحابة' },
        ],
        slots: [
          { id: 's1', label: '1st', labelAr: 'الأول', correctItemId: 'b' },
          { id: 's2', label: '2nd', labelAr: 'الثاني', correctItemId: 'c' },
          { id: 's3', label: '3rd', labelAr: 'الثالث', correctItemId: 'a' },
        ],
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'spin', difficulty: 'medium',
      linkedNodeId: condNode.id,
      content: {
        type: 'spin',
        prompt: 'Spin to the stage where clouds form.',
        promptAr: 'دوّر إلى المرحلة التي تتكوّن فيها السحب.',
        wheelSegments: [
          { id: 'w1', label: 'Evaporation', labelAr: 'التبخر' },
          { id: 'w2', label: 'Condensation', labelAr: 'التكاثف' },
          { id: 'w3', label: 'Precipitation', labelAr: 'الهطول' },
        ],
        correctSegmentId: 'w2',
      },
    });
    // hard ×4
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'choice', difficulty: 'hard',
      linkedNodeId: condNode.id,
      content: {
        type: 'choice',
        prompt: 'Why does precipitation happen?',
        promptAr: 'لماذا يحدث الهطول؟',
        options: [
          'Drops in clouds get too heavy and fall',
          'The sun pushes them down',
          'The wind blows them away',
        ],
        optionsAr: [
          'القطرات في السحب تصبح ثقيلة وتسقط',
          'الشمس تدفعها للأسفل',
          'الريح تنفخها بعيدًا',
        ],
        correctIndex: 0,
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'connect', difficulty: 'hard',
      linkedNodeId: evapNode.id,
      content: {
        type: 'connect',
        prompt: 'Match each cause to its effect.',
        promptAr: 'طابق كل سبب بنتيجته.',
        leftItems: [
          { id: 'l1', label: 'Sun heats water', labelAr: 'الشمس تسخّن الماء' },
          { id: 'l2', label: 'Vapor cools', labelAr: 'البخار يبرد' },
          { id: 'l3', label: 'Drops get heavy', labelAr: 'القطرات تثقل' },
        ],
        rightItems: [
          { id: 'r1', label: 'Cloud forms', labelAr: 'تتكوّن السحابة' },
          { id: 'r2', label: 'Rain falls', labelAr: 'المطر يسقط' },
          { id: 'r3', label: 'Vapor rises', labelAr: 'البخار يصعد' },
        ],
        correctPairs: [
          { leftId: 'l1', rightId: 'r3' },
          { leftId: 'l2', rightId: 'r1' },
          { leftId: 'l3', rightId: 'r2' },
        ],
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'drag_drop', difficulty: 'hard',
      linkedNodeId: condNode.id,
      content: {
        type: 'drag_drop',
        prompt: 'Match each stage to the correct place in the cycle.',
        promptAr: 'طابق كل مرحلة مع مكانها الصحيح في الدورة.',
        items: [
          { id: 'a', label: 'Condensation', labelAr: 'التكاثف' },
          { id: 'b', label: 'Precipitation', labelAr: 'الهطول' },
          { id: 'c', label: 'Evaporation', labelAr: 'التبخر' },
        ],
        slots: [
          { id: 's1', label: 'Start (sun)', labelAr: 'البداية (الشمس)', correctItemId: 'c' },
          { id: 's2', label: 'Middle (sky)', labelAr: 'الوسط (السماء)', correctItemId: 'a' },
          { id: 's3', label: 'End (ground)', labelAr: 'النهاية (الأرض)', correctItemId: 'b' },
        ],
      },
    });
    await store.createQuestion({
      learningPathId: waterPath.id, type: 'spin', difficulty: 'hard',
      linkedNodeId: evapNode.id,
      content: {
        type: 'spin',
        prompt: 'Spin to the source of energy that drives the water cycle.',
        promptAr: 'دوّر إلى مصدر الطاقة الذي يحرّك دورة الماء.',
        wheelSegments: [
          { id: 'w1', label: 'The sun', labelAr: 'الشمس' },
          { id: 'w2', label: 'The wind', labelAr: 'الريح' },
          { id: 'w3', label: 'The ocean floor', labelAr: 'قاع المحيط' },
        ],
        correctSegmentId: 'w1',
      },
    });
  }
  seeded++;
}
console.log(`seeded ${seeded} grade(s) (Grade 3 has Math + Science paths, each with a 12-question bank)`);
  seeded++;


console.log(
  `try: curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/v1/curriculum/grades`,
);

process.exit(0);
