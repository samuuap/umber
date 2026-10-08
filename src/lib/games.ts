/**
 * Juegos del día (Fase 9): «El cartel del día» y «El título del día».
 *
 * La película de cada juego y día está en `daily_games`, que rellena por
 * adelantado `scripts/seed/games.py`. Son las soluciones, también las de mañana:
 * solo se leen aquí, con la secret key.
 *
 * El servidor no guarda partidas. El navegador manda todos los intentos cada
 * vez y aquí se vuelven a corregir: no hay estado que se pueda desincronizar, y
 * lo único que se puede forzar es lo mismo que perder (los intentos malos
 * enseñan las pistas y la solución, como acabar la partida).
 */
import sharp from 'sharp';

import { UUID_PATTERN } from '@/lib/api';
import { requireSupabaseSecretKey } from '@/lib/env';
import { TmdbError, ValidationError, toError } from '@/lib/errors';
import { redactTitle, revealLetters, titleLetters } from '@/lib/game-rules';
import { getSupabaseAdminClient, getSupabaseClient, unwrap } from '@/lib/supabase';
import { TMDB_IMAGE_BASE_URL, posterUrl } from '@/lib/tmdb';
import {
  POSTER_MAX_ATTEMPTS,
  TITLE_CLUES,
  TITLE_LETTER_PICKS,
  TITLE_MAX_ATTEMPTS,
  isLocale,
  type GameAnswer,
  type GameKind,
  type GameTitleOption,
  type GuessResult,
  type Locale,
  type PosterGameResponse,
  type PosterGuessResult,
  type TitleClue,
  type TitleGameResponse,
} from '@/lib/types';

// ─── El día ──────────────────────────────────────────────────────────────────

/** El público es de España: el juego cambia a medianoche de Madrid. */
export const GAME_TIME_ZONE = 'Europe/Madrid';

// `en-CA` escribe las fechas como `2026-10-08`.
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: GAME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El día de Madrid, `YYYY-MM-DD`. */
export function gameDay(now: Date = new Date()): string {
  return DAY_FORMAT.format(now);
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * El día de una partida: hoy o uno anterior. Uno anterior vale para quien
 * empezó antes de medianoche y acaba después; uno futuro sería la solución de
 * mañana.
 */
function parseGameDay(value: unknown): string {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError('Falta el día de la partida, o no es una fecha.');
  }
  // Las fechas ISO se ordenan igual como texto.
  if (value > gameDay()) throw new ValidationError('Ese día todavía no ha llegado.');
  return value;
}

// ─── La película del día ─────────────────────────────────────────────────────

export interface DailyGame {
  readonly game: GameKind;
  readonly day: string;
  /** El que se comparte: «El título del día #12». */
  readonly number: number;
  readonly contentId: string;
  /** El de España y el inglés, limpios: los calcula `games.py`, no el corpus. */
  readonly titles: Readonly<Record<Locale, string>>;
  readonly year: number | null;
  readonly director: string | null;
  readonly synopsis: Readonly<Record<Locale, string | null>>;
  /** El cartel sin texto, para desenfocarlo. */
  readonly blurPosterPath: string;
  /** El cartel de siempre, con el título: el que se enseña al acabar. */
  readonly posterPath: string | null;
  readonly collectionId: number | null;
}

/**
 * Lo leído, por juego y día. No cambia en todo el día (y los anteriores, nunca),
 * así que una instancia que siga viva no vuelve a la base. Con tope, por los
 * días anteriores que alguien termine.
 */
const cache = new Map<string, Promise<DailyGame | null>>();
const CACHE_ENTRIES = 16;

async function fetchDailyGame(game: GameKind, day: string): Promise<DailyGame | null> {
  const row = unwrap(
    await getSupabaseAdminClient()
      .from('daily_games')
      .select(
        'number, content_id, title_es, title_en, poster_path, content:content_id (year, director, synopsis, synopsis_en, poster_path, collection_id)',
      )
      .eq('game', game)
      .eq('day', day)
      .limit(1),
  )[0];
  if (row === undefined) return null;
  return {
    game,
    day,
    number: row.number,
    contentId: row.content_id,
    titles: { es: row.title_es, en: row.title_en },
    year: row.content.year,
    director: row.content.director,
    synopsis: { es: row.content.synopsis, en: row.content.synopsis_en },
    blurPosterPath: row.poster_path,
    posterPath: row.content.poster_path,
    collectionId: row.content.collection_id,
  };
}

