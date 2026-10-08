/**
 * POST /api/games/poster — corrige los intentos de «El cartel del día».
 *
 * Como `/api/games/title`: todos los intentos cada vez, y el servidor no guarda
 * nada. Con cada fallo devuelve la ruta firmada del cartel un poco menos
 * desenfocado (`/api/games/poster-image`); al acabar, la solución. Contrato en
 * `src/lib/types.ts` (`PosterGameRequestBody`, `PosterGameResponse`).
 */
import type { APIRoute } from 'astro';

import { errorResponse, readJson } from '@/lib/api';
import { parsePosterPlay, playPoster } from '@/lib/games';

export const POST: APIRoute = async ({ request }) => {
  try {
    const play = parsePosterPlay(await readJson(request));
    return Response.json(await playPoster(play), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return errorResponse(error, 'api/games/poster');
  }
};
