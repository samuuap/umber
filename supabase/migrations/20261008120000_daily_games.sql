-- Juegos del día (Fase 9): «El cartel del día» (adivinar la película por su
-- cartel, cada vez menos desenfocado) y «El título del día» (se eligen cuatro
-- letras, se destapan en el título y, tras cada fallo, una pista: año, director,
-- sinopsis y cartel).
--
-- Una fila por juego y día con la película que toca. La rellena por adelantado
-- `scripts/seed/games.py`, que elige las películas y calcula lo que el corpus no
-- tiene: el título de España, limpio, en los dos idiomas (el corpus da a veces
-- el latinoamericano: *Joker* como «Guasón») y un cartel sin texto, para que el
-- título no se lea en él.
--
-- Son las soluciones de los días que vienen: solo las lee el servidor, con la
-- secret key. Como `rate_limits`, RLS sin políticas y sin permisos para `anon`
-- ni `authenticated`: con ellos, cualquiera podría leer las de mañana.

create table public.daily_games (
  game        text    not null check (game in ('poster', 'title')),
  -- El día en Madrid: el juego cambia a medianoche de allí.
  day         date    not null,
  -- El número que se comparte: «El título del día #12».
  number      integer not null check (number > 0),
  -- Sin cascada: borrar del corpus una película con día asignado tiene que
  -- pararse y decirlo, no dejar un hueco en un juego.
  content_id  uuid    not null references public.content (id) on delete restrict,
  title_es    text    not null,
  title_en    text    not null,
  -- Cartel sin texto de TMDB (`/movie/<id>/images`, idioma nulo), que se
  -- enseña desenfocado: el del juego del cartel y la última pista del título.
  poster_path text    not null,
  created_at  timestamptz not null default now(),

  primary key (game, day),
  unique (game, number),
  -- Una película sale una vez en cada juego. En los dos puede salir, pero
  -- lejos: lo cuida `games.py`.
  unique (game, content_id)
);

comment on table public.daily_games is
  'Película de cada juego y día (las soluciones, también las futuras). Solo servidor. La rellena scripts/seed/games.py.';

-- Para el borrado restringido desde `content` sin recorrer la tabla.
create index daily_games_content_id_idx on public.daily_games (content_id);

alter table public.daily_games enable row level security;
revoke all on table public.daily_games from anon, authenticated;
