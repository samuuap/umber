"""
¿Ordena bien «Más otoñales»? Una lista de referencia contra el orden real.

    python eval-autumn.py            # dónde caen en /explorar?sort=autumn (la base cargada)
    python eval-autumn.py --pilot    # sus notas con el prompt actual de score.py, sin cargar nada

La referencia es una lista de películas otoñales del usuario (2026-10-12): lo que
apetece ver una tarde de otoño. Parte de ella va de ejemplo en el prompt de
`score.py` (`in_prompt`); el resto mide si el criterio generaliza, y es la cifra
que importa. Los controles (Navidad, terror, especiales de Halloween infantiles)
tienen que quedar lejos.

Sin argumentos lee el orden de `explore_content` página a página, con la
publishable key, como la web: mide la nota y la fórmula de fama juntas.
`--pilot` puntúa solo estas películas con deepseek-flash (unos céntimos), para
probar un cambio de prompt antes de puntuar el universo entero. Los géneros van
en español, los de la base, y no en inglés como en `score.py`: es una
aproximación.
"""

from __future__ import annotations

import argparse
import json
import random
from statistics import mean, median
from typing import Any

from openai import OpenAI

from common import http_session, require_env
from score import BATCH_SIZE, MODEL, PASSES, SYSTEM_PROMPT, TEMPERATURE, autumn_factor, describe, parse_scores

# (título en inglés tal como está en `content.title_en`, año, va de ejemplo en el prompt)
REFERENCE: list[tuple[str, int, bool]] = [
    ("When Harry Met Sally...", 1989, True),
    ("You've Got Mail", 1998, True),
    ("The Lake House", 2006, False),
    ("About Time", 2013, True),
    ("Brooklyn", 2015, False),
    ("Sideways", 2004, False),
    ("The Shop Around the Corner", 1940, False),
    ("Mean Girls", 2004, False),
    ("Sleepless in Seattle", 1993, False),
    ("Dead Poets Society", 1989, True),
    ("Good Will Hunting", 1997, True),
    ("The Perks of Being a Wallflower", 2012, True),
    ("Mona Lisa Smile", 2003, False),
    ("October Sky", 1999, False),
    ("The Cider House Rules", 1999, False),
    ("Moonrise Kingdom", 2012, False),
    ("Little Miss Sunshine", 2006, False),
    ("Rushmore", 1998, False),
    ("The Breakfast Club", 1985, False),
    ("Fantastic Mr. Fox", 2009, True),
    ("Coraline", 2009, True),
    ("Harry Potter and the Philosopher's Stone", 2001, True),
    ("Kiki's Delivery Service", 1989, True),
    ("Spirited Away", 2001, False),
    ("Edward Scissorhands", 1990, False),
    ("The Iron Giant", 1999, False),
    ("My Neighbor Totoro", 1988, True),
    ("Ponyo", 2008, False),
    ("Matilda", 1996, False),
    ("Babe", 1995, False),
    ("Practical Magic", 1998, True),
    ("Fried Green Tomatoes", 1991, False),
    ("On Golden Pond", 1981, False),
    ("Julie & Julia", 2009, True),
    ("Life Is Beautiful", 1997, False),
    ("A Good Year", 2006, False),
    ("The Muppets", 2011, False),
    ("Paddington", 2014, False),
    ("Midnight in Paris", 2011, True),
    ("Le Chef", 2012, False),
    ("Chef", 2014, False),
    ("Café Society", 2016, False),
    ("The Notebook", 2004, False),
    ("Hugo", 2011, False),
    ("Little White Lies", 2010, False),
    ("Under the Tuscan Sun", 2003, False),
    ("The Bookshop", 2017, False),
    ("Groundhog Day", 1993, False),
]

# Lo que no debe salir arriba: Navidad (es Navidad, no otoño), terror y especiales de Halloween infantiles.
CONTROLS: list[tuple[str, int, str]] = [
    ("Love Actually", 2003, "Navidad"),
    ("Klaus", 2019, "Navidad"),
    ("Home Alone", 1990, "Navidad"),
    ("Elf", 2003, "Navidad"),
    ("The Holiday", 2006, "Navidad"),
    ("Halloween", 1978, "terror"),
    ("Thanksgiving", 2023, "terror"),
    ("The Conjuring", 2013, "terror"),
    ("Trick or Treat Scooby-Doo!", 2022, "Halloween infantil"),
    ("Muppets Haunted Mansion", 2021, "Halloween infantil"),
    ("Mutant Pumpkins from Outer Space", 2009, "Halloween infantil"),
]

PAGE = 60  # el máximo de `explore_content`
COLUMNS = "id,type,title,title_en,year,genres,keywords,synopsis,synopsis_en,autumn_score,vote_count"


def rest() -> tuple[str, Any]:
    publishable = require_env("SUPABASE_PUBLISHABLE_KEY")
    session = http_session()
    session.headers.update({"apikey": publishable, "Authorization": f"Bearer {publishable}", "Content-Type": "application/json"})
    return f"{require_env('SUPABASE_URL')}/rest/v1", session


def find_titles(base: str, session: Any, titles: list[tuple[str, int]]) -> dict[tuple[str, int], dict[str, Any]]:
    """Cada título por su nombre en inglés y su año, entre las películas."""
    found: dict[tuple[str, int], dict[str, Any]] = {}
    for title_en, year in titles:
        response = session.get(
            f"{base}/content",
            params={"select": COLUMNS, "type": "eq.movie", "title_en": f"eq.{title_en}", "year": f"eq.{year}"},
            timeout=30,
        )
        response.raise_for_status()
        rows = response.json()
        if rows:
            found[(title_en, year)] = rows[0]
        else:
            print(f"  ⚠ no está en el corpus: {title_en} ({year})")
    return found