/** La partida de ese juego y día, o `null` si no hay (nadie ha rellenado los días). */
export function loadDailyGame(game: GameKind, day: string = gameDay()): Promise<DailyGame | null> {
  const key = `${game}:${day}`;
  let loading = cache.get(key);
  if (loading === undefined) {
    loading = fetchDailyGame(game, day);
    // Un fallo no se queda en la caché: la siguiente petición lo reintenta.
    loading.catch(() => cache.delete(key));
    cache.set(key, loading);
    if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? key);
  }
  return loading;
}

async function requireDailyGame(game: GameKind, day: string): Promise<DailyGame> {
  const daily = await loadDailyGame(game, day);
  // Un 400 y no un 404: es la petición la que pide algo que no hay.
  if (daily === null) throw new ValidationError('No hay partida de ese día.');
  return daily;
}

function answerOf(daily: DailyGame, language: Locale): GameAnswer {
  return {
    content_id: daily.contentId,
    title: daily.titles[language],
    year: daily.year,
    director: daily.director,
    poster_url: posterUrl(daily.posterPath),
  };
}

function parseGuessList(value: unknown, max: number, allowEmpty: boolean): unknown[] {
  if (!Array.isArray(value) || (value.length === 0 && !allowEmpty)) throw new ValidationError('Faltan los intentos.');
  if (value.length > max) throw new ValidationError(`Son ${String(max)} intentos como mucho.`);
  return value;
}

/** El intento acertado solo puede ser el último: después no hay partida. */
function checkSolvedLast(results: readonly GuessResult[]): void {
  const correctAt = results.indexOf('correct');
  if (correctAt !== -1 && correctAt < results.length - 1) {
    throw new ValidationError('Esa partida ya está resuelta.');
  }
}

function parseRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('El cuerpo de la petición tiene que ser un objeto.');
  }
  return body as Record<string, unknown>;
}

// ─── El título del día ───────────────────────────────────────────────────────

export interface TitlePlay {
  readonly day: string;
  readonly language: Locale;
  readonly letters: readonly string[];
  /** Las letras de cada intento, o `null` si se pidió la pista. */
  readonly guesses: readonly (readonly string[] | null)[];
}

const LETTER_PATTERN = /^[A-ZÑ]$/u;

export function parseTitlePlay(body: unknown): TitlePlay {
  const record = parseRecord(body);
  const language = record['language'];
  if (!isLocale(language)) throw new ValidationError('El idioma tiene que ser «es» o «en».');

  const letters = record['letters'];
  if (
    !Array.isArray(letters) ||
    letters.length !== TITLE_LETTER_PICKS ||
    !letters.every((letter): letter is string => typeof letter === 'string' && LETTER_PATTERN.test(letter)) ||
    new Set(letters).size !== letters.length
  ) {
    throw new ValidationError(`Elige ${String(TITLE_LETTER_PICKS)} letras distintas.`);
  }

  const guesses = parseGuessList(record['guesses'], TITLE_MAX_ATTEMPTS, true).map((guess) => {
    if (guess === null) return null;
    if (typeof guess !== 'string' || ![...guess].every((letter) => LETTER_PATTERN.test(letter))) {
      throw new ValidationError('Cada intento va solo con letras mayúsculas, sin tildes.');
    }
    return [...guess];
  });
  return { day: parseGameDay(record['day']), language, letters, guesses };
}

/** La pista `index` (0 es el año), con lo que se enseña de ella. */
async function titleClue(daily: DailyGame, language: Locale, index: number): Promise<TitleClue> {
  const kind = TITLE_CLUES[index] ?? 'poster';
  switch (kind) {
    case 'year':
      return { kind, value: daily.year === null ? null : String(daily.year) };
    case 'director':
      return { kind, value: daily.director };
    case 'synopsis': {
      // La de su idioma y, si falta, la otra. Sin las palabras de los dos títulos.
      const synopsis = daily.synopsis[language] ?? daily.synopsis[language === 'es' ? 'en' : 'es'];
      return { kind, value: synopsis === null ? null : redactTitle(synopsis, [daily.titles.es, daily.titles.en]) };
    }
    case 'poster':
      return { kind, value: await posterImagePath('title', daily.day, 0) };
  }
}

