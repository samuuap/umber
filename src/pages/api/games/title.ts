/**
 * POST /api/games/title — corrige los intentos de «El título del día».
 *
 * El navegador manda todos los intentos de la partida cada vez, y aquí se
 * vuelven a corregir contra el título del día: el servidor no guarda partidas.
 * La solución solo sale cuando la partida ha terminado, y la sinopsis (sin las
 * palabras del título) tras cuatro fallos. Contrato en `src/lib/types.ts`
 * (`TitleGameRequestBody`, `TitleGameResponse`).
 *
 * Sin rate limit, como `/explorar`: no llama a ningún modelo ni gasta cupo de
 * nadie, solo una lectura que se queda en memoria todo el día.
 */
import type { APIRoute } from 'astro';

import { errorResponse, readJson } from '@/lib/api';
import { parseTitlePlay, playTitle } from '@/lib/games';

export const POST: APIRoute = async ({ request }) => {
  try {
    const play = parseTitlePlay(await readJson(request));
    return Response.json(await playTitle(play), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return errorResponse(error, 'api/games/title');
  }
};
