/**
 * El estado de una conversación con Umber, sacado del historial: cuántas
 * preguntas lleva, qué buscó la última vez y qué candidatos le quedan.
 *
 * Cómo conversa (decisión de producto, ver `docs/fase-4-api-chat.md`):
 *  1. Antes de buscar pregunta para entender qué quiere: al menos tres veces y
 *     como mucho cinco (Fase 8; antes, de dos a cuatro). Si la persona se
 *     enrolla, cierra con una pregunta que lleve a buscar. Si pide que le
 *     recomiende ya, no insiste (`wantsToSkipQuestions`).
 *  2. Busca con un resumen del ánimo que escribe él (`buscar_titulos`).
 *  3. Si le piden otra, saca la siguiente de esos candidatos sin volver a
 *     buscar, hasta agotarlos. Cuando se acaban, o si el ánimo cambia, busca de
 *     nuevo.
 *  4. Si nombran un título concreto, lo comprueba con `buscar_por_titulo` en
 *     cualquier turno: pedir un título no es un ánimo que haya que entender.
 *
 * El mínimo y el máximo de preguntas los hace cumplir el servidor con las
 * herramientas que ofrece y `tool_choice`: no depende de que el modelo los
 * recuerde.
 */
import { UUID_PATTERN } from '@/lib/api';
import type { ToolChoice } from '@/lib/deepseek';
import type {
  AssistantTurnMeta,
  ChatHistoryMessage,
  SearchCandidateRef,
  TurnSearch,
} from '@/lib/types';

/**
 * Decisión de producto (2026-10-04, Fase 8): un experto pregunta más que dos
 * cosas. Con 3–5 frente a 2–4, medido con `scripts/eval-dialogue.mjs` (ver
 * docs/fase-8). Preguntar por gustos (algo que le encantó) es lo que más afina.
 */
export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 5;
/** Un resumen del ánimo son una o dos frases; más es que el modelo se ha ido de madre. */
export const MAX_SUMMARY_CHARS = 500;
/** Los que se pasan al modelo en cada búsqueda: `DEFAULT_CANDIDATE_COUNT`. */
const MAX_CANDIDATES = 10;

// ─── Validación ──────────────────────────────────────────────────────────────

function isContentId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function parseCandidate(value: unknown): SearchCandidateRef | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, similarity } = value as Record<string, unknown>;
  return isContentId(id) && typeof similarity === 'number' && Number.isFinite(similarity)
    ? { id, similarity }
    : null;
}

function parseSearch(value: unknown): TurnSearch | null {
  if (typeof value !== 'object' || value === null) return null;
  const { summary, candidates } = value as Record<string, unknown>;
  if (typeof summary !== 'string' || summary.length === 0 || summary.length > MAX_SUMMARY_CHARS) {
    return null;
  }
  if (!Array.isArray(candidates) || candidates.length > MAX_CANDIDATES) return null;
  const parsed = candidates.map(parseCandidate);
  return parsed.every((item): item is SearchCandidateRef => item !== null)
    ? { summary, candidates: parsed }
    : null;
}

/**
 * Lo que recuerda un mensaje de Umber, venga de Supabase o del navegador. Lo mal
 * formado se descarta sin perder el mensaje: solo se pierde el estado de ese
 * turno. Un id del navegador que no es del corpus no llega a nada: los
 * candidatos se vuelven a leer de la base.
 */
export function parseTurnMeta(record: Readonly<Record<string, unknown>>): AssistantTurnMeta {
  const search = parseSearch(record['search']);
  const ids = record['recommendation_ids'];
  return {
    ...(search === null ? {} : { search }),
    ...(Array.isArray(ids) && ids.length <= MAX_CANDIDATES && ids.every(isContentId)
      ? { recommendation_ids: ids }
      : {}),
  };
}

// ─── Estado ──────────────────────────────────────────────────────────────────

export interface ConversationState {
  /** La última búsqueda, o `null` si aún no ha buscado. */
  readonly lastSearch: TurnSearch | null;
  /** Los candidatos de esa búsqueda que aún no ha recomendado, en su orden. */
  readonly remaining: readonly SearchCandidateRef[];
  readonly recommendedIds: ReadonlySet<string>;
  /** Respuestas seguidas de Umber, al final, sin buscar ni recomendar: sus preguntas. */
  readonly pendingQuestions: number;
}

function isQuestion(message: ChatHistoryMessage): boolean {
  return message.search === undefined && (message.recommendation_ids ?? []).length === 0;
}

export function conversationState(history: readonly ChatHistoryMessage[]): ConversationState {
  const assistant = history.filter((message) => message.role === 'assistant');
  const recommendedIds = new Set(assistant.flatMap((message) => message.recommendation_ids ?? []));
  const lastSearch = assistant.findLast((message) => message.search !== undefined)?.search ?? null;

  let pendingQuestions = 0;
  for (let index = assistant.length - 1; index >= 0; index -= 1) {
    const message = assistant[index];
    if (message === undefined || !isQuestion(message)) break;
    pendingQuestions += 1;
  }

  return {
    lastSearch,
    remaining: (lastSearch?.candidates ?? []).filter((candidate) => !recommendedIds.has(candidate.id)),
    recommendedIds,
    pendingQuestions,
  };
}

/**
 * Pide que le recomiende ya, sin más preguntas: «recomiéndame ya», «sin
 * preguntas», «sorpréndeme», «tú eliges». Preguntar cinco veces a quien tiene
 * prisa es peor que preguntar poco.
 */
const SKIP_QUESTIONS_PATTERN =
  /\b(sin (m[aá]s )?preguntas|no me (hagas m[aá]s preguntas|preguntes m[aá]s)|recomi[eé]nd(ame|a) (algo )?(ya|directamente)|dime (una|algo|cu[aá]l) ya|sorpr[eé]ndeme|t[uú] (eliges|decides)|elige t[uú]|lo que t[uú] (veas|quieras)|just (recommend|pick)|surprise me|no (more )?questions|you (choose|decide|pick))\b/iu;

export function wantsToSkipQuestions(message: string): boolean {
  return SKIP_QUESTIONS_PATTERN.test(message);
}

export interface TurnTools {
  /** Si puede buscar por ánimo (`buscar_titulos`). */
  readonly moodSearch: boolean;
  /** Si puede comprobar un título (`buscar_por_titulo`). */
  readonly titleSearch: boolean;
  readonly choice: ToolChoice;
}

/**
 * Qué puede hacer Umber en este turno. Antes de la primera búsqueda no puede
 * buscar por ánimo hasta haber preguntado `MIN_QUESTIONS` veces; con
 * `MAX_QUESTIONS` preguntas seguidas, está obligado a buscar, y solo por ánimo:
 * un título que no está no cuenta como búsqueda, y si pudiera elegir esa
 * herramienta seguiría obligado al turno siguiente, una y otra vez.
 */
export function turnToolsFor(state: ConversationState, skipQuestions = false): TurnTools {
  if (state.lastSearch === null && state.pendingQuestions < MIN_QUESTIONS && !skipQuestions) {
    return { moodSearch: false, titleSearch: true, choice: 'auto' };
  }
  if (state.pendingQuestions >= MAX_QUESTIONS) {
    return { moodSearch: true, titleSearch: false, choice: 'required' };
  }
  return { moodSearch: true, titleSearch: true, choice: 'auto' };
}