export async function playTitle(play: TitlePlay): Promise<TitleGameResponse> {
  const daily = await requireDailyGame('title', play.day);
  const answer = titleLetters(daily.titles[play.language]);
  const solution = answer.join('');

  const results = play.guesses.map((guess): GuessResult => {
    if (guess === null) return 'skip';
    if (guess.length !== answer.length) {
      throw new ValidationError(`El título tiene ${String(answer.length)} letras.`);
    }
    return guess.join('') === solution ? 'correct' : 'miss';
  });
  checkSolvedLast(results);

  const solved = results.at(-1) === 'correct';
  const failed = solved ? results.length - 1 : results.length;
  const finished = solved || results.length >= TITLE_MAX_ATTEMPTS;
  // Cada fallo destapa una pista; al perder ya están todas.
  const clues = await Promise.all(
    Array.from({ length: Math.min(failed, TITLE_CLUES.length) }, (_, index) => titleClue(daily, play.language, index)),
  );
  const present = new Set(answer);

  return {
    revealed: revealLetters(answer, play.letters),
    absent: play.letters.filter((letter) => !present.has(letter)),
    results,
    clues,
    solved,
    finished,
    answer: finished ? answerOf(daily, play.language) : null,
  };
}

// ─── El cartel del día ───────────────────────────────────────────────────────

export interface PosterPlay {
  readonly day: string;
  readonly guesses: readonly (string | null)[];
}

export function parsePosterPlay(body: unknown): PosterPlay {
  const record = parseRecord(body);
  const guesses = parseGuessList(record['guesses'], POSTER_MAX_ATTEMPTS, false).map((guess) => {
    if (guess === null) return null;
    if (typeof guess !== 'string' || !UUID_PATTERN.test(guess)) {
      throw new ValidationError('Cada intento tiene que ser una película del catálogo, o pasar.');
    }
    return guess.toLowerCase();
  });
  return { day: parseGameDay(record['day']), guesses };
}

/** Los ids que son de la misma saga que la película del día. */
async function sameSaga(daily: DailyGame, ids: readonly string[]): Promise<Set<string>> {
  if (daily.collectionId === null || ids.length === 0) return new Set();
  const rows = unwrap(
    await getSupabaseClient().from('content').select('id').in('id', ids).eq('collection_id', daily.collectionId),
  );
  return new Set(rows.map((row) => row.id));
}

export async function playPoster(play: PosterPlay): Promise<PosterGameResponse> {
  const daily = await requireDailyGame('poster', play.day);
  const wrong = play.guesses.filter((guess): guess is string => guess !== null && guess !== daily.contentId);
  const saga = await sameSaga(daily, wrong);
  const results = play.guesses.map((guess): PosterGuessResult => {
    if (guess === null) return 'skip';
    if (guess === daily.contentId) return 'correct';
    return saga.has(guess) ? 'saga' : 'miss';
  });
  checkSolvedLast(results.map((result) => (result === 'saga' ? 'miss' : result)));

  const solved = results.at(-1) === 'correct';
  const finished = solved || results.length >= POSTER_MAX_ATTEMPTS;
  return {
    results,
    solved,
    finished,
    // Con cada fallo, el cartel se ve un poco más.
    image_url: finished ? null : await posterImagePath('poster', play.day, results.length),
    answer: finished ? answerOf(daily, 'es') : null,
  };
}

// ─── El cartel desenfocado ───────────────────────────────────────────────────
/*
 * El desenfoque se hace aquí, no en el navegador: con un `filter: blur()` sobre
 * el cartel de TMDB bastaría abrir la imagen para verlo nítido. Cada nivel va
 * firmado (HMAC con la secret key): sin la firma, se podría pedir el último
 * nivel desde el primer intento. Mismo juego, día y nivel, misma imagen para
 * todos, así que la CDN la guarda y `sharp` trabaja unas pocas veces al día.
 */

/** Ancho del cartel: se ve a unos 300 px, y en pantallas de doble densidad pide 600. */
const POSTER_WIDTH = 500;
const POSTER_HEIGHT = 750;

/**
 * Sigma del desenfoque de cada nivel, a 500 px de ancho. En el cartel, uno por
 * intento: el primero deja ver los colores y la composición; el último, casi
 * todo (elegidos mirando *Interstellar*, *Joker* y *Matrix* a cada nivel). En el
 * título es la última pista, y se tiene que reconocer: un solo nivel, suave.
 */