def explore_ranks(base: str, session: Any, wanted: set[str]) -> dict[str, int]:
    """Puesto de cada id en «Más otoñales» (películas y series, como la web por defecto)."""
    ranks: dict[str, int] = {}
    offset = 0
    while wanted - ranks.keys():
        response = session.post(
            f"{base}/rpc/explore_content",
            data=json.dumps({"p_sort": "autumn", "p_limit": PAGE, "p_offset": offset}),
            timeout=30,
        )
        response.raise_for_status()
        page = response.json()
        if not page:
            break
        for position, row in enumerate(page, start=offset + 1):
            if row["id"] in wanted:
                ranks[row["id"]] = position
        offset += PAGE
    return ranks


def summary(label: str, ranks: list[int]) -> None:
    if not ranks:
        return
    within = " · ".join(f"{sum(rank <= cut for rank in ranks)} entre las {cut}" for cut in (36, 100, 200))
    print(f"  {label} ({len(ranks)}): {within} · mediana {median(ranks):.0f}")


def evaluate_order() -> None:
    base, session = rest()
    references = find_titles(base, session, [(title, year) for title, year, _ in REFERENCE])
    controls = find_titles(base, session, [(title, year) for title, year, _ in CONTROLS])
    ids = {row["id"] for row in [*references.values(), *controls.values()]}
    print(f"Recorriendo «Más otoñales» hasta encontrar {len(ids)} títulos…")
    ranks = explore_ranks(base, session, ids)

    print("\nReferencia (puesto · otoño · votos)")
    for title, year, in_prompt in sorted(REFERENCE, key=lambda item: ranks.get(references.get(item[:2], {}).get("id", ""), 10**9)):
        row = references.get((title, year))
        if row is None:
            continue
        mark = "  (en el prompt)" if in_prompt else ""
        print(f"  {ranks.get(row['id'], '—'):>6}  {row['autumn_score']:.2f}  {row['vote_count']:>6}  {row['title']} ({year}){mark}")
    print("\nControles: tienen que quedar lejos")
    for title, year, kind in CONTROLS:
        row = controls.get((title, year))
        if row is not None:
            print(f"  {ranks.get(row['id'], '—'):>6}  {row['autumn_score']:.2f}  {row['title']} ({year}) · {kind}")

    print("\nResumen")
    held_out = [ranks[references[(t, y)]["id"]] for t, y, p in REFERENCE if not p and (t, y) in references]
    in_prompt = [ranks[references[(t, y)]["id"]] for t, y, p in REFERENCE if p and (t, y) in references]
    summary("fuera del prompt, la que cuenta", held_out)
    summary("en el prompt", in_prompt)
    control_ranks = [ranks[row["id"]] for row in controls.values() if row["id"] in ranks]
    if control_ranks:
        print(f"  controles: el mejor, en el puesto {min(control_ranks)}")


def pilot() -> None:
    """Las notas de estas películas con el prompt actual, en `PASSES` pasadas barajadas, como `score.py`."""
    base, session = rest()
    references = find_titles(base, session, [(title, year) for title, year, _ in REFERENCE])
    controls = find_titles(base, session, [(title, year) for title, year, _ in CONTROLS])
    rows = [*references.values(), *controls.values()]
    # `describe` espera los géneros en inglés de `universe.jsonl`; aquí van los de la base.
    for row in rows:
        row["genres_en"] = row["genres"] or []
        row["keywords"] = row["keywords"] or []

    client = OpenAI(base_url="https://api.deepseek.com", api_key=require_env("DEEPSEEK_API_KEY"), max_retries=5, timeout=120)
    scores: dict[str, list[int]] = {row["id"]: [] for row in rows}
    for pass_number in range(1, PASSES + 1):
        shuffled = rows[:]
        random.Random(pass_number).shuffle(shuffled)
        for start in range(0, len(shuffled), BATCH_SIZE):
            batch = shuffled[start : start + BATCH_SIZE]
            response = client.chat.completions.create(
                model=MODEL,
                temperature=TEMPERATURE,
                max_tokens=1_000,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": "\n\n".join(describe(i, row) for i, row in enumerate(batch, start=1))},
                ],
                extra_body={"thinking": {"type": "disabled"}},
            )
            for row, score in zip(batch, parse_scores(response.choices[0].message.content or "", len(batch))):
                scores[row["id"]].append(score)
        print(f"  pasada {pass_number} de {PASSES}")

    def line(row: dict[str, Any], note: str) -> str:
        new = round(mean(scores[row["id"]]) / 100 * autumn_factor(row), 3)
        return f"  {row['autumn_score']:.2f} → {new:.2f}  {row['title']} ({row['year']}){note}"

    print("\nReferencia: otoño en la base → con este prompt (y las reglas de autumn_factor)")
    for title, year, in_prompt in REFERENCE:
        if (title, year) in references:
            print(line(references[(title, year)], "  (en el prompt)" if in_prompt else ""))
    print("\nControles")
    for title, year, kind in CONTROLS:
        if (title, year) in controls:
            print(line(controls[(title, year)], f" · {kind}"))
    held_out = [mean(scores[references[(t, y)]["id"]]) for t, y, p in REFERENCE if not p and (t, y) in references]
    print(f"\nMedia fuera del prompt: {mean(held_out):.0f}/100 · controles: {mean(mean(scores[r['id']]) for r in controls.values()):.0f}/100")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pilot", action="store_true", help="puntuar la lista con el prompt actual, sin tocar la base")
    args = parser.parse_args()
    pilot() if args.pilot else evaluate_order()


if __name__ == "__main__":
    main()
