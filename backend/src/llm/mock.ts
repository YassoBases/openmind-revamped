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

const here = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(here, '..', '..', '..', 'samples');

const MOCK_LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 4000);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Golden interactive payloads, keyword-routed the way the live model routes
 * by concept. One per approved registry type; every payload passes
 * validateInteractivePayload, so the mock exercises the exact production
 * validation + rendering path.
 */
function matchMockInteractive(question: string, ar: boolean): InteractivePayload | null {
  if (/كسر|كسور|خط الأعداد|المستقيم|عدد سالب|fraction|number line|decimal/i.test(question)) {
    return {
      type: 'number_line',
      version: 1,
      title: ar ? 'ضع الكسر في مكانه' : 'Place the fraction',
      instructions: ar
        ? 'حرّك المؤشر حتى يقف على قيمة ثلاثة أرباع، ثم تحقق.'
        : 'Move the marker until it stands on three quarters, then check.',
      data: {
        min: 0, max: 1, step: 0.05, target: 0.75, tolerance: 0.05,
        unit: ar ? 'من 0 إلى 1' : 'from 0 to 1',
        items: null, correctOrder: null, buckets: null,
      },
      expectedLearningAction: ar
        ? 'يحدد موضع كسر بين عددين صحيحين بنفسه'
        : 'Locates a fraction between two whole numbers by hand',
      followUpPrompt: ar
        ? 'اسأله أين يقع ٣/٤ بالنسبة إلى النصف'
        : 'Ask where 3/4 sits relative to one half',
    };
  }
  if (/رتب|رتّب|دورة الماء|مراحل|خطوات|ترتيب|order|sequence|water cycle|steps/i.test(question)) {
    return {
      type: 'order_sequence',
      version: 1,
      title: ar ? 'رتّب دورة الماء' : 'Order the water cycle',
      instructions: ar
        ? 'المس المراحل بالترتيب الصحيح من البداية إلى النهاية.'
        : 'Tap the stages in the correct order from start to finish.',
      data: {
        min: null, max: null, step: null, target: null, tolerance: null, unit: null,
        items: [
          { id: 'evap', label: ar ? 'تبخر الماء من البحر' : 'Water evaporates from the sea', bucketId: null },
          { id: 'cond', label: ar ? 'تكاثف البخار غيومًا' : 'Vapor condenses into clouds', bucketId: null },
          { id: 'rain', label: ar ? 'هطول المطر' : 'Rain falls', bucketId: null },
          { id: 'flow', label: ar ? 'جريان الماء إلى الأنهار' : 'Water flows back to rivers', bucketId: null },
        ],
        correctOrder: ['evap', 'cond', 'rain', 'flow'],
        buckets: null,
      },
      expectedLearningAction: ar
        ? 'يبني تسلسل دورة الماء بنفسه'
        : 'Builds the water-cycle sequence by hand',
      followUpPrompt: ar
        ? 'اسأله ماذا يحدث لو ارتفعت حرارة البحر'
        : 'Ask what happens if the sea gets warmer',
    };
  }
  if (/صنف|صنّف|اسم|فعل|حرف|أقسام الكلام|قواعد|grammar|noun|verb|sort|classify/i.test(question)) {
    return {
      type: 'sort_buckets',
      version: 1,
      title: ar ? 'اسم أم فعل أم حرف؟' : 'Noun, verb, or particle?',
      instructions: ar
        ? 'ضع كل كلمة في مجموعتها الصحيحة.'
        : 'Put each word into its correct group.',
      data: {
        min: null, max: null, step: null, target: null, tolerance: null, unit: null,
        items: [
          { id: 'w1', label: ar ? 'سوقٌ' : 'market', bucketId: 'noun' },
          { id: 'w2', label: ar ? 'يبني' : 'builds', bucketId: 'verb' },
          { id: 'w3', label: ar ? 'إلى' : 'to', bucketId: 'part' },
          { id: 'w4', label: ar ? 'ماءٌ' : 'water', bucketId: 'noun' },
          { id: 'w5', label: ar ? 'سافرَ' : 'traveled', bucketId: 'verb' },
          { id: 'w6', label: ar ? 'مِن' : 'from', bucketId: 'part' },
        ],
        correctOrder: null,
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
    };
  }
  return null;
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
    // voice, flavored by the student's chosen learning context when present.
    const primary = params.student.stage === 'primary_games';
    const lens = params.student.learningContext;
    const lensSuffix = lens ? (ar ? ` (بعدسة ${lens})` : ` (through the ${lens} lens)`) : '';

    // The student just acted on a block — mirror the live prompt's
    // result-handling rules so the full Ask → See → Try loop is testable.
    if (params.interactiveResult) {
      const r = params.interactiveResult;
      const correct = r.correctnessOrOutcome === 'correct';
      const explored = r.correctnessOrOutcome === 'explored';
      const data: TutorReply = {
        message: correct
          ? (ar
              ? `أحسنت يا ${params.student.name}! ${r.answerOrState} — هذا يبيّن أنك فهمت الفكرة بيديك لا بالحفظ. ما رأيك أن نجرّبها في موقف جديد؟`
              : `Well done, ${params.student.name}! ${r.answerOrState} — that shows you built the idea with your hands, not by memorizing. Shall we try it in a new situation?`)
          : explored
            ? (ar
                ? `جرّبت ولاحظت: ${r.answerOrState}. ما النمط الذي لفت انتباهك أثناء التحريك؟`
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
      };
      return { model: 'mock', data };
    }

    // Keyword-routed interactive blocks for middle-school "ask" questions —
    // one deterministic golden payload per approved type, so tests and the
    // whole Flutter rendering path exercise real registry data.
    if (!inExperience && !primary) {
      const q = params.question;
      const payload = matchMockInteractive(q, ar);
      if (payload) {
        const data: TutorReply = {
          message: ar
            ? `فكرة تستحق التجريب لا القراءة فقط! جهّزت لك نشاطًا قصيرًا — جرّبه وسنكمل من نتيجتك.${lensSuffix}`
            : `This idea deserves trying, not just reading! I prepared a short activity — do it and we will continue from your result.${lensSuffix}`,
          responseType: 'next_step',
          followUpQuestion: null,
          suggestedAction: 'try_again',
          relatedConcept: payload.title,
          needsClarification: false,
          interactivePayload: payload,
        };
        return { model: 'mock', data };
      }
    }

    const data: TutorReply = inExperience
      ? {
          message: ar
            ? `سؤال جيد يا ${params.student.name}! انظر إلى الشكل أمامك: ماذا يحدث للمساحة عندما تغيّر أحد البعدين فقط؟ جرّب تغييرًا واحدًا وراقب الناتج.${lensSuffix}`
            : `Good question, ${params.student.name}! Look at the shape on your screen: what happens to the area when you change just one dimension? Try one change and watch the result.${lensSuffix}`,
          responseType: 'hint',
          followUpQuestion: ar ? 'أي بُعد ستغيّر أولًا، ولماذا؟' : 'Which dimension will you change first, and why?',
          suggestedAction: 'try_again',
          relatedConcept: params.context?.concept ?? (ar ? 'مساحة المثلث' : 'triangle area'),
          needsClarification: false,
          interactivePayload: null,
        }
      : primary
        ? {
            message: ar
              ? `يا ${params.student.name}، سؤال رائع! لنلعب معه خطوة صغيرة: ما الذي تعرفه عنه حتى الآن؟ كل إجابة صغيرة تقرّبك من الحل مثل مرحلة في لعبة.`
              : `${params.student.name}, great question! Let's play with it one small step at a time: what do you already know? Each little answer is a level cleared on the way to the solution.`,
            responseType: 'question',
            followUpQuestion: ar ? 'ما أول شيء يخطر ببالك؟' : 'What first thing comes to mind?',
            suggestedAction: 'ask_followup',
            relatedConcept: null,
            needsClarification: false,
            interactivePayload: null,
          }
        : {
            message: ar
              ? `فكرة ممتازة أن تسأل! قبل أن أجيب مباشرة: ما الذي تعرفه عن هذا الموضوع حتى الآن؟ ابدأ بخطوة صغيرة وسأكمل معك.${lensSuffix}`
              : `Great that you asked! Before I answer directly: what do you already know about this topic? Start with one small step and I will continue with you.${lensSuffix}`,
            responseType: 'question',
            followUpQuestion: ar ? 'ما أول خطوة تخطر ببالك؟' : 'What first step comes to mind?',
            suggestedAction: 'ask_followup',
            relatedConcept: null,
            needsClarification: false,
            interactivePayload: null,
          };
    return { model: 'mock', data };
  }
}
