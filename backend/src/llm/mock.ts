/**
 * MOCK_LLM mode: the pipeline serves golden sample specs with simulated
 * latency. All Flutter/dev work runs free, no API keys involved. The mock
 * implements the same ContentProvider interface as the live LLM path, so the
 * generator/validator/assembly code under test is the production code.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ConnectContentSpec,
  EnrichedFeedback,
  FactCheckReport,
  GameSpec,
  McqContentSpec,
  Meta,
  NormalizedRequest,
  RepairItems,
} from '@edumind/shared';
import type { ContentProvider, FactCheckPiece, TutorReplyParams } from '../pipeline/provider.js';
import type { InteractivePayload, TutorReply } from '../tutor/contract.js';
import { matchGolden } from '../tutor/tools/registry.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(here, '..', '..', '..', 'samples');

const MOCK_LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 4000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Golden interactive payloads live on the tool descriptors themselves
 * (tutor/tools/*.ts), keyword-routed by matchGolden the way the live model
 * routes by concept. Every golden passes validateInteractivePayload (enforced
 * by test/tools.test.ts), so the mock exercises the exact production
 * validation + rendering path — including the availableTools eligibility the
 * route computed for this learner.
 */
function matchMockInteractive(
  question: string,
  availableTools: readonly string[],
  ar: boolean,
): InteractivePayload | null {
  return matchGolden(question, availableTools, ar) as InteractivePayload | null;
}

let samples: GameSpec[] | null = null;
function loadSamples(): GameSpec[] {
  if (!samples) {
    samples = readdirSync(samplesDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('stub_'))
      .map((f) => JSON.parse(readFileSync(join(samplesDir, f), 'utf8')) as GameSpec);
  }
  return samples;
}

const VAGUE = /\b(stuff|things|something|idk|dunno|anything|whatever)\b|^\s*\S{1,3}\s*$|شيء|أشياء|أي شيء/i;

/**
 * Deterministic first-step (and generic continuation) replies per study mode,
 * mirroring the live prompt's STUDY MODES rules: collect the required inputs
 * in ONE compact question (needsClarification=true), except quick_review
 * whose first step IS the prerequisite check. Continuations acknowledge and
 * advance one step so multi-turn plumbing stays testable.
 */
function mockStudyModeReply(
  mode: string,
  hasHistory: boolean,
  ar: boolean,
  name: string,
  hasInterests: boolean,
): TutorReply | null {
  const base = {
    relatedConcept: null,
    interactivePayload: null,
    suggestedInteraction: null,
  } as const;
  if (hasHistory) {
    // One generic mode-following continuation: acknowledge + next step.
    return {
      ...base,
      message: ar
        ? `تمام يا ${name}، سجلت ذلك. ننتقل إلى الخطوة التالية من برنامجنا.`
        : `Great, ${name} — noted. On to the next step of our program.`,
      responseType: 'next_step',
      followUpQuestion: null,
      suggestedAction: 'ask_followup',
      needsClarification: false,
    };
  }
  switch (mode) {
    case 'exam_prep':
      return {
        ...base,
        message: ar
          ? `لنجهّزك للسبر جيدًا يا ${name}. أخبرني في رسالة واحدة: ما المادة، وما الموضوعات التي يشملها السبر، ومتى موعده، وكم من الوقت متاح لك للدراسة؟`
          : `Let's get you ready, ${name}. In one message: which subject, which topics does the exam cover, when is it, and how much study time do you have?`,
        responseType: 'question',
        followUpQuestion: null,
        suggestedAction: 'ask_followup',
        needsClarification: true,
      };
    case 'lesson_discovery':
      // Interests are already known from onboarding for most students — only
      // ask what they care about when that signal is genuinely missing.
      return {
        ...base,
        message: hasInterests
          ? ar
            ? `يسعدني أن نكتشف الدرس معًا! أي درس تريد أن تفهم؟`
            : `Happy to discover this together! Which lesson do you want to understand?`
          : ar
            ? `يسعدني أن نكتشف الدرس معًا! أي درس تريد أن تفهم؟ وأخبرني أيضًا: ما الذي تستمتع به خارج المدرسة حتى أبني الأمثلة من عالمك؟`
            : `Happy to discover this together! Which lesson do you want to understand? And tell me: what do you enjoy outside school, so I can build the examples from your world?`,
        responseType: 'question',
        followUpQuestion: null,
        suggestedAction: 'ask_followup',
        needsClarification: true,
      };
    case 'backlog_plan':
      return {
        ...base,
        message: ar
          ? `لا بأس بالتراكم — سنقسمه معًا إلى خطوات صغيرة. أخبرني: ما الذي تراكم عليك (المواد والدروس)، وهل هناك مواعيد نهائية، وكم من الوقت متاح لك يوميًا؟`
          : `A backlog is fine — we will split it into small steps together. Tell me: what has piled up (subjects and lessons), any deadlines, and how much time do you have per day?`,
        responseType: 'question',
        followUpQuestion: null,
        suggestedAction: 'ask_followup',
        needsClarification: true,
      };
    case 'solve_diagnose':
      return {
        ...base,
        message: ar
          ? `أرني المسألة كما هي، والأهم: أرني محاولتك أنت في حلها — حتى لو لم تكتمل. من محاولتك سأعرف أين تختلط الفكرة بالضبط.`
          : `Show me the problem as written, and — most importantly — your own attempt at it, even unfinished. Your attempt tells me exactly where the idea gets tangled.`,
        responseType: 'question',
        followUpQuestion: null,
        suggestedAction: 'ask_followup',
        needsClarification: true,
      };
    case 'quick_review':
      return {
        ...base,
        message: ar
          ? `مراجعة سريعة إذن! سؤال أول لفحص الأساس: ما القاعدة أو الفكرة الأساسية التي يقوم عليها هذا الموضوع؟ أجب بما تتذكره وسأكمل بسؤالين قصيرين.`
          : `Quick review it is! First check question: what is the core rule or idea this topic stands on? Answer from memory and I will follow with two short checks.`,
        responseType: 'question',
        followUpQuestion: null,
        suggestedAction: 'ask_followup',
        needsClarification: false, // the check itself has begun
      };
    default:
      return null; // unknown mode → normal tutoring (the schema blocks these anyway)
  }
}

