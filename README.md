# Umber

Tu cinéfilo de confianza, con IA. Le cuentas a Umber cómo estás y qué te gusta,
te hace unas preguntas y te recomienda la película o la serie que encaja, con el
porqué y dónde verla. Además, dos juegos diarios de cine: el cartel del día y el
título del día.

**En producción:** [umber365.vercel.app](https://umber365.vercel.app)

Por debajo, Umber no se inventa títulos: busca por similitud semántica en un
corpus de unas 16.000 películas y series conocidas, vectorizadas en Supabase
pgvector, y DeepSeek pone la voz. El otoño, con el que empezó el proyecto, es
ahora una especialidad.

La documentación técnica completa (esquema, flujo del chat, convenciones y
estética) está en [`.claude/CLAUDE.md`](.claude/CLAUDE.md), y el estado del
trabajo, en [`docs/`](docs/README.md).

## Stack

| Capa | Tecnología |
|---|---|
| Web | Astro (SSR) y Tailwind CSS, sin framework de interfaz |
| Modelo | DeepSeek-V4.1-Flash (`deepseek-flash`), en streaming |
| Embeddings | Qwen3-Embedding-0.6B (1024 dimensiones) en Cloudflare Workers AI |
| Base de datos y cuentas | Supabase: PostgreSQL, pgvector y Auth |
| Datos de cine | TMDB y, para las plataformas, JustWatch a través de TMDB |
| Despliegue | Vercel, en Dublín, junto a Supabase |

## Puesta en marcha

Hace falta Node.js 22.12 o más y cuentas en [DeepSeek](https://platform.deepseek.com),
[Supabase](https://supabase.com), [TMDB](https://www.themoviedb.org/settings/api) y
[Cloudflare](https://dash.cloudflare.com) (Workers AI, gratis hasta 10.000 neuronas al día).

```bash
npm install
cp .env.example .env.local   # y rellena las credenciales
npm run dev                  # http://localhost:4321
```

### Embeddings en local, opcional

Para trabajar sin conexión, o para vectorizar el corpus entero sin pasar del cupo
de Cloudflare, hay un servidor Python que habla la misma API. Necesita Python
3.10 o más:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r scripts/embeddings/requirements.txt -r scripts/seed/requirements.txt
npm run embeddings   # http://127.0.0.1:8080/v1; la primera vez descarga el modelo (~1,2 GB)
```

Antes de apuntar `EMBEDDINGS_URL` a un servicio nuevo, comprueba que da los mismos
vectores que el corpus con `python scripts/seed/check-embeddings.py`: si no, la
búsqueda empeora sin dar ningún error.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción, para Vercel |
| `npm run typecheck` | `astro check`: TypeScript y plantillas |
| `npm test` | Tests de la lógica pura con Vitest (`src/lib/*.test.ts`) |
| `npm run db:push` | Aplica las migraciones de `supabase/migrations/` |
| `npm run db:verify` | Comprueba el esquema, RLS y restricciones |
| `npm run db:types` | Regenera los tipos de la base |
| `npm run check:guardrails` | Casos delicados contra el chat; repetir al tocar el system prompt |
| `npm run embeddings` | Servidor local de Qwen3-Embedding |

El seed del corpus (descarga de TMDB, puntuación, vectores y carga) y el
calendario de los juegos (`scripts/seed/games.py`) están explicados en
[`.claude/CLAUDE.md`](.claude/CLAUDE.md#comandos).

## Automatización

GitHub Actions, en `.github/workflows/`:

- **CI**, en cada push: tipos, tests y build.
- **Supabase**, cada lunes: mantiene el proyecto activo (el plan gratuito lo
  pausa tras 7 días sin uso) y guarda una copia de la base cifrada con GPG.
- **Saldo de DeepSeek**, cada día: falla, y GitHub avisa por email, si baja de 3 USD.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| [1](docs/fase-1-scaffolding.md) | Andamiaje y configuración base | ✅ |
| [2](docs/fase-2-base-de-datos.md) | Esquema de Supabase, pgvector y RLS | ✅ |
| [3](docs/fase-3-seed-corpus.md) | Seed del corpus desde TMDB | ✅ |
| [4](docs/fase-4-api-chat.md) | API del chat con streaming | ✅ |
| [5](docs/fase-5-frontend.md) | Frontend, ficha de contenido y cuentas | ✅ |
| [6](docs/fase-6-pulido-despliegue.md) | Pulido, producto completo y despliegue | 🔄 |
| [7](docs/fase-7-premium.md) | Planes de pago | 💤 |
| [8](docs/fase-8-experto-general.md) | Umber experto general, trazabilidad y panel de admin | 🔄 |
| [9](docs/fase-9-juegos.md) | Juegos del día | ✅ |

Datos e imágenes de [TMDB](https://www.themoviedb.org/). Umber usa la API de
TMDB, pero no está respaldado ni certificado por TMDB.
