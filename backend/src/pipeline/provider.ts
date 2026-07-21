/**
 * ContentProvider — the seam between the generation pipeline and the LLM.
 * LiveProvider talks to Anthropic (Haiku 4.5 default, Sonnet 4.6 escalation);
 * MockProvider serves golden specs. The pipeline (validators, fact-check
 * orchestration, repair, caching, assembly) is identical for both.
 */
import type {
  ConnectContentSpec,
  EnrichedFeedback,
  FactCheckReport,
  McqContentSpec,
  Meta,
  NormalizedRequest,
  RepairItems,
  RepairSceneItems,
  ScenePlayContentSpec,
  StageContent,
  WorldCreateContent,
  WorldStagePlan,
} from '@edumind/shared';
import {
  ConnectContentSpecSchema,
  FactCheckReportSchema,
  KITS_BY_GAME,
  STAGE_GENERATABLE_GAME_TYPES,
  McqContentSpecSchema,
  NormalizedRequestSchema,
  EnrichedFeedbackSchema,
  RepairItemsSchema,
  RepairSceneItemsSchema,
  ScenePlayContentSpecSchema,
  THEMES,
  VARIANTS_BY_GAME,
  WorldCreateContentSchema,
  contentSpecJsonSchema,
  factCheckJsonSchema,
  normalizedRequestJsonSchema,
  enrichedFeedbackJsonSchema,
  repairItemsJsonSchema,
  repairSceneItemsJsonSchema,
  stageContentJsonSchema,
  stageContentSchemaFor,
  worldCreateJsonSchema,
} from '@edumind/shared';
import { config } from '../config.js';
import { structuredCall } from '../llm/anthropic.js';
import {
  FACTCHECK_SYSTEM_PROMPT,
  FEEDBACK_SYSTEM_PROMPT,
  NORMALIZER_SYSTEM_PROMPT,
  REFINE_SYSTEM_PROMPT,
  SPEC_SYSTEM_PROMPT,
  STAGE_SYSTEM_PROMPT,
  TUTOR_SYSTEM_PROMPT,
  WORLD_PLAN_SYSTEM_PROMPT,
  buildRepairUserMessage,
} from '../llm/prompts.js';
import {
  TutorReplySchema,
  tutorReplyJsonSchema,
  type InteractiveResult,
  type TutorContext,
  type TutorReply,
} from '../tutor/contract.js';
import type { LearningStage } from '../learning/stage.js';

export interface TutorReplyParams {
  student: {
    name: string;
    grade: number;
    /** Resolved server-side from the authenticated grade — never client-sent. */
    stage: LearningStage;
    language: string;
    interest: string | null;
    /** Middle-school context lens chosen by the student (server-stored). Legacy — a fallback flavor only when interests is empty. */
    learningContext: string | null;
    /** Personal interests chosen at onboarding (1-2, both stages) — the primary source for real-life examples/activities. */
    interests: string[];
    /** 'm' | 'f' | null — used ONLY for Arabic grammatical addressing. Never anything else. */
    gender: string | null;
  };
  question: string;
  context: TutorContext | null;
  /**
   * Interactive tool ids this learner may be offered — filtered SERVER-SIDE
   * by grade, stage, subject and availability (tutor/tools/registry.ts)
   * before the model ever selects; the route re-checks the reply against it.
   */
  availableTools: string[];
  /** What the learner just did on the last interactive block, if anything. */
  interactiveResult: InteractiveResult | null;
  /** Most recent turns of this conversation, oldest first. */
  history: Array<{ role: 'student' | 'tutor'; content: string }>;
}

export interface FactCheckPiece {
  id: string;
  kind: 'teach' | 'item';
  payload: Record<string, unknown>;
}

/** Everything the stage-generation call needs to stay coherent with its world. */
export interface StageGenParams {
  world: {
    title: string;
    subject: string;
    topic: string;
    language: string;
    grade: number;
    arc: { intro: string; outro: string };
  };
  stagePlan: WorldStagePlan;
  stageIndex: number;
  stageCount: number;
  /** The previous stage's narrative beat — continuity for the writer. */
  previousBeat: string | null;
  /** Coarse note on the child's last-stage performance (adaptive ramp). */
  performanceNote: string | null;
  escalated: boolean;
}

