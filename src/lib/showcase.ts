/**
 * Títulos de escaparate: los fotogramas y carteles que dan ambiente a la portada
 * y a las páginas de cuenta.
 *
 * Dos fondos, porque Umber es general y el otoño, una especialidad (Fase 8):
 *
 * - **General**: películas muy conocidas y bien valoradas (`GENERAL_MIN_VOTES`,
 *   `GENERAL_MIN_RATING`): las que cualquiera reconoce de un fotograma. De una de
 *   ellas sale la portada, con sus parecidos («Si te gustó…»).
 * - **Otoño**: películas de drama y romance otoñales, sin terror, fantasía,
 *   misterio, comedia ni infantil, para el apartado de la especialidad. Lo más
 *   otoñal del corpus es Halloween y cine de miedo; con estos filtros quedan
 *   títulos del tono de *El sabor del sake* o *La tormenta de hielo*.
 *
 * Se elige por criterio y no por ids: el corpus cambia con cada seed.
 */
import { errorMessage } from '@/lib/errors';
import { getSupabaseClient, unwrap } from '@/lib/supabase';
import type { ContentType } from '@/lib/types';

export interface ShowcaseTitle {
  readonly id: string;
  readonly type: ContentType;
  readonly title: string;
  readonly year: number | null;
  readonly director: string | null;
  readonly poster_path: string;
  readonly backdrop_path: string | null;
  readonly vote_count: number | null;
}

const COLUMNS = 'id, type, title, year, director, poster_path, backdrop_path, vote_count';

/** Unas 300 películas: *El padrino*, *Interstellar*, *Parásitos*, *El viaje de Chihiro*… */
const GENERAL_MIN_VOTES = 5000;
const GENERAL_MIN_RATING = 7.4;
/** «Si te gustó…» solo con parecidos que también sean conocidos. */
const RELATED_MIN_VOTES = 1500;

const AUTUMN_MIN_SCORE = 0.7;
const AUTUMN_GENRES = ['Drama', 'Romance'];
const AUTUMN_EXCLUDED_GENRES =
  '{"Terror","Animación","Familia","Fantasía","Ciencia ficción","Misterio","Suspense","Crimen","Comedia","Acción","Aventura","Bélica","Música"}';

const POOL_SIZE = 400;
/**
 * El corpus solo cambia con un seed: una consulta por instancia cada hora basta,
 * y la portada no espera a la base en cada visita.
 */
const CACHE_MS = 60 * 60 * 1000;

type Row = Omit<ShowcaseTitle, 'type' | 'poster_path'> & { type: string; poster_path: string | null };

/** Una sola versión de cada título (hay tres *Mujercitas*), y solo con cartel. */
function toTitles(rows: readonly Row[]): ShowcaseTitle[] {
  const seen = new Set<string>();
  return rows.flatMap((row): ShowcaseTitle[] => {
    if (row.poster_path === null || seen.has(row.title) || (row.type !== 'movie' && row.type !== 'tv')) return [];
    seen.add(row.title);
    return [{ ...row, type: row.type, poster_path: row.poster_path }];
  });
}

function cached(load: () => Promise<readonly ShowcaseTitle[]>): () => Promise<readonly ShowcaseTitle[]> {
  let cache: { readonly at: number; readonly titles: readonly ShowcaseTitle[] } | null = null;
  return async () => {
    if (cache !== null && Date.now() - cache.at < CACHE_MS) return cache.titles;
    const titles = await load();
    cache = { at: Date.now(), titles };
    return titles;
  };
}

const generalPool = cached(async () =>
  toTitles(
    unwrap(
      await getSupabaseClient()
        .from('content')
        .select(COLUMNS)
        .eq('type', 'movie')
        .gte('vote_count', GENERAL_MIN_VOTES)
        .gte('vote_average', GENERAL_MIN_RATING)
        .not('backdrop_path', 'is', null)
        .order('vote_count', { ascending: false })
        .limit(POOL_SIZE),
    ),
  ),
);

const autumnPool = cached(async () =>
  toTitles(
    unwrap(
      await getSupabaseClient()
        .from('content')
        .select(COLUMNS)
        // Solo películas: los carteles de series, más chillones, rompían el tono.
        .eq('type', 'movie')
        .gte('autumn_score', AUTUMN_MIN_SCORE)
        .overlaps('genres', AUTUMN_GENRES)
        .not('genres', 'ov', AUTUMN_EXCLUDED_GENRES)
        .order('autumn_score', { ascending: false })
        .limit(POOL_SIZE),
    ),
  ),
);

function shuffle<T>(items: readonly T[]): T[] {
  return items
    .map((item) => ({ item, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

/** El escaparate es ambiente: si la base no responde, la página sigue sin él. */
async function safely<T>(label: string, fallback: T, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    console.warn(`[showcase] Sin ${label}:`, errorMessage(error));
    return fallback;
  }
}

/** Una película muy conocida, con fotograma, distinta en cada visita. `null` si no hay. */
export function pickStill(): Promise<ShowcaseTitle | null> {
  return safely('fotograma', null, async () => shuffle(await generalPool())[0] ?? null);
}

/** `count` muy conocidas al azar: el respaldo si una no tiene parecidos conocidos. */
export function pickKnown(count: number, except: string | null = null): Promise<ShowcaseTitle[]> {
  return safely('títulos', [], async () =>
    shuffle((await generalPool()).filter((title) => title.id !== except)).slice(0, count),
  );
}

/**
 * Los parecidos de un título que también son conocidos, en el orden de «Más
 * como esta» (`content_similar`, que calcula el seed): para «Si te gustó…».
 */
export function pickRelated(id: string, count: number): Promise<ShowcaseTitle[]> {
  return safely('parecidos', [], async () => {
    const rows = unwrap(
      await getSupabaseClient()
        .from('content_similar')
        .select(`similar:similar_id (${COLUMNS})`)
        .eq('content_id', id)
        .order('rank'),
    );
    return toTitles(rows.map((row) => row.similar))
      .filter((title) => (title.vote_count ?? 0) >= RELATED_MIN_VOTES)
      .slice(0, count);
  });
}

/** `count` títulos otoñales al azar, para el apartado de la especialidad. */
export function pickAutumn(count: number): Promise<ShowcaseTitle[]> {
  return safely('títulos de otoño', [], async () => shuffle(await autumnPool()).slice(0, count));
}
