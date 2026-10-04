# CLAUDE.md — Proyecto Umber 🍂

Experto en cine con IA (antes, planificador otoñal: el otoño es ahora una especialidad). Chat conversacional que recomienda películas y series según el ánimo y los gustos del usuario, usando DeepSeek + búsqueda semántica sobre un corpus de ~16.000 títulos conocidos vectorizados en Supabase pgvector. Plan y estado en `docs/fase-8-experto-general.md`.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Astro + Tailwind CSS |
| LLM | DeepSeek-V4.1-Flash (`deepseek-flash`) |
| Embeddings | Qwen3-Embedding-0.6B (1024 dim, API de OpenAI): Cloudflare Workers AI; en local, `npm run embeddings` |
| Base de datos | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth |
| Datos de cine | TMDB API v3 |
| Deploy | Vercel |

---

## Estructura del proyecto

```
/
├── src/
│   ├── components/          # SiteHeader, SiteFooter, LeafMark, ContentCard, PosterCard, ChatMessage, AuthForm, AuthScene
│   ├── layouts/
│   │   └── Layout.astro     # Layout base: tema, tipografías, metadatos, cabecera y pie
│   ├── middleware.ts        # Sesión de Supabase (cookies) en Astro.locals, en cada petición
│   ├── env.d.ts             # Tipos de Astro.locals
│   ├── pages/
│   │   ├── index.astro      # Portada: el cuadro para empezar (GET a /chat?mode=…&q=…), cómo funciona, «Si te gustó…», el apartado de otoño
│   │   ├── chat.astro       # Chat: ?mode=movie para empezar (&q= lo envía al abrir), ?conversation=<id> para retomar
│   │   ├── entrar.astro     # Login (formulario sin JS)
│   │   ├── registro.astro   # Registro: usuario, email y contraseña dos veces; exige confirmar el email
│   │   ├── salir.ts         # POST: cierra la sesión de este navegador
│   │   ├── favoritos.astro  # Favoritos, con plataformas pedidas a TMDB en servidor
│   │   ├── conversaciones.astro  # Conversaciones guardadas; POST para borrar una
│   │   ├── explorar/
│   │   │   ├── index.astro  # El corpus en carteles: búsqueda, tipo, género, orden, páginas
│   │   │   └── [id].astro   # Ficha de un título: sinopsis, plataformas, favorito, «Más como esta»
│   │   ├── auth/
│   │   │   └── confirm.ts   # Vuelta del enlace del email (code o token_hash)
│   │   └── api/
│   │       ├── chat.ts      # Endpoint principal — orquesta búsqueda, DeepSeek y SSE
│   │       ├── favorites.ts # POST / DELETE de favoritos
│   │       ├── search.ts    # POST: la búsqueda del chat sin el modelo (depurar, buscador)
│   │       └── tmdb.ts      # GET: plataformas de un título del corpus, con caché
│   ├── lib/
│   │   ├── env.ts           # Único acceso a variables de entorno (servidor)
│   │   ├── env.client.ts    # Variables públicas para el navegador
│   │   ├── errors.ts        # Jerarquía de errores tipados
│   │   ├── types.ts         # Tipos de dominio, los 4 modos y el contrato de /api/chat
│   │   ├── database.types.ts  # Tipos de las tablas de Supabase
│   │   ├── deepseek.ts      # Cliente DeepSeek y pasarela: toda llamada queda registrada
│   │   ├── trace.ts         # Traza de cada petición: pasos, llamadas a modelos, tokens y coste
│   │   ├── llm-pricing.ts   # Precio de DeepSeek por token, con hora punta
│   │   ├── supabase.ts      # Clientes Supabase (anon / cookies / usuario / service)
│   │   ├── tmdb.ts          # Funciones TMDB
│   │   ├── platforms.ts     # Plataformas de TMDB con caché en Supabase (platforms_cache)
│   │   ├── rate-limit.ts    # Límites de /api/chat y /api/search por usuario o IP
│   │   ├── recommendations.ts # Fichas por id, para las conversaciones retomadas
│   │   ├── explore.ts       # Filtros de /explorar en la URL, listado, géneros y ficha
│   │   ├── showcase.ts      # Escaparate: muy conocidas y sus parecidos, y el de otoño; con caché
│   │   ├── embeddings.ts    # Generación de embeddings (Qwen3 autoalojado)
│   │   ├── search.ts        # Búsqueda semántica: suelo de similitud y reordenado
│   │   ├── chat.ts          # Validación del chat, contexto del modelo y fichas
│   │   ├── turns.ts         # Estado de la conversación: preguntas, búsqueda, candidatos que quedan
│   │   ├── prompts.ts       # Carga y rellena las plantillas de src/prompts/
│   │   ├── auth.ts          # Usuario de la sesión o del token, redirecciones y errores
│   │   ├── conversations.ts # Leer, listar y guardar conversaciones con RLS
│   │   ├── favorites.ts     # Favoritos con RLS
│   │   ├── api.ts           # JSON y errores comunes de los endpoints
│   │   ├── locale.ts        # Idioma y región desde Accept-Language
│   │   ├── markdown.ts      # Texto de Umber a HTML, escapado (servidor y navegador)
│   │   └── chat-stream.ts   # Lector del SSE de /api/chat en el navegador
│   ├── scripts/             # JavaScript del navegador (sin framework)
│   │   ├── chat.ts          # El chat: envío, stream, errores, fichas
│   │   ├── content-card.ts  # Rellenar fichas y botón de favorito
│   │   ├── explore.ts       # Aplicar al momento el género y el orden de /explorar
│   │   ├── home.ts          # Intro envía en el cuadro de la portada; el índice cambia de cartel
│   │   ├── transitions.ts   # El cartel pulsado viaja a la ficha (View Transitions)
│   │   ├── auth-form.ts     # Mostrar la contraseña y avisar si las dos no coinciden
│   │   └── conversations.ts # Confirmar antes de borrar una conversación
│   ├── prompts/
│   │   ├── system.md        # System prompt de Umber (identidad, tono, reglas)
│   │   ├── specialty-autumn.md  # Capa de la especialidad de otoño
│   │   └── user-context.md  # Plantilla del user prompt con {{variables}}
│   └── styles/
│       └── global.css       # Tailwind + tema otoñal
├── scripts/
│   ├── verify-schema.mjs    # Comprueba esquema y RLS vía Data API
│   ├── check-guardrails.mjs # Casos delicados contra el chat: fuera de tema, crisis, piratería…
│   ├── eval-chat.mjs        # 30 peticiones reales de punta a punta: cumple lo pedido y juez
│   ├── eval-dialogue.mjs    # Personas simuladas con gustos ocultos: ¿acierta preguntando?
│   ├── embeddings/
│   │   └── server.py        # Qwen3-Embedding local con la API de OpenAI (sin conexión)
│   └── seed/
│       ├── common.py        # Entorno, HTTP, JSONL y el texto canónico de cada título
│       ├── fetch-tmdb.py    # Descarga el universo de candidatos de TMDB
│       ├── score.py         # autumn_score (3 pasadas de deepseek-flash, media) y selección
│       ├── embed.py         # Vectoriza el corpus con Qwen3: búsqueda y «sin nombre»
│       ├── load-db.py       # Upsert del corpus en Supabase pgvector y sus parecidos
│       ├── search.py        # Búsquedas de control contra el corpus cargado
│       └── check-embeddings.py  # ¿Da un servicio los mismos vectores que el corpus?
├── supabase/
│   ├── config.toml          # Configuración del CLI
│   └── migrations/          # Esquema versionado, en orden de aplicación
├── docs/                    # Estado del trabajo por fases (ver abajo)
├── public/
├── .claude/CLAUDE.md
├── vercel.json              # Región de las funciones: dub1, junto a Supabase (eu-west-1)
└── .env.local               # Nunca al repositorio
```

