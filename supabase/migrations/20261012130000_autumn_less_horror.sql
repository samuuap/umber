-- La especialidad de otoño es lo que apetece ver en otoño (El club de los poetas
-- muertos, Cuando Harry encontró a Sally), no el terror de Halloween: decisión de
-- producto del 2026-10-12. El terror puntúa la mitad, salvo lo familiar e
-- infantil (El retorno de las brujas, Coco). La misma regla, para las próximas
-- cargas, en `horror_factor()` de `scripts/seed/score.py`: tienen que coincidir.
--
-- Terror: el género en películas; las series no lo tienen en TMDB, así que
-- también las keywords (en inglés) con «horror» o «slasher».
update public.content
set autumn_score = round((autumn_score * 0.5)::numeric, 3)
where autumn_score is not null
  and (
    genres @> array['Terror']
    or exists (select 1 from unnest(keywords) as k where k like '%horror%' or k like '%slasher%')
  )
  and not genres && array['Familia', 'Infantil', 'Animación'];
