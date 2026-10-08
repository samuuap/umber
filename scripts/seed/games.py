"""
Rellena `daily_games`: la película de cada día de «El cartel del día» y de «El
título del día», por adelantado.

    python scripts/seed/games.py                    # hasta tener los próximos 365 días
    python scripts/seed/games.py --days 30
    python scripts/seed/games.py --min-votes 8000   # cuando se acaben las de 10.000
    python scripts/seed/games.py --dry-run          # enseña lo que añadiría, sin escribir

Solo añade días después del último que ya tiene película: los de antes no se
tocan, porque alguien puede haberlos jugado y el número que se comparte («El
título del día #12») tiene que seguir siendo el mismo. Si se pasa un año sin
ejecutarlo, los juegos se quedan sin partida: la página lo dice y no falla.

Qué entra (decisión de producto, 2026-10-08: «muy muy muy conocidas»):

- Películas con **10.000 votos o más** en TMDB, unas 390: las que conoce todo el
  mundo (las menos votadas de la lista son *Shrek tercero* o *Cazafantasmas*)
- Con un **cartel sin texto** en TMDB (`/movie/<id>/images`, idioma nulo): el
  del juego del cartel y la última pista del título. Con texto, el título se
  leería en él. La respuesta de TMDB se cachea en `data/textless-posters.jsonl`
- **Título**: además, que el de España y el inglés se puedan jugar: letras y
  poca puntuación, sin cifras ni subtítulos, palabras que quepan en el móvil y
  al menos seis letras distintas, para que las cuatro elegidas no lo destapen
  entero
- Una película sale una vez en cada juego; en los dos, con 120 días como poco
  entre uno y otro. Ni dos de la misma saga seguidas ni el mismo día

El título de España sale de las traducciones de TMDB (`data/details-movie.jsonl`)
y no de `content.title`: cuando TMDB deja vacío el de España porque allí se
estrenó con el original (*Joker*, *Pulp Fiction*), el corpus coge el de México
(«Guasón», «Tiempos violentos»). Aquí, vacío en España es el título original.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from common import CORPUS_PATH, DATA_DIR, append_jsonl, http_session, read_jsonl, require_env

DETAILS_PATH = DATA_DIR / "details-movie.jsonl"
TEXTLESS_PATH = DATA_DIR / "textless-posters.jsonl"

# Como `GAME_TIME_ZONE` en `src/lib/games.ts`: el juego cambia a medianoche de Madrid.
TIME_ZONE = ZoneInfo("Europe/Madrid")
# En este orden: el título tiene menos películas que valen, y elige primero.
GAMES = ("title", "poster")

# Lo que conoce todo el mundo: un cartel sin título o cuatro letras solo bastan
# si la película se ha visto mucho. Con menos se puede bajar a 8.000 (unas 560).
MIN_VOTES = 10_000
# Una película en los dos juegos, pero no cerca: quien la acaba de ver en uno la sabría en el otro.
CROSS_GAME_GAP_DAYS = 120
# Ni dos de la misma saga en dos semanas en un mismo juego.
SAGA_GAP_DAYS = 14

# Lo que cabe en el móvil a 390 px: palabras de 11 casillas como mucho.
TITLE_MIN_DISTINCT_LETTERS = 6
TITLE_MAX_LETTERS = 20
TITLE_MAX_WORDS = 5
TITLE_MAX_WORD_CELLS = 11
# La puntuación que se dibuja fija en el tablero. Los dos puntos no: casi siempre
# separan un subtítulo, y el título se hace largo.
TITLE_MARKS = set("-'’.,!¡?¿·&")

API = "https://api.themoviedb.org/3"
REST = f"{require_env('SUPABASE_URL')}/rest/v1"
PAGE_SIZE = 1_000

tmdb = http_session()
tmdb.headers["Authorization"] = f"Bearer {require_env('TMDB_READ_ACCESS_TOKEN')}"
supabase = http_session()
secret = require_env("SUPABASE_SECRET_KEY")
supabase.headers.update({"apikey": secret, "Authorization": f"Bearer {secret}", "Content-Type": "application/json"})


def request(method: str, path: str, **kwargs: Any) -> Any:
    response = supabase.request(method, f"{REST}{path}", timeout=60, **kwargs)
    if not response.ok:
        raise SystemExit(f"{method} {path} → {response.status_code}: {response.text[:500]}")
    return response


# ─── Títulos ─────────────────────────────────────────────────────────────────


def fold_letter(char: str) -> str | None:
    """Igual que `foldLetter` en `src/lib/game-rules.ts`: la letra como se juega."""
    upper = char.upper()
    if upper == "Ñ":
        return "Ñ"
    base = "".join(c for c in unicodedata.normalize("NFD", upper) if not unicodedata.combining(c))
    return base if re.fullmatch(r"[A-Z]", base) else None


def is_latin(text: str) -> bool:
    return all(not c.isalpha() or "LATIN" in unicodedata.name(c, "") for c in text)


def spain_title(detail: dict[str, Any]) -> str | None:
    """El título con el que se estrenó en España, o `None` si no se sabe."""
    spain = [t for t in detail["translations"] if t["lang"] == "es" and t["region"] == "ES"]
    original = detail.get("original_title") or ""
    if spain and spain[0]["title"]:
        return spain[0]["title"]
    # Vacío en España: se estrenó con el original. Solo se da por bueno si es
    # inglés o español; de otro idioma, vacío es más bien que falta el dato.
    if detail.get("original_language") in ("en", "es") and is_latin(original):
        return original or None
    return None


def clean_title(title: str) -> str:
    """Sin el paréntesis del final: «Del revés (Inside Out)» se estrenó como «Del revés»."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", unicodedata.normalize("NFC", title)).strip()


