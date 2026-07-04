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
} from '@edumind/shared';
import {
  ConnectContentSpecSchema,
  FactCheckReportSchema,
  McqContentSpecSchema,
  NormalizedRequestSchema,
  EnrichedFeedbackSchema,
  RepairItemsSchema,
  contentSpecJsonSchema,
  factCheckJsonSchema,
  normalizedRequestJsonSchema,
  enrichedFeedbackJsonSchema,
  repairItemsJsonSchema,
} from '@edumind/shared';
import { config } from '../config.js';
import { structuredCall } from '../llm/anthropic.js';
import {
  FACTCHECK_SYSTEM_PROMPT,
  FEEDBACK_SYSTEM_PROMPT,
  NORMALIZER_SYSTEM_PROMPT,
  REFINE_SYSTEM_PROMPT,
  SPEC_SYSTEM_PROMPT,
  TUTOR_SYSTEM_PROMPT,
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
    /** Middle-school context lens chosen by the student (server-stored). */
    learningContext: string | null;
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
  ): Promise<{ content: McqContentSpec | ConnectContentSpec; model: string }>;
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
  }): Promise<{ data: RepairItems; model: string }>;
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
    const isConnect = meta.gameType === 'draw_connect';
    const user = JSON.stringify({
      gameType: meta.gameType,
      theme: meta.theme,
      subject: meta.subject,
      topic: meta.topic,
      language: meta.language,
      grade: meta.grade,
      difficultyBaseline: meta.difficulty,
      educationalLevelCount: meta.sessionLength - 1,
      generatorNotes: opts.notes ?? null,
    });
    if (isConnect) {
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
    const res = await structuredCall({
      model: params.escalated ? config.modelEscalation : config.modelDefault,
      system: REFINE_SYSTEM_PROMPT,
      user: buildRepairUserMessage({
        gameType: params.meta.gameType,
        language: params.meta.language,
        grade: params.meta.grade,
        topic: params.meta.topic,
        teachCards: params.teachCards,
        failures: params.failures,
        diagramSummary: params.diagramSummary,
      }),
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
