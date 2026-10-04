-- Fase 8, bloque B: el corpus pasa de otoñal a general (~16.000 títulos).
--
-- 1. Columnas nuevas en `content`, para ordenar por lo conocido y filtrar por
--    gustos: votos, nota y popularidad de TMDB, idioma original, reparto
--    principal y saga. Las rellena `scripts/seed/load-db.py`.
-- 2. El vector pasa a `halfvec(1024)`: cada número en 2 bytes en vez de 4. Con
--    5.241 títulos, `content` ocupaba 108 MB (vectores e índice HNSW, sobre
--    todo); triplicar el corpus con `vector` acercaba la base a los 500 MB del
--    plan gratuito. La búsqueda apenas cambia: se mide con la prueba de recall.
-- 3. `search_content` compara contra `halfvec`. Mismo contrato: firma, columnas
--    y configuración (guarda de dimensión, búsqueda iterativa, `ef_search`).
-- 4. `explore_content` ordena por «más conocidas» (votos) cuando no se pide
--    otro orden, y por votos dentro de los demás. La app manda siempre `p_sort`.

-- Carga pgvector en la sesión para que `hnsw.*` se valide contra su definición real.
select extensions.vector_dims('[1]'::extensions.vector);

alter table public.content
  add column vote_count        integer,
  add column vote_average      real,
  add column popularity        real,
  add column original_language text,
  -- Los primeros del reparto, en su orden de TMDB.
  add column top_cast          text[]  not null default '{}',
  -- `belongs_to_collection` de TMDB: las películas de una misma saga.
  add column collection_id     integer;

comment on column public.content.top_cast is 'Los primeros del reparto según TMDB, en su orden.';
comment on column public.content.collection_id is 'Saga de TMDB (belongs_to_collection); null si no es de ninguna.';

-- ─── Vectores en halfvec ─────────────────────────────────────────────────────
-- El índice se rehace entero: con el tipo cambia la clase de operadores. Tras la
-- carga grande hay que reconstruirlo otra vez (ver CLAUDE.md).

drop index public.content_embedding_hnsw_idx;

alter table public.content
  alter column embedding type extensions.halfvec(1024)
  using embedding::extensions.halfvec(1024);

create index content_embedding_hnsw_idx
  on public.content using hnsw (embedding extensions.halfvec_cosine_ops);

-- ─── search_content ──────────────────────────────────────────────────────────
-- La consulta llega como `vector(1024)` (lo que manda la app no cambia) y se
-- convierte a `halfvec` una vez: así el orden usa el índice.

create or replace function public.search_content(
  query_embedding extensions.vector(1024),
  content_type    text default null,
  match_count     integer default 10,
  min_score       double precision default 0.5
)
returns table (
  id           uuid,
  tmdb_id      integer,
  type         text,
  title        text,
  title_en     text,
  year         integer,
  director     text,
  synopsis     text,
  synopsis_en  text,
  genres       text[],
  autumn_score double precision,
  poster_path  text,
  similarity   double precision
)
language plpgsql
stable
set search_path = public, extensions
-- Sin esto, el índice HNSW devuelve como mucho `ef_search` filas y el filtro por
-- tipo actúa después: las búsquedas de series se quedaban en 2 o 3 candidatos.
set hnsw.iterative_scan = strict_order
-- 40 por defecto; con 100 el índice devuelve el 97,5 % de los 10 mejores (20261003190000).
set hnsw.ef_search = 100
as $$
declare
  dims  integer := extensions.vector_dims(query_embedding);
  v_query extensions.halfvec(1024);
begin
  -- Postgres no aplica el `vector(1024)` de la firma: sin esta guarda, un vector
  -- de otra dimensión devolvería 0 filas en silencio.
  if dims <> 1024 then
    raise exception
      'search_content espera un vector de 1024 dimensiones y recibió %', dims
      using errcode = '22000';
  end if;
  v_query := query_embedding::extensions.halfvec(1024);

  return query
    select c.id,
           c.tmdb_id,
           c.type,
           c.title,
           c.title_en,
           c.year,
           c.director,
           c.synopsis,
           c.synopsis_en,
           c.genres,
           c.autumn_score,
           c.poster_path,
           1 - (c.embedding <=> v_query)
    from public.content as c
    where c.embedding is not null
      and (content_type is null or c.type = content_type)
      and 1 - (c.embedding <=> v_query) > min_score
    order by c.embedding <=> v_query
    -- Tope defensivo: la función está expuesta por PostgREST a `anon`, y sin
    -- límite una sola llamada podría volcar el corpus entero.
    limit least(greatest(coalesce(match_count, 10), 1), 50);
end;
$$;

-- ─── explore_content ─────────────────────────────────────────────────────────
--   p_sort   'popular' (más conocidas) | 'autumn' (más otoñales) | 'recent' | 'title'
-- Con el corpus general, «más otoñales» abría con una pared de Halloween y
-- dibujos animados. «Más conocidas» es el orden por defecto en la app.

create or replace function public.explore_content(
  p_type   text    default null,
  p_genre  text    default null,
  p_query  text    default null,
  p_sort   text    default 'autumn',
  p_limit  integer default 36,
  p_offset integer default 0
)
returns table (
  id           uuid,
  type         text,
  title        text,
  title_en     text,
  year         integer,
  poster_path  text,
  autumn_score double precision,
  total_count  bigint
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      -- `%` y `_` del usuario son texto, no comodines.
      '%' || replace(replace(replace(public.fold_search_text(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
        as pattern
  )
  select c.id, c.type, c.title, c.title_en, c.year, c.poster_path, c.autumn_score,
         count(*) over () as total_count
    from public.content c, params
   where (p_type is null or c.type = p_type)
     and (p_genre is null or p_genre = any (c.genres))
     and (
       nullif(btrim(p_query), '') is null
       or public.fold_search_text(c.title) like params.pattern
       or public.fold_search_text(c.title_en) like params.pattern
       or public.fold_search_text(c.director) like params.pattern
     )
   order by
     case when p_sort = 'recent' then c.year end desc nulls last,
     case when p_sort = 'title' then public.fold_search_text(c.title) end asc,
     case when p_sort = 'autumn' then c.autumn_score end desc nulls last,
     -- Desempate de todos, y el orden de 'popular'.
     c.vote_count desc nulls last,
     c.id
   -- Expuesta a anon: sin páginas enormes.
   limit least(greatest(coalesce(p_limit, 36), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
