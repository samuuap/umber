-- Filtro por persona sin plegar texto en cada búsqueda.
--
-- `search_content` plegaba (`fold_search_text`) la dirección y los seis del
-- reparto de cada título en cada búsqueda: unas 112.000 llamadas, porque una
-- función con `set search_path` no se incrusta en la consulta. «Algo de Nolan»
-- llegaba al timeout de `anon` (3 s). Ahora va plegado en una columna que
-- mantiene un trigger, y la búsqueda es un `like` sobre ella.

alter table public.content add column people_search text;

comment on column public.content.people_search is
  'Dirección y reparto en minúsculas y sin tildes, para el filtro por persona. Lo mantiene un trigger.';

create or replace function public.content_people_search()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.people_search := public.fold_search_text(
    coalesce(new.director, '') || ' | ' || array_to_string(coalesce(new.top_cast, '{}'), ' | ')
  );
  return new;
end;
$$;

create trigger content_people_search
  before insert or update of director, top_cast on public.content
  for each row execute function public.content_people_search();

update public.content set director = director;

-- Mismo contrato que en 20261004220000; solo cambia el filtro por persona.
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
         and (v_who is null or c.people_search like '%' || v_who || '%')
         and 1 - (c.embedding <=> v_query) > min_score
       order by (c.embedding <=> v_query) + 0
       limit v_limit;
  else
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
