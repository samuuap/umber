-- Los especiales de Halloween infantiles que conoce poca gente (Scooby-Doo,
-- Halloweentown, Los Muppets en Haunted Mansion…) puntuaban 0,93–0,95 de otoño:
-- el prompt de `score.py` da 85–100 a todo lo que va de Halloween. Decisión de
-- producto del 2026-10-12: otoño antes que Halloween. Puntúan el 60 %.
--
-- El patrón: keyword «halloween», infantil o familiar (Familia, Infantil,
-- Animación o Película de TV) y menos de 1.000 votos. Con los votos quedan
-- fuera los conocidos (Pesadilla antes de Navidad, Coraline, El retorno de las
-- brujas). El terror ya va a la mitad (20261012130000) y no es infantil: no se
-- penaliza dos veces. La misma regla, en `autumn_factor()` de `score.py`.
update public.content
set autumn_score = round((autumn_score * 0.6)::numeric, 3)
where autumn_score is not null
  and exists (select 1 from unnest(keywords) as k where k like '%halloween%')
  and genres && array['Familia', 'Infantil', 'Animación', 'Película de TV']
  and coalesce(vote_count, 0) < 1000;