## Estado del proyecto

El seguimiento del trabajo vive en [`docs/`](../docs/README.md), un archivo por
fase con lo hecho, lo pendiente, las decisiones tomadas con su motivo y las
preguntas abiertas. Antes de empezar a trabajar, leer el archivo de la fase
correspondiente; al cerrar una fase, actualizarlo.

Este documento es la fuente de verdad **técnica**; `docs/` es la del **estado**.
Una decisión que cambie el esquema o el stack va a los dos sitios.

---

## Variables de entorno

```bash
DEEPSEEK_API_KEY=          # Solo chat: DeepSeek no tiene endpoint de embeddings

EMBEDDINGS_URL=            # Cloudflare Workers AI: https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1
EMBEDDINGS_API_KEY=        # Token de Cloudflare (Workers AI Read y Edit)
EMBEDDINGS_MODEL=          # @cf/qwen/qwen3-embedding-0.6b (el servidor local: Qwen/Qwen3-Embedding-0.6B)

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=      # Scripts de seed y servidor. /api/chat no funciona sin ella (rate limiting)

TMDB_API_KEY=
TMDB_READ_ACCESS_TOKEN=

PUBLIC_APP_URL=
```

`SUPABASE_SECRET_KEY` nunca en el cliente, solo en servidor y scripts de administración.

Los nombres siguen la nomenclatura actual del dashboard de Supabase
(`sb_publishable_…` / `sb_secret_…`). En proyectos antiguos las mismas claves
aparecen etiquetadas como `anon public` y `service_role`.

---

## Comandos

```bash
npm run dev        # Desarrollo local
npm run build      # Build de producción
npm run preview    # Preview del build
npm run typecheck  # astro check
npm run embeddings # Qwen3-Embedding local en EMBEDDINGS_URL (necesita .venv, ver seed)

# Base de datos (migraciones versionadas en supabase/migrations/)
npx supabase login                                  # una vez, abre el navegador
npx supabase link --project-ref <ref-del-proyecto>  # una vez
npm run db:push    # aplica las migraciones pendientes
npm run db:verify  # comprueba esquema, RLS y restricciones vía Data API
npm run db:verify-rls  # comprueba el aislamiento entre dos usuarios reales
npm run db:types   # regenera src/lib/database.types.ts desde el esquema real
npm run check:guardrails  # 17 casos delicados contra el chat (npm run dev); repetir al tocar system.md
node scripts/eval-chat.mjs [url] [--only a,b] [--debug]  # 30 peticiones reales, comprobadas y con juez
node scripts/eval-dialogue.mjs [url] [--runs 4] [--debug] # personas simuladas con perfil oculto; juez

# Seed del corpus (una vez, o para actualizaciones). Python ≥ 3.10: el del sistema es 3.9
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r scripts/embeddings/requirements.txt -r scripts/seed/requirements.txt
npm run embeddings                  # en otra terminal
python scripts/seed/fetch-tmdb.py   # universo de ~17.000 títulos de TMDB, con reparto y recomendaciones
python scripts/seed/score.py        # autumn_score y selección (lo conocido, más lo de otoño)
python scripts/seed/embed.py        # vectoriza el corpus (búsqueda y «sin nombre»)
# En local y no en Cloudflare, que pasa de su cupo diario con miles de documentos:
#   EMBEDDINGS_URL=http://127.0.0.1:8080/v1 EMBEDDINGS_API_KEY= EMBEDDINGS_MODEL= python scripts/seed/embed.py
python scripts/seed/suggest.py      # lo que recomendaría un cinéfilo (DeepSeek, ~1–2 USD una vez)
python scripts/seed/load-db.py      # upsert en Supabase y parecidos (--prune borra lo que sobra;
                                    # se para si alguien lo guardó: --drop-favorites para borrarlo igual)
python scripts/seed/load-db.py --similar-only   # solo los parecidos, sin reescribir content
# Tras recargar muchos vectores, reconstruir el índice: el grafo HNSW se degrada
npx supabase db query --linked "reindex index public.content_embedding_hnsw_idx"
python scripts/seed/search.py "tarde de lluvia"   # búsquedas de control
python scripts/seed/eval-similar.py                # «Más como esta», puntuado por un juez (céntimos)
python scripts/seed/check-embeddings.py            # ¿da el servicio de .env.local los vectores del corpus?
```

Todos los pasos cachean en `scripts/seed/data/` (ignorado en git): se reanudan
tras un corte y reejecutarlos no repite llamadas ni duplica filas.

---

## Esquema de base de datos

### `content` — películas y series del corpus

