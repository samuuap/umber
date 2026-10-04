/**
 * Tipos de dominio de Umber.
 *
 * Los tipos de fila de la base de datos viven en `database.types.ts`; aquí están
 * los que usa la aplicación (modos, mensajes, candidatos enriquecidos).
 */
import type { Database } from '@/lib/database.types';

// ─── Contenido ───────────────────────────────────────────────────────────────

export type ContentType = 'movie' | 'tv';
export type ContentStatus = 'released' | 'ended' | 'ongoing';

/*
 * `database.types.ts` lo genera `supabase gen types` desde el esquema real, así
 * que manda en la forma de las tablas. Pero hay dos cosas del esquema que no
 * sabe expresar, y se corrigen aquí:
 *
 *  1. Las columnas con `CHECK` salen como `string`: el generador solo convierte
 *     en uniones los ENUM de Postgres. Se estrechan a los valores del
 *     constraint, que la base ya garantiza.
 *  2. `search_content` y `explore_content` devuelven todos sus campos como NO
 *     nulables, porque el generador no puede inferir nullabilidad de un
 *     `RETURNS TABLE`. Varias de
 *     esas columnas sí son nulas en el corpus, y sin corregirlo el compilador
 *     dejaría pasar un `candidate.director.trim()` que reventaría en ejecución.
 *
 * Al regenerar los tipos, comprobar si estas correcciones siguen haciendo falta.
 */
type ContentRow = Database['public']['Tables']['content']['Row'];
type ConversationRow = Database['public']['Tables']['conversations']['Row'];
type SearchContentRow = Database['public']['Functions']['search_content']['Returns'][number];
type ExploreContentRow = Database['public']['Functions']['explore_content']['Returns'][number];

/** Fila completa de la tabla `content`. */
export type Content = Omit<ContentRow, 'type' | 'status'> & {
  type: ContentType;
  status: ContentStatus | null;
};

/** Candidato devuelto por la búsqueda semántica, con su score de similitud. */
export type ContentCandidate = Omit<
  SearchContentRow,
  | 'type'
  | 'title_en'
  | 'year'
  | 'director'
  | 'synopsis'
  | 'synopsis_en'
  | 'genres'
  | 'autumn_score'
  | 'poster_path'
  | 'vote_count'
  | 'vote_average'
  | 'runtime'
  | 'original_language'
  | 'top_cast'
> & {
  type: ContentType;
  title_en: string | null;
  year: number | null;
  director: string | null;
  synopsis: string | null;
  synopsis_en: string | null;
  genres: string[] | null;
  autumn_score: number | null;
  poster_path: string | null;
  vote_count: number | null;
  vote_average: number | null;
  runtime: number | null;
  original_language: string | null;
  top_cast: string[];
};

/** Una fila del listado de `/explorar`; `total_count` es el total con esos filtros. */
export type ExploreItem = Omit<
  ExploreContentRow,
  'type' | 'title_en' | 'year' | 'poster_path' | 'autumn_score'
> & {
  type: ContentType;
  title_en: string | null;
  year: number | null;
  poster_path: string | null;
  autumn_score: number | null;
};

export type Conversation = Omit<ConversationRow, 'mode' | 'specialty'> & {
  mode: ChatMode;
  specialty: Specialty | null;
};
export type Favorite = Database['public']['Tables']['users_favorites']['Row'];

// ─── Especialidades ──────────────────────────────────────────────────────────

/**
 * Umber es un experto general; una especialidad cambia su catálogo (solo lo de
 * esa época), su voz y cómo ordena (Fase 8). Hoy, solo otoño; Navidad, después.
 */
export const SPECIALTIES = ['autumn'] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export function isSpecialty(value: unknown): value is Specialty {
  return typeof value === 'string' && (SPECIALTIES as readonly string[]).includes(value);
}

// ─── Filtros de búsqueda ─────────────────────────────────────────────────────

/** Lo conocido que quiere que sea: lo saca el modelo de la conversación. */
export const POPULARITY_PREFERENCES = ['known', 'lesser', 'any'] as const;
export type PopularityPreference = (typeof POPULARITY_PREFERENCES)[number];

/**
 * Lo que la persona ha pedido de forma explícita: no el ánimo, que va en el
 * resumen, sino lo que se puede comprobar en la ficha. Lo valida
 * `parseSearchFilters` en `src/lib/search.ts`.
 */
export interface SearchFilters {
  /** Al menos uno de estos géneros, con los nombres de las películas (`MOVIE_GENRES`). */
  readonly genresAny: readonly string[];
  readonly genresNone: readonly string[];
  readonly yearFrom: number | null;
  readonly yearTo: number | null;
  /** Minutos; en series, los de un episodio. */
  readonly maxRuntime: number | null;
  /** Idioma original, ISO 639-1. */
  readonly languages: readonly string[];
  /** En la dirección o el reparto. */
  readonly person: string | null;
  readonly popularity: PopularityPreference;
}