export interface ContentProvider {
  readonly name: string;
  normalize(raw: {
    subject?: string;
    topic: string;
    language: string;
    grade?: number;
    interestText?: string;
  }): Promise<{ data: NormalizedRequest; model: string }>;
  generateContent(
    meta: Meta,
    opts: { escalated: boolean; notes?: string | null },
  ): Promise<{ content: McqContentSpec | ConnectContentSpec | ScenePlayContentSpec; model: string }>;
  /** ONE call: the WorldPlan plus stage-1 content (Lesson Worlds). */
  planWorld(params: {
    subject: string;
    topic: string;
    language: string;
    grade: number;
    /** Curated-lesson grounding, when the world came from the catalog. */
    focusConcepts?: string[];
    notes?: string | null;
    escalated: boolean;
  }): Promise<{ data: WorldCreateContent; model: string }>;
  /** One small call: a single stage's content, guided by the world plan. */
  generateStage(params: StageGenParams): Promise<{ data: StageContent; model: string }>;
  factcheck(
    pieces: FactCheckPiece[],
    context: { topic: string; grade: number; language: string },
  ): Promise<{ data: FactCheckReport; model: string }>;
  repair(params: {
    meta: Meta;
    teachCards: Array<{ id: string; text: string }>;
    failures: Array<{ item: unknown; reason: string }>;
    diagramSummary?: string;
    escalated: boolean;
  }): Promise<{ data: RepairItems | RepairSceneItems; model: string }>;
  feedback(params: {
    language: string;
    name: string;
    summary: Record<string, unknown>;
  }): Promise<{ data: EnrichedFeedback; model: string }>;
  tutorReply(params: TutorReplyParams): Promise<{ data: TutorReply; model: string }>;
}

export class LiveProvider implements ContentProvider {
  readonly name = 'live';

  async normalize(raw: { subject?: string; topic: string; language: string; grade?: number; interestText?: string }) {
    const res = await structuredCall({
      model: config.modelDefault,
      system: NORMALIZER_SYSTEM_PROMPT,
      user: JSON.stringify({
        subject: raw.subject ?? null,
        topic: raw.topic,
        language: raw.language,
        grade: raw.grade ?? null,
        interestText: raw.interestText ?? null,
      }),
      jsonSchema: normalizedRequestJsonSchema(),
      zodSchema: NormalizedRequestSchema,
      maxTokens: 800,
      stage: 'normalizer',
    });
    return { data: res.data, model: res.model };
  }

  async generateContent(meta: Meta, opts: { escalated: boolean; notes?: string | null }) {
    const model = opts.escalated ? config.modelEscalation : config.modelDefault;
    const user = JSON.stringify({
      gameType: meta.gameType,
      theme: meta.theme,
      subject: meta.subject,
      topic: meta.topic,
      language: meta.language,
      grade: meta.grade,
      difficultyBaseline: meta.difficulty,
      educationalLevelCount: meta.sessionLength - 1,
      // scene_play only: the child's interest kit — labels should live in this
      // world (kit is picked server-side; learning logic never changes with it)
      sceneKit: meta.gameType === 'scene_play' ? meta.wrapper ?? 'nature' : undefined,
      generatorNotes: opts.notes ?? null,
    });
    if (meta.gameType === 'draw_connect') {
      const res = await structuredCall({
        model,
        system: SPEC_SYSTEM_PROMPT,
        user,
        jsonSchema: contentSpecJsonSchema(meta.gameType),
        zodSchema: ConnectContentSpecSchema,
        maxTokens: 16000,
        stage: 'spec',
      });
      return { content: res.data, model: res.model };
    }
    if (meta.gameType === 'scene_play') {
      const res = await structuredCall({
        model,
        system: SPEC_SYSTEM_PROMPT,
        user,
        jsonSchema: contentSpecJsonSchema(meta.gameType),
        zodSchema: ScenePlayContentSpecSchema,
        maxTokens: 16000,
        stage: 'spec',
      });
      return { content: res.data, model: res.model };
    }
    const res = await structuredCall({
      model,
      system: SPEC_SYSTEM_PROMPT,
      user,
      jsonSchema: contentSpecJsonSchema(meta.gameType),
      zodSchema: McqContentSpecSchema,
      maxTokens: 16000,
      stage: 'spec',
    });
    return { content: res.data, model: res.model };
  }

  async planWorld(params: {
    subject: string;
    topic: string;
    language: string;
    grade: number;
    focusConcepts?: string[];
    notes?: string | null;
    escalated: boolean;
  }) {
    const res = await structuredCall({
      model: params.escalated ? config.modelEscalation : config.modelDefault,
      system: WORLD_PLAN_SYSTEM_PROMPT,
      user: JSON.stringify({
        subject: params.subject,
        topic: params.topic,
        language: params.language,
        grade: params.grade,
        focusConcepts: params.focusConcepts ?? null,
        plannerNotes: params.notes ?? null,
        // The closed tables the plan must pick from (validated server-side).
        allowedFamilies: STAGE_GENERATABLE_GAME_TYPES,
        allowedVariants: VARIANTS_BY_GAME,
        allowedThemes: THEMES,
        allowedKits: {
          scene_play: KITS_BY_GAME.scene_play,
          number_city: KITS_BY_GAME.number_city,
        },
      }),
      jsonSchema: worldCreateJsonSchema(),
      zodSchema: WorldCreateContentSchema,
      maxTokens: 10000,
      stage: 'world_plan',
    });
    return { data: res.data, model: res.model };
  }