```sql
CREATE TABLE content (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id       INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('movie', 'tv')),
  title         TEXT NOT NULL,
  title_en      TEXT,
  year          INTEGER,
  director      TEXT,
  synopsis      TEXT,
  synopsis_en   TEXT,
  genres        TEXT[],
  keywords      TEXT[],
  autumn_score  FLOAT,          -- especialidad de otoño, 0–1, en todos los títulos
  embedding     HALFVEC(1024),  -- Qwen3-Embedding-0.6B, dimensión nativa, 2 bytes por número
  poster_path   TEXT,
  backdrop_path TEXT,
  runtime       INTEGER,
  seasons       INTEGER,
  status        TEXT CHECK (status IN ('released', 'ended', 'ongoing')),
  vote_count        INTEGER,    -- votos en TMDB: lo conocido que es
  vote_average      REAL,
  popularity        REAL,       -- la de TMDB, que se mueve con las tendencias
  original_language TEXT,       -- ISO 639-1
  top_cast          TEXT[] NOT NULL DEFAULT '{}',  -- los 6 primeros del reparto
  collection_id     INTEGER,    -- saga de TMDB (belongs_to_collection)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- TMDB numera películas y series en espacios independientes: /movie/550 y
  -- /tv/550 son obras distintas. La unicidad debe incluir el tipo.
  UNIQUE (tmdb_id, type)
);

-- HNSW y no ivfflat: no hay que dimensionar listas, da mejor recall y se puede
-- crear sobre la tabla vacía. Con 5.000 filas, ivfflat con lists=100 dejaría
-- ~50 filas por lista y degradaría la recuperación.
CREATE INDEX content_embedding_hnsw_idx ON content USING hnsw (embedding halfvec_cosine_ops);
```

Qué contiene cada columna, tal como la rellena el seed:

- `title` y `synopsis` en español (es-ES, o si no otra variante del español);
  `title_en` y `synopsis_en` en inglés. Todo título tiene al menos una de las
  dos sinopsis
- `genres` en español, para mostrar. `keywords` en inglés: TMDB no las traduce
- `director`: en series, quien la crea (`created_by`), que es el equivalente
- **Qué entra** (Fase 8): lo conocido. Películas con 200 votos o más y nota por
  encima de 3,5; series de todo tipo con 500 o más. Y, para la especialidad de
  otoño, lo que entraba antes aunque no llegue: otoñal (películas 32+, series
  40+) y relevante (300 votos y nota de 6 o 7; sin mínimo de votos lo muy
  otoñal, 60+, y lo de los dos últimos años). Constantes en `score.py`
- `people_search`: dirección y reparto en minúsculas y sin tildes, para el
  filtro por persona de `search_content`. Lo mantiene un trigger: no escribirlo
- `vote_count`, `vote_average`, `popularity`, `top_cast` y `collection_id` salen
  de una segunda descarga de TMDB (`data/extras-*.jsonl`), con sus
  recomendaciones, que no van a la base: las usa «Más como esta»
- `autumn_score` entre 0 y 1, **en todos los títulos**: la media de 3
  puntuaciones de deepseek-flash (0–100), en lotes distintos, / 100. Es la
  especialidad de otoño: ya no decide qué entra al corpus, solo lo de otoño.
  El criterio de la puntuación es **otoño antes que Halloween**:
  Halloween cuenta si la película va de él, y el terror sin Halloween ni ambiente
  otoñal puntúa 40 como mucho. El prompt está en `scripts/seed/score.py`
- `embedding`: de un texto en inglés (título, sinopsis, géneros y keywords),
  con la sinopsis española solo si falta la inglesa. Lleva también el título
  español cuando es otro (unas tres cuartas partes): sin él, «Cadena perpetua» no
  encontraba *The Shawshank Redemption*. Lo construye `document_text()` en
  `scripts/seed/common.py`
- `embedding` en `halfvec` (Fase 8): la mitad de espacio, con recall@10 del
  98,5 % frente al 99 % de `vector` (20 consultas). `search_content` recibe un
  `vector(1024)`, como siempre, y lo convierte

### `users_favorites`

```sql
CREATE TABLE users_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id  UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, content_id)
);
```

### `profiles`

```sql
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- true si nadie tiene ese nombre. Para anon: explica por qué falló un registro
is_username_available(p_username TEXT) RETURNS BOOLEAN
```

- `username` es **copia** de `raw_user_meta_data->>'username'` de `auth.users`:
  la escriben dos triggers (`sync_profile_from_auth_user`), al crearse el usuario
  y cada vez que cambia ese dato. Por eso la app lo lee de la sesión
  (`user_metadata` de los claims) sin consultar la tabla. Nunca escribirlo en
  `profiles` desde la app: no hay políticas de escritura
- Si el nombre está cogido o no cumple el formato, falla la operación de Auth
  entera (registro o `updateUser`) con un error genérico de base de datos. Se
  manda ya normalizado, en minúsculas (`normalizeUsername()` en `src/lib/auth.ts`)
- Sin `username` en los metadatos (Admin API, cuentas anteriores, Google cuando
  llegue) queda en `null`

### `conversations`

```sql
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL CHECK (mode IN ('movie', 'tv', 'weekend', 'month')),
  specialty   TEXT CHECK (specialty IN ('autumn')),  -- null: Umber general (Fase 8)
  messages    JSONB NOT NULL DEFAULT '[]',  -- { role, content, created_at } y, en los de
                                           -- Umber, recommendation_ids y language
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Añade al final en un solo UPDATE, con RLS de quien llama. false si no existe
-- o es de otro usuario. Nunca leer, concatenar y reescribir `messages` desde la
-- app: con dos peticiones a la vez se pierde un turno
append_conversation_messages(p_id UUID, p_messages JSONB) RETURNS BOOLEAN
```

### Función de búsqueda semántica

```sql
CREATE OR REPLACE FUNCTION search_content(
  query_embedding VECTOR(1024),
  content_type    TEXT DEFAULT NULL,
  match_count     INT DEFAULT 10,
  min_score       FLOAT DEFAULT 0.5,
  -- Filtros (Fase 8): los que pidió la persona, todos opcionales
  genres_any TEXT[], genres_none TEXT[], year_from INT, year_to INT,
  max_runtime INT, languages TEXT[], min_votes INT, max_votes INT,
  person TEXT,          -- dirección o reparto, sin tildes ni mayúsculas
  min_autumn FLOAT      -- la especialidad de otoño
)
RETURNS TABLE (
  id UUID, tmdb_id INTEGER, type TEXT, title TEXT, title_en TEXT,
  year INTEGER, director TEXT, synopsis TEXT, synopsis_en TEXT,
  genres TEXT[], autumn_score FLOAT, poster_path TEXT,
  vote_count INTEGER, vote_average REAL, runtime INTEGER,
  original_language TEXT, top_cast TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql STABLE
SET search_path = public, extensions
```

La implementación está en `supabase/migrations/`, que es la fuente real. Lo que
no se ve en la firma:

- Es **PL/pgSQL y no SQL** solo para poder lanzar un error si el vector no tiene
  1024 dimensiones. Postgres **no** aplica los modificadores de tipo a los
  parámetros de función, así que el `VECTOR(1024)` de la firma no valida nada: un
  vector de otra dimensión entraría y la consulta devolvería 0 filas en silencio
