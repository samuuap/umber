/**
 * Cliente de DeepSeek.
 *
 * La API de DeepSeek es compatible con el SDK de OpenAI, así que reutilizamos ese
 * SDK apuntando a `https://api.deepseek.com`.
 *
 * Los embeddings NO salen de aquí: DeepSeek no expone endpoint de embeddings.
 * Viven en `src/lib/embeddings.ts`, contra un modelo Qwen3 servido aparte.
 *
 * Es también la pasarela de DeepSeek: toda llamada exige una traza
 * (`src/lib/trace.ts`) y queda registrada con sus tokens, su coste estimado, el
 * tiempo hasta el primer token y la herramienta que llamó.
 *
 * Reglas del proyecto:
 *  - El chat va SIEMPRE en streaming (mejor percepción de latencia).
 *  - Temperatura 0.8 para conversar, 0.1 para clasificar o extraer.
 *  - Máximo 600 tokens de respuesta.
 *  - Sin razonamiento: ver `THINKING_DISABLED`.
 */
import OpenAI from 'openai';

import type { Json } from '@/lib/database.types';
import { env } from '@/lib/env';
import { DeepSeekError, toError } from '@/lib/errors';
import { deepSeekCost } from '@/lib/llm-pricing';
import type { CallPurpose, RequestTrace } from '@/lib/trace';
import type { ChatMessage } from '@/lib/types';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export const DEEPSEEK_MODELS = {
  /**
   * Conversación de Umber. `deepseek-flash` (DeepSeek-V4.1-Flash) es el modelo
   * estándar actual y el mejor calidad/precio para esta tarea: los candidatos
   * llegan ya seleccionados por la búsqueda vectorial, así que el modelo solo
   * tiene que elegir uno y redactar 600 tokens con voz propia.
   */
  chat: 'deepseek-flash',
} as const;

export const DEEPSEEK_TEMPERATURE = {
  /** Umber conversando: queremos voz propia, no un resumen plano. */
  chat: 0.8,
  /** Clasificación y extracción estructurada: casi determinista. */
  extraction: 0.1,
} as const;

export const DEEPSEEK_MAX_TOKENS = 600;

/**
 * `deepseek-flash` razona por defecto, y esos tokens cuentan contra `max_tokens`.
 * Medido con prompts y candidatos reales: razonando con 600 tokens, una de cada
 * tres respuestas llegó vacía; con 3.000, la primera palabra tardaba hasta 6,3 s
 * y la elección no mejoraba. Sin razonar llega en menos de un segundo. Los modos
 * `weekend` y `month` podrán activarlo, con más `max_tokens`, porque planificar
 * varios días sí se beneficia de pensar.
 */
const THINKING_DISABLED = { type: 'disabled' } as const;

/** `thinking` es propio de DeepSeek: el SDK de OpenAI no lo tipa, pero lo envía en el cuerpo. */
type DeepSeekParams<T> = T & { readonly thinking: typeof THINKING_DISABLED };

let client: OpenAI | undefined;

/** Cliente DeepSeek. Singleton perezoso: se crea en la primera petición. */
export function getDeepSeekClient(): OpenAI {
  client ??= new OpenAI({
    apiKey: env.deepseek.apiKey,
    baseURL: DEEPSEEK_BASE_URL,
  });
  return client;
}

/** Una herramienta que el modelo puede llamar, con sus parámetros en JSON Schema. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  /** JSON sin validar: lo interpreta quien la ejecuta. */
  readonly arguments: string;
}

/** Una llamada del modelo a una herramienta y lo que devolvió, para la segunda vuelta. */
export interface ToolRound {
  readonly call: ToolCall;
  readonly result: string;
}

/**
 * `none` impide llamar a herramientas, `required` obliga, `auto` lo decide el
 * modelo. Es como el servidor hace cumplir las reglas de la conversación sin
 * depender de que el modelo las recuerde.
 */
export type ToolChoice = 'auto' | 'none' | 'required';

export interface ChatRequestOptions {
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolDefinition[];
  /** Solo con `tools`. Por defecto `auto`. */
  readonly toolChoice?: ToolChoice;
  /** La llamada anterior del modelo a una herramienta y su resultado, que van al final. */
  readonly toolRound?: ToolRound;
  /** Por defecto `DEEPSEEK_TEMPERATURE.chat`. */
  readonly temperature?: number;
  /** Por defecto `DEEPSEEK_MAX_TOKENS`. */
  readonly maxTokens?: number;
  /** Para cortar la generación si el cliente abandona la petición. */
  readonly signal?: AbortSignal;
  /** Dónde queda registrada la llamada. Obligatoria: no hay llamadas sin registrar. */
  readonly trace: RequestTrace;
  readonly purpose: CallPurpose;
  /** Versión de los prompts (`PROMPT_VERSION`), para comparar versiones en el panel. */
  readonly promptVersion?: string;
}

