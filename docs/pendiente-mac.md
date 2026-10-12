# Pendiente en el Mac — 2026-10-12

Recalibrar la especialidad de otoño con el criterio nuevo de `score.py` (lo que
apetece ver una tarde de otoño; la Navidad es Navidad; sin terror). Contexto y
cifras del piloto en `docs/fase-8-experto-general.md` («La especialidad de
otoño, recalibrada»). Los datos del seed (`scripts/seed/data/`) solo están en el
Mac: por eso se hace allí.

## Antes, en Windows

- [ ] Aplicar las migraciones pendientes (orden por fama y especiales de
      Halloween infantiles): `npx supabase db push`
- [ ] Commit y push de los cambios

## En el Mac, desde la raíz del proyecto

- [ ] Traer los cambios y activar el entorno
  ```bash
  git pull
  source .venv/bin/activate
  ```

- [ ] *(Opcional)* Probar el prompt con la lista de referencia, sin tocar nada
      (céntimos)
  ```bash
  python scripts/seed/eval-autumn.py --pilot
  ```
  Debería dar unos 73/100 fuera del prompt y unos 31 en los controles.

- [ ] Puntuar el universo con el criterio nuevo (~1–2 USD de DeepSeek; si se
      corta, se reanuda donde iba)
  ```bash
  python scripts/seed/score.py
  ```

- [ ] Vectorizar los títulos que entren nuevos. Primero, en otra terminal:
      `npm run embeddings`
  ```bash
  EMBEDDINGS_URL=http://127.0.0.1:8080/v1 EMBEDDINGS_API_KEY= EMBEDDINGS_MODEL= python scripts/seed/embed.py
  ```

- [ ] Sugerencias del cinéfilo para los títulos nuevos (céntimos)
  ```bash
  python scripts/seed/suggest.py
  ```

- [ ] Cargar en Supabase. `--prune` quita lo que ya no entra al corpus; sin él,
      esos títulos se quedarían con la nota antigua
  ```bash
  python scripts/seed/load-db.py --prune
  ```
  Si se para, alguien tiene en favoritos un título que sale: mirar cuál antes de
  repetir con `--drop-favorites`.

- [ ] Compactar la tabla y reconstruir el índice: la carga reescribe todas las
      filas y, sin esto, las búsquedas pasan de 0,1 a 2 s. Mientras dura, la
      búsqueda se para unos segundos
  ```bash
  npx supabase db query --linked "vacuum full public.content"
  npx supabase db query --linked "reindex index public.content_embedding_hnsw_idx"
  ```

- [ ] Medir el orden real de «Más otoñales»
  ```bash
  python scripts/seed/eval-autumn.py
  ```
  Antes: ninguna de las 34 de fuera del prompt en la primera página, mediana en
  el puesto 1.954. Mirar también que los controles (Navidad, terror, Halloween
  infantil) queden lejos.

- [ ] Echar un vistazo a `/explorar?sort=autumn`: que no se hayan colado arriba
      títulos que no tocan

- [ ] Apuntar el resultado en `docs/fase-8-experto-general.md` y marcar la
      última casilla de «La especialidad de otoño, recalibrada»

## Si no convence

Volver el prompt atrás con git (`scripts/seed/score.py`) y repetir desde
`score.py`: guarda en caché las notas de cada versión del prompt, así que volver
a la anterior no cuesta nada.