- Descarta las filas con `embedding IS NULL`
- Devuelve los dos títulos y las dos sinopsis: el chat da los candidatos en el
  idioma de la respuesta. Cambiar las columnas de `RETURNS TABLE` obliga a
  borrarla y crearla entera (ver `20260930180000`), con todo lo de esta lista
- Limita `match_count` a 50: está expuesta por PostgREST a `anon`
- Lleva `SET hnsw.iterative_scan = strict_order`. Sin él, el índice HNSW devuelve
  como mucho 40 filas (`ef_search`) y el filtro por tipo se aplica después: con
  solo 500 series, las búsquedas de `tv` se quedaban en 2 o 3 candidatos. No
  quitarlo, y si se recrea la función, volver a ponerlo
- Y `SET hnsw.ef_search = 100` (por defecto, 40): con 40 el índice devolvía el
  94 % de los 10 mejores, y en búsquedas por título el 70 %; con 100, el 97,5 %
  (`20261003190000`). Lo mismo: si se recrea la función, volver a ponerlo
- El `min_score` por defecto (0.5) es alto para este modelo: en películas, lo
  bueno cae entre 0,40 y 0,55, y en series, que son 500, puede quedarse en 0,32
- **No pasarle un `min_score` que pocas filas superen.** La búsqueda iterativa
  sigue recorriendo el índice hasta completar el `LIMIT`: con 0.99, hasta 4,3 s y
  un timeout del rol `anon`. El chat pide con `min_score = -1` y aplica su suelo
  (0,30) en `src/lib/search.ts`; como las filas llegan ordenadas, da lo mismo
- **Dos caminos** (Fase 8): con filtros, cuenta antes las filas que pasan (unos
  30 ms) y, si son 4.000 o menos, busca **exacto sobre lo filtrado**, sin el
  índice, que filtra según recorre y con tan pocos tendría que recorrerlo casi
  entero (pasaba de 3 s). Con más, o sin filtros, el índice con
  `iterative_scan`. En caliente, 0,1–0,6 s; diez a la vez, 0,4 s. Son dos
  consultas: con un `CASE` en el `ORDER BY` el planificador no usaría el índice
  nunca. El `+ 0` del camino exacto es para que no lo use
- **La app la llama con la secret key** (`searchPool`): el rol `anon` corta a los
  3 s, y con la base en frío una búsqueda filtrada podía pasar de ahí. El corpus
  es público, así que no cambia lo que se puede leer
- **Tras una migración que reescriba las filas de `content`** (un `update` de
  toda la tabla, como la de `people_search`), `vacuum full public.content` y
  reconstruir el índice HNSW: sin ello, las búsquedas pasaron de 0,1 a 2 s
- **El filtro por persona va sobre `content.people_search`** (dirección y
  reparto ya plegados, con un trigger). Plegar en cada búsqueda eran 112.000
  llamadas a `fold_search_text`, que no se incrusta por llevar `search_path`:
  «de Nolan» llegaba al timeout de `anon`

### Explorar el corpus

```sql
-- Una página del listado; en cada fila, el total con esos filtros
explore_content(p_type TEXT, p_genre TEXT, p_query TEXT,
                p_sort TEXT DEFAULT 'autumn',  -- 'popular' | 'autumn' | 'recent' | 'title'
                p_limit INT DEFAULT 36, p_offset INT DEFAULT 0)
  RETURNS TABLE (id, type, title, title_en, year, poster_path, autumn_score, total_count)

content_genres(p_type TEXT DEFAULT NULL) RETURNS TABLE (genre TEXT, titles BIGINT)
```

- `p_query` busca en el título (los dos idiomas) y en el director, **sin tildes
  ni mayúsculas**: «otono» encuentra «Otoño». Lo hace `fold_search_text()` con
  `translate`, no con la extensión unaccent. `%` y `_` del usuario son texto
- Expuestas a `anon` (el corpus es público) y con `p_limit` de 60 como mucho
- Se usan desde `src/lib/explore.ts`; sus filas pasan por `ExploreItem` en
  `src/lib/types.ts`, por la misma razón que `search_content`

### `content_similar` — «Más como esta»

```sql
CREATE TABLE content_similar (
  content_id  UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  rank        SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 30),  -- 1, el más parecido
  similar_id  UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  similarity  FLOAT NOT NULL,
  PRIMARY KEY (content_id, rank)
);
```

- Los 12 más parecidos a cada título, del mismo tipo. **Los calcula el seed**
  (`scripts/seed/similar.py`, desde `load-db.py`), no la web: la ficha solo los
  lee, sin búsqueda vectorial. `similarity` es la puntuación del método
- **Método híbrido** (Fase 8), seis señales con pesos medidos con
  `eval-similar.py` (40 películas, juez de DeepSeek; ver la Fase 8):
  - **Cinéfilo**: lo que deepseek-flash recomendaría a quien adoró el título
    (`suggest.py`, 10 por título, una vez). Solo cuenta lo que se encuentra en el
    corpus por título y año: no puede colar uno inventado
  - **Argumento**: un **segundo vector, de lo que cuenta cada título sin su
    nombre** (`plot_text()`). Con el de búsqueda, que lleva el título, dos títulos
    se parecían por cómo se llaman (*Cuando Harry encontró a Sally* junto a
    *Harry, un amigo que os quiere*, un thriller)
  - **TMDB** (sus recomendaciones), **géneros**, **keywords** y **popularidad**
  - Reglas: el mismo público (ni infantil para lo que no lo es, ni lo contrario)
    y nada de terror para quien no lo pide, salvo que lo sugieran el cinéfilo o
    TMDB; dos como mucho de una saga; una versión de cada título
- El vector de argumento no va a la base (`data/plot-embeddings.jsonl`): otra
  columna y su índice costarían espacio del plan gratuito. Por fuerza bruta en
  numpy, en bloques: exacto y en unos segundos
- Lectura pública, como el corpus; sin políticas de escritura

### `platforms_cache` y `rate_limits` — solo servidor

```sql
CREATE TABLE platforms_cache (
  content_id  UUID PRIMARY KEY REFERENCES content(id) ON DELETE CASCADE,
  by_region   JSONB NOT NULL,        -- {"ES": ["Netflix", "Filmin"], …}
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rate_limits (
  key            TEXT NOT NULL,      -- '<ámbito>:user:<uuid>', '<ámbito>:ip:<dirección>' (IPv6: su /64) o '<ámbito>:global'
  window_seconds INTEGER NOT NULL,
  window_start   TIMESTAMPTZ NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  hits           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_seconds, window_start)
);

-- 0 si la petición cabe; si no, segundos hasta poder repetir
hit_rate_limit(p_key TEXT, p_window_seconds INT[], p_limits INT[]) RETURNS INTEGER
```

