"""
Puntúa cuán otoñal es cada título del universo y elige el corpus.

Desde la Fase 8 Umber es un experto general y el otoño, una especialidad: el
corpus es todo lo conocido (`is_known`), y la puntuación de otoño se guarda en
todos para la especialidad. Lo que entraba antes por otoñal se queda aunque no
llegue al umbral general.

    python score.py

1. deepseek-flash puntúa de 0 a 100 **todo** el universo, por lotes y a
   temperatura 0.1, en `PASSES` pasadas. Cada pasada baraja los títulos con otra
   semilla, así que cada uno cae en lotes de composición distinta, y la
   puntuación final es la media: con una sola pasada, la franja media tenía
   ruido de ±10 a ±40 según el lote, justo donde está el corte.
2. Las puntuaciones se guardan en `data/scores.jsonl` con la versión del prompt y
   la pasada: reejecutar no repite llamadas y da el mismo corpus, y cambiar el
   prompt invalida la caché por sí solo.
3. Entra al corpus lo conocido (`is_known`: votos y nota) y, para la
   especialidad, lo otoñal (`MIN_AUTUMN`) y relevante (`is_relevant`), con las
   series de otoño hasta `AUTUMN_MAX_TV`. Todos llevan `autumn_score = media / 100`,
   salvo el terror y los especiales de Halloween infantiles (`autumn_factor`).

Hasta la versión anterior, una heurística de géneros y keywords decidía qué
títulos llegaban al modelo. Premiaba el terror y dejaba fuera clásicos otoñales
sin keywords estacionales, como *Tienes un e-mail*: ahora se puntúa todo.

Necesita `data/universe.jsonl` (fetch-tmdb.py). Produce `data/corpus.jsonl`.
"""

from __future__ import annotations

import hashlib
import json
import random
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from statistics import mean
from typing import Any

from openai import OpenAI, OpenAIError

from common import (
    CONTENT_TYPES,
    CORPUS_PATH,
    DATA_DIR,
    UNIVERSE_PATH,
    append_jsonl,
    content_key,
    read_jsonl,
    require_env,
    write_jsonl,
)

# ─── Qué entra al corpus ─────────────────────────────────────────────────────
# Decisión de producto (2026-10-04, Fase 8): cine internacional conocido, el
# español dentro como uno más. Películas con 200 votos o más y nota por encima de
# 3,5; series de todo tipo con 500 o más. La nota solo quita lo malo de verdad: lo
# conocido ya lo ordena la popularidad al buscar.
KNOWN_MIN_VOTES = {"movie": 200, "tv": 500}
KNOWN_MIN_RATING = 3.5

# La especialidad de otoño, con sus criterios de antes (2026-10-04): otoñal y
# relevante. Lo que entraba por aquí se queda aunque no llegue al umbral general.
MIN_AUTUMN = {"movie": 32, "tv": 40}
MIN_VOTES = {"movie": 300, "tv": 300}
MIN_RATING = {"movie": 6.0, "tv": 7.0}
# El terror puntúa la mitad en la especialidad (2026-10-12): el otoño es lo que
# apetece ver en esta época, no Halloween ni los slashers. Salvo lo familiar e
# infantil. La misma regla está en la migración 20261012130000: tienen que coincidir.
# Las dos, en `autumn_factor()`.
HORROR_FACTOR = 0.5
HORROR_KEYWORDS = ("horror", "slasher")
NOT_HORROR_GENRES = {"Familia", "Infantil", "Animación"}
# Los especiales de Halloween infantiles que conoce poca gente (Scooby-Doo,
# Halloweentown) puntúan el 60 % (2026-10-12): el prompt da 85–100 a Halloween.
# Migración 20261012160000.
HALLOWEEN_SPECIAL_FACTOR = 0.6
HALLOWEEN_SPECIAL_GENRES = {"Familia", "Infantil", "Animación", "Película de TV"}
HALLOWEEN_SPECIAL_MAX_VOTES = 1000
# Sin el mínimo de votos (la nota se exige igual): lo muy otoñal, que es el
# centro de la especialidad, y lo de los dos últimos años, que aún no ha tenido
# tiempo de acumularlos. Si no, salía *Cuando cae el otoño* (Ozon, 2024; otoño 82).
VOTES_EXEMPT_AUTUMN = 60
RECENT_YEARS = 2
# Las 500 series más otoñales de entre las relevantes.
AUTUMN_MAX_TV = 500

MODEL = "deepseek-flash"
TEMPERATURE = 0.1  # clasificación: lo más estable posible
PASSES = 3
BATCH_SIZE = 25
WORKERS = 8
MAX_ATTEMPTS = 3
SCORES_PATH = DATA_DIR / "scores.jsonl"

