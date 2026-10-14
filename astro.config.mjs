// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';

import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // SSR: el chat necesita endpoints de servidor con streaming.
  output: 'server',
  adapter: vercel(),

  // CSP con los hashes de los scripts y estilos que genera Astro. En las páginas
  // SSR va como cabecera, así que `frame-ancestors` sí se aplica (en un <meta>
  // no). No funciona en `astro dev`: se prueba con `build` + `preview`. Las
  // otras cabeceras de seguridad las pone `src/middleware.ts`.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' https://image.tmdb.org",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ],
    },
  },
  // No se pinta Markdown con código (los prompts se leen con `?raw`), y Shiki
  // usa estilos en línea que el CSP bloquearía.
  markdown: { syntaxHighlight: false },

  // Esquema de variables de entorno. Se consume siempre desde `src/lib/env.ts`.
  // `context: 'server'` impide que el bundle de cliente pueda importarlas.
  env: {
    schema: {
      // DeepSeek — solo chat (no tiene endpoint de embeddings)
      DEEPSEEK_API_KEY: envField.string({ context: 'server', access: 'secret' }),

      // Embeddings — Qwen3-Embedding-0.6B por la API de OpenAI. En producción,
      // Cloudflare Workers AI; en local sin conexión, `npm run embeddings`.
      EMBEDDINGS_URL: envField.string({
        context: 'server',
        access: 'public',
        default: 'http://127.0.0.1:8080/v1',
      }),
      // El token de Cloudflare. El servidor local no pide nada.
      EMBEDDINGS_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      // Nombre del modelo en el servicio: `@cf/qwen/qwen3-embedding-0.6b` en Cloudflare.
      EMBEDDINGS_MODEL: envField.string({
        context: 'server',
        access: 'public',
        default: 'Qwen/Qwen3-Embedding-0.6B',
      }),

      // Supabase
      SUPABASE_URL: envField.string({ context: 'server', access: 'public' }),
      SUPABASE_PUBLISHABLE_KEY: envField.string({ context: 'server', access: 'secret' }),
      // Solo scripts de seed y endpoints de servidor. Nunca en cliente.
      SUPABASE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),

      // TMDB
      TMDB_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      TMDB_READ_ACCESS_TOKEN: envField.string({ context: 'server', access: 'secret' }),

      // App
      PUBLIC_APP_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'http://localhost:4321',
      }),
    },
  },

  // Fuentes autoalojadas y optimizadas en build. Se exponen como variables CSS
  // que consume el tema de Tailwind en `src/styles/global.css`.
  //
  // «La sala a oscuras» (tipografía del 2026-10-14): Libre Franklin, la versión
  // libre de la Franklin Gothic de la prensa y de los créditos de cine, para
  // titulares e interfaz, con un solo archivo variable de 400 a 800; y
  // Newsreader de lectura (opsz 16) para lo que dicen Umber y las sinopsis. La
  // de lectura no se precarga: solo la descargan las páginas que la usan.
  // `latin` cubre el español entero (tildes, ñ, ¿¡); un nombre con otra letra
  // sale con la de respaldo.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Libre Franklin',
      cssVariable: '--font-franklin',
      weights: ['400 800'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Newsreader',
      cssVariable: '--font-newsreader-text',
      weights: [400, 600],
      // La cursiva, de verdad y no inclinada: el navegador solo la baja si un texto la usa.
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
      options: { experimental: { variableAxis: { opsz: ['16'] } } },
    },
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
