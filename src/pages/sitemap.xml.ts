/**
 * GET /sitemap.xml — las páginas públicas y la ficha de cada título del corpus
 * (unas 16.000, por debajo del tope de 50.000 URLs de un sitemap). Un día en la
 * CDN: el corpus solo cambia al recargar el seed.
 */
import type { APIRoute } from 'astro';

import { EXPLORE_PATH } from '@/lib/explore';
import { LEGAL_PAGES } from '@/lib/legal';
import { getSupabaseClient, unwrap } from '@/lib/supabase';

const PAGE_SIZE = 1000;
const STATIC_PATHS = ['/', EXPLORE_PATH, '/juegos', '/juegos/cartel', '/juegos/titulo', '/sobre-umber'];

async function contentIds(): Promise<string[]> {
  const ids: string[] = [];
  for (;;) {
    const rows = unwrap(
      await getSupabaseClient()
        .from('content')
        .select('id')
        .order('id')
        .range(ids.length, ids.length + PAGE_SIZE - 1),
    );
    ids.push(...rows.map((row) => row.id));
    if (rows.length < PAGE_SIZE) return ids;
  }
}

export const GET: APIRoute = async ({ url }) => {
  const paths = [
    ...STATIC_PATHS,
    ...LEGAL_PAGES.map((page) => page.href),
    ...(await contentIds()).map((id) => `${EXPLORE_PATH}/${id}`),
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `<url><loc>${new URL(path, url.origin).href}</loc></url>`),
    '</urlset>',
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
};
