/**
 * Qwen tutor provider — Ask Hudhud ONLY. Implements the narrow TutorProvider
 * seam (pipeline/provider.ts); every content-generation stage (normalize,
 * spec, factcheck, repair, feedback) keeps its existing provider untouched.
 *
 * Safety model (same posture as the Anthropic path):
 *  - The API key comes from the environment (config.ts), rides only the
 *    Authorization header, and is never logged, thrown, or echoed to clients.
 *  - Qwen's output is untrusted: it must parse as JSON and pass the SAME
 *    TutorReplySchema Zod gate the Anthropic path uses. The route then applies
 *    its own gates on top (tool eligibility, semantic payload validation,
 *    result integrity) exactly as before — this provider changes WHO writes
 *    the reply, never what is allowed through.
 *  - Every failure (HTTP error, timeout, non-JSON, schema mismatch) falls
 *    back to the regular provider, so a Qwen outage degrades to the previous
 *    behavior instead of a broken tutor.
 */
import type { z } from 'zod';
import { metrics } from '../pipeline/metrics.js';
import type { TutorProvider, TutorReplyParams } from '../pipeline/provider.js';
import { TutorReplySchema, type TutorReply } from '../tutor/contract.js';
import { emptyToolData } from '../tutor/tools/registry.js';
import { TUTOR_SYSTEM_PROMPT } from './prompts.js';

/**
 * Qwen's OpenAI-compatible json_object mode guarantees JSON but not OUR
 * shape, so the shape is stated in the system prompt (built once at import —
 * a static string, provider-side caching still applies) and the reply is
 * Zod-validated regardless.
 *
 * Deliberately a concrete SKELETON, not a JSON-Schema dump: live testing
 * showed qwen3 frequently echoes a pasted schema back verbatim
 * ({"type":"object","properties":…}) instead of producing an instance.
 * Models follow examples; they parrot schemas.
 */
const QWEN_SYSTEM_PROMPT = `${TUTOR_SYSTEM_PROMPT}

OUTPUT FORMAT (STRICT)
Return ONLY the reply object itself as one JSON object — never a JSON Schema, never markdown fences, never commentary. Exactly this shape:
{"message": "<the reply text>", "responseType": "explanation|hint|question|encouragement|correction|next_step", "followUpQuestion": "<one short question>" | null, "suggestedAction": "none|try_again|show_hint|real_life_example|open_related_experience|ask_followup", "relatedConcept": "<curriculum concept>" | null, "needsClarification": true|false, "interactivePayload": null | {"type": "<tool id from availableTools>", "version": <the tool's version number>, "title": "<short title>", "instructions": "<one sentence>", "data": {<only the selected tool's fields as documented above; unused fields may be omitted>}, "expectedLearningAction": "<what acting should teach>", "followUpPrompt": "<how you will follow up>"}, "suggestedInteraction": null | {"mechanic": "<mechanic id>", "reason": "<one line>", "conceptFamily": "<concept>" | null}}
"message" is REQUIRED and always the student-facing text — a reply that is only an activity object is invalid.`;

export interface QwenTutorProviderOptions {
  apiKey: string;
  /** OpenAI-compatible base URL, no trailing slash (…/compatible-mode/v1). */
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /**
   * Completion budget. Reasoning models (qwen3) spend this on hidden
   * reasoning BEFORE the visible JSON, so it must be generous — a tight
   * budget truncates the JSON and the reply falls back. Default 4096.
   */
  maxTokens?: number;
  /** Where a failed/invalid/slow Qwen call degrades to — never left unanswered. */
  fallback: TutorProvider;
  /** Injectable for tests — mocked responses, never a real API. */
  fetchImpl?: typeof fetch;
  logger?: { warn: (obj: unknown, msg?: string) => void };
}

export class QwenTutorProvider implements TutorProvider {
  readonly name = 'qwen';

  constructor(private readonly opts: QwenTutorProviderOptions) {}

  async tutorReply(params: TutorReplyParams): Promise<{ data: TutorReply; model: string }> {
    try {
      const data = await this.call(params);
      metrics.bump('tutor_qwen_ok');
      return { data, model: this.opts.model };
    } catch (err) {
      // The message is safe by construction (see call()) — never the key,
      // never a response body.
      metrics.bump('tutor_qwen_fallback');
      this.opts.logger?.warn(
        { reason: (err as Error).message },
        '[tutor] qwen reply failed — falling back',
      );
      return this.opts.fallback.tutorReply(params);
    }
  }