# Secuelas con número romano: «SAWII» no es un título que se adivine letra a letra.
ROMAN_NUMERAL = re.compile(r"^(?:II|III|IV|VI|VII|VIII|IX|XI|XII)$")


def playable(title: str) -> bool:
    if any(c.isdigit() for c in title) or any(ROMAN_NUMERAL.match(word) for word in title.split()):
        return False
    if any(fold_letter(c) is None and not c.isspace() and c not in TITLE_MARKS for c in title):
        return False
    words = title.split()
    letters = [fold_letter(c) for c in title if fold_letter(c) is not None]
    return (
        len(set(letters)) >= TITLE_MIN_DISTINCT_LETTERS
        and len(letters) <= TITLE_MAX_LETTERS
        and len(words) <= TITLE_MAX_WORDS
        and all(len(word) <= TITLE_MAX_WORD_CELLS for word in words)
    )


# ─── Carteles sin texto ──────────────────────────────────────────────────────


def textless_poster(tmdb_id: int, cache: dict[int, str | None]) -> str | None:
    """El cartel sin texto más votado en TMDB, con forma de cartel. Cacheado."""
    if tmdb_id in cache:
        return cache[tmdb_id]
    response = tmdb.get(f"{API}/movie/{tmdb_id}/images", params={"include_image_language": "null"}, timeout=30)
    response.raise_for_status()
    posters = [
        p
        for p in response.json().get("posters", [])
        if p.get("iso_639_1") is None and 0.62 <= (p.get("aspect_ratio") or 0) <= 0.72 and (p.get("width") or 0) >= 500
    ]
    posters.sort(key=lambda p: (p.get("vote_count") or 0, p.get("vote_average") or 0, p.get("width") or 0), reverse=True)
    path = posters[0]["file_path"] if posters else None
    cache[tmdb_id] = path
    append_jsonl(TEXTLESS_PATH, [{"tmdb_id": tmdb_id, "poster_path": path}])
    return path


# ─── Base ────────────────────────────────────────────────────────────────────


def select_all(path: str, select: str, **filters: str) -> list[dict[str, Any]]:
    """Todas las filas, de mil en mil: PostgREST no devuelve más de una vez."""
    rows: list[dict[str, Any]] = []
    while True:
        params = {"select": select, "order": "content_id", "limit": PAGE_SIZE, "offset": len(rows)} | filters
        page = request("GET", path, params=params).json()
        rows += page
        if len(page) < PAGE_SIZE:
            return rows


def movie_ids() -> dict[int, str]:
    """`{tmdb_id: content.id}` de las películas cargadas."""
    ids: dict[int, str] = {}
    offset = 0
    while True:
        page = request(
            "GET",
            "/content",
            params={"select": "id,tmdb_id", "type": "eq.movie", "order": "id", "limit": PAGE_SIZE, "offset": offset},
        ).json()
        ids |= {row["tmdb_id"]: row["id"] for row in page}
        if len(page) < PAGE_SIZE:
            return ids
        offset += PAGE_SIZE


Candidate = tuple[dict[str, Any], str, tuple[str, str]]


def pick(
    candidates: list[Candidate],
    day: date,
    saga_nearby: set[int],
    other_game_days: dict[str, list[date]],
    textless: dict[int, str | None],
) -> tuple[Candidate, str] | None:
    """El primero que vale para ese día, y lo saca de la lista. `None` si no queda ninguno."""
    index = 0
    while index < len(candidates):
        candidate = candidates[index]
        row, content_id, _ = candidate
        saga = row.get("collection_id")
        near_other = any(abs((day - other).days) < CROSS_GAME_GAP_DAYS for other in other_game_days.get(content_id, []))
        if (saga is not None and saga in saga_nearby) or near_other:
            index += 1
            continue
        poster = textless_poster(row["tmdb_id"], textless)
        del candidates[index]
        # Sin cartel sin texto no vale nunca: fuera de la lista también.
        if poster is None:
            continue
        return candidate, poster
    return None


