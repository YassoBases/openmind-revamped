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
import { TutorReplySchema, tutorReplyJsonSchema, type TutorReply } from '../tutor/contract.js';
import { TUTOR_SYSTEM_PROMPT } from './prompts.js';

/**
 * Qwen's OpenAI-compatible json_object mode guarantees JSON but not OUR
 * shape, so the schema is stated explicitly in the system prompt (built once
 * at import — a static string, provider-side caching still applies) and the
 * reply is Zod-validated regardless.
 */
const QWEN_SYSTEM_PROMPT = `${TUTOR_SYSTEM_PROMPT}

OUTPUT FORMAT (STRICT)
Respond with ONLY one JSON object — no markdown fences, no commentary — matching this JSON Schema exactly (every property present; use null where allowed):
${JSON.stringify(tutorReplyJsonSchema())}`;

export interface QwenTutorProviderOptions {
  apiKey: string;
  /** OpenAI-compatible base URL, no trailing slash (…/compatible-mode/v1). */
  baseUrl: string;
  model: string;
  timeoutMs: number;
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
          max_tokens: 2500,
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

    const valid = (TutorReplySchema as z.ZodType<TutorReply>).safeParse(parsed);
    if (!valid.success) {
      // Issue paths only — never model text — so logs stay content-free.
      const issues = valid.error.issues.slice(0, 3).map((i) => i.path.join('.')).join(', ');
      throw new Error(`qwen reply failed schema validation (${issues})`);
    }
    return valid.data;
  }
}

/** Defensive: some models fence JSON in markdown despite instructions. */
function stripFences(text: string): string {
  const t = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return fenced ? fenced[1]! : t;
}
