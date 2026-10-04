-- `search_content` elige búsqueda exacta o por índice contando lo que dejan los filtros.
--
-- Con la regla anterior (exacta solo con persona o idioma), un filtro combinado
-- que deja muy poco («animación» + «poco conocida» + una época) iba por el
-- índice, que tenía que recorrer miles de nodos con lecturas sueltas: 1 de 30
-- conversaciones simuladas pasó de los 3 s del rol `anon` (2026-10-04). Ahora
-- cuenta antes las filas que pasan (unos 30 ms): hasta 4.000, exacta (calcular
-- 4.000 distancias en caliente son unos 100 ms); más, el índice.

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
  v_exact boolean := false;
  v_count integer;
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
  -- Exacta si los filtros dejan pocos; si no, el índice. Se decide contando lo
  -- que pasa (sin distancias, unos 30 ms): por el tipo de filtro no se sabe,
  -- porque «animación» sola deja 1.135 y con «poco conocida» y una época, 40, y
  -- con tan pocos el índice recorre miles de nodos y pasa del timeout.
  if v_who is not null or genres_any is not null or year_from is not null or year_to is not null
     or max_runtime is not null or languages is not null or min_votes is not null
     or max_votes is not null or min_autumn is not null then
    select count(*) into v_count
      from public.content as c
     where (content_type is null or c.type = content_type)
       and (genres_any is null or c.genres && genres_any)
       and (genres_none is null or not (c.genres && genres_none))
       and (year_from is null or c.year >= year_from)
       and (year_to is null or c.year <= year_to)
       and (max_runtime is null or c.runtime <= max_runtime)
       and (languages is null or c.original_language = any (languages))
       and (min_votes is null or c.vote_count >= min_votes)
       and (max_votes is null or c.vote_count <= max_votes)
       and (min_autumn is null or c.autumn_score >= min_autumn)
       and (v_who is null or c.people_search like '%' || v_who || '%');
    v_exact := v_count <= 4000;
  end if;

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