# ─── Puntuación con el modelo ────────────────────────────────────────────────

# Criterio (2026-10-12): lo que apetece ver una tarde de otoño, acogedor y cálido,
# y no solo lo que transcurre en otoño. La Navidad es Navidad, y el terror no
# entra. Los ejemplos son parte de la lista de referencia de `eval-autumn.py`; el
# resto de esa lista queda fuera del prompt para medir si el criterio generaliza.

SYSTEM_PROMPT = """\
You score films and TV series for a recommendation app that only suggests what to watch in autumn.

For each title, give an integer from 0 to 100: how much it is something people want to watch on an autumn evening, once September comes, the days get shorter and the rain starts. That is first a feeling: warm, cozy, gentle, nostalgic or bittersweet; a story to curl up with. An autumn setting (a new school year, New England in October, the harvest, Thanksgiving, falling leaves) adds to it, but is not required: a warm, gentle story set in another season can still be a perfect autumn watch. Judge the work itself: its mood, its themes, its setting and what it leaves you with. Genre alone decides nothing.

- 90–100: an autumn classic, what people reach for every autumn: cozy, warm and nostalgic, often with school, books, rain or falling leaves. E.g. Dead Poets Society, When Harry Met Sally..., You've Got Mail, Good Will Hunting, Fantastic Mr. Fox, Practical Magic, Gilmore Girls, the Harry Potter films.
- 70–89: a comfort watch that fits autumn very well: gentle comedies and romances, bittersweet coming-of-age, campus and school life, small towns and bookshops, food and wine, quiet family dramas, whimsical animation. E.g. The Perks of Being a Wallflower, About Time, Kiki's Delivery Service, My Neighbor Totoro, Julie & Julia, Midnight in Paris.
- 40–69: fits an autumn evening reasonably well without being a comfort watch: reflective dramas, romances, fantasies, mysteries or thrillers with some warmth or melancholy.
- 10–39: loud, bright or seasonally at odds with autumn: mainstream action, broad comedies, most science fiction, stories about summer holidays or spring break.
- 0–9: the opposite of autumn: beach and party films, superhero blockbusters, space opera. E.g. Mamma Mia!, Guardians of the Galaxy.

Holidays belong to their own season:
- Christmas is Christmas, not autumn: when Christmas or the winter holidays are central to the story, score 10–25 however cozy it is. E.g. Love Actually, Klaus, Home Alone, Elf.
- Halloween and the Day of the Dead are autumn, but not its centre: titles about them score 60–80 when warm and family-friendly (e.g. Coco, Hocus Pocus), and follow the horror rule otherwise.
- Horror is not an autumn watch for this app: horror, slashers, possessions and haunted houses score 30 at most, on Halloween or not. Being spooky is not being autumnal. Dark fairy tales and family fantasy with a spooky edge are not horror: they score like any other title (e.g. Coraline).

Score each title on its own merits; do not rank the titles in the list against each other.
Reply with json only, in exactly this shape: {"scores": [{"id": 1, "score": 73}, ...]}, one entry per title, using the ids given."""

# Subir si cambia `describe`: forma parte de lo que ve el modelo.
FORMAT_VERSION = 1
PROMPT_VERSION = hashlib.sha256(f"{MODEL}|{FORMAT_VERSION}|{SYSTEM_PROMPT}".encode()).hexdigest()[:12]


class ScoringError(Exception):
    pass


def describe(index: int, row: dict[str, Any]) -> str:
    kind = "film" if row["type"] == "movie" else "TV series"
    year = f" ({row['year']})" if row["year"] else ""
    synopsis = (row["synopsis_en"] or row["synopsis"] or "")[:500]
    return (
        f"[{index}] {row['title_en']}{year} · {kind}\n"
        f"Genres: {', '.join(row['genres_en']) or '—'}\n"
        f"Keywords: {', '.join(row['keywords'][:20]) or '—'}\n"
        f"Synopsis: {synopsis}"
    )


def parse_scores(content: str, expected: int) -> list[int]:
    try:
        entries = json.loads(content)["scores"]
        by_id = {int(entry["id"]): entry["score"] for entry in entries}
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        raise ScoringError(f"respuesta ilegible: {error}") from error
    if set(by_id) != set(range(1, expected + 1)):
        raise ScoringError(f"ids {sorted(by_id)} en vez de 1..{expected}")
    scores = [by_id[i] for i in range(1, expected + 1)]
    if not all(isinstance(s, int) and not isinstance(s, bool) and 0 <= s <= 100 for s in scores):
        raise ScoringError(f"puntuaciones fuera de 0–100: {scores}")
    return scores


