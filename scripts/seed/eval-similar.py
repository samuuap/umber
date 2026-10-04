"""
Compara métodos de «Más como esta» con un juez: deepseek-flash puntúa de 1 a 5
cada parecido de 40 películas conocidas.

    python eval-similar.py
    python eval-similar.py tmdb=0.1,plot=0.6,genres=0.1,keywords=0.1,popularity=0.1   # más variantes del híbrido

Métodos: `legacy` (solo argumento y otoño, el de antes de la Fase 8), `hybrid`
(el de `similar.py`) y `tmdb` (solo las recomendaciones de TMDB que están en el
corpus), como referencia. De cada uno, los 6 primeros: es lo que se ve de la
lista en la ficha sin hacer scroll.

El juez no sabe de qué método sale cada candidato: por película se juntan los de
los tres, sin repetir, en un orden fijo que no depende del método. Cada
puntuación se cachea por pareja en `data/eval-similar.jsonl`: al cambiar los
pesos solo se juzgan las parejas nuevas. Unos céntimos de DeepSeek por pasada.

Necesita `data/corpus.jsonl` (score.py) y `data/plot-embeddings.jsonl` (embed.py).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from statistics import mean
from typing import Any

from openai import OpenAI

from common import (
    CORPUS_PATH,
    DATA_DIR,
    PLOT_EMBEDDINGS_PATH,
    SUGGESTIONS_PATH,
    append_jsonl,
    content_key,
    read_jsonl,
    require_env,
    unpack_vector,
)
from similar import resolve_suggestions, similar_titles

TOP = 6
# El juez, por defecto el mismo modelo que sugiere. `JUDGE_MODEL=deepseek-v4-pro`
# para que no se puntúe a sí mismo.
MODEL = os.environ.get("JUDGE_MODEL", "deepseek-flash")
CACHE_PATH = DATA_DIR / "eval-similar.jsonl"

# Conocidas y variadas: géneros, épocas, públicos y países. Por título inglés y
# año, que es como las nombra cualquiera; nada de ids.
FILMS = [
    ("The Shawshank Redemption", 1994), ("Pulp Fiction", 1994), ("Interstellar", 2014), ("Inception", 2010),
    ("Amélie", 2001), ("Spirited Away", 2001), ("Coco", 2017), ("Toy Story", 1995),
    ("The Godfather", 1972), ("Titanic", 1997), ("La La Land", 2016), ("Parasite", 2019),
    ("Mad Max: Fury Road", 2015), ("The Notebook", 2004), ("Before Sunrise", 1995), ("Good Will Hunting", 1997),
    ("Dead Poets Society", 1989), ("When Harry Met Sally...", 1989), ("Harry Potter and the Philosopher's Stone", 2001),
    ("The Lord of the Rings: The Fellowship of the Ring", 2001), ("Jurassic Park", 1993), ("The Matrix", 1999),
    ("Se7en", 1995), ("The Silence of the Lambs", 1991), ("Get Out", 2017), ("Hereditary", 2018),
    ("The Grand Budapest Hotel", 2014), ("Little Women", 2019), ("Pride & Prejudice", 2005), ("Volver", 2006),
    ("Pan's Labyrinth", 2006), ("Back to the Future", 1985), ("The Devil Wears Prada", 2006), ("Gladiator", 2000),
    ("Whiplash", 2014), ("Her", 2013), ("Eternal Sunshine of the Spotless Mind", 2004), ("Up", 2009),
    ("Knives Out", 2019), ("Home Alone", 1990),
]

SYSTEM_PROMPT = """\
You are a film critic who gives excellent personal recommendations.
Someone loved the SOURCE film. For each CANDIDATE, rate how good a recommendation it would be for that person:
5 = excellent, an obvious "if you loved this, watch that"
4 = good, clearly related in tone, genre or audience
3 = acceptable, some connection
2 = weak, little in common
1 = poor, a different audience or tone (e.g. a children's film for a horror fan, a horror film for a romance fan)
Judge each candidate on its own; do not rank them against each other.
Reply with json only: {"scores": [{"id": 1, "score": 4}, ...]}, one entry per candidate."""
JUDGE_VERSION = hashlib.sha256(f"{MODEL}|{SYSTEM_PROMPT}".encode()).hexdigest()[:10]


def describe(row: dict[str, Any]) -> str:
    year = f" ({row['year']})" if row["year"] else ""
    synopsis = (row["synopsis_en"] or row["synopsis"] or "")[:240]
    return f"{row['title_en']}{year} · {', '.join(row['genres_en']) or '—'} · {synopsis}"


def judge(client: OpenAI, source: dict[str, Any], candidates: list[dict[str, Any]]) -> list[int]:
    listing = "\n".join(f"[{i}] {describe(row)}" for i, row in enumerate(candidates, start=1))
    for _ in range(3):
        response = client.chat.completions.create(
            model=MODEL,
            temperature=0.1,
            max_tokens=600,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"SOURCE: {describe(source)}\n\nCANDIDATES:\n{listing}"},
            ],
            extra_body={"thinking": {"type": "disabled"}},
        )
        try:
            entries = json.loads(response.choices[0].message.content or "")["scores"]
            by_id = {int(entry["id"]): int(entry["score"]) for entry in entries}
            if set(by_id) == set(range(1, len(candidates) + 1)) and all(1 <= v <= 5 for v in by_id.values()):
                return [by_id[i] for i in range(1, len(candidates) + 1)]
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            pass
    raise SystemExit(f"El juez no devolvió una respuesta válida para {source['title_en']}.")


def main() -> None:
    corpus = list(read_jsonl(CORPUS_PATH))
    by_key = {content_key(row["type"], row["tmdb_id"]): row for row in corpus}
    plots = {row["key"]: unpack_vector(row["embedding"]) for row in read_jsonl(PLOT_EMBEDDINGS_PATH)}
    items = [row for key, row in by_key.items() if key in plots]

    sources = []
    for title, year in FILMS:
        found = [row for row in items if row["type"] == "movie" and row["title_en"] == title and row["year"] == year]
        if not found:
            print(f"  ⚠ no está en el corpus: {title} ({year})", file=sys.stderr)
            continue
        sources.append(found[0])
    print(f"{len(sources)} películas de {len(FILMS)}")

    suggested = resolve_suggestions(items, SUGGESTIONS_PATH)
    methods = {
        "legacy": similar_titles(items, plots, "legacy"),
        "hybrid": similar_titles(items, plots, "hybrid", suggested=suggested),
    }
    # Variantes de pesos por la línea de órdenes: `llm=0.3,tmdb=0.1,plot=0.4,…`.
    # Sin `llm`, ni como peso ni como candidatos: el híbrido sin el cinéfilo.
    for spec in sys.argv[1:]:
        weights = {name: float(value) for name, value in (part.split("=") for part in spec.split(","))}
        methods[spec] = similar_titles(
            items, plots, "hybrid", weights, suggested if weights.get("llm", 0) > 0 else None
        )
    # Referencia: lo que sugiere el cinéfilo, tal cual y en su orden.
    methods["llm"] = {key: [(other, 0.0) for other in others] for key, others in suggested.items()}
    position = {(row["type"], row["tmdb_id"]): row for row in items}
    methods["tmdb"] = {
        content_key(row["type"], row["tmdb_id"]): [
            (content_key(row["type"], tmdb_id), 0.0)
            for tmdb_id in row.get("tmdb_recommendations") or []
            if (row["type"], tmdb_id) in position
        ]
        for row in sources
    }

    cache = {row["pair"]: row["score"] for row in read_jsonl(CACHE_PATH) if row.get("judge") == JUDGE_VERSION}
    client = OpenAI(base_url="https://api.deepseek.com", api_key=require_env("DEEPSEEK_API_KEY"), timeout=120)
    scores: dict[str, list[int]] = {name: [] for name in methods}
    examples: list[str] = []
    for source in sources:
        key = content_key(source["type"], source["tmdb_id"])
        tops = {name: [k for k, _ in lists.get(key, [])[:TOP]] for name, lists in methods.items()}
        # Orden fijo e independiente del método: el juez no puede saber de dónde sale cada uno.
        union = sorted({k for top in tops.values() for k in top})
        pending = [k for k in union if f"{key}>{k}" not in cache]
        if pending:
            values = judge(client, source, [by_key[k] for k in pending])
            rows = [{"pair": f"{key}>{k}", "score": v, "judge": JUDGE_VERSION} for k, v in zip(pending, values)]
            append_jsonl(CACHE_PATH, rows)
            cache |= {row["pair"]: row["score"] for row in rows}
        for name, top in tops.items():
            scores[name] += [cache[f"{key}>{k}"] for k in top]
        if source["title_en"] in ("Good Will Hunting", "Coco", "Amélie", "Hereditary"):
            for name in ("legacy", "hybrid"):
                listing = " · ".join(f"{by_key[k]['title']} [{cache[f'{key}>{k}']}]" for k in tops[name])
                examples.append(f"  {source['title']} — {name}: {listing}")

    print(f"\nJuez {JUDGE_VERSION}, {TOP} primeros de cada método:\n")
    width = max(len(name) for name in scores)
    print(f"  {'método':<{width}} {'media':>6} {'≥4':>6} {'≤2':>6} {'n':>5}")
    for name, values in scores.items():
        if not values:
            continue
        good = sum(v >= 4 for v in values) / len(values)
        bad = sum(v <= 2 for v in values) / len(values)
        print(f"  {name:<{width}} {mean(values):>6.2f} {good:>6.0%} {bad:>6.0%} {len(values):>5}")
    print("\n" + "\n".join(examples))


if __name__ == "__main__":
    main()
