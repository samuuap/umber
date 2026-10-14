-- «Mis plataformas»: el chat busca solo en las plataformas que tiene la persona.
--
-- 1. `search_content` admite `platforms` y `platforms_region`: solo los títulos
--    que, según `platforms_cache`, están en alguna de ellas (suscripción o
--    gratis). La caché tiene ya todo el corpus: la rellena cada noche
--    `scripts/seed/platforms.py`. Lo que filtra pasa por el mismo recuento que
--    los demás filtros: con pocas plataformas, búsqueda exacta.
-- 2. `platform_counts`: cuántos títulos tiene cada plataforma en una región,
--    para ordenar el selector (las que más tienen, primero). Solo el servidor.
-- 3. `conversations.platforms`: las elegidas al empezar la conversación, para
--    retomarla con las mismas. `null`, todas.

select extensions.vector_dims('[1]'::extensions.vector);

drop function public.search_content(
  extensions.vector, text, integer, double precision, text[], text[], integer, integer, integer, text[],
  integer, integer, text, double precision
);

create function public.search_content(
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
  min_autumn      double precision default null,
  -- Solo lo que está en alguna de estas plataformas en `platforms_region`
  -- (nombres de `platforms_cache`, ya normalizados).
  platforms        text[]          default null,
  platforms_region text            default 'ES'
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
  -- Los que están en esas plataformas. Se leen en su propia sentencia, solo con
  -- el filtro: `platforms_cache` es del servidor, y nombrarla en las consultas
  -- de abajo haría fallar por permisos a `anon` aunque no filtre por plataforma.
  v_ids   uuid[];
begin
  if dims <> 1024 then
    raise exception 'search_content espera un vector de 1024 dimensiones y recibió %', dims
      using errcode = '22000';
  end if;
  if coalesce(cardinality(genres_any), 0) > 20 or coalesce(cardinality(genres_none), 0) > 20
     or coalesce(cardinality(languages), 0) > 10 or length(coalesce(person, '')) > 100
     or coalesce(cardinality(platforms), 0) > 40 then
    raise exception 'search_content: filtros demasiado largos' using errcode = '22023';
  end if;
  v_query := query_embedding::extensions.halfvec(1024);
  if platforms is not null then
    -- Con sus variantes: «Movistar Plus+» vale también para «Movistar Plus+
    -- Ficción Total», que TMDB da aparte cuando el título solo está en ella.
    v_ids := array(
      select p.content_id from public.platforms_cache as p
       where exists (
         select 1
           from jsonb_array_elements_text(p.by_region -> coalesce(platforms_region, 'ES')) as listed (name),
                unnest(platforms) as wanted (name)
          where listed.name = wanted.name or starts_with(listed.name, wanted.name || ' ')
       )
    );
  end if;
  -- Exacta si los filtros dejan pocos; si no, el índice. Se decide contando lo
  -- que pasa (sin distancias, unos 30 ms): por el tipo de filtro no se sabe,
  -- porque «animación» sola deja 1.135 y con «poco conocida» y una época, 40, y
  -- con tan pocos el índice recorre miles de nodos y pasa del timeout.
  if v_who is not null or genres_any is not null or year_from is not null or year_to is not null
     or max_runtime is not null or languages is not null or min_votes is not null
     or max_votes is not null or min_autumn is not null or v_ids is not null then
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
       and (v_ids is null or c.id in (select unnest(v_ids)))
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
       and (v_ids is null or c.id in (select unnest(v_ids)))
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
       and (v_ids is null or c.id in (select unnest(v_ids)))
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
  integer, integer, text, double precision, text[], text
) to anon, authenticated, service_role;

-- ─── Cuántos títulos tiene cada plataforma ───────────────────────────────────

create function public.platform_counts(p_region text, p_type text default null)
returns table (platform text, titles bigint)
language sql
stable
set search_path = public
as $$
  with found as (
    select name, count(*) as titles
      from public.platforms_cache as p
      join public.content as c on c.id = p.content_id
     cross join lateral jsonb_array_elements_text(p.by_region -> p_region) as name
     where p_type is null or c.type = p_type
     group by name
  )
  -- Las variantes («Netflix Standard with Ads») suman en su plataforma y no
  -- salen aparte, como al filtrar. Un título nunca lleva las dos
  -- (`streamingNames` quita la variante), así que la suma no repite ninguno.
  select base.name, sum(variant.titles)::bigint
    from found as base
    join found as variant on variant.name = base.name or starts_with(variant.name, base.name || ' ')
   where not exists (select 1 from found as other where starts_with(base.name, other.name || ' '))
   group by base.name
   order by 2 desc, 1;
$$;

comment on function public.platform_counts(text, text) is
  'Títulos por plataforma en una región, de más a menos. Para el selector de plataformas.';

-- Como `platforms_cache`: solo la secret key.
revoke execute on function public.platform_counts(text, text) from public, anon, authenticated;
grant execute on function public.platform_counts(text, text) to service_role;

-- ─── Las plataformas de una conversación ─────────────────────────────────────

alter table public.conversations
  add column platforms text[] check (cardinality(platforms) between 1 and 40);

comment on column public.conversations.platforms is
  'Plataformas elegidas al empezar (nombres de platforms_cache), o null: todas.';
