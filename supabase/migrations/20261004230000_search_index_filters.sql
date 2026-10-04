-- `search_content` exacta solo con persona o idioma.
--
-- Con cualquier filtro iba por el camino exacto, sin índice: un género como
-- Romance o Drama son miles de títulos, y con la caché fría y cinco
-- conversaciones a la vez pasaba de los 3 s del rol `anon` (3 de 30
-- conversaciones simuladas, 2026-10-04). Ahora la búsqueda exacta queda para lo
-- que deja pocos (una persona, un idioma que no sea el inglés), y el resto de
-- filtros va por el índice con `iterative_scan`, que los aplica según recorre.

-- Carga pgvector en la sesión para que `hnsw.*` se valide contra su definición real.
select extensions.vector_dims('[1]'::extensions.vector);

create or replace function public.search_content(
  query_embedding extensions.vector(1024),
  content_type    text             default null,
  match_count     integer          default 10,
  min_score       double precision default 0.5,
  genres_any      text[]           default null,
  genres_none     text[]           default null,
  year_from       integer          default null,
  year_to         integer          default null,
  max_runtime     integer          default null,
  languages       text[]           default null,
  min_votes       integer          default null,
  max_votes       integer          default null,
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
set hnsw.iterative_scan = strict_order
set hnsw.ef_search = 100
as $$
declare
  dims    integer := extensions.vector_dims(query_embedding);
  v_query extensions.halfvec(1024);
  v_limit integer := least(greatest(coalesce(match_count, 10), 1), 50);
  -- `%` y `_` de quien escribe son texto, no comodines.
  v_who   text    := nullif(
    replace(replace(replace(public.fold_search_text(btrim(person)), '\', '\\'), '%', '\%'), '_', '\_'), ''
  );
  v_exact boolean;
begin
  if dims <> 1024 then
    raise exception 'search_content espera un vector de 1024 dimensiones y recibió %', dims
      using errcode = '22000';
  end if;
  if coalesce(cardinality(genres_any), 0) > 20 or coalesce(cardinality(genres_none), 0) > 20
     or coalesce(cardinality(languages), 0) > 10 or length(coalesce(person, '')) > 100 then
    raise exception 'search_content: filtros demasiado largos' using errcode = '22023';
  end if;
  v_query := query_embedding::extensions.halfvec(1024);
  -- Exacta solo con lo que de verdad deja pocos: una persona (decenas) o un
  -- idioma que no sea el inglés (cientos). El resto filtra poco, y la búsqueda
  -- iterativa del índice encuentra 30 recorriendo unos cientos de nodos.
  v_exact := v_who is not null or (languages is not null and not ('en' = any (languages)));

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
         and (v_who is null or c.people_search like '%' || v_who || '%')
         and 1 - (c.embedding <=> v_query) > min_score
       order by (c.embedding <=> v_query) + 0
       limit v_limit;
  else
    -- Por el índice, con los filtros aplicados según recorre (`iterative_scan`).
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
         and 1 - (c.embedding <=> v_query) > min_score
       order by c.embedding <=> v_query
       limit v_limit;
  end if;
end;
$$;
