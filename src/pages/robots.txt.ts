/**
 * GET /robots.txt — fuera lo privado, lo que no tiene sentido indexar (el chat
 * pide consentimiento antes) y la API; el sitemap, con el dominio de la petición.
 */
import type { APIRoute } from 'astro';

const DISALLOW = [
  '/admin',
  '/api/',
  '/auth/',
  '/cuenta',
  '/conversaciones',
  '/favoritos',
  '/chat',
  '/antes-de-hablar',
  '/salir',
  // Toda URL con parámetros: los filtros de /explorar (tipo × género × orden ×
  // página) y las fichas que los arrastran eran millones de URLs para un bot,
  // cada una una función. Lo que se indexa ya está en el sitemap, sin ellos.
  '/*?',
];

export const GET: APIRoute = ({ url }) =>
  new Response(
    ['User-agent: *', ...DISALLOW.map((path) => `Disallow: ${path}`), '', `Sitemap: ${url.origin}/sitemap.xml`, ''].join(
      '\n',
    ),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400' } },
  );