- Las dos tablas tienen RLS **sin políticas** y sin permisos para `anon` ni
  `authenticated`; `hit_rate_limit` solo la ejecuta `service_role`. Se usan con
  `getSupabaseAdminClient()`: no son datos de ningún usuario, y abrir la función
  a la publishable key dejaría gastar el cupo de otra IP
- `by_region` lleva **todas las regiones**, ya normalizadas por
  `getStreamingNamesByRegion()`: TMDB las manda juntas. Una región que no aparece no
  tiene plataformas de suscripción ni gratis. La caducidad (3 días) la aplica
  `src/lib/platforms.ts`; una fila caducada no se borra, porque sirve de
  respaldo si TMDB no responde
- `hit_rate_limit` cuenta en ventanas fijas alineadas con la época (el día es de
  UTC) y borra lo caducado en cada llamada. Los límites viven en
  `src/lib/rate-limit.ts`

### Trazabilidad — solo servidor

```sql
chat_traces    -- una fila por petición admitida a /api/chat o /api/search: quién (user_id
               -- o client_hash), mensaje, respuesta, búsqueda con sus candidatos,
               -- recomendadas, títulos inventados, pasos con su duración, estado
llm_calls      -- cada llamada a un modelo de esa petición: tokens (y los de caché),
               -- coste en USD, primer token, duración, herramienta y argumentos
usage_daily    -- tokens y coste por día (UTC), proveedor, modelo y propósito
request_daily  -- peticiones por día, endpoint, estado y con o sin sesión

-- Guarda una petición y sus llamadas en un solo viaje, y suma en los agregados
record_trace(p_trace JSONB, p_calls JSONB) RETURNS VOID
-- Borra el texto a los 30 días y las trazas a los 90. pg_cron, cada noche a las 03:17 UTC
prune_traces() RETURNS VOID
```

- Las cuatro tablas, como `rate_limits`: RLS sin políticas y sin permisos para
  `anon` ni `authenticated`. Las dos funciones solo las ejecuta `service_role`
- **Una petición que no pasa el rate limit no deja traza**, solo suma en
  `request_daily` (`p_trace.admitted = false`). Las inválidas (400) tampoco: se
  validan antes del límite. Si dejaran fila, insistir llenaría la base
- La IP nunca se guarda: `client_hash` es un HMAC de la clave del rate limit
  (`hashClient` en `src/lib/trace.ts`)
- Borrar una cuenta o una conversación borra sus trazas en cascada; los
  agregados diarios no llevan nada de nadie y se quedan
- Decisión de producto: el texto de las consultas se guarda 30 días, también el
  de quien no tiene cuenta. Va en la política de privacidad

---

## Flujo del chat

Umber, cinéfilo general (Fase 8), conversa: pregunta de 3 a 5 veces para
entender qué quiere (ánimo, compañía, gustos, conocida o no), salvo que le pidan
que recomiende ya («sin preguntas», «sorpréndeme»: `wantsToSkipQuestions`),
decide él cuándo buscar y busca con un resumen que escribe él y los filtros que
la persona ha pedido de forma explícita. Lo que la persona ha nombrado como visto
o favorito no se le recomienda. Si piden otra, la
saca de los mismos 10 candidatos hasta agotarlos. Si nombran un título concreto,
lo comprueba con `buscar_por_titulo` en cualquier turno menos el forzado (4
preguntas seguidas), que tiene que recomendar. Reglas y estado en
`src/lib/turns.ts`.

**Especialidad** (`?especialidad=otono` en `/chat`, `specialty` en la API, y en
la conversación guardada): solo títulos de otoño (`autumn_score` ≥ 0,32 en
películas y 0,40 en series), el otoño pesa al ordenar y el system prompt lleva la
capa de `src/prompts/specialty-autumn.md`. Sin ella, Umber es general y el otoño
no pesa nada.

```
Usuario escribe
      ↓
POST /api/chat → validar (parseChatRequest)
      ↓
A la vez:
  - Rate limit (hit_rate_limit): 8/min; 50/día con cuenta; sin ella, una
    conversación de prueba al día por IP (20 mensajes, `trial_used`); y, si
    cabe, 300/día entre todos (techo del gasto de DeepSeek) → 429
  - Historial: de Supabase si hay conversation_id, si no el que manda el cliente
      ↓
Estado (conversationState): preguntas seguidas, última búsqueda, candidatos que
quedan. Idioma de la respuesta (detectMessageLanguage)
      ↓
Candidatos que quedan de la última búsqueda: de la base por id, con plataformas
      ↓
DeepSeek (`deepseek-flash`) con dos herramientas (turnToolsFor). Sin búsqueda
previa y antes de 3 preguntas, solo buscar_por_titulo (salvo que pida que le
recomiende ya); con 5 preguntas seguidas, solo buscar_titulos y tool_choice
required; el resto, las dos y auto. DeepSeek a veces llama a una
herramienta que no se le ofreció: el servidor la trata como buscar_titulos
  ├─ texto: una pregunta, u «otra» de los que quedan → al cliente
  ├─ buscar_por_titulo(«Cadena perpetua / The Shawshank Redemption», intención):
  │     «verlo»: los que se llaman así primero, y sus parecidos de «Más como
  │     esta» (`content_similar`) hasta 10. «parecido» (le encantó, ya la vio,
  │     quiere algo así): solo los parecidos; lo nombrado va de referencia y no
  │     puede recomendarlo. Si no está, no cuenta como búsqueda: Umber lo dice y
  │     sigue preguntando
  └─ buscar_titulos(resumen en inglés + filtros: géneros, años, duración,
     idiomas, persona, popularidad):
        Evento `searching` al cliente («Buscando títulos que encajen…»)
              ↓
        Embedding del resumen (Qwen3-Embedding, Cloudflare Workers AI)
              ↓
        pgvector con los filtros → 30 candidatos, sin los ya recomendados.
        Con menos de 3, se quitan filtros por orden (popularidad, géneros,
        época y duración; nunca persona, idioma ni lo excluido) y se le dice
              ↓
        Reordenar por similitud + 0,08 × popularidad (+ 0,2 × otoño en la
        especialidad) → 10, con votos, nota, duración, idioma y reparto
              ↓
        Plataformas (platforms_cache, 3 días; si no, TMDB con 2 s de tope)
              ↓
        Segunda llamada a DeepSeek con los candidatos → la recomendación
      ↓
Stream SSE al cliente (los primeros 280 caracteres se retienen: un preámbulo
antes de buscar se descarta)
      ↓
Guardar en Supabase (si autenticado; append_conversation_messages) con search y
recommendation_ids → evento `done` → traza (`record_trace`) → cerrar el stream
```

