/**
 * Búsqueda en el corpus: vectoriza la consulta, llama a `search_content` con
 * los filtros que pidió la persona y reordena por similitud y popularidad (y
 * por otoño, en esa especialidad).
 *
 * Las constantes están medidas con el corpus real; las medidas y su motivo están
 * en `docs/fase-4-api-chat.md` y `docs/fase-8-experto-general.md`.
 */
import { isRecord, parseText } from '@/lib/api';
import type { Json } from '@/lib/database.types';
import { embedQuery, toPgVector } from '@/lib/embeddings';
import { ValidationError } from '@/lib/errors';
import { getSupabaseAdminClient, getSupabaseClient, unwrap } from '@/lib/supabase';
import { posterUrl } from '@/lib/tmdb';
import type { RequestTrace } from '@/lib/trace';
import {
  MAX_MESSAGE_CHARS,
  MAX_SEARCH_RESULTS,
  NO_FILTERS,
  isSpecialty,
  type ContentCandidate,
  type ContentType,
  type PopularityPreference,
  type SearchCandidateRef,
  type SearchFilters,
  type SearchResult,
  type Specialty,
} from '@/lib/types';

/**
 * Suelo de similitud, no un umbral de «encaja». Con este modelo la similitud no
 * separa «nada encaja» de «encaja flojo»: «hola» llega a 0,39 y una petición
 * legítima de serie puede quedarse en 0,32. El suelo quita ruido; decidir si
 * algo encaja es trabajo del modelo.
 *
 * Se aplica aquí y no en `search_content`: si pocas filas superan el umbral, la
 * búsqueda iterativa del índice sigue recorriéndolo para completar el LIMIT, y
 * puede llegar al timeout del rol `anon`. Filtrar después da el mismo resultado.
 */
export const SEARCH_MIN_SIMILARITY = 0.3;

/** `min_score` que se pasa a `search_content`: ninguno, ver `SEARCH_MIN_SIMILARITY`. */
const NO_DATABASE_THRESHOLD = -1;

/**
 * Candidatos que se piden a la base para reordenar. `search_content` corta en
 * 50. Es también el tope de `/api/search`: más allá no hay nada reordenado.
 */
export const SEARCH_POOL_SIZE = MAX_SEARCH_RESULTS;

/** Candidatos que se pasan al modelo por defecto. */
export const DEFAULT_CANDIDATE_COUNT = 10;

/**
 * Peso de la popularidad al reordenar (Fase 8): a igualdad de parecido, lo
 * conocido antes. La popularidad va de 0 (200 votos) a 1 (30.000 o más), en
 * escala logarítmica. Medido con `scripts/eval-chat.mjs`.
 */
export const POPULARITY_WEIGHT = 0.08;

/**
 * Peso de `autumn_score` en la especialidad de otoño. Con 0,2, frente a 0,1,
 * cambian entre 0 y 3 de los 10 primeros: su otoño medio sube de 0,58 a 0,61 y
 * la similitud solo baja de 0,437 a 0,434 (12 consultas).
 */
export const AUTUMN_WEIGHT = 0.2;

/** Lo que entra en la especialidad de otoño: los mismos cortes con los que se eligió el corpus otoñal. */
const AUTUMN_MIN_SCORE: Readonly<Record<ContentType, number>> = { movie: 0.32, tv: 0.4 };

/**
 * «Conocida» y «menos conocida», en votos de TMDB. Las series tienen menos
 * votos: *Breaking Bad*, 15.000; una película igual de vista, el triple.
 */
const KNOWN_MIN_VOTES: Readonly<Record<ContentType, number>> = { movie: 2000, tv: 1000 };
const LESSER_MAX_VOTES: Readonly<Record<ContentType, number>> = { movie: 1500, tv: 700 };

/** Con menos que esto tras filtrar, se relajan los filtros: ver `searchCandidates`. */
const MIN_FILTERED_RESULTS = 3;

// ─── Géneros ─────────────────────────────────────────────────────────────────

/** Los géneros que puede pedir el modelo: los de las películas, tal como están en `content.genres`. */
export const MOVIE_GENRES = [
  'Acción', 'Animación', 'Aventura', 'Bélica', 'Ciencia ficción', 'Comedia', 'Crimen', 'Documental',
  'Drama', 'Familia', 'Fantasía', 'Historia', 'Misterio', 'Música', 'Película de TV', 'Romance',
  'Suspense', 'Terror', 'Western',
] as const;

