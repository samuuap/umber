/**
 * Trazabilidad de una petición: qué pidió quién, qué pasos dio el servidor y
 * cuánto tardó cada uno, y cada llamada a un modelo con sus tokens y su coste.
 *
 * Se crea al empezar la petición y se guarda al terminar, en una sola llamada a
 * `record_trace` con la secret key. Las llamadas a modelos las añaden
 * `src/lib/deepseek.ts` y `src/lib/embeddings.ts`, que exigen una traza: no hay
 * forma de llamar a un modelo sin que quede registrado.
 *
 * Una petición que no pasa el rate limit no deja traza, solo suma en el
 * contador diario: si dejara una fila, insistir llenaría la base. Y si guardar
 * falla, la petición no: se avisa en el log y sigue. Al contrario que el rate
 * limiting, perder una traza no deja nada abierto.
 */
import type { Json } from '@/lib/database.types';
import { requireSupabaseSecretKey } from '@/lib/env';
import { toError } from '@/lib/errors';
import { clientKey } from '@/lib/rate-limit';
import { getSupabaseAdminClient } from '@/lib/supabase';

export type TraceEndpoint = 'chat' | 'search';

/** Para qué se llamó al modelo: el panel agrupa el consumo por esto. */
export type CallPurpose =
  /** Primera llamada del turno: pregunta, recomienda de lo que queda o decide buscar. */
  | 'turn'
  /** Segunda llamada, con los resultados de la búsqueda. */
  | 'recommend'
  /** El embedding de una consulta. */
  | 'query_embedding'
  /** Tareas internas sin streaming (`complete`). */
  | 'task';

export interface ModelCall {
  readonly provider: 'deepseek' | 'embeddings';
  readonly model: string;
  readonly purpose: CallPurpose;
  readonly promptVersion: string | null;
  readonly status: 'ok' | 'error' | 'aborted';
  readonly error: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheHitTokens: number | null;
  readonly cacheMissTokens: number | null;
  readonly costUsd: number;
  /** Desde el inicio de la petición. */
  readonly startedMs: number;
  readonly firstTokenMs: number | null;
  readonly durationMs: number;
  readonly finishReason: string | null;
  readonly toolName: string | null;
  readonly toolArgs: Json;
}

interface TraceStep {
  readonly name: string;
  readonly startedMs: number;
  readonly durationMs: number;
  readonly ok: boolean;
}

export interface TraceOutcome {
  readonly status: number;
  readonly errorCode: string | null;
}

/** Lo que más puede tardar guardar la traza antes de rendirse: va antes de cerrar la respuesta. */
const SAVE_TIMEOUT_MS = 2_000;

let hmacKey: Promise<CryptoKey> | undefined;

/**
 * Agrupa las peticiones de una misma conexión sin guardar la IP: HMAC de la
 * clave del rate limit (la IP, o su /64 en IPv6) con la secret key. Con Web
 * Crypto, que está en Node y en Vercel sin dependencias.
 */
export async function hashClient(address: string | null): Promise<string> {
  const encoder = new TextEncoder();
  hmacKey ??= crypto.subtle.importKey(
    'raw',
    encoder.encode(requireSupabaseSecretKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', await hmacKey, encoder.encode(clientKey(address)));
  return [...new Uint8Array(signature)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export class RequestTrace {
  readonly id: string = crypto.randomUUID();
  readonly endpoint: TraceEndpoint;
  private readonly startedAt = performance.now();
  private readonly steps: TraceStep[] = [];
  private readonly calls: ModelCall[] = [];
  private firstByteMs: number | null = null;

  /** Pasó el rate limit: gastó cupo y deja traza completa. */
  admitted = false;
  userId: string | null = null;
  clientHash: string | null = null;
  conversationId: string | null = null;
  mode: string | null = null;
  language: string | null = null;
  message: string | null = null;
  reply: string | null = null;
  /** La búsqueda del turno: tipo, consulta y candidatos con su puntuación. */
  search: Json = null;
  recommendationIds: readonly string[] = [];
  unknownTitles: readonly string[] = [];
  /** Lo que ayuda a entender el turno: herramientas ofrecidas, preguntas seguidas… */
  readonly meta: { [key: string]: Json } = {};

  constructor(endpoint: TraceEndpoint) {
    this.endpoint = endpoint;
  }

  /** Milisegundos desde el inicio de la petición. */
  elapsed(): number {
    return Math.round(performance.now() - this.startedAt);
  }

  /** Mide un paso. Si falla, queda medido igual y el error sigue su camino. */
  async time<T>(name: string, work: Promise<T>): Promise<T> {
    const startedMs = this.elapsed();
    let ok = false;
    try {
      const result = await work;
      ok = true;
      return result;
    } finally {
      this.steps.push({ name, startedMs, durationMs: this.elapsed() - startedMs, ok });
    }
  }

  addCall(call: ModelCall): void {
    this.calls.push(call);
  }

  /** La persona ve el primer texto. Solo cuenta la primera vez. */
  markFirstByte(): void {
    this.firstByteMs ??= this.elapsed();
  }

  /** Guarda la traza. No lanza nunca: si falla, lo dice en el log. */
  async save(outcome: TraceOutcome): Promise<void> {
    const trace: Json = {
      id: this.id,
      endpoint: this.endpoint,
      admitted: this.admitted,
      user_id: this.userId,
      conversation_id: this.conversationId,
      client_hash: this.clientHash,
      mode: this.mode,
      language: this.language,
      status: outcome.status,
      error_code: outcome.errorCode,
      duration_ms: this.elapsed(),
      first_byte_ms: this.firstByteMs,
      message: this.message,
      reply: this.reply,
      search: this.search,
      recommendation_ids: [...this.recommendationIds],
      unknown_titles: [...this.unknownTitles],
      steps: this.steps.map((step) => ({ ...step })),
      meta: this.meta,
    };
    const calls: Json = this.calls.map((call) => ({
      provider: call.provider,
      model: call.model,
      purpose: call.purpose,
      prompt_version: call.promptVersion,
      status: call.status,
      error: call.error,
      input_tokens: call.inputTokens,
      output_tokens: call.outputTokens,
      cache_hit_tokens: call.cacheHitTokens,
      cache_miss_tokens: call.cacheMissTokens,
      cost_usd: call.costUsd,
      started_ms: call.startedMs,
      first_token_ms: call.firstTokenMs,
      duration_ms: call.durationMs,
      finish_reason: call.finishReason,
      tool_name: call.toolName,
      tool_args: call.toolArgs,
    }));

    try {
      const { error } = await getSupabaseAdminClient()
        .rpc('record_trace', { p_trace: trace, p_calls: calls })
        .abortSignal(AbortSignal.timeout(SAVE_TIMEOUT_MS));
      if (error !== null) throw new Error(error.message);
    } catch (error: unknown) {
      console.warn(`[trace] No se pudo guardar la traza ${this.id}: ${toError(error).message}`);
    }
  }
}
