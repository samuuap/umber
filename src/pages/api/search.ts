/**
 * POST /api/search — búsqueda semántica en el corpus, sin pasar por el modelo.
 *
 * Es la misma búsqueda que ve Umber (vectorizar, `search_content`, suelo de
 * similitud y reordenado con `autumn_score`), así que sirve para depurar por qué
 * el chat recomienda lo que recomienda. Contrato en `src/lib/types.ts`
 * (`SearchRequestBody`, `SearchResponse`).
 *
 * Tiene su propio rate limit: no gasta DeepSeek, pero sí el servicio de
 * embeddings, que es nuestro y se puede saturar. Deja traza como el chat.
 */
import type { APIRoute } from 'astro';

import { errorResponse, publicError, readClientAddress, readJson } from '@/lib/api';
import { getRequestUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { describeFilters, parseSearchRequest, searchCandidates, toSearchResult, traceCandidates } from '@/lib/search';
import { RequestTrace, hashClient } from '@/lib/trace';
import type { SearchResponse } from '@/lib/types';

export const POST: APIRoute = async (context) => {
  const trace = new RequestTrace('search');
  try {
    const search = parseSearchRequest(await readJson(context.request));
    trace.message = search.query;
    const user = await getRequestUser({ request: context.request, locals: context.locals });
    const clientAddress = readClientAddress(context);
    trace.userId = user?.id ?? null;
    trace.clientHash = await hashClient(clientAddress);
    await trace.time('limits', enforceRateLimit('search', { userId: user?.id ?? null, clientAddress }));
    trace.admitted = true;

    const { candidates, relaxed } = await trace.time(
      'search',
      searchCandidates(search.query, {
        contentType: search.contentType,
        limit: search.limit,
        trace,
        filters: search.filters,
        specialty: search.specialty,
      }),
    );
    trace.search = {
      kind: 'api',
      query: search.query,
      type: search.contentType,
      filters: describeFilters(search.filters),
      relaxed: [...relaxed],
      candidates: traceCandidates(candidates),
    };
    const body: SearchResponse = { results: candidates.map(toSearchResult), relaxed };
    await trace.save({ status: 200, errorCode: null });
    return Response.json(body);
  } catch (error: unknown) {
    const response = errorResponse(error, 'api/search');
    const code = publicError(error).body.error.code;
    await trace.save({ status: response.status, errorCode: code });
    return response;
  }
};