/** TMDB llama distinto a los géneros de series: el filtro busca los dos. */
const SERIES_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = {
  'Acción': ['Acción y aventura'],
  'Aventura': ['Acción y aventura'],
  'Ciencia ficción': ['Ciencia ficción y fantasía'],
  'Fantasía': ['Ciencia ficción y fantasía'],
  'Bélica': ['Bélica y política'],
  'Familia': ['Infantil'],
};

function withSeriesEquivalents(genres: readonly string[]): string[] {
  return [...new Set(genres.flatMap((genre) => [genre, ...(SERIES_EQUIVALENTS[genre] ?? [])]))];
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

const FIRST_FILM_YEAR = 1890;
const LANGUAGE_PATTERN = /^[a-z]{2}$/u;
/** El chino puede venir como `zh` o, en TMDB, como `cn` (cantonés). */
const LANGUAGE_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = { zh: ['zh', 'cn'], cn: ['zh', 'cn'] };
const MAX_PERSON_CHARS = 80;

/** Los nombres de cada filtro: en el chat, en español (los pone el modelo); en `/api/search`, en inglés. */
export interface FilterKeys {
  readonly genresAny: string;
  readonly genresNone: string;
  readonly yearFrom: string;
  readonly yearTo: string;
  readonly maxRuntime: string;
  readonly languages: string;
  readonly person: string;
  readonly popularity: string;
}

export const API_FILTER_KEYS: FilterKeys = {
  genresAny: 'genres_any',
  genresNone: 'genres_none',
  yearFrom: 'year_from',
  yearTo: 'year_to',
  maxRuntime: 'max_runtime',
  languages: 'languages',
  person: 'person',
  popularity: 'popularity',
};

/** Cómo dice el modelo la popularidad (`buscar_titulos`) y cómo la dice la API. */
const POPULARITY_VALUES: Readonly<Record<string, PopularityPreference>> = {
  conocida: 'known',
  menos_conocida: 'lesser',
  cualquiera: 'any',
  known: 'known',
  lesser: 'lesser',
  any: 'any',
};

function genreList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((genre): genre is string => (MOVIE_GENRES as readonly string[]).includes(String(genre)));
}

function year(value: unknown): number | null {
  const now = new Date().getFullYear();
  return typeof value === 'number' && Number.isInteger(value) && value >= FIRST_FILM_YEAR && value <= now + 1
    ? value
    : null;
}

/**
 * Los filtros de una búsqueda. Lo que no se entiende se ignora en vez de fallar:
 * vienen del modelo, y una búsqueda con menos filtros es mejor que ninguna.
 */
export function parseSearchFilters(raw: Readonly<Record<string, unknown>>, keys: FilterKeys): SearchFilters {
  const runtime = raw[keys.maxRuntime];
  const person = raw[keys.person];
  const languages = raw[keys.languages];
  const popularity = raw[keys.popularity];
  let yearFrom = year(raw[keys.yearFrom]);
  let yearTo = year(raw[keys.yearTo]);
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];
  return {
    genresAny: genreList(raw[keys.genresAny]),
    genresNone: genreList(raw[keys.genresNone]),
    yearFrom,
    yearTo,
    maxRuntime:
      typeof runtime === 'number' && Number.isInteger(runtime) && runtime >= 20 && runtime <= 400 ? runtime : null,
    languages: Array.isArray(languages)
      ? [
          ...new Set(
            languages.map((code) => String(code).toLowerCase()).filter((code) => LANGUAGE_PATTERN.test(code)),
          ),
        ].slice(0, 5)
      : [],
    person: typeof person === 'string' && person.trim().length > 1 ? person.trim().slice(0, MAX_PERSON_CHARS) : null,
    popularity: typeof popularity === 'string' ? (POPULARITY_VALUES[popularity] ?? 'any') : 'any',
  };
}

/** Lo que se pidió, para la traza. */
export function describeFilters(filters: SearchFilters): Json {
  return {
    ...(filters.genresAny.length > 0 ? { generos: [...filters.genresAny] } : {}),
    ...(filters.genresNone.length > 0 ? { sin: [...filters.genresNone] } : {}),
    ...(filters.yearFrom !== null ? { desde: filters.yearFrom } : {}),
    ...(filters.yearTo !== null ? { hasta: filters.yearTo } : {}),
    ...(filters.maxRuntime !== null ? { max_min: filters.maxRuntime } : {}),
    ...(filters.languages.length > 0 ? { idiomas: [...filters.languages] } : {}),
    ...(filters.person !== null ? { persona: filters.person } : {}),
    ...(filters.popularity !== 'any' ? { popularidad: filters.popularity } : {}),
  };
}

