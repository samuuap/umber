"""
«Más como esta»: los títulos más parecidos a cada uno, del mismo tipo.

Lo usan `load-db.py`, que carga el resultado en `content_similar`, y
`eval-similar.py`, que compara métodos con un juez.

Hasta la Fase 8 solo contaba el parecido de argumento (`plot_text`), y fallaba
de tres maneras: comparaba el argumento y no el tono ni el público (*El
indomable Will Hunting* traía *El bosque*, un thriller; *Coco*, una comedia de
zombis), el corpus era solo otoñal, y no había ninguna señal de popularidad. El
método híbrido mezcla seis señales:

- **Cinéfilo**: los 10 títulos que deepseek-flash recomendaría a quien adoró
  este (`suggest.py`), los que estén en el corpus. Es la que mejor capta el
  tono y el público de lo conocido
- **TMDB**: sus recomendaciones, de lo que vio la gente que vio el título. Más
  irregulares de lo esperado: a *Interstellar* le proponía *Stargate*
- **Argumento**: el parecido de `plot_text`, para todo lo demás
- **Géneros** y **keywords** en común
- **Popularidad**: a igualdad, lo conocido antes

Y tres reglas duras: el mismo público (nada infantil ni de animación para un
título que no lo es, y para uno familiar, solo familiar o de animación) y nada
de terror para uno que no lo es, salvo que lo sugiera el cinéfilo o TMDB; como mucho dos de
una misma saga (*Harry Potter* llenaba la lista con sus siete), y una sola
versión de cada título en la lista (hay tres *Mujercitas*).
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Any

import numpy as np

from common import comparable_title, content_key, read_jsonl

SIMILAR_COUNT = 12

# Pesos del método híbrido, ajustados con `eval-similar.py`: 40 películas, sus 6
# primeros parecidos puntuados de 1 a 5 por deepseek-v4-pro, que no es el modelo
# que sugiere (ver docs/fase-8). Sin el cinéfilo, lo mejor era 3,7 de media (TMDB
# a 0,40 bajaba a 3,54: sus recomendaciones son irregulares). Con él a 0,35, 4,01,
# y las malas (2 o menos) del 13 % al 4 %. El cinéfilo solo se queda en 3,93:
# el resto cubre lo que él no conoce.
WEIGHTS = {"llm": 0.35, "tmdb": 0.05, "plot": 0.25, "genres": 0.10, "keywords": 0.05, "popularity": 0.20}
# Vecinos por argumento que entran como candidatos, además de los de TMDB.
PLOT_POOL = 40
# TMDB da 20 recomendaciones en su primera página.
TMDB_RECOMMENDATIONS = 20
# `suggest.py` pide 10 por título.
LLM_SUGGESTIONS = 10
MAX_PER_COLLECTION = 2
# Filas de la matriz de similitud por bloque: 1.000 × 15.000 son 60 MB.
CHUNK = 1_000

# Ids de géneros de TMDB. Películas: Animación 16, Familia 10751, Terror 27.
# Series: Animación 16, Familia 10751, Infantil 10762 (no tienen terror).
KIDS_GENRES = {16, 10751, 10762}
# Lo que hace familiar un título: la animación sola no (*Akira*, *Perfect Blue*).
FAMILY_GENRES = {10751, 10762}
HORROR_GENRES = {27}

# El método de antes, para comparar: de los 24 más parecidos por argumento, los
# 12 primeros tras sumar 0,2 × otoño.
LEGACY_POOL = 24
LEGACY_AUTUMN_WEIGHT = 0.2


def _normalized(vectors: list[list[float]]) -> np.ndarray:
    matrix = np.array(vectors, dtype=np.float32)
    matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
    return matrix


def _top_plot(matrix: np.ndarray, pool: int) -> tuple[np.ndarray, np.ndarray]:
    """Para cada fila, los `pool` vecinos más parecidos (sin ella misma), ordenados, y su similitud."""
    count = matrix.shape[0]
    pool = min(pool, count - 1)
    indices = np.zeros((count, pool), dtype=np.int32)
    values = np.zeros((count, pool), dtype=np.float32)
    for start in range(0, count, CHUNK):
        block = matrix[start : start + CHUNK] @ matrix.T
        for offset in range(block.shape[0]):
            block[offset, start + offset] = -np.inf
        top = np.argpartition(-block, pool, axis=1)[:, :pool]
        top_values = np.take_along_axis(block, top, axis=1)
        order = np.argsort(-top_values, axis=1)
        indices[start : start + CHUNK] = np.take_along_axis(top, order, axis=1)
        values[start : start + CHUNK] = np.take_along_axis(top_values, order, axis=1)
    return indices, values


def _title_variants(title: str) -> set[str]:
    """Formas de un título para emparejar: entero, sin «The» delante, y antes de
    «:» o de « or » (*Birdman or (The Unexpected Virtue of Ignorance)*)."""
    variants = {comparable_title(title)}
    for separator in (":", " or ", " - "):
        if separator in title:
            variants.add(comparable_title(title.split(separator)[0]))
    variants |= {variant.removeprefix("the ") for variant in variants}
    return {variant for variant in variants if variant}


def resolve_suggestions(items: list[dict[str, Any]], path: Any) -> dict[str, list[str]]:
    """Las sugerencias de `suggest.py`, como claves del corpus y en su orden.

    Por título (inglés o español) y año, con un año de margen: TMDB y el modelo
    no siempre fechan igual. Lo que no está en el corpus, o es el propio título,
    se descarta: así el modelo no puede colar un título inventado.
    """
    index: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for item in items:
        for title in {item["title_en"] or "", item["title"] or ""}:
            for variant in _title_variants(title):
                index.setdefault((item["type"], variant), []).append(item)

    by_key = {content_key(item["type"], item["tmdb_id"]): item for item in items}
    resolved: dict[str, list[str]] = {}
    for row in read_jsonl(path):
        source = by_key.get(row["key"])
        if source is None:
            continue
        keys: list[str] = []
        for suggestion in row["similar"]:
            matches = {
                content_key(match["type"], match["tmdb_id"]): match
                for variant in _title_variants(suggestion["title"])
                for match in index.get((source["type"], variant), [])
            }
            year = suggestion.get("year")
            fitting = [
                match for match in matches.values()
                if year is None or match["year"] is None or abs(match["year"] - year) <= 1
            ]
            if not fitting:
                continue
            best = min(fitting, key=lambda match: (abs((match["year"] or 0) - (year or 0)), -(match.get("vote_count") or 0)))
            key = content_key(best["type"], best["tmdb_id"])
            if key != row["key"] and key not in keys:
                keys.append(key)
        resolved[row["key"]] = keys
    return resolved


def _jaccard(a: set[Any], b: set[Any]) -> float:
    return len(a & b) / len(a | b) if a or b else 0.0


def similar_titles(
    items: list[dict[str, Any]],
    plot_vectors: dict[str, list[float]],
    method: str = "hybrid",
    weights: dict[str, float] | None = None,
    suggested: dict[str, list[str]] | None = None,
) -> dict[str, list[tuple[str, float]]]:
    """`{clave: [(clave parecida, puntuación), …]}`, de más a menos parecido.

    `method`: `"hybrid"` (el de la Fase 8) o `"legacy"` (solo argumento y otoño,
    el de antes), para compararlos. `weights` sustituye a `WEIGHTS`, para probar.
    `suggested`: lo que sugiere el cinéfilo (`resolve_suggestions`).
    """
    weights = weights or WEIGHTS
    suggested = suggested or {}
    result: dict[str, list[tuple[str, float]]] = {}
    for content_type in ("movie", "tv"):
        group = [item for item in items if item["type"] == content_type]
        if len(group) < 2:
            continue
        keys = [content_key(item["type"], item["tmdb_id"]) for item in group]
        matrix = _normalized([plot_vectors[key] for key in keys])
        pool = LEGACY_POOL if method == "legacy" else PLOT_POOL
        top_indices, top_values = _top_plot(matrix, pool)

        if method == "legacy":
            autumn = [item.get("autumn_score") or 0 for item in group]
            for i, key in enumerate(keys):
                ranked = sorted(
                    zip(top_indices[i], top_values[i]),
                    key=lambda pair: -(pair[1] + LEGACY_AUTUMN_WEIGHT * autumn[pair[0]]),
                )
                result[key] = [(keys[j], float(value)) for j, value in ranked[:SIMILAR_COUNT]]
            continue

        position = {item["tmdb_id"]: index for index, item in enumerate(group)}
        index_of = {key: index for index, key in enumerate(keys)}
        genres = [set(item.get("genre_ids") or []) for item in group]
        keywords = [{word.lower() for word in (item.get("keywords") or [])[:20]} for item in group]
        titles = [comparable_title(item["title_en"] or item["title"]) for item in group]
        collections = [item.get("collection_id") for item in group]
        votes = [max(item.get("vote_count") or 1, 1) for item in group]
        low, high = math.log10(min(votes)), math.log10(max(votes))
        popularity = [(math.log10(v) - low) / (high - low) if high > low else 0.0 for v in votes]

        for i, key in enumerate(keys):
            # Candidatos: los vecinos por argumento y las recomendaciones de TMDB que estén en el corpus.
            tmdb_rank = {
                position[tmdb_id]: rank
                for rank, tmdb_id in enumerate((group[i].get("tmdb_recommendations") or [])[:TMDB_RECOMMENDATIONS])
                if tmdb_id in position and position[tmdb_id] != i
            }
            llm_rank = {
                index_of[other]: rank
                for rank, other in enumerate(suggested.get(key, [])[:LLM_SUGGESTIONS])
                if other in index_of
            }
            candidates = set(top_indices[i].tolist()) | set(tmdb_rank) | set(llm_rank)
            # El argumento, en la escala de los vecinos de este título: el primero vale 1 y el último del pool, 0.
            best, worst = float(top_values[i][0]), float(top_values[i][-1])
            spread = best - worst if best > worst else 1.0

            scored: list[tuple[float, int]] = []
            for j in candidates:
                from_tmdb = j in tmdb_rank
                from_llm = j in llm_rank
                if not (from_tmdb or from_llm):
                    if genres[j] & KIDS_GENRES and not genres[i] & KIDS_GENRES:
                        continue
                    if genres[i] & FAMILY_GENRES and not genres[j] & KIDS_GENRES:
                        continue
                    if genres[j] & HORROR_GENRES and not genres[i] & HORROR_GENRES:
                        continue
                plot = float(matrix[i] @ matrix[j])
                score = (
                    # Lineal: medida con el juez, una caída más suave (la décima a 0,55) daba 3,95 y no 4,01.
                    weights.get("llm", 0.0) * (1 - llm_rank[j] / LLM_SUGGESTIONS if from_llm else 0.0)
                    + weights["tmdb"] * (1 - tmdb_rank[j] / TMDB_RECOMMENDATIONS if from_tmdb else 0.0)
                    + weights["plot"] * min(max((plot - worst) / spread, 0.0), 1.0)
                    + weights["genres"] * _jaccard(genres[i], genres[j])
                    + weights["keywords"] * _jaccard(keywords[i], keywords[j])
                    + weights["popularity"] * popularity[j]
                )
                scored.append((score, j))
            scored.sort(key=lambda pair: -pair[0])

            chosen: list[tuple[str, float]] = []
            per_collection: Counter[int] = Counter()
            seen_titles: set[str] = set()
            for score, j in scored:
                collection = collections[j]
                if collection is not None and per_collection[collection] >= MAX_PER_COLLECTION:
                    continue
                if titles[j] in seen_titles:
                    continue
                if collection is not None:
                    per_collection[collection] += 1
                seen_titles.add(titles[j])
                chosen.append((keys[j], round(score, 6)))
                if len(chosen) == SIMILAR_COUNT:
                    break
            result[key] = chosen
    return result