export const NO_FILTERS: SearchFilters = {
  genresAny: [],
  genresNone: [],
  yearFrom: null,
  yearTo: null,
  maxRuntime: null,
  languages: [],
  person: null,
  popularity: 'any',
};

/** Los filtros en el JSON de `/api/search`. */
export interface SearchFiltersBody {
  readonly genres_any?: readonly string[];
  readonly genres_none?: readonly string[];
  readonly year_from?: number;
  readonly year_to?: number;
  readonly max_runtime?: number;
  readonly languages?: readonly string[];
  readonly person?: string;
  readonly popularity?: PopularityPreference;
}

// ─── Modos ───────────────────────────────────────────────────────────────────

/**
 * Los 4 modos de la app. `weekend` y `month` están diseñados pero no
 * implementados (v2): no eliminar sus constantes ni sus tipos.
 */
export const CHAT_MODES = ['movie', 'tv', 'weekend', 'month'] as const;

export type ChatMode = (typeof CHAT_MODES)[number];

export interface ChatModeDefinition {
  readonly id: ChatMode;
  readonly label: string;
  readonly labelEn: string;
  readonly description: string;
  /** Tipo de contenido al que se restringe la búsqueda, o null si no aplica. */
  readonly contentType: ContentType | null;
  /** false = diseñado pero pendiente de implementar (v2). */
  readonly available: boolean;
}

export const CHAT_MODE_DEFINITIONS: Readonly<Record<ChatMode, ChatModeDefinition>> = {
  movie: {
    id: 'movie',
    label: 'Película',
    labelEn: 'Movie',
    description: 'Una recomendación para ver ahora mismo.',
    contentType: 'movie',
    available: true,
  },
  tv: {
    id: 'tv',
    label: 'Serie',
    labelEn: 'Series',
    description: 'Algo con capítulos para dejarse llevar.',
    contentType: 'tv',
    available: true,
  },
  weekend: {
    id: 'weekend',
    label: 'Fin de semana',
    labelEn: 'Weekend',
    description: 'Un plan coherente para dos o tres días.',
    contentType: null,
    available: false,
  },
  month: {
    id: 'month',
    label: 'Un mes de cine',
    labelEn: 'A month of films',
    description: 'Un calendario cinematográfico para todo el mes.',
    contentType: null,
    available: false,
  },
} as const;

/** Modos operativos en el MVP. */
export const AVAILABLE_CHAT_MODES: readonly ChatMode[] = CHAT_MODES.filter(
  (mode) => CHAT_MODE_DEFINITIONS[mode].available,
);

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === 'string' && (CHAT_MODES as readonly string[]).includes(value);
}

export function isAvailableChatMode(value: unknown): value is ChatMode {
  return isChatMode(value) && CHAT_MODE_DEFINITIONS[value].available;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
}

/** Un candidato de una búsqueda, tal como se recuerda para sacar «otra» sin volver a buscar. */
export interface SearchCandidateRef {
  readonly id: string;
  readonly similarity: number;
}

/** Una búsqueda que hizo Umber: con qué resumen del ánimo y qué candidatos salieron, en orden. */
export interface TurnSearch {
  readonly summary: string;
  readonly candidates: readonly SearchCandidateRef[];
}

/**
 * Lo que un mensaje de Umber recuerda del turno, además del texto. De aquí sale
 * el estado de la conversación: cuántas preguntas lleva, qué candidatos le
 * quedan y qué ha recomendado ya.
 */
export interface AssistantTurnMeta {
  /** Solo si en ese turno buscó. */
  readonly search?: TurnSearch;
  /** Ids del corpus que recomendó; vacío en un turno de pregunta. */
  readonly recommendation_ids?: readonly string[];
}

/** Un mensaje del historial con lo que recuerda el turno: así lo manda el navegador sin sesión. */
export type ChatHistoryMessage = ChatMessage & AssistantTurnMeta;

/** Mensajes guardados en la columna `conversations.messages` (JSONB). */
export interface StoredChatMessage extends ChatMessage, AssistantTurnMeta {
  readonly created_at: string;
  /** Solo en los de Umber: el idioma en que respondió, que es el de los títulos de sus fichas. */
  readonly language?: Locale;
}

// ─── API del chat ────────────────────────────────────────────────────────────

/** Un estado de ánimo cabe de sobra; más es pegar documentos, no conversar. */
export const MAX_MESSAGE_CHARS = 1000;
/**
 * Mensajes de una conversación, contando los de Umber: 20 turnos. Una normal
 * son de 10 a 20 (2 a 4 preguntas, la recomendación y algún «otra»). Decisión
 * de producto (2026-10-03): que ninguna se alargue sin fin. Sin cuenta, es
 * también la conversación de prueba del día.
 */
export const MAX_CONVERSATION_MESSAGES = 40;
/** Con cuántos turnos por delante empieza el chat a avisar. */
export const CONVERSATION_WARNING_TURNS = 5;

/** Turnos (mensaje de la persona y respuesta de Umber) que le caben a una conversación con `messages`. */
export function remainingTurns(messages: number): number {
  return Math.max(0, Math.floor((MAX_CONVERSATION_MESSAGES - messages) / 2));
}