// ─── Orden ───────────────────────────────────────────────────────────────────

const POPULARITY_FLOOR = Math.log10(200);
const POPULARITY_CEILING = Math.log10(30_000);

/** De 0 (200 votos, el mínimo del corpus) a 1 (30.000 o más). */
export function popularityOf(votes: number | null): number {
  if (votes === null || votes <= 0) return 0;
  return Math.min(Math.max((Math.log10(votes) - POPULARITY_FLOOR) / (POPULARITY_CEILING - POPULARITY_FLOOR), 0), 1);
}

export interface RankedCandidate extends ContentCandidate {
  /** El orden con el que llega al modelo: ver `rankScore`. */
  readonly rank_score: number;
}

/**
 * Similitud, más la popularidad (salvo si ha pedido algo menos conocido, que ya
 * filtra por votos), más el otoño en esa especialidad.
 */
function rankScore(
  candidate: ContentCandidate,
  specialty: Specialty | null,
  popularity: PopularityPreference,
): number {
  const fame = popularity === 'lesser' ? 0 : POPULARITY_WEIGHT * popularityOf(candidate.vote_count);
  const autumn = specialty === 'autumn' ? AUTUMN_WEIGHT * (candidate.autumn_score ?? 0) : 0;
  return candidate.similarity + fame + autumn;
}

// ─── Búsqueda ────────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** `null` busca en películas y series. */
  readonly contentType: ContentType | null;
  /** Por defecto `DEFAULT_CANDIDATE_COUNT`. */
  readonly limit?: number;
  /** Se aplica antes de cortar, para que excluir no deje la lista corta. */
  readonly exclude?: (candidate: ContentCandidate) => boolean;
  /** Donde queda registrado el embedding de la consulta. */
  readonly trace: RequestTrace;
  readonly filters?: SearchFilters;
  /** Solo el catálogo de esa especialidad, y su puntuación al ordenar. */
  readonly specialty?: Specialty | null;
}

/** Los candidatos de `search_content` para un vector ya calculado, con estos filtros. */
async function searchPool(
  vector: readonly number[],
  options: SearchOptions,
  filters: SearchFilters,
): Promise<RankedCandidate[]> {
  const { contentType } = options;
  const specialty = options.specialty ?? null;
  // Sin tipo (solo `/api/search`), los umbrales de las películas.
  const thresholds = contentType ?? 'movie';
  /*
   * Con la secret key: el rol `anon` corta a los 3 s, y con la base en frío
   * (tras un rato sin uso) una búsqueda filtrada puede pasar de ahí y dejar el
   * chat en error (1 de 30 conversaciones simuladas, 2026-10-04). El corpus es
   * público: no cambia lo que se puede leer, solo que en frío tarda en vez de
   * fallar. En caliente, de 0,1 a 0,6 s.
   */
  const rows = unwrap(
    await getSupabaseAdminClient().rpc('search_content', {
      query_embedding: toPgVector(vector),
      match_count: SEARCH_POOL_SIZE,
      min_score: NO_DATABASE_THRESHOLD,
      ...(contentType === null ? {} : { content_type: contentType }),
      ...(filters.genresAny.length > 0 ? { genres_any: withSeriesEquivalents(filters.genresAny) } : {}),
      ...(filters.genresNone.length > 0 ? { genres_none: withSeriesEquivalents(filters.genresNone) } : {}),
      ...(filters.yearFrom === null ? {} : { year_from: filters.yearFrom }),
      ...(filters.yearTo === null ? {} : { year_to: filters.yearTo }),
      ...(filters.maxRuntime === null ? {} : { max_runtime: filters.maxRuntime }),
      ...(filters.languages.length > 0
        ? { languages: [...new Set(filters.languages.flatMap((code) => LANGUAGE_EQUIVALENTS[code] ?? [code]))] }
        : {}),
      ...(filters.person === null ? {} : { person: filters.person }),
      ...(filters.popularity === 'known' ? { min_votes: KNOWN_MIN_VOTES[thresholds] } : {}),
      ...(filters.popularity === 'lesser' ? { max_votes: LESSER_MAX_VOTES[thresholds] } : {}),
      ...(specialty === 'autumn' ? { min_autumn: AUTUMN_MIN_SCORE[thresholds] } : {}),
    }),
  );

  return (
    rows
      // `type` sale como string del generador: se comprueba en vez de suponerlo.
      .flatMap((row): ContentCandidate[] =>
        row.type === 'movie' || row.type === 'tv' ? [{ ...row, type: row.type, top_cast: row.top_cast ?? [] }] : [],
      )
      .filter((candidate) => candidate.similarity >= SEARCH_MIN_SIMILARITY)
      .map((candidate) => ({ ...candidate, rank_score: rankScore(candidate, specialty, filters.popularity) }))
      .sort((a, b) => b.rank_score - a.rank_score)
  );
}