La búsqueda ocurre con el stream ya abierto, detrás del evento `searching`: la
espera más larga del chat (unos 4 s, sobre todo el embedding de Cloudflare)
tiene un aviso en pantalla. Por eso un fallo del buscador llega como evento
`error`, no con su código HTTP.

Contrato de `POST /api/chat`, tipado en `src/lib/types.ts`:

- **Cuerpo** (`ChatRequestBody`): `mode`, `message` (≤ 1.000 caracteres) y,
  opcionales, `history` (mensajes `user`/`assistant`, solo sin conversación
  guardada; el navegador manda la conversación entera), `conversation_id`,
  `locale`, `region` y `specialty` (`autumn`; con `conversation_id` manda la
  guardada). Los mensajes de Umber del historial llevan lo que
  devolvió `done`: `search` y `recommendation_ids`. Sin eso, el servidor no sabe
  qué candidatos le quedan
- **Tope por conversación**: 40 mensajes contando los de Umber
  (`MAX_CONVERSATION_MESSAGES`, 20 turnos). El que no cabe recibe 409
  `conversation_full`. En los dos últimos turnos Umber va cerrando, y el chat
  avisa cuando quedan 5. Para `conversation_full` y `trial_used`, la interfaz
  muestra un panel (empezar otra, o crear cuenta) en vez de un error. El resto
  de errores salen en la burbuja con lo que se puede hacer (`recoveryFor` en
  `src/scripts/chat.ts`): «Reintentar» si repetir puede servir, «Entrar de
  nuevo» con `auth_error`, «Empezar una nueva» con `not_found`
- **Sesión**: la de las cookies (el navegador) o `Authorization: Bearer
  <access_token>` (scripts). Sin ninguna se chatea sin guardar; con un token
  inválido o caducado, 401
- **Respuesta** (`ChatStreamEvent`): `text/event-stream` con `delta { text }`
  por fragmento, `searching {}` justo antes de buscar y, al final, `done {
  conversation_id, recommendations, search }` o `error { code, message }`.
  `recommendations` trae la ficha de cada título que Umber ha nombrado (vacío
  si ha preguntado): id del corpus, póster y plataformas. `search` es la
  búsqueda del turno (resumen y candidatos), o `null`
- **Errores antes de abrir el stream** (validar, sesión, rate limit, historial,
  abrir DeepSeek): JSON `{ error: { code, message } }` con el `status` del error
  tipado (400, 401, 404, 409, 429, 502). `message` se puede mostrar tal cual. El
  429 (`rate_limited` o `trial_used`) lleva `Retry-After` en segundos. Lo que falla después,
  búsqueda incluida, llega como evento `error` con el mismo `code` y `message`

Los otros dos endpoints, con el mismo formato de error:

- **`POST /api/search`** (`SearchRequestBody` → `SearchResponse`): `{ query,
  type?, limit?, filters?, specialty? }`, con `limit` de 1 a 30 y los mismos
  filtros que el chat (`genres_any`, `genres_none`, `year_from`, `year_to`,
  `max_runtime`, `languages`, `person`, `popularity`). Devuelve lo mismo que ve
  Umber, con `similarity`, `autumn_score`, `vote_count` y `rank_score`, y
  `relaxed`: los filtros que hubo que quitar. Sesión opcional; rate limit
  propio (20/min y 300/día por IP, 30/min y 1.000/día con sesión, 5.000/día
  entre todos: protege la cuota gratuita de Cloudflare, que comparte con el chat)
- **`GET /api/tmdb?content_id=<uuid>&region=ES`** (`PlatformsResponse`):
  plataformas de un título del corpus, por `lookupPlatforms`. Sin `region`, la de
  `Accept-Language`. `Cache-Control` público de un día en la CDN. No acepta rutas
  de TMDB: no es un proxy libre

---

## Auth

- Sesión por **SSR en cookies** con `@supabase/ssr`. No hay cliente de Supabase
  en el navegador, así que las cookies van `httpOnly` y las claves siguen sin
  prefijo `PUBLIC_`
- `src/middleware.ts` crea en cada petición el cliente con las cookies y verifica
  la sesión con `getClaims()`: en local, con las claves ES256 del proyecto, sin
  llamada de red. Deja `Astro.locals.supabase` y `Astro.locals.user`
- Leer y escribir datos del usuario siempre con `Astro.locals.supabase` (o
  `getRequestUser()` en endpoints), nunca con la secret key: RLS hace el resto.
  Las únicas tablas que la app toca con la secret key son `platforms_cache` y
  `rate_limits`, que no son de ningún usuario
- El proyecto **exige confirmar el email**. El enlace vuelve a `/auth/confirm`,
  que tiene que estar en *Redirect URLs* del dashboard (Authentication → URL
  Configuration), junto con la *Site URL*. Con la plantilla de email por
  defecto (`?code=`) el enlace solo funciona en el navegador del registro; la
  plantilla con `?token_hash=` funciona en cualquiera
- Registrar emails inventados hace rebotar el SMTP por defecto de Supabase, que
  limita los envíos. Para probar, crear usuarios ya confirmados con la Admin API
  (como hace `scripts/verify-rls.mjs`) y, si hace falta un enlace, sacarlo de
  `/auth/v1/admin/generate_link`, que no envía correo
- **El correo que trae Supabase no sirve para gente real**: 2 correos por hora
  en todo el proyecto y solo a direcciones del equipo (con las demás,
  `email_address_not_authorized`). Producción necesita un SMTP propio y gratuito,
  sin servidor ni dominio de pago (ver «Correo de la cuenta» en la Fase 6). El
  enlace caduca a la hora. `supabase/config.toml` es solo para el Supabase
  local: no usar `supabase config push`, que pisaría la configuración de Auth
  del proyecto
- El registro pide **nombre de usuario**, email y la contraseña dos veces (8 a 72
  caracteres, el tope de bcrypt). El nombre va en `signUp({ options: { data: {
  username } } })` y acaba en `profiles` (ver el esquema). Se entra con el email
- `AuthForm` funciona sin JavaScript; con él, añade «Mostrar» en cada contraseña
  y el aviso de que no coinciden. Los errores de un campo salen junto a él
  (`AuthFormError`)
- **Pendiente: entrar con Google.** Ver `docs/fase-5-frontend.md`

---

## Los 4 modos

| Constante | Descripción | Estado |
|---|---|---|
| `movie` | Recomendación individual de película | MVP |
| `tv` | Recomendación individual de serie | MVP |
| `weekend` | Plan coherente para 2-3 días | v2 |
| `month` | Calendario completo del mes | v2 |