/** Cuerpo de `POST /api/chat`. Lo valida `parseChatRequest` en `src/lib/chat.ts`. */
export interface ChatRequestBody {
  readonly mode: ChatMode;
  readonly message: string;
  /**
   * Turnos anteriores, solo para quien no tiene conversación guardada. Con
   * `conversation_id`, el servidor lee el historial de Supabase y lo ignora.
   * Los de Umber llevan lo que devolvió `done` (`search` y los ids
   * recomendados): sin eso no sabría qué candidatos le quedan.
   */
  readonly history?: readonly ChatHistoryMessage[];
  /** Conversación guardada que se continúa. Exige sesión. */
  readonly conversation_id?: string;
  readonly locale?: Locale;
  /** Región de plataformas, ISO 3166-1 alfa-2 (`ES`, `MX`…). */
  readonly region?: string;
  /**
   * Especialidad de una conversación nueva. Con `conversation_id` manda la que
   * se guardó con ella.
   */
  readonly specialty?: Specialty;
}

/** Título que Umber ha recomendado, con lo que necesita la ficha de contenido. */
export interface Recommendation {
  /** `content.id`: lo que se guarda en `users_favorites`. */
  readonly id: string;
  readonly tmdb_id: number;
  readonly type: ContentType;
  /** En el idioma de la respuesta: el mismo que ha leído la persona. */
  readonly title: string;
  readonly year: number | null;
  readonly director: string | null;
  readonly genres: readonly string[];
  readonly poster_url: string | null;
  /** Suscripción o gratis en la región. `null` si TMDB no respondió a tiempo. */
  readonly platforms: readonly string[] | null;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    /** Redactado para mostrarlo tal cual a la persona. */
    readonly message: string;
  };
}

/**
 * Eventos del stream SSE de `POST /api/chat`, en este orden: `delta` tantas veces
 * como fragmentos, con un `searching` antes de los de la recomendación si busca,
 * y al final `done` o `error`. Un fallo antes de empezar no abre stream: llega
 * como JSON `ApiErrorBody` con su código HTTP.
 */
export type ChatStreamEvent =
  | { readonly event: 'delta'; readonly data: { readonly text: string } }
  /** Empieza a buscar: lo que viene detrás tarda varios segundos. */
  | { readonly event: 'searching'; readonly data: Readonly<Record<string, never>> }
  | {
      readonly event: 'done';
      readonly data: {
        /** `null` sin sesión, o si guardar falló: la respuesta llegó igual. */
        readonly conversation_id: string | null;
        readonly recommendations: readonly Recommendation[];
        /**
         * La búsqueda de este turno, o `null` si no buscó. Sin sesión, el
         * navegador la devuelve en el historial.
         */
        readonly search: TurnSearch | null;
      };
    }
  | { readonly event: 'error'; readonly data: ApiErrorBody['error'] };

// ─── API de búsqueda y de TMDB ───────────────────────────────────────────────

/** Tope de `limit` en `/api/search`: los candidatos que se piden a la base para reordenar. */
export const MAX_SEARCH_RESULTS = 30;

/** Cuerpo de `POST /api/search`. Lo valida `parseSearchRequest` en `src/lib/search.ts`. */
export interface SearchRequestBody {
  /** Texto libre, como un mensaje del chat: hasta `MAX_MESSAGE_CHARS`. */
  readonly query: string;
  /** Sin tipo, busca en películas y series. */
  readonly type?: ContentType;
  /** De 1 a `MAX_SEARCH_RESULTS`. Por defecto, los mismos que ve el modelo en el chat. */
  readonly limit?: number;
  /** Los mismos filtros que saca el chat de la conversación. */
  readonly filters?: SearchFiltersBody;
  readonly specialty?: Specialty;
}

/** Un resultado de `/api/search`, con las puntuaciones que deciden su orden. */
export interface SearchResult {
  readonly id: string;
  readonly tmdb_id: number;
  readonly type: ContentType;
  readonly title: string;
  readonly title_en: string | null;
  readonly year: number | null;
  readonly director: string | null;
  readonly genres: readonly string[];
  /** La española, o la inglesa si falta. */
  readonly synopsis: string | null;
  readonly poster_url: string | null;
  readonly similarity: number;
  readonly autumn_score: number | null;
  readonly vote_count: number | null;
  /** Similitud más popularidad (y otoño, en la especialidad): el orden del chat. Ver `rankScore`. */
  readonly rank_score: number;
}

export interface SearchResponse {
  readonly results: readonly SearchResult[];
  /** Filtros que hubo que quitar porque con todos no salía casi nada. */
  readonly relaxed: readonly string[];
}

/** Respuesta de `GET /api/tmdb?content_id=…&region=…`. */
export interface PlatformsResponse {
  readonly content_id: string;
  readonly region: string;
  /** Suscripción o gratis en la región. `null` si TMDB no respondió. */
  readonly platforms: readonly string[] | null;
}

// ─── Localización ────────────────────────────────────────────────────────────

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
