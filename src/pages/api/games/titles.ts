/**
 * GET /api/games/titles?q=… — el buscador de «El cartel del día»: películas del
 * catálogo por título (en los dos idiomas) o director, las más conocidas
 * primero.
 *
 * Es el buscador de `/explorar`, sin sesión ni rate limit como él. La respuesta
 * no depende de quién pregunta: la CDN la guarda un día.
 */
import type { APIRoute } from 'astro';

import { errorResponse } from '@/lib/api';
import { parseTitleQuery, searchGameTitles } from '@/lib/games';
import type { GameTitleSearchResponse } from '@/lib/types';

const CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400';

export const GET: APIRoute = async ({ url }) => {
  try {
    const body: GameTitleSearchResponse = {
      results: await searchGameTitles(parseTitleQuery(url.searchParams.get('q'))),
    };
    return Response.json(body, { headers: { 'Cache-Control': CACHE_CONTROL } });
  } catch (error: unknown) {
    return errorResponse(error, 'api/games/titles');
  }
};