/**
 * Si con todos los filtros sale casi nada, se quitan en este orden, de lo que
 * menos importa a lo que más. Nunca la persona, el idioma ni lo que no quiere:
 * si no hay nada de Wes Anderson, mejor decirlo que recomendar otra cosa.
 */
const RELAXATIONS: readonly { readonly label: string; readonly relax: (filters: SearchFilters) => SearchFilters }[] = [
  { label: 'popularidad', relax: (filters) => ({ ...filters, popularity: 'any' }) },
  { label: 'géneros', relax: (filters) => ({ ...filters, genresAny: [] }) },
  { label: 'época y duración', relax: (filters) => ({ ...filters, yearFrom: null, yearTo: null, maxRuntime: null }) },
];

export interface CandidateSearch {
  readonly candidates: RankedCandidate[];
  /** Los filtros que hubo que quitar, en el orden de `RELAXATIONS`. */
  readonly relaxed: readonly string[];
}

/** Busca por ánimo: los mejores de `query` con sus filtros, sin los excluidos. */
export async function searchCandidates(query: string, options: SearchOptions): Promise<CandidateSearch> {
  const vector = await embedQuery(query, options.trace);
  const keep = (candidates: readonly RankedCandidate[]): RankedCandidate[] =>
    candidates
      .filter((candidate) => options.exclude === undefined || !options.exclude(candidate))
      .slice(0, options.limit ?? DEFAULT_CANDIDATE_COUNT);

  let filters = options.filters ?? NO_FILTERS;
  let candidates = keep(await searchPool(vector, options, filters));
  const relaxed: string[] = [];
  for (const step of RELAXATIONS) {
    if (candidates.length >= MIN_FILTERED_RESULTS) break;
    const next = step.relax(filters);
    if (JSON.stringify(next) === JSON.stringify(filters)) continue;
    filters = next;
    relaxed.push(step.label);
    candidates = keep(await searchPool(vector, options, filters));
  }
  return { candidates, relaxed };
}

/** Minúsculas, sin tildes ni puntuación: «¡Olvídate de mí!» y «olvidate de mi» son iguales. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const CANDIDATE_COLUMNS =
  'id, tmdb_id, type, title, title_en, year, director, synopsis, synopsis_en, genres, autumn_score, poster_path, vote_count, vote_average, runtime, original_language, top_cast';

/**
 * Los candidatos de una búsqueda anterior, leídos de nuevo del corpus: es lo que
 * permite sacar «otra» sin volver a vectorizar. Mantienen el orden en que
 * salieron; uno que ya no está en el corpus se pierde.
 */
