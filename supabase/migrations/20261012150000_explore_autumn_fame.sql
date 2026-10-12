-- «Más otoñales» de /explorar: otoñal y conocida, no solo otoñal (2026-10-12).
-- Ordenar solo por `autumn_score` ponía cuatro Monster High de 200 votos por
-- delante de Donnie Darko (13.800) con el mismo 0,887, y series que casi nadie
-- conoce en la primera página. Decisión de producto: pesa mucho lo conocido.
--
--   otoño × (0,25 + 0,75 × fama) × (0,5 si es un corto)
--
-- La fama, en log de los votos: 0 hasta 500 y 1 desde 20.000. Así una muy
-- conocida y algo otoñal (Puñales por la espalda, 0,79 y 14.600 votos: 0,74)
-- va por delante de una muy otoñal que conoce poca gente (Pesadillas 2, 0,93 y
-- 1.700 votos: 0,46). Corto: película de menos de 40 minutos.
-- Solo cambia el `order by`; la firma y lo demás, como en 20261004200000.

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
     -- Otoñal y, sobre todo, conocida: ver la cabecera.
     case when p_sort = 'autumn'
          then c.autumn_score
             * (0.25 + 0.75 * greatest(0, least(1,
                 (ln(greatest(coalesce(c.vote_count, 0), 1)) - ln(500)) / (ln(20000) - ln(500)))))
             * (case when c.type = 'movie' and c.runtime < 40 then 0.5 else 1 end)
     end desc nulls last,
     -- Desempate de todos, y el orden de 'popular'.
     c.vote_count desc nulls last,
     c.id
   -- Expuesta a anon: sin páginas enormes.
   limit least(greatest(coalesce(p_limit, 36), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
