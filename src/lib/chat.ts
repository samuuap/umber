/**
 * Piezas del chat que no dependen de HTTP: validar la petición, construir el
 * contexto del modelo y la herramienta con la que busca, y reconocer qué títulos
 * ha recomendado.
 *
 * Umber pregunta antes de buscar y busca él, con un resumen del ánimo: las
 * reglas y el estado de la conversación están en `src/lib/turns.ts`. El endpoint
 * `src/pages/api/chat.ts` solo lo orquesta.
 */
import { REGION_PATTERN, UUID_PATTERN, isRecord, parseText } from '@/lib/api';
import { ValidationError } from '@/lib/errors';
import {
  detectMessageLanguage,
  localeFromAcceptLanguage,
  regionFromAcceptLanguage,
} from '@/lib/locale';
import type { ToolDefinition } from '@/lib/deepseek';
import { lookupPlatforms, type PlatformsCache } from '@/lib/platforms';
import { renderUserContext, systemPrompt } from '@/lib/prompts';
import {
  MOVIE_GENRES,
  normalizeTitle,
  parseSearchFilters,
  type FilterKeys,
  type RankedCandidate,
} from '@/lib/search';
import { posterUrl, TMDB_DEFAULT_REGION } from '@/lib/tmdb';
import {
  MAX_QUESTIONS,
  MAX_SUMMARY_CHARS,
  MIN_QUESTIONS,
  parseTurnMeta,
  type ConversationState,
} from '@/lib/turns';
import {
  CHAT_MODE_DEFINITIONS,
  DEFAULT_LOCALE,
  MAX_CONVERSATION_MESSAGES,
  MAX_MESSAGE_CHARS,
  NO_FILTERS,
  remainingTurns,
  isChatMode,
  isLocale,
  isSpecialty,
  type ChatHistoryMessage,
  type ChatMessage,
  type ChatMode,
  type ContentCandidate,
  type Locale,
  type Recommendation,
  type SearchFilters,
  type Specialty,
} from '@/lib/types';

// ─── Límites ─────────────────────────────────────────────────────────────────

/** Una respuesta de 600 tokens son unos 2.500 caracteres; el resto es margen. */
export const MAX_HISTORY_MESSAGE_CHARS = 4000;
/** Mensajes del historial que ve el modelo: los últimos seis turnos. */
export const HISTORY_WINDOW = 12;
/**
 * Mensajes del usuario con los que se busca si el resumen del modelo no sirve
 * (vacío o demasiado largo), contando el actual.
 */
export const SEARCH_QUERY_TURNS = 3;
/** Longitud de la sinopsis de cada candidato en el prompt. */
const SYNOPSIS_MAX_CHARS = 400;

// ─── Validación ──────────────────────────────────────────────────────────────

export interface ChatRequest {
  readonly mode: ChatMode;
  readonly message: string;
  readonly history: readonly ChatHistoryMessage[];
  readonly conversationId: string | null;
  readonly locale: Locale;
  readonly region: string;
  /** La de una conversación nueva; con `conversationId` manda la guardada. */
  readonly specialty: Specialty | null;
}

function parseHistory(value: unknown): ChatHistoryMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError('El historial tiene que ser una lista de mensajes.');
  }
  // Uno lleno se rechaza después, con su propio error: ver `prepareChat`.
  if (value.length > MAX_CONVERSATION_MESSAGES) {
    throw new ValidationError(
      `El historial tiene ${String(value.length)} mensajes; el máximo es ${String(MAX_CONVERSATION_MESSAGES)}.`,
    );
  }
  return value.map((item: unknown) => {
    // `system` no: el cliente no puede escribir instrucciones al modelo.
    if (!isRecord(item) || (item['role'] !== 'user' && item['role'] !== 'assistant')) {
      throw new ValidationError('Cada mensaje del historial necesita un rol «user» o «assistant».');
    }
    return {
      role: item['role'],
      content: parseText(item['content'], MAX_HISTORY_MESSAGE_CHARS, 'un mensaje del historial'),
      // Lo que recuerda cada turno de Umber: sin ello no sabría qué candidatos le quedan.
      ...(item['role'] === 'assistant' ? parseTurnMeta(item) : {}),
    };
  });
}

