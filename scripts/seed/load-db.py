"""
Carga el corpus vectorizado en la tabla `content` de Supabase, y en
`content_similar` los parecidos de cada título («Más como esta»).

    python load-db.py            # upsert de todo el corpus
    python load-db.py --prune    # y borra de `content` lo que ya no está en el corpus

Usa la secret key, que es la que se salta RLS: `anon` no puede escribir en
`content`. Hace upsert por `(tmdb_id, type)`, así que reejecutar actualiza en vez
de duplicar.

`--prune` borraría en cascada los favoritos que apunten a esos títulos. Por eso
no es el comportamiento por defecto, y si alguien guardó alguno se detiene sin
borrar nada y dice cuáles: hace falta añadir `--drop-favorites`. Tras una carga
grande, reconstruir el índice HNSW (ver `CLAUDE.md`).
"""

from __future__ import annotations

import argparse
import json
from typing import Any

from common import (
    CORPUS_PATH,
    EMBEDDINGS_PATH,
    PLOT_EMBEDDINGS_PATH,
    SUGGESTIONS_PATH,
    content_key,
    document_text,
    http_session,
    plot_text,
    read_jsonl,
    require_env,
    text_hash,
    to_pg_vector,
    unpack_vector,
)
from similar import resolve_suggestions, similar_titles

BATCH_SIZE = 100
SIMILAR_BATCH_SIZE = 1_000  # sin vectores, las filas son pequeñas
PAGE_SIZE = 1_000  # el máximo que devuelve PostgREST en Supabase por defecto

COLUMNS = (
    "tmdb_id", "type", "title", "title_en", "year", "director", "synopsis", "synopsis_en",
    "genres", "keywords", "autumn_score", "poster_path", "backdrop_path", "runtime", "seasons", "status",
    "vote_count", "vote_average", "popularity", "original_language", "collection_id",
)

REST = f"{require_env('SUPABASE_URL')}/rest/v1"
session = http_session()
secret = require_env("SUPABASE_SECRET_KEY")
session.headers.update({"apikey": secret, "Authorization": f"Bearer {secret}", "Content-Type": "application/json"})


def request(method: str, path: str, **kwargs: Any) -> Any:
    response = session.request(method, f"{REST}{path}", timeout=120, **kwargs)
    if not response.ok:
        raise SystemExit(f"{method} {path} → {response.status_code}: {response.text[:500]}")
    return response


def build_rows() -> list[dict[str, Any]]:
    """Filas del corpus con su vector, comprobando que el vector es del texto actual."""
    embeddings = {row["key"]: row for row in read_jsonl(EMBEDDINGS_PATH)}
    rows, stale = [], 0
    for item in read_jsonl(CORPUS_PATH):
        embedding = embeddings.get(content_key(item["type"], item["tmdb_id"]))
        if embedding is None or embedding["hash"] != text_hash(document_text(item)):
            stale += 1
            continue
        rows.append(
            {column: item.get(column) for column in COLUMNS}
            | {"top_cast": item.get("cast") or [], "embedding": to_pg_vector(unpack_vector(embedding["embedding"]))}
        )
    if not rows:
        raise SystemExit(f"No hay corpus en {CORPUS_PATH}. Ejecuta antes score.py y embed.py.")
    if stale:
        raise SystemExit(f"{stale} títulos sin vector o con un vector desfasado. Ejecuta antes embed.py.")
    return rows


