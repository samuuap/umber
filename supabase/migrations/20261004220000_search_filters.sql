-- Fase 8, bloque C: el recomendador experto busca con filtros.
--
-- 1. `search_content` admite filtros que el modelo saca de la conversación:
--    géneros que sí y que no, años, duración, idioma original, votos, una
--    persona (dirección o reparto) y la especialidad de otoño. Devuelve además
--    votos, nota, duración, idioma y reparto, para reordenar y para que el
--    modelo sepa qué es conocido.
--
--    Con un filtro selectivo (persona, idioma, años, votos, géneros que sí,
--    duración, otoño) la búsqueda es exacta sobre lo filtrado, sin el índice:
--    el índice HNSW filtra después de recorrer, y con «de Wes Anderson» (13 de
--    16.000) tendría que recorrerlo casi entero. Medido en el plan gratuito, en
--    caliente: exacta sobre los 16.000, 122 ms; sobre lo filtrado, 20–31 ms. Sin
--    filtros, el índice, como antes.
--
-- 2. `conversations.specialty`: la especialidad de la conversación (otoño), para
--    retomarla con la misma.

select extensions.vector_dims('[1]'::extensions.vector);

drop function public.search_content(extensions.vector, text, integer, double precision);

create function public.search_content(
  query_embedding extensions.vector(1024),
  content_type    text             default null,
  match_count     integer          default 10,
  min_score       double precision default 0.5,
  -- Al menos uno de estos géneros, tal como están en `content.genres`.
  genres_any      text[]           default null,
  -- Ninguno de estos.
  genres_none     text[]           default null,
  year_from       integer          default null,
  year_to         integer          default null,
  max_runtime     integer          default null,
  -- Idioma original, ISO 639-1.
  languages       text[]           default null,
  min_votes       integer          default null,
  max_votes       integer          default null,
  -- En la dirección o el reparto, sin tildes ni mayúsculas.
  person          text             default null,
  min_autumn      double precision default null
)
returns table (
  id                uuid,
  tmdb_id           integer,
  type              text,
  title             text,
  title_en          text,
  year              integer,
  director          text,
  synopsis          text,
  synopsis_en       text,
  genres            text[],
  autumn_score      double precision,
  poster_path       text,
  vote_count        integer,
  vote_average      real,
  runtime           integer,
  original_language text,
  top_cast          text[],
  similarity        double precision
)
language plpgsql
stable
set search_path = public, extensions
-- Sin esto, el índice HNSW devuelve como mucho `ef_search` filas y el filtro por
-- tipo actúa después: las búsquedas de series se quedaban en 2 o 3 candidatos.
set hnsw.iterative_scan = strict_order
-- 40 por defecto; con 100 el índice devuelve el 97 % de los 10 mejores.
set hnsw.ef_search = 100
as $$
declare
  dims    integer := extensions.vector_dims(query_embedding);
  v_query extensions.halfvec(1024);
  v_limit integer := least(greatest(coalesce(match_count, 10), 1), 50);
  v_who   text    := nullif(public.fold_search_text(btrim(person)), '');
  v_exact boolean;
begin
  -- Postgres no aplica el `vector(1024)` de la firma: sin esta guarda, un vector
  -- de otra dimensión devolvería 0 filas en silencio.
  if dims <> 1024 then
    raise exception 'search_content espera un vector de 1024 dimensiones y recibió %', dims
      using errcode = '22000';
  end if;
  -- Expuesta a anon: nada de listas o textos desmesurados.
  if coalesce(cardinality(genres_any), 0) > 20 or coalesce(cardinality(genres_none), 0) > 20
     or coalesce(cardinality(languages), 0) > 10 or length(coalesce(person, '')) > 100 then
    raise exception 'search_content: filtros demasiado largos' using errcode = '22023';
  end if;
  v_query := query_embedding::extensions.halfvec(1024);
  v_exact := v_who is not null or languages is not null or year_from is not null or year_to is not null
             or min_votes is not null or max_votes is not null or genres_any is not null
             or max_runtime is not null or min_autumn is not null;

  if v_exact then
    -- Exacta sobre lo filtrado. `+ 0`: con la distancia tal cual, el
    -- planificador usaría el índice, que filtra después de recorrer.
    return query
      select c.id, c.tmdb_id, c.type, c.title, c.title_en, c.year, c.director, c.synopsis, c.synopsis_en,
             c.genres, c.autumn_score, c.poster_path, c.vote_count, c.vote_average, c.runtime,
             c.original_language, c.top_cast, 1 - (c.embedding <=> v_query)
        from public.content as c
       where c.embedding is not null
         and (content_type is null or c.type = content_type)
         and (genres_any is null or c.genres && genres_any)
         and (genres_none is null or not (c.genres && genres_none))
         and (year_from is null or c.year >= year_from)
         and (year_to is null or c.year <= year_to)
         and (max_runtime is null or c.runtime <= max_runtime)
         and (languages is null or c.original_language = any (languages))
         and (min_votes is null or c.vote_count >= min_votes)
         and (max_votes is null or c.vote_count <= max_votes)
         and (min_autumn is null or c.autumn_score >= min_autumn)
         and (
           v_who is null
           or public.fold_search_text(c.director) like '%' || v_who || '%'
           or exists (
             select 1 from unnest(c.top_cast) as actor
              where public.fold_search_text(actor) like '%' || v_who || '%'
           )
         )
         and 1 - (c.embedding <=> v_query) > min_score
       order by (c.embedding <=> v_query) + 0
       limit v_limit;
  else
    -- Sin filtros selectivos: el índice, que con `genres_none` (pocos quita) va bien.
    return query
      select c.id, c.tmdb_id, c.type, c.title, c.title_en, c.year, c.director, c.synopsis, c.synopsis_en,
             c.genres, c.autumn_score, c.poster_path, c.vote_count, c.vote_average, c.runtime,
             c.original_language, c.top_cast, 1 - (c.embedding <=> v_query)
        from public.content as c
       where c.embedding is not null
         and (content_type is null or c.type = content_type)
         and (genres_none is null or not (c.genres && genres_none))
         and 1 - (c.embedding <=> v_query) > min_score
       order by c.embedding <=> v_query
       limit v_limit;
  end if;
end;
$$;

comment on function public.search_content is
  'Candidatos del corpus por similitud coseno, con filtros. Umber no puede recomendar nada fuera de aquí.';

grant execute on function public.search_content(
  extensions.vector, text, integer, double precision, text[], text[], integer, integer, integer, text[],
  integer, integer, text, double precision
) to anon, authenticated, service_role;

-- ─── La especialidad de una conversación ─────────────────────────────────────

alter table public.conversations
  add column specialty text check (specialty in ('autumn'));

comment on column public.conversations.specialty is
  'Especialidad con la que se habló (otoño), o null: Umber general.';