  /** One schema-gated chat call. Throws only key-free, body-free messages. */
  private async call(params: TutorReplyParams): Promise<TutorReply> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${this.opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          // Same volatile user payload as the Anthropic path: identity from
          // the authenticated row, context, server-computed availableTools,
          // gate-approved interactiveResult, conversation history.
          messages: [
            { role: 'system', content: QWEN_SYSTEM_PROMPT },
            {
              role: 'user',
              content: JSON.stringify({
                student: params.student,
                context: params.context,
                availableTools: params.availableTools,
                interactiveResult: params.interactiveResult,
                history: params.history,
                question: params.question,
              }),
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: this.opts.maxTokens ?? 4096,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new Error(
        (err as Error).name === 'AbortError'
          ? `qwen timeout after ${this.opts.timeoutMs}ms`
          : 'qwen request failed',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new Error(`qwen http ${res.status}`);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error('qwen returned non-JSON body');
    }
    const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })
      ?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error('qwen response missing message content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(content));
    } catch {
      throw new Error('qwen reply is not valid JSON');
    }

    const normalized = normalizeReply(parsed);
    const valid = (TutorReplySchema as z.ZodType<TutorReply>).safeParse(normalized);
    if (valid.success) return valid.data;

    // Envelope rescue: when ONLY the activity payload is malformed (e.g.
    // items without ids — unrecoverable), the honest degradation is the
    // model's own text WITHOUT the broken activity — same rule the route's
    // semantic gate applies — not a canned fallback reply mid-conversation.
    const payloadOnly = valid.error.issues.every((i) => i.path[0] === 'interactivePayload');
    if (payloadOnly && normalized !== null && typeof normalized === 'object') {
      const retry = (TutorReplySchema as z.ZodType<TutorReply>).safeParse({
        ...(normalized as Record<string, unknown>),
        interactivePayload: null,
      });
      if (retry.success) {
        metrics.bump('tutor_qwen_payload_dropped');
        return retry.data;
      }
    }

    // Issue paths only — never model text — so logs stay content-free.
    const issues = valid.error.issues.slice(0, 3).map((i) => i.path.join('.')).join(', ');
    throw new Error(`qwen reply failed schema validation (${issues})`);
  }
}

/** Defensive: some models fence JSON in markdown despite instructions. */
function stripFences(text: string): string {
  const t = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return fenced ? fenced[1]! : t;
}

/**
 * Normalize a Qwen reply onto the contract's flat shapes BEFORE validation.
 * Anthropic's constrained decoding always emits every key; Qwen's
 * json_object mode does not, and the contract's flat fields are nullable
 * but NOT optional — so an omitted key (the model's natural behavior for
 * fields it doesn't use) would fail the whole reply and force a fallback.
 * Filling ABSENT keys with null is safe (null was always allowed); a key
 * that is PRESENT with a wrong type is never touched and still rejects.
 * The route's semantic gates run unchanged downstream.
 */
function normalizeReply(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
  const reply = parsed as Record<string, unknown>;
  for (const key of ['followUpQuestion', 'relatedConcept', 'interactivePayload', 'suggestedInteraction'] as const) {
    if (!(key in reply)) reply[key] = null;
  }
  const payload = reply.interactivePayload;
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    const data = p.data;
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      // Same fill the registry applies to goldens (registry.emptyToolData).
      const filled = { ...emptyToolData(), ...(data as Record<string, unknown>) } as Record<string, unknown>;
      // Nested nullable-but-required key: an order/timeline item has no
      // bucket, and the model naturally omits bucketId rather than null it.
      if (Array.isArray(filled.items)) {
        filled.items = filled.items.map((item) =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
            ? { bucketId: null, ...(item as Record<string, unknown>) }
            : item,
        );
      }
      p.data = filled;
    }
  }
  const suggestion = reply.suggestedInteraction;
  if (suggestion !== null && typeof suggestion === 'object' && !Array.isArray(suggestion)) {
    const s = suggestion as Record<string, unknown>;
    if (!('conceptFamily' in s)) s.conceptFamily = null;
  }
  return reply;
}