export type ChunkStream = AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

function toSdkMessages(
  messages: readonly ChatMessage[],
  toolRound: ToolRound | undefined,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const sdk: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  if (toolRound !== undefined) {
    const { call, result } = toolRound;
    sdk.push(
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } },
        ],
      },
      { role: 'tool', tool_call_id: call.id, content: result },
    );
  }
  return sdk;
}

function toSdkTools(
  tools: readonly ToolDefinition[] | undefined,
): OpenAI.Chat.Completions.ChatCompletionTool[] | undefined {
  return tools?.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: { ...tool.parameters } },
  }));
}

/** Lo que DeepSeek manda en `usage`, con sus dos campos de caché, que el SDK no tipa. */
interface DeepSeekUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
}

function readUsage(usage: unknown): DeepSeekUsage | null {
  if (typeof usage !== 'object' || usage === null) return null;
  const number = (key: string): number | null => {
    const value: unknown = (usage as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : null;
  };
  const promptTokens = number('prompt_tokens');
  const completionTokens = number('completion_tokens');
  if (promptTokens === null || completionTokens === null) return null;
  const cacheHitTokens = number('prompt_cache_hit_tokens') ?? 0;
  return {
    promptTokens,
    completionTokens,
    cacheHitTokens,
    // Sin el desglose, todo cuenta como fuera de caché: el coste sale por arriba, no por abajo.
    cacheMissTokens: number('prompt_cache_miss_tokens') ?? promptTokens - cacheHitTokens,
  };
}

/** Los argumentos de una herramienta como JSON, o tal cual si no lo son. */
function toolArgsJson(raw: string): Json {
  try {
    return JSON.parse(raw) as Json;
  } catch {
    return { raw };
  }
}

/** Una llamada en curso: se va completando con lo que llega y se registra al acabar. */
class CallRecorder {
  private readonly startedAt = new Date();
  private readonly startedMs: number;
  private firstTokenMs: number | null = null;
  private usage: DeepSeekUsage | null = null;
  private finishReason: string | null = null;
  private toolName = '';
  private toolArgs = '';
  private finished = false;
  private readonly options: ChatRequestOptions;

  constructor(options: ChatRequestOptions) {
    this.options = options;
    this.startedMs = options.trace.elapsed();
  }

  observe(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): void {
    const choice = chunk.choices[0];
    const delta = choice?.delta;
    const hasContent = typeof delta?.content === 'string' && delta.content.length > 0;
    const toolParts = delta?.tool_calls ?? [];
    if (this.firstTokenMs === null && (hasContent || toolParts.length > 0)) {
      this.firstTokenMs = this.options.trace.elapsed();
    }
    // Se registra la primera herramienta: el chat solo hace una llamada por turno.
    for (const part of toolParts.filter((item) => item.index === 0)) {
      this.toolName += part.function?.name ?? '';
      this.toolArgs += part.function?.arguments ?? '';
    }
    if (choice?.finish_reason != null) this.finishReason = choice.finish_reason;
    this.usage = readUsage(chunk.usage) ?? this.usage;
  }

  /** Una respuesta entera, sin streaming. */
  observeCompletion(response: OpenAI.Chat.Completions.ChatCompletion): void {
    this.firstTokenMs = this.options.trace.elapsed();
    this.finishReason = response.choices[0]?.finish_reason ?? null;
    this.usage = readUsage(response.usage);
  }

  finish(status: 'ok' | 'error' | 'aborted', error: unknown): void {
    if (this.finished) return;
    this.finished = true;
    const { trace, purpose, promptVersion } = this.options;
    const usage = this.usage;
    trace.addCall({
      provider: 'deepseek',
      model: DEEPSEEK_MODELS.chat,
      purpose,
      promptVersion: promptVersion ?? null,
      status,
      error: error === null ? null : toError(error).message.slice(0, 500),
      inputTokens: usage?.promptTokens ?? null,
      outputTokens: usage?.completionTokens ?? null,
      cacheHitTokens: usage?.cacheHitTokens ?? null,
      cacheMissTokens: usage?.cacheMissTokens ?? null,
      costUsd:
        usage === null
          ? 0
          : deepSeekCost(
              DEEPSEEK_MODELS.chat,
              {
                cacheHitTokens: usage.cacheHitTokens,
                cacheMissTokens: usage.cacheMissTokens,
                outputTokens: usage.completionTokens,
              },
              this.startedAt,
            ),
      startedMs: this.startedMs,
      firstTokenMs: this.firstTokenMs,
      durationMs: trace.elapsed() - this.startedMs,
      finishReason: this.finishReason,
      toolName: this.toolName.length > 0 ? this.toolName : null,
      toolArgs: this.toolName.length > 0 ? toolArgsJson(this.toolArgs) : null,
    });
  }

  /** Cortada por la persona (cerró el chat) o fallo de verdad. */
  statusOf(): 'error' | 'aborted' {
    return this.options.signal?.aborted === true ? 'aborted' : 'error';
  }
}

/**
 * Pasa los chunks tal cual y, al acabar el stream (entero, cortado o con error),
 * registra la llamada. Si quien lo lee deja de leer, cuenta como cortada.
 */
async function* recorded(stream: ChunkStream, recorder: CallRecorder): ChunkStream {
  let status: 'ok' | 'error' | 'aborted' = 'aborted';
  let failure: unknown = null;
  try {
    for await (const chunk of stream) {
      recorder.observe(chunk);
      yield chunk;
    }
    status = 'ok';
  } catch (error: unknown) {
    status = recorder.statusOf();
    failure = error;
    throw error;
  } finally {
    recorder.finish(status, failure);
  }
}

/**
 * Llamada de chat en streaming. Devuelve los chunks crudos del SDK, por si el
 * endpoint necesita leer `usage` o `finish_reason`.
 *
 * La promesa se resuelve al llegar las cabeceras de la respuesta, así que los
 * errores del proveedor (clave, saldo, límite de peticiones) saltan aquí y no a
 * mitad del stream: el endpoint aún puede responder con un código HTTP.
 *
 * `include_usage`: DeepSeek manda los tokens en un último chunk sin `choices`,
 * con los de caché aparte.
 */
export async function streamChat(options: ChatRequestOptions): Promise<ChunkStream> {
  const tools = toSdkTools(options.tools);
  const body: DeepSeekParams<OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming> = {
    model: DEEPSEEK_MODELS.chat,
    messages: toSdkMessages(options.messages, options.toolRound),
    temperature: options.temperature ?? DEEPSEEK_TEMPERATURE.chat,
    max_tokens: options.maxTokens ?? DEEPSEEK_MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
    thinking: THINKING_DISABLED,
    ...(tools === undefined ? {} : { tools, tool_choice: options.toolChoice ?? 'auto' }),
  };
  const recorder = new CallRecorder(options);
  try {
    const stream = await getDeepSeekClient().chat.completions.create(
      body,
      options.signal === undefined ? undefined : { signal: options.signal },
    );
    return recorded(stream, recorder);
  } catch (error: unknown) {
    recorder.finish(recorder.statusOf(), error);
    throw new DeepSeekError(`Fallo al abrir el stream de chat: ${toError(error).message}`, error);
  }
}

export type TurnEvent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_call'; readonly call: ToolCall };

/**
 * Un stream ya abierto como eventos: el texto según llega y, al final, las
 * llamadas a herramientas. Los argumentos de una llamada llegan troceados en
 * varios fragmentos, identificados por su `index`: se juntan antes de emitirla.
 */
export async function* turnEvents(stream: ChunkStream): AsyncGenerator<TurnEvent> {
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  try {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta === undefined) continue;
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        yield { type: 'text', text: delta.content };
      }
      for (const part of delta.tool_calls ?? []) {
        const call = calls.get(part.index) ?? { id: '', name: '', arguments: '' };
        if (part.id !== undefined) call.id = part.id;
        call.name += part.function?.name ?? '';
        call.arguments += part.function?.arguments ?? '';
        calls.set(part.index, call);
      }
    }
  } catch (error: unknown) {
    throw new DeepSeekError(`El stream de chat se cortó: ${toError(error).message}`, error);
  }
  for (const call of calls.values()) {
    if (call.name.length > 0) yield { type: 'tool_call', call };
  }
}