/** Strip ids/intro from a golden spec to produce generation-shaped content. */
function toContent(spec: GameSpec, educationalLevels: number): McqContentSpec | ConnectContentSpec {
  const eduLevels = spec.levels.filter((l) => !l.isIntro);
  const levels = [];
  for (let i = 0; i < educationalLevels; i++) {
    const src = eduLevels[i % eduLevels.length]!;
    levels.push({
      title: src.title + (i >= eduLevels.length ? ` ${i + 1}` : ''),
      teaching: src.teaching.map(({ id: _id, ...t }) => t),
      items: src.items.map((item) => {
        const { id: _id, kind: _kind, ...rest } = item as Record<string, unknown> & { id: string; kind: string };
        return rest;
      }),
    });
  }
  const narrative = spec.narrative
    ? {
        ...spec.narrative,
        perLevel: Array.from({ length: educationalLevels }, (_, i) =>
          spec.narrative!.perLevel[i % Math.max(spec.narrative!.perLevel.length, 1)] ?? '…'),
      }
    : undefined;
  if (spec.meta.gameType === 'draw_connect') {
    return {
      narrative,
      diagram: spec.diagram!,
      levels,
      summaryHints: spec.summaryHints,
    } as ConnectContentSpec;
  }
  return { narrative, levels, summaryHints: spec.summaryHints } as McqContentSpec;
}

export class MockProvider implements ContentProvider {
  readonly name = 'mock';

  async normalize(raw: { subject?: string; topic: string; language: string }): Promise<{ data: NormalizedRequest; model: string }> {
    await sleep(Math.min(400, MOCK_LATENCY_MS / 8));
    const vague = VAGUE.test(raw.topic);
    return {
      model: 'mock',
      data: {
        subject: raw.subject || (raw.language === 'ar' ? 'العلوم' : 'General Knowledge'),
        topic: raw.topic.trim(),
        confidence: vague ? 0.3 : 0.92,
        complexity: 0.4,
        clarifyingQuestion: vague
          ? raw.language === 'ar'
            ? 'ما الموضوع الذي تريد تعلمه بالتحديد؟'
            : 'What exactly would you like to learn about? Give me a specific topic!'
          : null,
        remappedInterest: null,
        notes: 'mock normalizer',
      },
    };
  }

  async generateContent(meta: Meta): Promise<{ content: McqContentSpec | ConnectContentSpec; model: string }> {
    await sleep(MOCK_LATENCY_MS);
    const all = loadSamples();
    const match =
      all.find((s) => s.meta.gameType === meta.gameType && s.meta.language === meta.language) ??
      all.find((s) => s.meta.gameType === meta.gameType);
    if (!match) throw new Error(`no golden sample for gameType ${meta.gameType}`);
    return { content: toContent(match, meta.sessionLength - 1), model: 'mock' };
  }

