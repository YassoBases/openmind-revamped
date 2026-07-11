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
        suggestedInteraction: null,
      };
      return { model: 'mock', data };
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
            ? `فكرة تستحق التجريب لا القراءة فقط! جهّزت لك نشاطًا قصيرًا — جرّبه وسنكمل من نتيجتك.${lensSuffix}`
            : `This idea deserves trying, not just reading! I prepared a short activity — do it and we will continue from your result.${lensSuffix}`,
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
          suggestedInteraction: null,
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
            suggestedInteraction: null,
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
            suggestedInteraction: null,
          };
    return { model: 'mock', data };
  }
}