/**
 * Llamada sin streaming. Solo para tareas internas y deterministas (clasificar
 * el modo, extraer entidades del mensaje). Nunca para la respuesta al usuario.
 */
export async function complete(options: ChatRequestOptions): Promise<string> {
  const body: DeepSeekParams<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming> = {
    model: DEEPSEEK_MODELS.chat,
    messages: toSdkMessages(options.messages, options.toolRound),
    temperature: options.temperature ?? DEEPSEEK_TEMPERATURE.extraction,
    max_tokens: options.maxTokens ?? DEEPSEEK_MAX_TOKENS,
    stream: false,
    thinking: THINKING_DISABLED,
  };
  const recorder = new CallRecorder(options);
  try {
    const response = await getDeepSeekClient().chat.completions.create(
      body,
      options.signal === undefined ? undefined : { signal: options.signal },
    );
    recorder.observeCompletion(response);

    const content = response.choices[0]?.message.content;
    if (content === undefined || content === null) {
      throw new DeepSeekError('DeepSeek devolvió una respuesta sin contenido.');
    }
    recorder.finish('ok', null);
    return content;
  } catch (error: unknown) {
    recorder.finish(recorder.statusOf(), error);
    if (error instanceof DeepSeekError) throw error;
    throw new DeepSeekError(`Fallo en la llamada a DeepSeek: ${toError(error).message}`, error);
  }
}