const BLUR_SIGMAS: Readonly<Record<GameKind, readonly number[]>> = {
  poster: [58, 38, 25, 16, 9, 4.5],
  title: [6],
};

const encoder = new TextEncoder();
let signingKey: Promise<CryptoKey> | undefined;

async function sign(payload: string): Promise<string> {
  signingKey ??= crypto.subtle.importKey(
    'raw',
    // Con una etiqueta propia: esta firma no sirve para nada más que la use la clave.
    encoder.encode(`umber-games:${requireSupabaseSecretKey()}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey, encoder.encode(payload)));
  // base64url, recortada: 22 caracteres son 132 bits, de sobra para una firma que no protege dinero.
  return btoa(String.fromCharCode(...signature))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .slice(0, 22);
}

/** La ruta del cartel del juego y día con el desenfoque del nivel `level` (0 es el primero). */
export async function posterImagePath(game: GameKind, day: string, level: number): Promise<string> {
  const signature = await sign(`${game}:${day}:${String(level)}`);
  const params = new URLSearchParams({ game, day, level: String(level), sig: signature });
  return `/api/games/poster-image?${params.toString()}`;
}

/** Comparación en tiempo constante: que la firma no se pueda adivinar carácter a carácter. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export interface PosterImageRequest {
  readonly game: GameKind;
  readonly day: string;
  readonly level: number;
}

/** Lanza `ValidationError` si falta algo o la firma no es la de ese juego, día y nivel. */
export async function parsePosterImageRequest(params: URLSearchParams): Promise<PosterImageRequest> {
  const game = params.get('game');
  if (game !== 'poster' && game !== 'title') throw new ValidationError('Ese juego no existe.');
  const day = parseGameDay(params.get('day'));
  const level = Number(params.get('level'));
  if (!Number.isInteger(level) || level < 0 || level >= BLUR_SIGMAS[game].length) {
    throw new ValidationError('Ese nivel del cartel no existe.');
  }
  const expected = await sign(`${game}:${day}:${String(level)}`);
  if (!sameText(params.get('sig') ?? '', expected)) throw new ValidationError('La firma del cartel no es válida.');
  return { game, day, level };
}

/** El cartel sin texto del día, desenfocado para el nivel `level`. JPEG. */
export async function renderPosterImage({ game, day, level }: PosterImageRequest): Promise<Uint8Array<ArrayBuffer>> {
  const daily = await requireDailyGame(game, day);

  let response: Response;
  try {
    response = await fetch(`${TMDB_IMAGE_BASE_URL}/w500${daily.blurPosterPath}`, {
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error: unknown) {
    throw new TmdbError(`No se pudo descargar el cartel: ${toError(error).message}`, 502, error);
  }
  if (!response.ok) throw new TmdbError(`TMDB respondió ${String(response.status)} con el cartel.`);

  const sigma = BLUR_SIGMAS[game][level] ?? 58;
  const image = await sharp(await response.arrayBuffer())
    .resize(POSTER_WIDTH, POSTER_HEIGHT, { fit: 'cover' })
    .blur(sigma)
    .jpeg({ quality: 74, mozjpeg: true })
    .toBuffer();
  return new Uint8Array(image);
}

// ─── El buscador del cartel ──────────────────────────────────────────────────

const MAX_QUERY_CHARS = 60;
const MAX_OPTIONS = 8;

export function parseTitleQuery(value: string | null): string {
  const query = (value ?? '').trim().slice(0, MAX_QUERY_CHARS);
  if (query.length < 2) throw new ValidationError('Escribe al menos dos letras.');
  return query;
}

/**
 * Películas del catálogo cuyo título (en los dos idiomas) o director encaja, las
 * más conocidas primero. Es `explore_content`, el buscador de `/explorar`: sin
 * tildes ni mayúsculas.
 */
export async function searchGameTitles(query: string): Promise<GameTitleOption[]> {
  const rows = unwrap(
    await getSupabaseClient().rpc('explore_content', {
      p_type: 'movie',
      p_query: query,
      p_sort: 'popular',
      p_limit: MAX_OPTIONS,
    }),
  );
  return rows.map((row) => ({ id: row.id, title: row.title, title_en: row.title_en, year: row.year }));
}