def score_batch(client: OpenAI, batch: list[dict[str, Any]]) -> dict[str, int]:
    """Sin streaming: es un proceso por lotes y nadie lee la respuesta mientras llega."""
    listing = "\n\n".join(describe(i, row) for i, row in enumerate(batch, start=1))
    last_error: ScoringError | None = None
    for _ in range(MAX_ATTEMPTS):
        response = client.chat.completions.create(
            model=MODEL,
            temperature=TEMPERATURE,
            max_tokens=1_000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": listing},
            ],
            # deepseek-flash razona por defecto: ~20 veces más tokens por lote, y
            # con este `max_tokens` el razonamiento no deja sitio a la respuesta.
            extra_body={"thinking": {"type": "disabled"}},
        )
        try:
            scores = parse_scores(response.choices[0].message.content or "", len(batch))
        except ScoringError as error:
            last_error = error
            continue
        return {content_key(row["type"], row["tmdb_id"]): score for row, score in zip(batch, scores)}
    raise ScoringError(f"lote de {batch[0]['title_en']!r}: {last_error}")


def load_scores() -> dict[str, dict[int, int]]:
    """Clave → pasada → puntuación, solo de la versión actual del prompt."""
    scores: dict[str, dict[int, int]] = {}
    for row in read_jsonl(SCORES_PATH):
        if row["version"] == PROMPT_VERSION and "pass" in row:
            scores.setdefault(row["key"], {})[row["pass"]] = row["score"]
    return scores