Los modos `weekend` y `month` están diseñados. No eliminar sus tipos ni constantes aunque no estén implementados.

---

## Convenciones de código

- TypeScript estricto — `strict: true` en tsconfig, sin `any`
- Variables de entorno siempre via `src/lib/env.ts`, nunca `process.env.X` suelto
- Errores siempre tipados, nunca `catch(e: any)`
- Comentarios en español, código (variables, funciones) en inglés
- `src/lib/database.types.ts` se **genera** con `npm run db:types`: no editarlo a
  mano. El generador no sabe expresar dos cosas del esquema —las columnas con
  `CHECK` salen como `string`, y `search_content` devuelve todo como no nulable—,
  así que esas correcciones viven en `src/lib/types.ts`
- Imports con alias `@/` para `src/`
- Streaming activado siempre en las llamadas al chat de DeepSeek
- JavaScript del navegador en `src/scripts/`, sin framework. Solo puede importar
  de `src/lib/` los módulos que no tocan servidor: `types.ts`, `markdown.ts`,
  `chat-stream.ts`
- Astro pinta el `<script>` de un componente donde se pinta el componente. Si el
  componente va dentro de un `<template>` (como `ContentCard` en el chat), su
  script queda inerte: quien clona la plantilla tiene que inicializarlo
- Texto que viene del LLM o del usuario: `textContent`, o `renderReply()`, que
  escapa antes de dar formato. Nunca `innerHTML` con texto sin escapar

---

## DeepSeek — configuración

- Modelo chat: `deepseek-flash` (DeepSeek-V4.1-Flash) — mejor calidad/precio
- Base URL: `https://api.deepseek.com` (compatible con SDK de OpenAI)
- DeepSeek **no expone embeddings**: esa parte va contra el servicio de Qwen3
- Temperature chat: `0.8`
- Temperature clasificación/extracción: `0.1`
- Max tokens respuesta: `600`
- Usar streaming siempre para mejor UX. La excepción son los procesos por lotes
  (`scripts/seed/score.py`), donde nadie lee la respuesta mientras llega
- `deepseek-flash` **razona por defecto**, y los tokens del razonamiento cuentan
  contra `max_tokens`: con un tope bajo la respuesta llega vacía o cortada. Se
  desactiva con `thinking: { type: 'disabled' }` en el cuerpo de la petición
  (`extra_body` en el SDK de Python)
- **Sin razonamiento** en el chat de `movie` y `tv` y en `complete()`:
  `src/lib/deepseek.ts` lo envía siempre. `weekend` y `month` podrán activarlo,
  subiendo `max_tokens`. Motivo y medidas en `docs/fase-4-api-chat.md`
- **Pasarela**: `streamChat()` y `complete()` exigen `trace` y `purpose`, y
  `embedQuery()` la traza: no hay llamada a un modelo sin registrar. El stream
  pide `stream_options: { include_usage: true }`, y DeepSeek manda al final los
  tokens con los de caché aparte (`prompt_cache_hit_tokens`), que cuestan 50
  veces menos. El coste sale de `src/lib/llm-pricing.ts` (en hora punta, el
  doble) y se guarda con cada llamada. `PROMPT_VERSION` (`src/lib/prompts.ts`)
  cambia con cualquier cambio de prompt, para comparar versiones

---

## Embeddings — configuración

- Modelo: `Qwen/Qwen3-Embedding-0.6B` (1024 dim nativas, 32k de contexto, 100+ idiomas)
- Se habla con él por la API de embeddings de OpenAI: TEI y vLLM la exponen igual,
  así que pasar de local a gestionado es cambiar `EMBEDDINGS_URL`
- **Servicio: Cloudflare Workers AI** (`@cf/qwen/qwen3-embedding-0.6b`), gratis
  hasta 10.000 neuronas al día (~90.000 consultas); al pasarse falla, no cobra.
  Da los mismos vectores que el servidor local que indexó el corpus. Se configura
  con `EMBEDDINGS_URL` (`https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1`),
  `EMBEDDINGS_API_KEY` (token con Workers AI Read y Edit) y `EMBEDDINGS_MODEL`
- **Antes de apuntar `EMBEDDINGS_URL` a cualquier servicio nuevo**, pasar
  `scripts/seed/check-embeddings.py`: vectores distintos degradan la búsqueda sin
  dar ningún error. El `text_hash` del corpus usa el modelo, no el servicio:
  cambiar de servicio no obliga a revectorizar
- Levantarlo en local con `npm run embeddings` (`scripts/embeddings/server.py`,
  sentence-transformers sobre MPS/CUDA/CPU). Con Docker, TEI es equivalente:
  ```bash
  docker run -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
    --model-id Qwen/Qwen3-Embedding-0.6B
  ```
- El servidor carga el modelo en **float32** a propósito: transformers usa por
  defecto el bfloat16 del checkpoint, y eso mete ruido de ~1e-3 que hace que el
  mismo texto dé vectores distintos según el lote en el que vaya
- El modelo es **asimétrico**: la consulta va envuelta en
  `Instruct: {tarea}\nQuery:{texto}` y el documento en crudo. Omitir la
  instrucción cuesta entre un 1% y un 5% de precisión de recuperación
- Consultas vía `embedQuery()` en `src/lib/embeddings.ts`; el corpus, vía
  `scripts/seed/embed.py`. La normalización y la instrucción de tarea están
  duplicadas en `scripts/seed/common.py` y **tienen que coincidir** con las de
  TypeScript: si divergen, la búsqueda se degrada sin dar ningún error
- Cambiar de modelo o de dimensión obliga a reindexar el corpus completo

---

## TMDB — notas

- Usar `append_to_response=watch/providers` para obtener plataformas en una sola llamada
- Región por defecto para streaming: `ES`. Detectar por idioma del usuario si es posible
- Pósters al tamaño en que se muestran: `w185` y `w342` con `srcset` en las
  rejillas (`PosterCard`), `w342` en las fichas del chat y favoritos
  (`TMDB_POSTER_SIZE`), `w342`/`w500` en la ficha grande. Con `w342` fijo,
  `/explorar` pesaba 1,2 MB de carteles; así, unos 490 kB. El `sizes` de las
  rejillas no puede pasar de 185 px en escritorio, o se baja `w342` en todas
- Backdrops: `w780` y `w1280` con `srcset`, nunca `original` (varios MB)
- Las plataformas se piden siempre con `lookupPlatforms()` (`src/lib/platforms.ts`),
  que las cachea en `platforms_cache`, y no con las funciones de `src/lib/tmdb.ts`