export async function loadCandidates(
  refs: readonly SearchCandidateRef[],
  specialty: Specialty | null = null,
): Promise<RankedCandidate[]> {
  if (refs.length === 0) return [];
  const rows = unwrap(
    await getSupabaseClient()
      .from('content')
      .select(CANDIDATE_COLUMNS)
      .in(
        'id',
        refs.map((ref) => ref.id),
      ),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return refs.flatMap((ref) => {
    const row = byId.get(ref.id);
    // `type` sale como string del generador; el CHECK de la tabla garantiza el valor.
    if (row === undefined || (row.type !== 'movie' && row.type !== 'tv')) return [];
    const candidate: ContentCandidate = { ...row, type: row.type, similarity: ref.similarity };
    return [{ ...candidate, rank_score: rankScore(candidate, specialty, 'any') }];
  });
}

/**
 * Los parecidos de un título («Más como esta»), en su orden: los calcula el
 * seed con lo que recomendaría un cinéfilo, el argumento y la popularidad
 * (`scripts/seed/similar.py`), mucho mejor que los vecinos del nombre.
 */
async function loadSimilar(contentId: string): Promise<RankedCandidate[]> {
  const rows = unwrap(
    await getSupabaseClient()
      .from('content_similar')
      .select('similar_id, similarity')
      .eq('content_id', contentId)
      .order('rank'),
  );
  return loadCandidates(rows.map((row) => ({ id: row.similar_id, similarity: row.similarity })));
}

export interface TitleSearch {
  /** Los que se llaman como alguno de los títulos pedidos, en español o en inglés. */
  readonly exact: RankedCandidate[];
  /** Los más parecidos, sin los excluidos: para «otra» o «algo como esta». */
  readonly similar: RankedCandidate[];
}

/**
 * Busca títulos concretos. El vector del título los encuentra (el texto
 * vectorizado lleva el español y el inglés), pero entre muchos de similitud
 * parecida: por eso los que coinciden de nombre van aparte, sin excluir los ya
 * recomendados, que alguien puede pedir de nuevo. Los parecidos son los de su
 * «Más como esta»; sin ellos, los vecinos del nombre.
 */
export async function searchTitles(titles: readonly string[], options: SearchOptions): Promise<TitleSearch> {
  const wanted = new Set(titles.map(normalizeTitle));
  const isWanted = (candidate: ContentCandidate): boolean =>
    wanted.has(normalizeTitle(candidate.title)) ||
    (candidate.title_en !== null && wanted.has(normalizeTitle(candidate.title_en)));

  const vector = await embedQuery(titles.join(' / '), options.trace);
  const pool = await searchPool(vector, { ...options, specialty: null }, NO_FILTERS);
  const exact = pool.filter(isWanted);
  const first = exact[0];
  const neighbours = first === undefined ? [] : await loadSimilar(first.id);
  const exclude = options.exclude;
  const similar = (neighbours.length > 0 ? neighbours : pool)
    .filter((candidate) => !isWanted(candidate) && (exclude === undefined || !exclude(candidate)))
    .slice(0, Math.max(0, (options.limit ?? DEFAULT_CANDIDATE_COUNT) - exact.length));
  return { exact, similar };
}

/** Cómo queda una búsqueda en la traza: lo justo para ver por qué salió cada uno. */
export function traceCandidates(candidates: readonly RankedCandidate[]): Json {
  return candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    year: candidate.year,
    votes: candidate.vote_count,
    similarity: Math.round(candidate.similarity * 1000) / 1000,
    rank_score: Math.round(candidate.rank_score * 1000) / 1000,
  }));
}

/** Cómo se recuerda una búsqueda en la conversación: solo ids y similitud, en su orden. */
export function toCandidateRefs(candidates: readonly RankedCandidate[]): SearchCandidateRef[] {
  return candidates.map(({ id, similarity }) => ({ id, similarity }));
}

// ─── POST /api/search ────────────────────────────────────────────────────────

export interface SearchRequest {
  readonly query: string;
  readonly contentType: ContentType | null;
  readonly limit: number;
  readonly filters: SearchFilters;
  readonly specialty: Specialty | null;
}

/** Valida el cuerpo de `POST /api/search` (`SearchRequestBody`). */
export function parseSearchRequest(body: unknown): SearchRequest {
  if (!isRecord(body)) {
    throw new ValidationError('La petición tiene que ser un objeto JSON.');
  }

  const type = body['type'];
  if (type !== undefined && type !== 'movie' && type !== 'tv') {
    throw new ValidationError('El tipo tiene que ser «movie» o «tv».');
  }

  const limit = body['limit'];
  if (
    limit !== undefined &&
    (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_RESULTS)
  ) {
    throw new ValidationError(`El límite tiene que ser un número entero de 1 a ${String(MAX_SEARCH_RESULTS)}.`);
  }

  const filters = body['filters'];
  if (filters !== undefined && !isRecord(filters)) {
    throw new ValidationError('Los filtros tienen que ser un objeto.');
  }
  const specialty = body['specialty'];
  if (specialty !== undefined && !isSpecialty(specialty)) {
    throw new ValidationError('Especialidad desconocida.');
  }

  return {
    // Masculino: los mensajes de `parseText` dicen «está vacío».
    query: parseText(body['query'], MAX_MESSAGE_CHARS, 'el texto de búsqueda'),
    contentType: type ?? null,
    limit: limit ?? DEFAULT_CANDIDATE_COUNT,
    filters: filters === undefined ? NO_FILTERS : parseSearchFilters(filters, API_FILTER_KEYS),
    specialty: specialty ?? null,
  };
}

export function toSearchResult(candidate: RankedCandidate): SearchResult {
  return {
    id: candidate.id,
    tmdb_id: candidate.tmdb_id,
    type: candidate.type,
    title: candidate.title,
    title_en: candidate.title_en,
    year: candidate.year,
    director: candidate.director,
    genres: candidate.genres ?? [],
    synopsis: candidate.synopsis ?? candidate.synopsis_en,
    poster_url: posterUrl(candidate.poster_path),
    similarity: candidate.similarity,
    autumn_score: candidate.autumn_score,
    vote_count: candidate.vote_count,
    rank_score: candidate.rank_score,
  };
}
