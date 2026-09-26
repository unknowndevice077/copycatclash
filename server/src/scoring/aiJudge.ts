import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config } from '../config';
import { RUBRIC_SYSTEM, pairInstruction, singleInstruction } from './rubricPrompt';

const Verdict = z.object({
  score: z.number().min(0).max(100),
  reason: z.string().min(1).max(200),
});
export type Verdict = z.infer<typeof Verdict>;

const PairVerdict = z.object({ X: Verdict, Y: Verdict });

const verdictSchema = {
  type: 'object',
  properties: { score: { type: 'number' }, reason: { type: 'string' } },
  required: ['score', 'reason'],
  additionalProperties: false,
} as const;

const pairSchema = {
  type: 'object',
  properties: { X: verdictSchema, Y: verdictSchema },
  required: ['X', 'Y'],
  additionalProperties: false,
} as const;

/** Thrown when the model answered but the JSON did not validate (eligible for one retry). */
export class MalformedVerdictError extends Error {}

/** Thrown when the model declined to judge. */
export class JudgeRefusalError extends Error {}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!config.ai.apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  // Retries are handled by the scoring service's deadline, not the SDK.
  client ??= new Anthropic({ apiKey: config.ai.apiKey, maxRetries: 0 });
  return client;
}

export function aiConfigured(): boolean {
  return Boolean(config.ai.apiKey);
}

function jpegBlock(data: Buffer): Anthropic.ImageBlockParam {
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: data.toString('base64') } };
}

async function ask(content: Anthropic.ContentBlockParam[], schema: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const response = await getClient().messages.create(
    {
      model: config.ai.model,
      max_tokens: 400,
      system: RUBRIC_SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema } },
    },
    { signal, timeout: config.ai.timeoutMs },
  );
  if (response.stop_reason === 'refusal') throw new JudgeRefusalError('judge declined to score');
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  try {
    // Tolerate stray code fences in case the configured model ignores structured output.
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new MalformedVerdictError(`unparseable judge output: ${text.slice(0, 120)}`);
  }
}

async function withJsonRetry<T>(fn: () => Promise<unknown>, schema: z.ZodType<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const parsed = schema.safeParse(await fn());
      if (parsed.success) return parsed.data;
      throw new MalformedVerdictError(parsed.error.message);
    } catch (err) {
      if (err instanceof MalformedVerdictError && attempt === 0) continue;
      throw err;
    }
  }
}

/** Judges one drawing against the reference. Images must be normalised JPEGs. */
export function judgeSingle(reference: Buffer, drawing: Buffer, signal: AbortSignal): Promise<Verdict> {
  const content: Anthropic.ContentBlockParam[] = [jpegBlock(reference), jpegBlock(drawing), { type: 'text', text: singleInstruction() }];
  return withJsonRetry(() => ask(content, verdictSchema, signal), Verdict);
}

/**
 * Judges both drawings in a single call to reduce relative bias.
 * Drawings are randomly assigned to labels X/Y so the model can't favour a position.
 */
export async function judgePair(reference: Buffer, a: Buffer, b: Buffer, signal: AbortSignal): Promise<{ A: Verdict; B: Verdict }> {
  const aIsX = Math.random() < 0.5;
  const [x, y] = aIsX ? [a, b] : [b, a];
  const content: Anthropic.ContentBlockParam[] = [jpegBlock(reference), jpegBlock(x), jpegBlock(y), { type: 'text', text: pairInstruction() }];
  const verdict = await withJsonRetry(() => ask(content, pairSchema, signal), PairVerdict);
  return aIsX ? { A: verdict.X, B: verdict.Y } : { A: verdict.Y, B: verdict.X };
}

/** API errors that mean "switch to fallback now" rather than "the answer was bad". */
export function isApiUnavailable(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError ||
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError ||
    (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500)
  );
}