# ─── Calendario ──────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--days", type=int, default=365, help="días por delante que tiene que haber (365)")
    parser.add_argument("--min-votes", type=int, default=MIN_VOTES, help=f"votos mínimos en TMDB ({MIN_VOTES})")
    parser.add_argument("--dry-run", action="store_true", help="enseña lo que añadiría, sin escribir")
    args = parser.parse_args()

    details = {d["id"]: d for d in read_jsonl(DETAILS_PATH)}
    corpus = [r for r in read_jsonl(CORPUS_PATH) if r["type"] == "movie"]
    if not corpus or not details:
        raise SystemExit("Faltan data/corpus.jsonl o data/details-movie.jsonl: ejecuta antes fetch-tmdb.py y score.py.")
    ids = movie_ids()
    existing = select_all("/daily_games", "game,day,number,content_id")
    # Los días de cada película en cada juego.
    days_in: dict[str, dict[str, list[date]]] = {game: {} for game in GAMES}
    for row in existing:
        days_in[row["game"]].setdefault(row["content_id"], []).append(date.fromisoformat(row["day"]))
    textless = {row["tmdb_id"]: row["poster_path"] for row in read_jsonl(TEXTLESS_PATH)}
    saga_of = {ids[r["tmdb_id"]]: r.get("collection_id") for r in corpus if r["tmdb_id"] in ids}
    # La saga de lo elegido cada día en cada juego: ni dos seguidas ni la misma el mismo día.
    saga_on: dict[tuple[str, date], int | None] = {
        (row["game"], date.fromisoformat(row["day"])): saga_of.get(row["content_id"]) for row in existing
    }

    today = datetime.now(TIME_ZONE).date()
    until = today + timedelta(days=args.days - 1)
    new_rows: list[dict[str, Any]] = []
    for game in GAMES:
        other_game = "title" if game == "poster" else "poster"
        rows = [row for row in existing if row["game"] == game]
        last_day = max((date.fromisoformat(row["day"]) for row in rows), default=None)
        number = max((row["number"] for row in rows), default=0)
        start = max(today, last_day + timedelta(days=1)) if last_day else today
        if start > until:
            print(f"{game}: ya hay partida hasta el {last_day}")
            continue

        candidates: list[Candidate] = []
        for row in corpus:
            content_id = ids.get(row["tmdb_id"])
            detail = details.get(row["tmdb_id"])
            if (
                content_id is None
                or detail is None
                or content_id in days_in[game]
                or (row.get("vote_count") or 0) < args.min_votes
            ):
                continue
            title_es = spain_title(detail)
            if title_es is None or not row.get("title_en"):
                continue
            titles = (clean_title(title_es), clean_title(row["title_en"]))
            if game == "title" and not all(playable(t) for t in titles):
                continue
            candidates.append((row, content_id, titles))
        # Al azar, pero las más votadas antes (Efraimidis-Spirakis: azar elevado a
        # 1/votos). El orden depende del juego y del primer día: reejecutar da lo mismo.
        rng = random.Random(f"{game}:{start.isoformat()}")
        candidates.sort(key=lambda c: rng.random() ** (1 / max(c[0].get("vote_count") or 1, 1)), reverse=True)
        print(f"{game}: {len(candidates)} películas posibles para los días del {start} al {until}")

        day = start
        while day <= until:
            nearby = {saga_on.get((game, day - timedelta(days=back))) for back in range(1, SAGA_GAP_DAYS + 1)}
            nearby.add(saga_on.get((other_game, day)))
            picked = pick(
                candidates, day, {saga for saga in nearby if saga is not None}, days_in[other_game], textless
            )
            if picked is None:
                print(f"  ⚠ {game}: se acaban las películas el {day - timedelta(days=1)}")
                break
            (row, content_id, (title_es, title_en)), poster = picked
            number += 1
            days_in[game].setdefault(content_id, []).append(day)
            saga_on[(game, day)] = row.get("collection_id")
            new_rows.append(
                {
                    "game": game,
                    "day": day.isoformat(),
                    "number": number,
                    "content_id": content_id,
                    "title_es": title_es,
                    "title_en": title_en,
                    "poster_path": poster,
                }
            )
            day += timedelta(days=1)

    for game in GAMES:
        rows = [row for row in new_rows if row["game"] == game]
        print(f"\n{game}: {len(rows)} días nuevos")
        for row in rows[:10]:
            print(f"  #{row['number']:<4} {row['day']}  {row['title_es']}  /  {row['title_en']}")
    if args.dry_run or not new_rows:
        return
    for start_index in range(0, len(new_rows), 500):
        request(
            "POST",
            "/daily_games",
            headers={"Prefer": "return=minimal"},
            data=json.dumps(new_rows[start_index : start_index + 500]),
        )
    print(f"\n{len(new_rows)} días guardados en daily_games")


if __name__ == "__main__":
    main()