---

## Estética

«Noche de otoño», en clave editorial (rediseño del 2026-10-04): como una revista
de cine en otoño. Oscura y cálida, mucho espacio, **un solo acento** y
composiciones asimétricas en vez de rejillas de tarjetas iguales. Nada de
degradados de color ni de elementos infantiles. Tokens `umber-*` en
`src/styles/global.css`.

```
Fondo base:        #14110D  (noche cálida)          umber-base
Superficie:        #1C1813  (fichas, el cuadro)     umber-surface
Superficie +1:     #262019  (tus burbujas)          umber-raised
Filetes:           #2E261F  (separan; decorativos)  umber-line
Borde de control:  #7B6C5E               3,4:1      umber-rule
Texto principal:   #EFE6D8  (crema)      15:1       umber-cream
Texto secundario:  #AB9B88  (ceniza)     7:1        umber-ash
Acento:            #D9893D  (ámbar)      6,8:1      umber-amber (+ umber-amber-hover)

Titulares:         Newsreader de titular (opsz 72), 300 y cursiva   font-display
Lo que se lee:     Newsreader de lectura (opsz 16), 400 y 600       font-serif
Interfaz:          Schibsted Grotesk 400–600                        font-sans
```

- **El ámbar, medido**: la acción principal, lo elegido (la línea de una
  pestaña) y los títulos que recomienda Umber. Rótulos, enlaces secundarios y
  todo lo demás, en crema o ceniza
- **La regla de la tipografía**: lo que se dice va en serif (Umber, lo que
  escribes, las sinopsis, los títulos); la interfaz, en sans. La cursiva de
  titular marca una palabra por titular, no más («¿Qué te apetece ver *hoy*?»)
- Contraste contra el fondo base; todos pasan AA. Los campos llevan solo la
  línea de abajo, en `umber-rule`: lo que identifica un control pide 3:1
- Piezas comunes en `global.css`: usarlas antes que repetir clases.
  Titulares `display-1/2/3`; `eyebrow` (y `eyebrow-rule`, con filete), `lead`,
  `reading`; `btn-primary`, `btn-secondary` y `.arrow` (la flecha que se
  adelanta); `link`, `link-quiet`; `field`, `field-label`, `select-wrap`;
  `chip`; `tabs`/`tab` (pestañas con línea, en enlaces o en radios); `composer`
  (el cuadro donde se escribe a Umber); `graded` (el etalonado de los
  fotogramas); `dot-list`
- Imágenes: carteles con radio de 3 px, no de tarjeta. Los fotogramas de
  ambiente (portada, cuenta, fondo de la ficha) llevan `graded`, para que
  fotogramas muy distintos parezcan de la misma película. Salen de
  `src/lib/showcase.ts`, elegidas por criterio y no por id: en general, películas
  muy conocidas y bien valoradas (5.000 votos o más, nota de 7,4), y en la portada
  una de ellas con sus parecidos («Si te gustó…»); en el apartado de otoño, dramas
  y romances otoñales, sin terror, comedia ni infantil
- **Umber es general; el otoño, un apartado** (Fase 8): nada de otoño en los
  textos generales (portada, pie, título y descripción por defecto). La
  especialidad tiene su sección en la portada, con la etiqueta «Nuevo», y lleva a
  `/chat?…&especialidad=otono` y a `/explorar?sort=autumn`
- Grano de película encima de todo (`/grain.svg`, al 4 %), con mezcla normal:
  un modo de fusión en una capa fija hace que el scroll recomponga la página
- **Movimiento**, siempre lento y apagado con `prefers-reduced-motion`:
  `rise` al cargar (escalonado con `[animation-delay:…]`), `develop` (un
  fotograma que se revela), `reveal` al entrar en pantalla con
  `animation-timeline: view()` (sin soporte, ya está ahí) y `message-in` en el
  chat. Entre páginas, `@view-transition` funde una con otra sin JavaScript, y el
  cartel pulsado en una rejilla viaja hasta la ficha (`src/scripts/transitions.ts`,
  con `data-poster-link`, `data-poster` y `data-poster-target`)
- Fuentes: solo `latin` (cubre el español). Newsreader en dos cortes fijos de
  su eje óptico, no el eje entero: 45 + 56 kB en vez de 272. La de lectura no se
  precarga: solo la bajan las páginas que la usan. Un peso o una cursiva nuevos
  hay que añadirlos en `fonts` de `astro.config.mjs`
- La marca es una hoja (`LeafMark`): en la cabecera, como avatar de Umber y en
  el favicon

---

## Seguridad

- RLS activado en todas las tablas de Supabase
- `SUPABASE_SECRET_KEY` solo en servidor y scripts de seed, nunca en cliente
- Validar todos los inputs antes de pasarlos al LLM
- El system prompt nunca se expone al cliente
- **CSP** con `security.csp` de Astro (`astro.config.mjs`): hashes de los
  scripts y estilos propios, imágenes solo de `image.tmdb.org`, sin iframes
  (`frame-ancestors 'none'`). En SSR va como cabecera: **no poner otra cabecera
  `Content-Security-Policy` en el middleware**, que la sustituiría. Un recurso
  externo nuevo (imágenes, fuentes, `fetch` del navegador) hay que añadirlo a
  sus directivas. No funciona en `astro dev`: se prueba sobre el build.
  **Nada de atributos `style` en el marcado ni de URIs `data:` en el CSS**
  (`img-src` no las admite: el grano es un archivo). Lo dinámico, por clases o
  desde JavaScript con `element.style`, que la CSP sí deja
- `src/middleware.ts` añade `X-Content-Type-Options`, `X-Frame-Options` y
  `Referrer-Policy` a todas las respuestas
- **Guardarraíles de conversación** en `system.md` («De qué hablas»): solo cine
  y series, sin sermones; crisis (no querer vivir, hacerse daño) antes que el
  cine, con el 024 y el 112 y sin hablar de películas en ese mensaje; nada de
  piratería (se comprueba el título y se dice dónde verlo legalmente) ni de
  contenido sexual explícito; sin suponer el género. Probados con 17 casos
  (ver `docs/fase-4-api-chat.md`): al tocar `system.md`, repetirlos. Los
  números de teléfono van sin negrita: la negrita marca títulos

---

## Lo que NO hacer

- No usar `localStorage` para historial de chat — va a Supabase
- No llamar a TMDB directamente desde el cliente — siempre vía `/api/tmdb`
- No hardcodear IDs de TMDB en el código
- No recomendar contenido sin pasar por el corpus vectorial — Umber no inventa títulos