def upsert(rows: list[dict[str, Any]]) -> None:
    for start in range(0, len(rows), BATCH_SIZE):
        request(
            "POST",
            "/content",
            params={"on_conflict": "tmdb_id,type"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            data=json.dumps(rows[start : start + BATCH_SIZE]),
        )
        print(f"  {min(start + BATCH_SIZE, len(rows))}/{len(rows)}")


def loaded_ids() -> dict[str, str]:
    """`{clave: id}` de todo lo que hay en `content`."""
    ids: dict[str, str] = {}
    offset = 0
    while True:
        page = request(
            "GET", "/content", params={"select": "id,tmdb_id,type", "order": "id", "limit": PAGE_SIZE, "offset": offset}
        ).json()
        ids |= {content_key(row["type"], row["tmdb_id"]): row["id"] for row in page}
        if len(page) < PAGE_SIZE:
            return ids
        offset += PAGE_SIZE


def similar_rows(ids: dict[str, str]) -> list[dict[str, Any]]:
    """«Más como esta»: los parecidos de cada título, calculados en `similar.py`.

    Con lo que sugiere el cinéfilo (`suggest.py`, si se ha ejecutado), los
    vectores de `plot_text` (lo que cuenta, sin el nombre), las recomendaciones
    de TMDB, géneros, keywords y popularidad. Por fuerza bruta en bloques: con
    16.000 títulos son unos segundos y el resultado es exacto.
    """
    plots = {row["key"]: row for row in read_jsonl(PLOT_EMBEDDINGS_PATH)}
    items = [item for item in read_jsonl(CORPUS_PATH) if content_key(item["type"], item["tmdb_id"]) in ids]
    stale = [
        item for item in items
        if plots.get(content_key(item["type"], item["tmdb_id"]), {}).get("hash") != text_hash(plot_text(item))
    ]
    if stale:
        raise SystemExit(f"{len(stale)} títulos sin vector de parecidos o desfasado. Ejecuta antes embed.py.")

    vectors = {
        content_key(item["type"], item["tmdb_id"]): unpack_vector(plots[content_key(item["type"], item["tmdb_id"])]["embedding"])
        for item in items
    }
    rows: list[dict[str, Any]] = []
    suggested = resolve_suggestions(items, SUGGESTIONS_PATH)
    if not suggested:
        print("  ⚠ Sin sugerencias del cinéfilo (suggest.py): «Más como esta» sale peor")
    for key, similar in similar_titles(items, vectors, suggested=suggested).items():
        rows.extend(
            {"content_id": ids[key], "rank": rank, "similar_id": ids[other], "similarity": score}
            for rank, (other, score) in enumerate(similar, start=1)
        )
    return rows


def upsert_similar(rows: list[dict[str, Any]]) -> None:
    """Por `(content_id, rank)`: recargar sustituye la lista entera de cada título.

    Si una lista nueva es más corta que la de antes, sus últimos puestos se
    quedarían con títulos viejos: se borran antes los que pasan de su largo.
    """
    longest: dict[str, int] = {}
    for row in rows:
        longest[row["content_id"]] = max(longest.get(row["content_id"], 0), row["rank"])
    shorter = sorted({rank for rank in longest.values() if rank < 30})
    for rank in shorter:
        ids = [content_id for content_id, length in longest.items() if length == rank]
        for start in range(0, len(ids), BATCH_SIZE):
            request(
                "DELETE",
                "/content_similar",
                params={"content_id": f"in.({','.join(ids[start : start + BATCH_SIZE])})", "rank": f"gt.{rank}"},
            )
    for start in range(0, len(rows), SIMILAR_BATCH_SIZE):
        request(
            "POST",
            "/content_similar",
            params={"on_conflict": "content_id,rank"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            data=json.dumps(rows[start : start + SIMILAR_BATCH_SIZE]),
        )


def favorited(ids: list[str]) -> dict[str, int]:
    """`{id: favoritos}` de los títulos de `ids` que alguien ha guardado."""
    counts: dict[str, int] = {}
    for start in range(0, len(ids), BATCH_SIZE):
        batch = ",".join(ids[start : start + BATCH_SIZE])
        for row in request("GET", "/users_favorites", params={"select": "content_id", "content_id": f"in.({batch})"}).json():
            counts[row["content_id"]] = counts.get(row["content_id"], 0) + 1
    return counts


def titles_of(ids: list[str]) -> list[str]:
    rows = request("GET", "/content", params={"select": "title,year", "id": f"in.({','.join(ids)})"}).json()
    return [f"{row['title']} ({row['year']})" for row in rows]


def count(**filters: str) -> int:
    response = request("HEAD", "/content", params={"select": "id", **filters}, headers={"Prefer": "count=exact"})
    return int(response.headers["Content-Range"].split("/")[-1])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prune", action="store_true", help="borrar de content lo que ya no está en el corpus")
    parser.add_argument(
        "--drop-favorites",
        action="store_true",
        help="con --prune, borrar aunque haya usuarios que guardaron esos títulos (se pierden sus favoritos)",
    )
    parser.add_argument(
        "--similar-only",
        action="store_true",
        help="cargar solo los parecidos, sin reescribir content (reescribirlo degrada el índice HNSW)",
    )
    args = parser.parse_args()

    rows = build_rows()
    current = {content_key(row["type"], row["tmdb_id"]) for row in rows}
    if args.similar_only:
        ids = loaded_ids()
        similar = similar_rows({key: row_id for key, row_id in ids.items() if key in current})
        print(f"Más como esta: {len(similar)} parecidos de {len(current)} títulos")
        upsert_similar(similar)
        return

    print(f"Cargando {len(rows)} títulos en {REST.removesuffix('/rest/v1')}")
    upsert(rows)

    ids = loaded_ids()
    leftovers = [row_id for key, row_id in ids.items() if key not in current]
    if leftovers and args.prune:
        # Borrar un título borra en cascada los favoritos que lo guardan: sin
        # pedirlo expresamente, no. Las conversaciones que lo recomendaron se
        # quedan sin su ficha, pero no pierden texto.
        saved = favorited(leftovers)
        if saved and not args.drop_favorites:
            affected = titles_of(list(saved)[:10])
            raise SystemExit(
                f"  ✗ {sum(saved.values())} favoritos de usuarios apuntan a {len(saved)} de los títulos que se "
                f"borrarían ({', '.join(affected)}{'…' if len(saved) > 10 else ''}). No se ha borrado nada. "
                "Para borrarlos igualmente: --prune --drop-favorites"
            )
        for start in range(0, len(leftovers), BATCH_SIZE):
            request("DELETE", "/content", params={"id": f"in.({','.join(leftovers[start : start + BATCH_SIZE])})"})
        print(f"  {len(leftovers)} títulos que ya no están en el corpus, borrados")
    elif leftovers:
        print(f"  ⚠ {len(leftovers)} títulos en la tabla ya no están en el corpus. --prune para borrarlos")

    similar = similar_rows({key: row_id for key, row_id in ids.items() if key in current})
    print(f"\nMás como esta: {len(similar)} parecidos de {len(current)} títulos")
    upsert_similar(similar)

    print("\nEn la tabla")
    print(f"  total        {count():>6}")
    for content_type in ("movie", "tv"):
        print(f"  {content_type:<12} {count(type=f'eq.{content_type}'):>6}")
    for column in ("embedding", "director", "synopsis", "synopsis_en", "poster_path"):
        print(f"  sin {column:<12} {count(**{column: 'is.null'}):>2}")


if __name__ == "__main__":
    main()
