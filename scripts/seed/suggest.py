"""
Lo que recomendaría un cinéfilo: para cada título del corpus, deepseek-flash
nombra los 10 que más disfrutaría quien lo adoró. Es una señal más de «Más como
esta» (`similar.py`).

    python suggest.py

Por qué: el argumento compara de qué va cada película, no su tono ni su público,
y las recomendaciones de TMDB son irregulares (a *Interstellar* le proponía
*Stargate* y *Vengadores: Endgame*). Lo que sabe el modelo de cine es lo más
parecido a preguntar a alguien que ha visto mucho: *Interstellar* → *Gravity*,
*Marte*, *La llegada*.

El modelo puede inventarse títulos o fechas: solo cuentan los que se encuentran
en el corpus por título y año, y el resto se descarta. Sin streaming: es un
proceso por lotes. Unos 1–2 USD para 16.000 títulos, una vez: se cachea por
título y versión del prompt en `data/suggestions.jsonl`.

Necesita `data/corpus.jsonl` (score.py).
"""

from __future__ import annotations

import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from openai import OpenAI, OpenAIError

from common import CORPUS_PATH, SUGGESTIONS_PATH, append_jsonl, content_key, read_jsonl, require_env

MODEL = "deepseek-flash"
BATCH_SIZE = 10
WORKERS = 16
MAX_ATTEMPTS = 3
PER_TITLE = 10

SYSTEM_PROMPT = """\
You are a film and TV expert with encyclopedic knowledge, recommending like a knowledgeable friend.
For each title, list the 10 titles that someone who loved it would most enjoy next: close in tone, themes, genre and audience.
- Prefer well-known titles; include a lesser-known one only when it is clearly the better match.
- Never include the title itself. At most 2 entries from its own franchise.
- For a film, suggest films. For a TV series, suggest TV series.
- Give the original English title (or the original title if it has no English one) and the year: release year for films, first-air year for series.
Reply with json only, in exactly this shape: {"items": [{"id": 1, "similar": [{"title": "Gravity", "year": 2013}, ...]}, ...]}, one item per title, using the ids given."""

VERSION = hashlib.sha256(f"{MODEL}|{SYSTEM_PROMPT}".encode()).hexdigest()[:12]


class SuggestionError(Exception):
    pass


def describe(index: int, row: dict[str, Any]) -> str:
    kind = "film" if row["type"] == "movie" else "TV series"
    year = f" ({row['year']})" if row["year"] else ""
    credit = f" · {'dir.' if row['type'] == 'movie' else 'created by'} {row['director']}" if row.get("director") else ""
    return f"[{index}] {row['title_en']}{year} · {kind}{credit} · {', '.join(row['genres_en'][:3]) or '—'}"


def parse(content: str, expected: int) -> dict[int, list[dict[str, Any]]]:
    try:
        items = json.loads(content)["items"]
        by_id = {int(item["id"]): item["similar"] for item in items}
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        raise SuggestionError(f"respuesta ilegible: {error}") from error
    if set(by_id) != set(range(1, expected + 1)):
        raise SuggestionError(f"ids {sorted(by_id)} en vez de 1..{expected}")
    clean: dict[int, list[dict[str, Any]]] = {}
    for index, similar in by_id.items():
        if not isinstance(similar, list):
            raise SuggestionError(f"«similar» no es una lista en {index}")
        clean[index] = [
            {"title": str(entry["title"]), "year": entry.get("year") if isinstance(entry.get("year"), int) else None}
            for entry in similar[:PER_TITLE]
            if isinstance(entry, dict) and entry.get("title")
        ]
    return clean


def suggest_batch(client: OpenAI, batch: list[dict[str, Any]]) -> list[dict[str, Any]]:
    listing = "\n".join(describe(i, row) for i, row in enumerate(batch, start=1))
    last_error: Exception | None = None
    for _ in range(MAX_ATTEMPTS):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                temperature=0.2,
                max_tokens=3_000,
                response_format={"type": "json_object"},
                messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": listing}],
                # Sin razonamiento, como en score.py: no hace falta y se come `max_tokens`.
                extra_body={"thinking": {"type": "disabled"}},
            )
            by_index = parse(response.choices[0].message.content or "", len(batch))
        except (SuggestionError, OpenAIError) as error:
            last_error = error
            continue
        return [
            {"key": content_key(row["type"], row["tmdb_id"]), "version": VERSION, "similar": by_index[i]}
            for i, row in enumerate(batch, start=1)
        ]
    raise SuggestionError(f"lote fallido tras {MAX_ATTEMPTS} intentos: {last_error}")


def main() -> None:
    corpus = list(read_jsonl(CORPUS_PATH))
    if not corpus:
        raise SystemExit(f"No hay corpus en {CORPUS_PATH}. Ejecuta antes score.py.")
    done = {row["key"] for row in read_jsonl(SUGGESTIONS_PATH) if row.get("version") == VERSION}
    pending = [row for row in corpus if content_key(row["type"], row["tmdb_id"]) not in done]
    # Un tipo por lote: el prompt pide películas para películas y series para series.
    batches = [
        group[i : i + BATCH_SIZE]
        for content_type in ("movie", "tv")
        for group in [[row for row in pending if row["type"] == content_type]]
        for i in range(0, len(group), BATCH_SIZE)
    ]
    print(f"{len(corpus) - len(pending)} en caché (prompt {VERSION}), {len(pending)} por pedir en {len(batches)} lotes")

    client = OpenAI(base_url="https://api.deepseek.com", api_key=require_env("DEEPSEEK_API_KEY"), timeout=180)
    failures = 0
    with ThreadPoolExecutor(WORKERS) as pool:
        futures = [pool.submit(suggest_batch, client, batch) for batch in batches]
        for count, future in enumerate(as_completed(futures), start=1):
            try:
                append_jsonl(SUGGESTIONS_PATH, future.result())
            except SuggestionError as error:
                failures += 1
                print(f"  ✗ {error}", file=sys.stderr)
            if count % 100 == 0:
                print(f"  {count}/{len(batches)} lotes", flush=True)
    if failures:
        raise SystemExit(f"{failures} lotes fallidos. Reejecuta: los ya pedidos no se repiten.")
    print("Hecho.")


if __name__ == "__main__":
    main()