  async factcheck(pieces: FactCheckPiece[]): Promise<{ data: FactCheckReport; model: string }> {
    await sleep(Math.min(500, MOCK_LATENCY_MS / 8));
    return {
      model: 'mock',
      data: { verdicts: pieces.map((p) => ({ targetId: p.id, verdict: 'pass' as const, reason: 'ok (mock)' })) },
    };
  }

  async repair(): Promise<{ data: RepairItems; model: string }> {
    throw new Error('mock repair should never be needed (factcheck always passes)');
  }

  async feedback(params: { language: string; name: string }): Promise<{ data: EnrichedFeedback; model: string }> {
    await sleep(Math.min(300, MOCK_LATENCY_MS / 10));
    const ar = params.language === 'ar';
    return {
      model: 'mock',
      data: ar
        ? {
            headline: `أحسنت يا ${params.name}!`,
            body: 'تقدمك رائع في هذا الموضوع. راجع المفاهيم التي استخدمت فيها التلميحات لتثبتها أكثر.',
            reviewSuggestions: [],
          }
        : {
            headline: `Strong work, ${params.name}!`,
            body: 'You are making real progress on this topic. Revisit the concepts where you used hints to lock them in.',
            reviewSuggestions: [],
          },
    };
  }

  async tutorReply(params: TutorReplyParams): Promise<{ data: TutorReply; model: string }> {
    await sleep(Math.min(400, MOCK_LATENCY_MS / 8));
    const ar = params.student.language === 'ar';
    const inExperience = params.context?.source === 'experience';
    // Mirror the live prompt's stage rule so the plumbing is testable:
    // primary gets playful game framing; middle keeps the calm hint-first
    // voice; both flavor examples from the student's interests when present.
    const primary = params.student.stage === 'primary_games';
    const interests = params.student.interests ?? [];
    const lens = params.student.learningContext;
    // Localized interest names — never the raw English id inside an Arabic sentence.
    const interestNames: Record<string, { ar: string; en: string }> = {
      tech_robotics: { ar: 'التقنية والروبوتات', en: 'technology & robots' },
      games_challenges: { ar: 'الألعاب والتحديات', en: 'games & challenges' },
      drawing_design: { ar: 'الرسم والتصميم', en: 'drawing & design' },
      sports_movement: { ar: 'الرياضة والحركة', en: 'sports & movement' },
      reading_stories: { ar: 'القراءة والقصص', en: 'reading & stories' },
      helping_people: { ar: 'مساعدة الناس', en: 'helping people' },
      nature_environment: { ar: 'الطبيعة والبيئة', en: 'nature & environment' },
    };
    // Localized lens names (legacy fallback only) — never the raw English id inside an Arabic sentence.
    const lensNames: Record<string, { ar: string; en: string }> = {
      market: { ar: 'السوق', en: 'the market' },
      building: { ar: 'البناء', en: 'construction' },
      water_energy: { ar: 'الماء والطاقة', en: 'water & energy' },
      roads_transport: { ar: 'الطرق والمواصلات', en: 'roads & transport' },
      technology: { ar: 'التقنية', en: 'technology' },
    };
    // Interests are the PRIMARY flavor signal (both stages), rotated naturally
    // across a conversation when two are present (keyed off prior student
    // turns, so repeat asks alternate). The legacy lens is a fallback ONLY
    // when interests is empty — never combined with an active interest.
    let flavorName: string | null = null;
    if (interests.length > 0) {
      const studentTurns = params.history.filter((h) => h.role === 'student').length;
      const id = interests[studentTurns % interests.length]!;
      flavorName = ar ? interestNames[id]?.ar ?? id : interestNames[id]?.en ?? id;
    } else if (lens) {
      flavorName = ar ? lensNames[lens]?.ar ?? lens : lensNames[lens]?.en ?? lens;
    }
    const flavorSuffix = flavorName ? (ar ? ` (بعدسة ${flavorName})` : ` (through the ${flavorName} lens)`) : '';

    // Arabic grammatical addressing ONLY (student.gender) — conjugates the
    // 2nd-person verb ending exactly like the game shells' existing {m,f,n}
    // gendered strings (educore.js). Never changes content: same sentence,
    // same idea, same difficulty — only the verb ending moves. Neutral
    // (undiacritized) form when gender is absent, exactly as before.
    const gender = params.student.gender;
    const ar2p = (masc: string, fem: string, neutral: string) =>
      gender === 'm' ? masc : gender === 'f' ? fem : neutral;
    const wellDone = ar2p('أحسنتَ', 'أحسنتِ', 'أحسنت');
    const youTried = ar2p('جرّبتَ', 'جرّبتِ', 'جرّبت');

    // The student just acted on a block — mirror the live prompt's
    // result-handling rules so the full Ask → See → Try loop is testable.
    if (params.interactiveResult) {
      const r = params.interactiveResult;
      const correct = r.correctnessOrOutcome === 'correct';
      const explored = r.correctnessOrOutcome === 'explored';
      const data: TutorReply = {
        message: correct
          ? (ar
              ? `${wellDone} يا ${params.student.name}! ${r.answerOrState} — هذا يبيّن أنك فهمت الفكرة بيديك لا بالحفظ. ما رأيك أن نجرّبها في موقف جديد؟`
              : `Well done, ${params.student.name}! ${r.answerOrState} — that shows you built the idea with your hands, not by memorizing. Shall we try it in a new situation?`)
          : explored
            ? (ar
                ? `${youTried} ولاحظت: ${r.answerOrState}. ما النمط الذي لفت انتباهك أثناء التحريك؟`
                : `You explored and observed: ${r.answerOrState}. What pattern caught your eye while moving things?`)
            : (ar
                ? `محاولة مفيدة! ${r.answerOrState}. هذا يخبرنا أين تختلط الفكرة — انظر إلى العنصر الذي لم يستقر في مكانه وفكّر: ما الذي يميّزه؟ جرّب مرة أخرى.`
                : `A useful attempt! ${r.answerOrState}. That tells us where the idea gets mixed up — look at the piece that did not settle and ask: what makes it different? Try again.`),
        responseType: correct ? 'encouragement' : explored ? 'question' : 'correction',
        followUpQuestion: correct
          ? (ar ? 'أين قد تقابل الفكرة نفسها في يومك؟' : 'Where might you meet the same idea in your day?')
          : (ar ? 'ما الذي ستغيّره في محاولتك القادمة؟' : 'What will you change on your next try?'),
        suggestedAction: correct ? 'ask_followup' : 'try_again',
        relatedConcept: null,
        needsClarification: false,
        interactivePayload: null,
        suggestedInteraction: null,
      };
      return { model: 'mock', data };
    }

    // Study programs (contract.ts STUDY_MODES): mirror the live prompt's
    // per-mode FIRST STEP deterministically — collect the program's required
    // inputs (or open the diagnostic) — so mode plumbing and each first-step
    // behavior are testable end to end. Program logic keys on the stable id
    // in context.mode, never on the question's Arabic text.
    if (params.context?.mode) {
      const reply = mockStudyModeReply(
        params.context.mode,
        params.history.length > 0,
        ar,
        params.student.name,
        interests.length > 0,
      );
      if (reply) return { model: 'mock', data: reply };
    }

    // Keyword-routed interactive blocks for "ask" questions — deterministic
    // descriptor goldens, offered ONLY from the availableTools the route's
    // eligibility filter computed (primary students get an empty list), so
    // tests and the whole Flutter rendering path exercise real registry data.
    if (!inExperience && params.availableTools.length > 0) {
      const q = params.question;
      const payload = matchMockInteractive(q, params.availableTools, ar);
      if (payload) {
        const data: TutorReply = {
          message: ar
            ? `فكرة تستحق التجريب لا القراءة فقط! جهّزت لك نشاطًا قصيرًا — جرّبه وسنكمل من نتيجتك.${flavorSuffix}`
            : `This idea deserves trying, not just reading! I prepared a short activity — do it and we will continue from your result.${flavorSuffix}`,
          responseType: 'next_step',
          followUpQuestion: null,
          suggestedAction: 'try_again',
          relatedConcept: payload.title,
          needsClarification: false,
          interactivePayload: payload,
          suggestedInteraction: null,
        };
        return { model: 'mock', data };
      }

      // No registered tool fits, but the question asks to SEE a relationship
      // the platform does not render yet (graphing, simulation). Mirror the
      // live prompt's HONESTY RULE: teach with text AND name the missing
      // interaction, so the whole fallback + future-support signal is testable.
      const gap = ar
        ? /رسم بياني|تمثيل بياني|منحنى|المنحنى|دالة|الدالة|محاكاة|تجربة تفاعلية/
        : /\b(graph|plot|curve|function|simulate|simulation)\b/i;
      if (gap.test(q)) {
        const data: TutorReply = {
          message: ar
            ? 'سؤال ممتاز! لنمشِ خطوة بخطوة: تخيّل محورًا أفقيًا للأعداد ومحورًا رأسيًا للنتيجة، وكل قيمة تعطي نقطة. سأشرح، وقريبًا سنجرّبها بيدك.'
            : 'Great question! Step by step: picture a horizontal axis for the input and a vertical one for the result — each value gives one point. I will explain, and soon you will try it by hand.',
          responseType: 'explanation',
          followUpQuestion: ar
            ? 'ما القيمة التي تريد أن نبدأ بها على المحور الأفقي؟'
            : 'Which value should we start with on the horizontal axis?',
          suggestedAction: 'ask_followup',
          relatedConcept: ar ? 'التمثيل البياني' : 'graphing',
          needsClarification: false,
          interactivePayload: null,
          suggestedInteraction: {
            mechanic: 'plot_graph',
            reason: ar
              ? 'رؤية المنحنى وهو يتغيّر مع تغيّر الميل تبني الفكرة أفضل من وصفها بالكلمات.'
              : 'Watching the curve move as the slope changes builds the idea better than describing it.',
            conceptFamily: ar ? 'تمثيل الدوال الخطية بيانيًا' : 'graphing linear functions',
          },
        };
        return { model: 'mock', data };
      }
    }

    // In-experience help must speak about THIS lesson's concept — a geometry
    // hint on an equations or history step reads as a broken tutor. The
    // context's concept/stepTitle anchor the wording; a generic-but-honest
    // nudge covers the (rare) contextless case.
    const concept = params.context?.concept ?? params.context?.stepTitle ?? null;
    const data: TutorReply = inExperience
      ? {
          message: ar
            ? concept
              ? `سؤال جيد يا ${params.student.name}! أنت تعمل الآن على «${concept}». انظر إلى ما أمامك على الشاشة: غيّر عنصرًا واحدًا فقط وراقب ماذا يتغيّر معه — هذا هو مفتاح الخطوة.${flavorSuffix}`
              : `سؤال جيد يا ${params.student.name}! انظر إلى ما أمامك على الشاشة: غيّر عنصرًا واحدًا فقط وراقب ماذا يتغيّر معه، ثم جرّب من جديد.${flavorSuffix}`
            : concept
              ? `Good question, ${params.student.name}! You are working on "${concept}". Look at your screen: change ONE thing and watch what changes with it — that is the key to this step.${flavorSuffix}`
              : `Good question, ${params.student.name}! Look at your screen: change ONE thing and watch what changes with it, then try again.${flavorSuffix}`,
          responseType: 'hint',
          followUpQuestion: ar ? 'ما أول تغيير ستجرّبه، ولماذا؟' : 'What is the first change you will try, and why?',
          suggestedAction: 'try_again',
          relatedConcept: concept,
          needsClarification: false,
          interactivePayload: null,
          suggestedInteraction: null,
        }
      : primary
        ? {
            message: ar
              ? `يا ${params.student.name}، سؤال رائع! لنلعب معه خطوة صغيرة: ما الذي تعرفه عنه حتى الآن؟ كل إجابة صغيرة تقرّبك من الحل مثل مرحلة في لعبة.${flavorSuffix}`
              : `${params.student.name}, great question! Let's play with it one small step at a time: what do you already know? Each little answer is a level cleared on the way to the solution.${flavorSuffix}`,
            responseType: 'question',
            followUpQuestion: ar ? 'ما أول شيء يخطر ببالك؟' : 'What first thing comes to mind?',
            suggestedAction: 'ask_followup',
            relatedConcept: null,
            needsClarification: false,
            interactivePayload: null,
            suggestedInteraction: null,
          }
        : {
            message: ar
              ? `فكرة ممتازة أن تسأل! قبل أن أجيب مباشرة: ما الذي تعرفه عن هذا الموضوع حتى الآن؟ ابدأ بخطوة صغيرة وسأكمل معك.${flavorSuffix}`
              : `Great that you asked! Before I answer directly: what do you already know about this topic? Start with one small step and I will continue with you.${flavorSuffix}`,
            responseType: 'question',
            followUpQuestion: ar ? 'ما أول خطوة تخطر ببالك؟' : 'What first step comes to mind?',
            suggestedAction: 'ask_followup',
            relatedConcept: null,
            needsClarification: false,
            interactivePayload: null,
            suggestedInteraction: null,
          };
    return { model: 'mock', data };
  }
}