def pass_batches(pass_number: int, pending: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Lotes barajados con la pasada como semilla: otra composición en cada una, y la misma al reejecutar."""
    rows = sorted(pending, key=lambda row: (row["type"], row["tmdb_id"]))
    random.Random(pass_number).shuffle(rows)
    return [rows[i : i + BATCH_SIZE] for i in range(0, len(rows), BATCH_SIZE)]


def score_all(universe: list[dict[str, Any]]) -> dict[str, list[int]]:
    scores = load_scores()
    client: OpenAI | None = None
    failures = 0

    for pass_number in range(1, PASSES + 1):
        pending = [row for row in universe if pass_number not in scores.get(content_key(row["type"], row["tmdb_id"]), {})]
        batches = pass_batches(pass_number, pending)
        print(f"  pasada {pass_number}: {len(universe) - len(pending)} en caché (prompt {PROMPT_VERSION}), {len(pending)} por puntuar en {len(batches)} lotes")
        if not batches:
            continue

        client = client or OpenAI(base_url="https://api.deepseek.com", api_key=require_env("DEEPSEEK_API_KEY"), max_retries=5, timeout=120)
        with ThreadPoolExecutor(WORKERS) as pool:
            futures = [pool.submit(score_batch, client, batch) for batch in batches]
            for done, future in enumerate(as_completed(futures), start=1):
                try:
                    result = future.result()
                except (ScoringError, OpenAIError) as error:
                    failures += 1
                    print(f"  ✗ {error}", file=sys.stderr)
                    continue
                append_jsonl(SCORES_PATH, [{"key": k, "version": PROMPT_VERSION, "pass": pass_number, "score": s} for k, s in result.items()])
                for key, score in result.items():
                    scores.setdefault(key, {})[pass_number] = score
                if done % 50 == 0:
                    print(f"    {done}/{len(batches)} lotes")

    if failures:
        raise SystemExit(f"{failures} lotes fallidos. Reejecuta: los ya puntuados no se repiten.")
    return {key: [by_pass[p] for p in sorted(by_pass)] for key, by_pass in scores.items()}


# ─── Selección ───────────────────────────────────────────────────────────────


def is_known(row: dict[str, Any]) -> bool:
    """Lo que entra al corpus general: conocido y sin una nota desastrosa."""
    return (
        row["vote_count"] >= KNOWN_MIN_VOTES[row["type"]]
        and (row["vote_average"] or 0) > KNOWN_MIN_RATING
    )


def is_relevant(row: dict[str, Any]) -> bool:
    """De la especialidad de otoño: bien valorado y con votos suficientes para que la nota signifique algo."""
    content_type = row["type"]
    if (row["vote_average"] or 0) < MIN_RATING[content_type]:
        return False
    return (
        row["vote_count"] >= MIN_VOTES[content_type]
        or row["llm_score"] >= VOTES_EXEMPT_AUTUMN
        or (row["year"] or 0) > date.today().year - RECENT_YEARS
    )


def autumn_factor(row: dict[str, Any]) -> float:
    """Lo que se multiplica la puntuación de otoño: el terror y los especiales de Halloween."""
    genres = set(row.get("genres") or [])
    keywords = row.get("keywords") or []
    horror = "Terror" in genres or any(word in keyword for keyword in keywords for word in HORROR_KEYWORDS)
    if horror and not genres & NOT_HORROR_GENRES:
        return HORROR_FACTOR
    halloween = any("halloween" in keyword for keyword in keywords)
    if halloween and genres & HALLOWEEN_SPECIAL_GENRES and (row.get("vote_count") or 0) < HALLOWEEN_SPECIAL_MAX_VOTES:
        return HALLOWEEN_SPECIAL_FACTOR
    return 1.0


def label(row: dict[str, Any]) -> str:
    return f"{row['llm_score']:>5.1f}  {row['title']} ({row['year']})"


def report(content_type: str, ranked: list[dict[str, Any]], chosen: int) -> None:
    kept = ranked[:chosen]
    deciles = Counter(min(int(row["llm_score"] // 10), 9) * 10 for row in kept)
    print(f"\n  {content_type}: {len(kept)} al corpus, corte en {kept[-1]['llm_score']:.1f}/100")
    print("  reparto: " + "  ".join(f"{d}–{d + 9}: {deciles[d]}" for d in sorted(deciles, reverse=True)))
    print("  arriba:  " + " · ".join(label(r) for r in kept[:5]))
    print("  el corte: " + " · ".join(label(r) for r in kept[-3:]))
    if len(ranked) > chosen:
        print("  fuera:   " + " · ".join(label(r) for r in ranked[chosen : chosen + 3]))

    # Lo que la media corrige: títulos en los que las pasadas no se ponen de acuerdo.
    spread = sorted(kept, key=lambda row: max(row["llm_scores"]) - min(row["llm_scores"]), reverse=True)
    wide = sum(1 for row in kept if max(row["llm_scores"]) - min(row["llm_scores"]) >= 20)
    print(f"  pasadas que difieren en 20 o más: {wide}. Las que más: "
          + " · ".join(f"{row['title']} {row['llm_scores']}" for row in spread[:3]))


def main() -> None:
    universe = list(read_jsonl(UNIVERSE_PATH))
    if not universe:
        raise SystemExit(f"No hay universo en {UNIVERSE_PATH}. Ejecuta antes fetch-tmdb.py.")
    print(f"{len(universe)} títulos en el universo, {PASSES} pasadas")

    scores = score_all(universe)

    corpus: list[dict[str, Any]] = []
    for content_type in CONTENT_TYPES:
        ranked = []
        for row in universe:
            if row["type"] != content_type:
                continue
            passes = scores[content_key(row["type"], row["tmdb_id"])]
            ranked.append(row | {"llm_scores": passes, "llm_score": round(mean(passes), 1)})
        ranked.sort(key=lambda row: (-row["llm_score"], -row["vote_count"]))

        autumnal = [row for row in ranked if row["llm_score"] >= MIN_AUTUMN[content_type]]
        eligible = [row for row in autumnal if is_relevant(row)]
        print(f"\n  {content_type}: {len(autumnal)} otoñales (≥{MIN_AUTUMN[content_type]}), "
              f"{len(autumnal) - len(eligible)} fuera por poco relevantes")
        chosen = min(AUTUMN_MAX_TV, len(eligible)) if content_type == "tv" else len(eligible)
        report(content_type, eligible, chosen)
        autumn_keys = {content_key(row["type"], row["tmdb_id"]) for row in eligible[:chosen]}

        # El corpus: lo conocido, más lo de otoño que no llega al umbral general.
        known = [row for row in ranked if is_known(row)]
        known_keys = {content_key(row["type"], row["tmdb_id"]) for row in known}
        selected = [row for row in ranked if content_key(row["type"], row["tmdb_id"]) in known_keys | autumn_keys]
        selected.sort(key=lambda row: (-row["vote_count"], row["tmdb_id"]))
        only_autumn = len(autumn_keys - known_keys)
        print(f"  {content_type}: {len(known)} conocidos (≥{KNOWN_MIN_VOTES[content_type]} votos, "
              f"nota >{KNOWN_MIN_RATING}) + {only_autumn} de otoño que no llegan = {len(selected)} al corpus")
        # Qué entra lo decide la puntuación del modelo; la guardada lleva ya las reglas de `autumn_factor`.
        corpus += [row | {"autumn_score": round(row["llm_score"] / 100 * autumn_factor(row), 3)} for row in selected]

    write_jsonl(CORPUS_PATH, corpus)
    print(f"\n{len(corpus)} títulos → {CORPUS_PATH.relative_to(DATA_DIR.parent)}")


if __name__ == "__main__":
    main()