/** Valida el cuerpo de `POST /api/chat`. Todo lo que llega al modelo pasa por aquí. */
export function parseChatRequest(body: unknown, acceptLanguage: string | null): ChatRequest {
  if (!isRecord(body)) {
    throw new ValidationError('La petición tiene que ser un objeto JSON.');
  }

  const mode = body['mode'];
  if (!isChatMode(mode)) {
    throw new ValidationError('Modo desconocido.');
  }
  const definition = CHAT_MODE_DEFINITIONS[mode];
  if (!definition.available) {
    throw new ValidationError(`El modo «${definition.label}» todavía no está disponible.`);
  }

  const conversationId = body['conversation_id'];
  if (
    conversationId !== undefined &&
    (typeof conversationId !== 'string' || !UUID_PATTERN.test(conversationId))
  ) {
    throw new ValidationError('El identificador de conversación no es válido.');
  }

  const locale = body['locale'];
  if (locale !== undefined && !isLocale(locale)) {
    throw new ValidationError('Idioma no soportado.');
  }

  const region = body['region'];
  if (region !== undefined && (typeof region !== 'string' || !REGION_PATTERN.test(region))) {
    throw new ValidationError('La región tiene que ser un código de dos letras, como «ES».');
  }

  const specialty = body['specialty'];
  if (specialty !== undefined && !isSpecialty(specialty)) {
    throw new ValidationError('Especialidad desconocida.');
  }

  return {
    mode,
    message: parseText(body['message'], MAX_MESSAGE_CHARS, 'el mensaje'),
    history: parseHistory(body['history']),
    conversationId: conversationId ?? null,
    locale: locale ?? localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE,
    region: region ?? regionFromAcceptLanguage(acceptLanguage) ?? TMDB_DEFAULT_REGION,
    specialty: specialty ?? null,
  };
}

// ─── Títulos mencionados ─────────────────────────────────────────────────────

export interface TitleMention {
  readonly title: string;
  readonly year: number | null;
}

/**
 * Títulos en negrita de un texto de Umber, con el año que los sigue. `system.md`
 * le pide ese formato exacto: **Título** (año), solo para títulos.
 */
export function extractTitleMentions(text: string): TitleMention[] {
  return [...text.matchAll(/\*\*([^*\n]+?)\*\*(?:\s*\((\d{4})\))?/gu)].map((match) => ({
    title: (match[1] ?? '').trim(),
    year: match[2] === undefined ? null : Number(match[2]),
  }));
}

/** Vale el título en español y el inglés: Umber escribe el del idioma en que responde. */
function mentionMatches(mention: TitleMention, candidate: ContentCandidate): boolean {
  const mentioned = normalizeTitle(mention.title);
  const titles = [candidate.title, candidate.title_en].flatMap((title) =>
    title === null ? [] : [normalizeTitle(title)],
  );
  return (
    titles.includes(mentioned) &&
    (mention.year === null || candidate.year === null || mention.year === candidate.year)
  );
}

/** Título en el idioma de la respuesta. El corpus siempre tiene el español; el inglés, casi siempre. */
function titleIn(candidate: ContentCandidate, language: Locale): string {
  return language === 'en' ? (candidate.title_en ?? candidate.title) : candidate.title;
}

/** Sinopsis en el idioma de la respuesta, o en el otro si falta: todo título tiene al menos una. */
function synopsisIn(candidate: ContentCandidate, language: Locale): string | null {
  return language === 'en'
    ? (candidate.synopsis_en ?? candidate.synopsis)
    : (candidate.synopsis ?? candidate.synopsis_en);
}

/**
 * Títulos en negrita que no son de ningún candidato, cada uno una vez: o
 * inventados, o nombrados sin haberlos buscado. Contar todas las menciones daba
 * un aviso falso cada vez que Umber nombraba dos veces el mismo título.
 */
