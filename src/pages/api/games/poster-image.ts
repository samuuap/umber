/**
 * GET /api/games/poster-image?day=…&level=…&sig=… — el cartel del día con el
 * desenfoque de un intento.
 *
 * Las rutas las firma el servidor (`posterImagePath`): la página da la del
 * primer intento y `/api/games/poster` la de cada fallo. Sin firma, se podría
 * pedir el cartel casi nítido desde el principio. La imagen de un día y nivel
 * es la misma para todos y no cambia: la CDN la guarda, y `sharp` trabaja unas
 * pocas veces al día.
 */
import type { APIRoute } from 'astro';

import { errorResponse } from '@/lib/api';
import { parsePosterImageRequest, renderPosterImage } from '@/lib/games';

/** Un día en el navegador y una semana en la CDN: la imagen de un día y nivel no cambia. */
const CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800, immutable';

export const GET: APIRoute = async ({ url }) => {
  try {
    const image = await renderPosterImage(await parsePosterImageRequest(url.searchParams));
    return new Response(image, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE_CONTROL } });
  } catch (error: unknown) {
    return errorResponse(error, 'api/games/poster-image');
  }
};