  async generateStage(params: StageGenParams) {
    const res = await structuredCall({
      model: params.escalated ? config.modelEscalation : config.modelDefault,
      system: STAGE_SYSTEM_PROMPT,
      user: JSON.stringify({
        world: params.world,
        stage: params.stagePlan,
        stageIndex: params.stageIndex,
        stageCount: params.stageCount,
        previousBeat: params.previousBeat,
        performanceNote: params.performanceNote,
      }),
      jsonSchema: stageContentJsonSchema(params.stagePlan.gameType),
      zodSchema: stageContentSchemaFor(params.stagePlan.gameType),
      maxTokens: 6000,
      stage: 'stage_spec',
    });
    return { data: res.data as StageContent, model: res.model };
  }

  async factcheck(pieces: FactCheckPiece[], context: { topic: string; grade: number; language: string }) {
    const res = await structuredCall({
      model: config.modelDefault, // Haiku judge — ~$0.01/game
      system: FACTCHECK_SYSTEM_PROMPT,
      user: JSON.stringify({ context, pieces }),
      jsonSchema: factCheckJsonSchema(),
      zodSchema: FactCheckReportSchema,
      maxTokens: 8000,
      stage: 'factcheck',
    });
    return { data: res.data, model: res.model };
  }

  async repair(params: {
    meta: Meta;
    teachCards: Array<{ id: string; text: string }>;
    failures: Array<{ item: unknown; reason: string }>;
    diagramSummary?: string;
    escalated: boolean;
  }) {
    // scene_play repairs carry mechanic payloads (mapping, corrections,
    // palette…), so they use their own lean schema — the classic repair
    // schema stays small for mcq/connect.
    const scene = params.meta.gameType === 'scene_play';
    const user = buildRepairUserMessage({
      gameType: params.meta.gameType,
      language: params.meta.language,
      grade: params.meta.grade,
      topic: params.meta.topic,
      teachCards: params.teachCards,
      failures: params.failures,
      diagramSummary: params.diagramSummary,
    });
    if (scene) {
      const res = await structuredCall({
        model: params.escalated ? config.modelEscalation : config.modelDefault,
        system: REFINE_SYSTEM_PROMPT,
        user,
        jsonSchema: repairSceneItemsJsonSchema(),
        zodSchema: RepairSceneItemsSchema,
        maxTokens: 6000,
        stage: 'repair',
      });
      return { data: res.data, model: res.model };
    }
    const res = await structuredCall({
      model: params.escalated ? config.modelEscalation : config.modelDefault,
      system: REFINE_SYSTEM_PROMPT,
      user,
      jsonSchema: repairItemsJsonSchema(),
      zodSchema: RepairItemsSchema,
      maxTokens: 4000,
      stage: 'repair',
    });
    return { data: res.data, model: res.model };
  }

  async feedback(params: { language: string; name: string; summary: Record<string, unknown> }) {
    const res = await structuredCall({
      model: config.modelDefault,
      system: FEEDBACK_SYSTEM_PROMPT,
      user: JSON.stringify(params),
      jsonSchema: enrichedFeedbackJsonSchema(),
      zodSchema: EnrichedFeedbackSchema,
      maxTokens: 800,
      stage: 'feedback',
    });
    return { data: res.data, model: res.model };
  }

  async tutorReply(params: TutorReplyParams) {
    // The system prompt stays static (prompt-cached); everything volatile —
    // student profile, learning context, conversation history — rides the
    // user message, mirroring every other stage in this pipeline.
    const res = await structuredCall({
      model: config.modelDefault,
      system: TUTOR_SYSTEM_PROMPT,
      user: JSON.stringify({
        student: params.student,
        context: params.context,
        availableTools: params.availableTools,
        interactiveResult: params.interactiveResult,
        history: params.history,
        question: params.question,
      }),
      jsonSchema: tutorReplyJsonSchema(),
      zodSchema: TutorReplySchema,
      // Interactive payloads (items, order, buckets) need more room than a
      // text-only reply.
      maxTokens: 2500,
      stage: 'tutor',
    });
    return { data: res.data, model: res.model };
  }
}