export function unknownTitleMentions(
  text: string,
  candidates: readonly ContentCandidate[],
): TitleMention[] {
  const seen = new Set<string>();
  return extractTitleMentions(text).filter((mention) => {
    const key = normalizeTitle(mention.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return !candidates.some((candidate) => mentionMatches(mention, candidate));
  });
}

/** Lo que Umber ya ha recomendado en la conversación, sin repetir. */
export function extractRecommended(history: readonly ChatMessage[]): TitleMention[] {
  const seen = new Set<string>();
  const mentions: TitleMention[] = [];
  for (const message of history) {
    if (message.role !== 'assistant') continue;
    for (const mention of extractTitleMentions(message.content)) {
      const key = `${normalizeTitle(mention.title)}|${String(mention.year)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mentions.push(mention);
    }
  }
  return mentions;
}

export function isAlreadyRecommended(
  candidate: ContentCandidate,
  recommended: readonly TitleMention[],
): boolean {
  return recommended.some((mention) => mentionMatches(mention, candidate));
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

/**
 * Respaldo del resumen del modelo: los últimos mensajes del usuario, no solo el
 * actual. «Dame otra» o «más alegre» no dicen nada solos; junto a «está
 * lloviendo y estoy melancólico» siguen en el mismo ánimo.
 */
export function buildSearchQuery(history: readonly ChatMessage[], message: string): string {
  const previous = history
    .filter((item) => item.role === 'user')
    .slice(-(SEARCH_QUERY_TURNS - 1))
    .map((item) => item.content);
  return [...previous, message].join('\n');
}

/** Los filtros de `buscar_titulos`, con los nombres que ve el modelo. */
const TOOL_FILTER_KEYS: FilterKeys = {
  genresAny: 'generos',
  genresNone: 'generos_excluidos',
  yearFrom: 'desde_anio',
  yearTo: 'hasta_anio',
  maxRuntime: 'duracion_maxima',
  languages: 'idiomas',
  person: 'persona',
  popularity: 'popularidad',
};

/**
 * La herramienta con la que Umber busca, cuando ya tiene claro qué quiere la
 * persona. El resumen lleva el ánimo; los filtros, lo que ha pedido de forma
 * explícita y se puede comprobar en la ficha (Fase 8). Son condiciones duras:
 * si sobran, `searchCandidates` los va quitando y se lo dice.
 */
export const SEARCH_TOOL: ToolDefinition = {
  name: 'buscar_titulos',
  description:
    'Busca en el catálogo títulos que encajen con lo que quiere la persona: su ánimo y lo que haya pedido. Llámala cuando ya lo tengas claro, o cuando necesites títulos nuevos porque ha cambiado de idea o ya no te quedan candidatos. Para un título concreto, o para algo parecido a un título sin más condiciones, usa buscar_por_titulo.',
  parameters: {
    type: 'object',
    properties: {
      resumen: {
        type: 'string',
        description:
          'El ánimo y lo que le apetece ver, en una o dos frases en inglés (el catálogo está en inglés): tono, ritmo, temas, con quién lo ve. Conserva los títulos, personas o lugares que mencione. Lo que no quiere, dilo en positivo: en vez de «nada de terror», «something calm and gentle».',
      },
      generos: {
        type: 'array',
        items: { type: 'string', enum: [...MOVIE_GENRES] },
        description: 'Si pide un género concreto: una comedia, un western, terror, un documental; «comedia romántica» → ["Romance"]. Basta con que el título tenga uno de ellos.',
      },
      generos_excluidos: {
        type: 'array',
        items: { type: 'string', enum: [...MOVIE_GENRES] },
        description: 'Géneros que no quiere ver: «nada de terror» → ["Terror"].',
      },
      desde_anio: {
        type: 'integer',
        description: 'Si pide una época: «de los 90» → 1990; «de los 80 o los 90» → 1980; «reciente» → 2020.',
      },
      hasta_anio: {
        type: 'integer',
        description: 'Si pide una época: «de los 90» → 1999; «de los 80 o los 90» → 1999; «un clásico» o «en blanco y negro» → 1965.',
      },
      duracion_maxima: {
        type: 'integer',
        description: 'En minutos, solo si pide algo corto: «menos de hora y media» → 90; «que no sea muy larga» → 120.',
      },
      idiomas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Idioma original (ISO 639-1), solo si pide cine de un país o idioma: «coreano» → ["ko"], «español» → ["es"], «anime» → ["ja"], «francés» → ["fr"].',
      },
      persona: {
        type: 'string',
        description: 'Un director, directora, actor o actriz que pida, con su nombre completo: «Wes Anderson».',
      },
      popularidad: {
        type: 'string',
        enum: ['conocida', 'menos_conocida', 'cualquiera'],
        description: '«conocida» si quiere algo que casi todo el mundo ha visto; «menos_conocida» si quiere una joya escondida o algo que no salga en todas las listas; si no lo ha dicho, «cualquiera».',
      },
    },
    required: ['resumen'],
  },
};

/**
 * La herramienta con la que comprueba un título concreto. Está en todos los
 * turnos, también antes de poder buscar por ánimo: a «¿tienes El padrino?» no
 * hay que hacerle preguntas, y sin ella respondía que no lo tenía sin mirar.
 */
export const TITLE_SEARCH_TOOL: ToolDefinition = {
  name: 'buscar_por_titulo',
  description:
    'Comprueba si un título concreto está en el catálogo, en qué plataformas se puede ver, y trae sus parecidos. Llámala en cuanto la persona nombre un título: si lo pide, si pregunta si lo tienes, dónde verlo (o descargarlo), si quiere algo parecido a él o si te cuenta que le encantó o que ya lo ha visto. Si quiere algo parecido pero con otra condición («como El padrino pero más corta»), usa buscar_titulos con sus filtros. Puedes usarla en cualquier momento de la conversación. Nunca la uses para buscar por ánimo.',
  parameters: {
    type: 'object',
    properties: {
      titulo: {
        type: 'string',
        description:
          'El título tal como lo nombra la persona y, si lo conoces, también su título en inglés, separados por « / ». Por ejemplo: «Cadena perpetua / The Shawshank Redemption».',
      },
      intencion: {
        type: 'string',
        enum: ['verlo', 'parecido'],
        description:
          '«verlo» si quiere ver ese título: lo pide, pregunta si lo tienes o dónde verlo. «parecido» si lo nombra como referencia: quiere algo parecido, o te cuenta que le encantó o que ya lo ha visto. Con «parecido» solo te llegan sus parecidos: ese ya lo conoce.',
      },
    },
    required: ['titulo', 'intencion'],
  },
};

/** Para qué nombra un título: verlo, o como referencia de lo que le gusta. */
export type TitleIntent = 'watch' | 'similar';

/**
 * La intención con la que llamó a `buscar_por_titulo`. Sin ella, o ilegible,
 * «verlo», que era lo que hacía antes de existir el parámetro.
 */
export function parseTitleIntent(args: string): TitleIntent {
  try {
    const parsed: unknown = JSON.parse(args);
    return isRecord(parsed) && parsed['intencion'] === 'parecido' ? 'similar' : 'watch';
  } catch {
    return 'watch';
  }
}

/** Títulos que se piden de una vez, como mucho: «Cadena perpetua / The Shawshank Redemption». */
const MAX_TITLE_VARIANTS = 4;

/**
 * Los títulos que pidió el modelo al llamar a `buscar_por_titulo`. Si no se
 * pueden leer, se busca con el mensaje de la persona tal cual.
 */
export function parseTitleQuery(args: string, fallback: string): string[] {
  try {
    const parsed: unknown = JSON.parse(args);
    const raw = isRecord(parsed) && typeof parsed['titulo'] === 'string' ? parsed['titulo'] : '';
    // Las variantes van separadas por « / », como pide la herramienta. Una barra
    // sin espacios puede ser del título (*Face/Off*): va entero y, por si eran
    // dos títulos pegados, también cada parte.
    const parts = raw.split(/\s+\/\s+/u);
    const variants = parts.length === 1 && raw.includes('/') ? [raw, ...raw.split('/')] : parts;
    const titles = variants
      .map((title) => title.trim())
      .filter((title) => title.length > 0 && title.length <= MAX_SUMMARY_CHARS)
      // «The Godfather / The Godfather»: cuando el título ya es el inglés, lo repite.
      .filter((title, index, all) => all.findIndex((other) => normalizeTitle(other) === normalizeTitle(title)) === index)
      .slice(0, MAX_TITLE_VARIANTS);
    if (titles.length > 0) return titles;
  } catch {
    // JSON roto: vale el respaldo.
  }
  return [fallback.slice(0, MAX_SUMMARY_CHARS)];
}

export interface SearchCall {
  readonly summary: string;
  readonly fromModel: boolean;
  readonly filters: SearchFilters;
}

/**
 * El resumen y los filtros con los que el modelo llamó a `buscar_titulos`. Si
 * el resumen no se puede leer, o viene vacío o desmesurado, se busca con los
 * últimos mensajes de la persona: una búsqueda peor es mejor que un error. Un
 * filtro que no se entiende se ignora.
 */
export function parseSearchCall(args: string, fallback: string): SearchCall {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(args);
  } catch {
    // JSON roto: vale el respaldo, sin filtros.
  }
  const record = isRecord(parsed) ? parsed : {};
  const summary = typeof record['resumen'] === 'string' ? record['resumen'].trim() : '';
  const filters = isRecord(parsed) ? parseSearchFilters(record, TOOL_FILTER_KEYS) : NO_FILTERS;
  return summary.length > 0 && summary.length <= MAX_SUMMARY_CHARS
    ? { summary, fromModel: true, filters }
    : { summary: fallback.slice(0, MAX_SUMMARY_CHARS), fromModel: false, filters };
}

// ─── Idioma de la respuesta ──────────────────────────────────────────────────

/**
 * El del mensaje; si no se sabe («ok», «Interstellar»), el de los mensajes
 * anteriores de la persona, y si tampoco, el de la interfaz.
 *
 * Se decide aquí y no se deja al modelo: con todo el contexto en español, a «Do
 * you have The Godfather?» respondía en español aunque la plantilla le pedía
 * contestar en el idioma del mensaje (2 de 2 mensajes en inglés, 2026-09-30).
 */
export function replyLanguage(
  message: string,
  history: readonly ChatMessage[],
  interfaceLocale: Locale,
): Locale {
  const earlier = history
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
    .join('\n');
  return detectMessageLanguage(message) ?? detectMessageLanguage(earlier) ?? interfaceLocale;
}

const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  es: 'español',
  en: 'inglés (English)',
};

const SPECIALTY_NAMES: Readonly<Record<Specialty, string>> = {
  autumn: 'Otoño: solo recomiendas títulos de otoño',
};

// ─── Enriquecimiento con TMDB ────────────────────────────────────────────────

export interface EnrichedCandidate extends RankedCandidate {
  /** Suscripción o gratis en la región. `null` si TMDB no respondió a tiempo. */
  readonly platforms: readonly string[] | null;
}

export interface Enrichment {
  readonly candidates: EnrichedCandidate[];
  /** La caché de plataformas, escribiéndose. Nunca falla: ver `lookupPlatforms`. */
  readonly saved: Promise<void>;
}

/**
 * Añade las plataformas de cada candidato. TMDB es prescindible: si falla o
 * tarda, el candidato va sin plataformas y Umber no las menciona. `cache`, si
 * ya se pidió con `readPlatformsCache`.
 */
export async function enrichCandidates(
  candidates: readonly RankedCandidate[],
  region: string,
  signal: AbortSignal,
  cache?: Promise<PlatformsCache>,
): Promise<Enrichment> {
  const { platforms, saved } = await lookupPlatforms(candidates, region, signal, cache);
  return {
    candidates: candidates.map((candidate, index) => ({
      ...candidate,
      platforms: platforms[index] ?? null,
    })),
    saved,
  };
}

// ─── Contexto del modelo ─────────────────────────────────────────────────────

function oneLine(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : maxChars)}…`;
}

function withYear(title: string, year: number | null): string {
  return year === null ? title : `${title} (${String(year)})`;
}

const numberFormat = new Intl.NumberFormat('es-ES');

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${String(rest)} min` : `${String(hours)} h ${String(rest).padStart(2, '0')} min`;
}

/** Cuántos votos tiene en TMDB, en palabras: el modelo no sabe qué es mucho. */
function fameLabel(votes: number): string {
  if (votes >= 10_000) return 'muy conocida';
  if (votes >= 2_000) return 'conocida';
  if (votes >= 700) return 'algo conocida';
  return 'poco conocida';
}

/**
 * Formato de cada candidato tal como lo documenta `user-context.md`. Título y
 * sinopsis van en el idioma de la respuesta: el modelo copia el título tal cual,
 * y así nombra *Always Be My Maybe* y no *Siempre queda el amor* a quien escribe
 * en inglés.
 */
function formatCandidate(
  candidate: EnrichedCandidate,
  index: number,
  region: string,
  language: Locale,
  specialty: Specialty | null,
): string {
  const head = [withYear(titleIn(candidate, language), candidate.year)];
  if (candidate.director !== null) head.push(`dir. ${candidate.director}`);
  head.push(candidate.type);
  if (candidate.genres !== null && candidate.genres.length > 0) {
    head.push(`géneros: ${candidate.genres.join(', ')}`);
  }

  const meta = [`similitud ${candidate.similarity.toFixed(2)}`];
  if (candidate.vote_count !== null) {
    meta.push(`${fameLabel(candidate.vote_count)} (${numberFormat.format(candidate.vote_count)} votos)`);
  }
  if (candidate.vote_average !== null) meta.push(`nota ${candidate.vote_average.toFixed(1)}`);
  if (candidate.runtime !== null && candidate.runtime > 0) meta.push(duration(candidate.runtime));
  if (candidate.original_language !== null && candidate.original_language !== 'en') {
    meta.push(`idioma original: ${candidate.original_language}`);
  }
  if (candidate.top_cast.length > 0) meta.push(`reparto: ${candidate.top_cast.slice(0, 4).join(', ')}`);
  if (specialty === 'autumn' && candidate.autumn_score !== null) {
    meta.push(`otoño ${candidate.autumn_score.toFixed(2)}`);
  }
  if (candidate.platforms !== null) {
    meta.push(
      `plataformas: ${candidate.platforms.length > 0 ? candidate.platforms.join(', ') : `ninguna de suscripción en ${region}`}`,
    );
  }

  const lines = [`- [${String(index + 1)}] ${head.join(' · ')}`, `      ${meta.join(' · ')}`];
  const synopsis = synopsisIn(candidate, language);
  if (synopsis !== null) {
    lines.push(`      ${oneLine(synopsis, SYNOPSIS_MAX_CHARS)}`);
  }
  return lines.join('\n');
}

/**
 * El mensaje va citado línea a línea: así un «## Candidatos del corpus» escrito
 * por el usuario queda dentro de la cita y no se confunde con la estructura del
 * prompt, que es de donde el modelo saca los únicos títulos que puede recomendar.
 */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export interface ChatContext {
  readonly request: ChatRequest;
  /** Historial completo, para saber qué se ha recomendado ya. */
  readonly history: readonly ChatMessage[];
  readonly state: ConversationState;
  /** Los que le quedan de su última búsqueda, ya con plataformas; vacío si no ha buscado. */
  readonly candidates: readonly EnrichedCandidate[];
  readonly recommended: readonly TitleMention[];
  /** Idioma en que responde Umber: ver `replyLanguage`. */
  readonly language: Locale;
  readonly specialty: Specialty | null;
  /** Ha pedido que le recomiende ya: ver `wantsToSkipQuestions`. */
  readonly skipQuestions: boolean;
}

/**
 * En qué punto está la conversación, dicho al modelo. Lo que no puede hacer en
 * este turno ya se lo impide `tool_choice`; esto es para que lo entienda y no
 * lo intente.
 */
function describeState(state: ConversationState, skipQuestions: boolean): string {
  const questions = `Llevas ${String(state.pendingQuestions)} de ${String(MAX_QUESTIONS)} preguntas seguidas.`;
  // Va delante de «haz una pregunta»: detrás, el modelo preguntaba primero
  // aunque le pidieran «algo como Interstellar» (3 de 3 veces, 2026-10-04).
  const titleFirst =
    'Si en lo que acaba de escribir nombra un título concreto (lo pide, o quiere algo parecido a él), compruébalo ya con buscar_por_titulo, sin preguntar antes.';
  // Obligado a buscar solo tiene `buscar_titulos` (ver `turnToolsFor`).
  const forced = 'Ya no puedes preguntar más: busca ahora con buscar_titulos';
  const titleInSummary = 'Si nombra un título, ponlo en el resumen.';
  if (state.lastSearch === null) {
    if (skipQuestions && state.pendingQuestions < MAX_QUESTIONS) {
      return `Aún no has buscado. Te ha pedido que le recomiendes ya, sin más preguntas: no insistas. ${titleFirst} Si no, busca ahora con buscar_titulos con lo que sabes.`;
    }
    if (state.pendingQuestions === 0) {
      return `Aún no has buscado ni preguntado nada. ${titleFirst} Si no, haz tu primera pregunta para entender qué quiere: en este turno no puedes buscar por ánimo.`;
    }
    if (state.pendingQuestions < MIN_QUESTIONS) {
      return `Aún no has buscado. ${questions} ${titleFirst} Si no, haz otra pregunta sobre algo que aún no sepas: en este turno no puedes buscar por ánimo.`;
    }
    if (state.pendingQuestions >= MAX_QUESTIONS) {
      return `Aún no has buscado. ${questions} ${forced}, con lo que sabes. ${titleInSummary}`;
    }
    return `Aún no has buscado. ${questions} Si ya tienes claro su ánimo, busca con buscar_titulos; si no, haz otra pregunta.`;
  }
  /*
   * En una sola línea y sin comillas propias: sin sesión, el resumen llega del
   * navegador con el historial, y un salto de línea con «## …» se haría pasar
   * por una sección del prompt.
   */
  const summary = oneLine(state.lastSearch.summary, MAX_SUMMARY_CHARS).replace(/[«»]/gu, '"');
  const last = `Tu última búsqueda fue: «${summary}».`;
  if (state.pendingQuestions >= MAX_QUESTIONS) {
    return `${last} ${questions} ${forced}, con su ánimo actualizado. ${titleInSummary}`;
  }
  if (state.lastSearch.candidates.length === 0) {
    return `${last} No encontró nada que encajara: pregúntale por otro ángulo de su ánimo, o busca de nuevo con buscar_titulos con otras palabras.`;
  }
  if (state.remaining.length === 0) {
    return `${last} Ya has recomendado todos sus candidatos: si quiere otra, o si su ánimo ha cambiado, busca de nuevo con buscar_titulos.`;
  }
  return `${last} Te quedan ${String(state.remaining.length)} candidatos de ella (abajo). Si pide otra, elige una de ellos sin buscar. Si su ánimo ha cambiado, busca de nuevo con buscar_titulos.`;
}

/**
 * Lo cerca que está el final de la conversación (`MAX_CONVERSATION_MESSAGES`),
 * para que cierre recomendando y no la deje a medias con una pregunta.
 */
function describeEnding(historyLength: number): string | null {
  const after = remainingTurns(historyLength + 2);
  if (after === 0) {
    return 'Este es tu último mensaje en esta conversación: no hagas preguntas. Si ya le has recomendado algo, despídete con calidez; si no, recomiéndale uno ahora.';
  }
  if (after <= 2) {
    return `A esta conversación solo le quedan ${String(after)} mensajes tuyos después de este: ve cerrando, sin abrir temas nuevos.`;
  }
  return null;
}

function formatCandidates(
  candidates: readonly EnrichedCandidate[],
  region: string,
  language: Locale,
  specialty: Specialty | null,
): string {
  return candidates
    .map((candidate, index) => formatCandidate(candidate, index, region, language, specialty))
    .join('\n');
}

/**
 * Lo que devuelve `buscar_titulos` al modelo. Sustituye a los candidatos que le
 * quedaban: si ha buscado, es que esos ya no le valían. Si hubo que quitar
 * filtros (`relaxed`), se lo dice, para que no presente como «de los 90» algo
 * que no lo es.
 */
export function formatSearchResult(
  candidates: readonly EnrichedCandidate[],
  region: string,
  language: Locale,
  relaxed: readonly string[],
  specialty: Specialty | null,
): string {
  if (candidates.length === 0) {
    return 'Ningún título del catálogo encaja con esa búsqueda. Díselo con naturalidad y pregúntale por otro ángulo, u ofrécele quitar alguna condición. No nombres ninguna película.';
  }
  const order =
    specialty === 'autumn'
      ? 'Vienen ordenados por parecido, por lo conocidos y por lo otoñales'
      : 'Vienen ordenados por parecido y por lo conocidos';
  return [
    'Candidatos del catálogo para esa búsqueda. Son los únicos que puedes recomendar ahora; los que te quedaban de antes ya no valen.',
    `${order}, pero el orden no es una recomendación: elige el que de verdad encaje con lo que ha pedido.`,
    ...(relaxed.length > 0
      ? [
          `Con todo lo que pidió no había casi nada, así que se han quitado estas condiciones: ${relaxed.join(', ')}. Si el que recomiendas no cumple alguna, díselo con naturalidad.`,
        ]
      : []),
    '',
    formatCandidates(candidates, region, language, specialty),
    '',
    `Recomienda uno solo, en ${LANGUAGE_NAMES[language]}, con el título tal como viene arriba.`,
  ].join('\n');
}

/**
 * Lo que devuelve `buscar_por_titulo` al modelo. Con intención «verlo», lo que
 * pidió (recomendable) y sus parecidos. Con «parecido», lo que nombró va solo
 * como referencia, fuera de los candidatos: ya lo conoce, y si fuera candidato
 * acababa recomendándoselo (4 de 30 conversaciones simuladas, 2026-10-04).
 */
export function formatTitleResult(
  exact: readonly EnrichedCandidate[],
  similar: readonly EnrichedCandidate[],
  region: string,
  language: Locale,
  specialty: Specialty | null,
  intent: TitleIntent,
): string {
  if (exact.length === 0) {
    return 'Ese título no está en el catálogo. Díselo con naturalidad, sin nombrar ningún otro título, y sigue la conversación: si aún no sabes qué le apetece, pregúntale.';
  }
  if (intent === 'similar') {
    const reference = exact.map((candidate) => withYear(titleIn(candidate, language), candidate.year)).join(', ');
    if (similar.length === 0) {
      return `Ya conoce ${reference}, pero no hay parecidos en el catálogo. Pregúntale por otro ángulo de lo que le gusta. No nombres ninguna otra película.`;
    }
    return [
      `Ya conoce ${reference}: no se lo recomiendes. Te dice algo de sus gustos. Sus parecidos, los únicos que puedes recomendar ahora:`,
      '',
      formatCandidates(similar, region, language, specialty),
      '',
      `Si ya sabes lo bastante de lo que quiere, recomienda uno solo, en ${LANGUAGE_NAMES[language]}, con el título tal como viene arriba; si te falta algo para elegir bien, pregúntaselo.`,
    ].join('\n');
  }
  const lines = [
    'Está en el catálogo. Lo que ha pedido:',
    '',
    formatCandidates(exact, region, language, specialty),
  ];
  if (similar.length > 0) {
    lines.push(
      '',
      'Otros parecidos, por si pide otra. Junto con lo de arriba, son los únicos que puedes recomendar ahora:',
      '',
      similar
        .map((candidate, index) => formatCandidate(candidate, exact.length + index, region, language, specialty))
        .join('\n'),
    );
  }
  lines.push('', `Recomiéndaselo, en ${LANGUAGE_NAMES[language]}, con el título tal como viene arriba.`);
  return lines.join('\n');
}

/**
 * Los últimos turnos, empezando siempre por un mensaje del usuario. Al modelo
 * solo le llegan rol y texto: los mensajes guardados llevan además fecha, ids y
 * idioma.
 */
function historyWindow(history: readonly ChatMessage[]): ChatMessage[] {
  const window = history.slice(-HISTORY_WINDOW);
  const firstUser = window.findIndex((message) => message.role === 'user');
  return firstUser === -1 ? [] : window.slice(firstUser).map(({ role, content }) => ({ role, content }));
}

/** system.md + historial reciente + la plantilla rellena como último mensaje. */
export function buildChatMessages(context: ChatContext): ChatMessage[] {
  const { request, state, candidates, recommended, language, specialty } = context;
  const definition = CHAT_MODE_DEFINITIONS[request.mode];

  const userContext = renderUserContext({
    mode: request.mode,
    mode_label: request.locale === 'en' ? definition.labelEn : definition.label,
    reply_language: LANGUAGE_NAMES[language],
    specialty: specialty === null ? 'ninguna: recomiendas de todo' : SPECIALTY_NAMES[specialty],
    region: request.region,
    today: new Date().toISOString().slice(0, 10),
    user_message: quote(request.message),
    conversation_state: [describeState(state, context.skipQuestions), describeEnding(context.history.length)]
      .filter((part) => part !== null)
      .join(' '),
    candidates:
      state.lastSearch === null
        ? '(aún no has buscado)'
        : candidates.length === 0
          ? '(no te queda ninguno)'
          : formatCandidates(candidates, request.region, language, specialty),
    already_recommended:
      recommended.length === 0
        ? '(ninguno)'
        : recommended.map((mention) => `- ${withYear(mention.title, mention.year)}`).join('\n'),
  });

  return [
    { role: 'system', content: systemPrompt(specialty) },
    ...historyWindow(context.history),
    { role: 'user', content: userContext },
  ];
}

// ─── Recomendaciones ─────────────────────────────────────────────────────────

/**
 * Candidatos que Umber ha recomendado en `text`, en el orden en que aparecen. Es
 * lo que permite a la interfaz pintar la ficha sin tener que interpretar el texto.
 * El año desempata títulos repetidos, como *La niebla* película y serie.
 */
export function findRecommendations(
  text: string,
  candidates: readonly EnrichedCandidate[],
  language: Locale,
): Recommendation[] {
  const found: EnrichedCandidate[] = [];
  for (const mention of extractTitleMentions(text)) {
    const candidate = candidates.find((item) => mentionMatches(mention, item));
    if (candidate !== undefined && !found.includes(candidate)) found.push(candidate);
  }

  return found.map((candidate) => ({
    id: candidate.id,
    tmdb_id: candidate.tmdb_id,
    type: candidate.type,
    title: titleIn(candidate, language),
    year: candidate.year,
    director: candidate.director,
    genres: candidate.genres ?? [],
    poster_url: posterUrl(candidate.poster_path),
    platforms: candidate.platforms,
  }));
}
