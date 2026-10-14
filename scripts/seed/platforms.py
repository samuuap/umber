"""
Rellena `platforms_cache` con las plataformas de todo el corpus, para que el
chat pueda buscar solo en las que tiene la persona («Mis plataformas»).

    python scripts/seed/platforms.py                  # lo que falta o tiene más de 20 h
    python scripts/seed/platforms.py --max-age-hours 0  # todo otra vez

La app solo pide a TMDB las plataformas de lo que va a enseñar, y las guarda
tres días: así, la mayoría del corpus no tenía ninguna fila y no se podía
filtrar por ellas al buscar. Este script pide las que faltan o han envejecido y
lo repite cada noche un workflow (`.github/workflows/platforms.yml`): el
catálogo de las plataformas cambia sobre todo a fin de mes.

Son unas 16.000 llamadas a `/{tipo}/{id}/watch/providers`, unos minutos. Basta
con `.env.local` (o las variables del workflow) y `requests`.

La normalización de los nombres tiene que coincidir con `streamingNames()` en
`src/lib/tmdb.ts`, que también escribe la caché: si divergen, el filtro por
plataforma deja fuera títulos sin dar ningún error.
"""

from __future__ import annotations

import argparse
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any

from common import http_session, require_env

API = "https://api.themoviedb.org/3"
REST = f"{require_env('SUPABASE_URL')}/rest/v1"
PAGE = 1000
BATCH = 500
# TMDB admite unas 50 peticiones por segundo por IP.
WORKERS = 12

# Como `RESELLER_SUFFIX` en `src/lib/tmdb.ts`.
RESELLER_SUFFIX = re.compile(r"\s+(?:Amazon|Apple TV|Roku|Verizon|Plex)\s+Channel$")

tmdb = http_session(WORKERS)
tmdb.headers["Authorization"] = f"Bearer {require_env('TMDB_READ_ACCESS_TOKEN')}"
supabase = http_session()
secret = require_env("SUPABASE_SECRET_KEY")
supabase.headers.update({"apikey": secret, "Authorization": f"Bearer {secret}", "Content-Type": "application/json"})


def streaming_names(providers: dict[str, Any]) -> list[str]:
    """Igual que `streamingNames()` en TypeScript: suscripción y gratis, sin revendedores ni variantes."""
    priority: dict[str, int] = {}
    for provider in (providers.get("flatrate") or []) + (providers.get("free") or []):
        name = RESELLER_SUFFIX.sub("", provider["provider_name"]).strip()
        if name and (name not in priority or provider["display_priority"] < priority[name]):
            priority[name] = provider["display_priority"]
    names = [name for name, _ in sorted(priority.items(), key=lambda item: item[1])]
    return [name for name in names if not any(other != name and name.startswith(f"{other} ") for other in names)]


def by_region(results: dict[str, Any]) -> dict[str, list[str]]:
    """Como `getStreamingNamesByRegion()`: las regiones sin ninguna no aparecen."""
    regions = {region: streaming_names(providers) for region, providers in results.items()}
    return {region: names for region, names in regions.items() if names}


def read_all(path: str, select: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    while True:
        response = supabase.get(
            f"{REST}/{path}", params={"select": select, "order": "id" if path == "content" else "content_id",
                                      "limit": PAGE, "offset": len(rows)}, timeout=60,
        )
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if len(page) < PAGE:
            return rows


def fetch(row: dict[str, Any]) -> tuple[str, dict[str, list[str]] | None]:
    response = tmdb.get(f"{API}/{row['type']}/{row['tmdb_id']}/watch/providers", timeout=30)
    # Un título que TMDB ya no tiene no se guarda: la app lo trata como «no se sabe».
    if response.status_code == 404:
        return row["id"], None
    response.raise_for_status()
    return row["id"], by_region(response.json().get("results") or {})


def save(rows: list[dict[str, Any]]) -> None:
    response = supabase.post(
        f"{REST}/platforms_cache",
        params={"on_conflict": "content_id"},
        json=rows,
        headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        timeout=60,
    )
    response.raise_for_status()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max-age-hours", type=float, default=20,
                        help="vuelve a pedir lo que tenga más de estas horas (por defecto 20: cada noche)")
    args = parser.parse_args()

    content = read_all("content", "id,tmdb_id,type")
    fresh_since = datetime.now(timezone.utc) - timedelta(hours=args.max_age_hours)
    fresh = {
        row["content_id"]
        for row in read_all("platforms_cache", "content_id,fetched_at")
        if datetime.fromisoformat(row["fetched_at"]) >= fresh_since
    }
    pending = [row for row in content if row["id"] not in fresh]
    print(f"{len(content)} títulos; {len(pending)} por pedir a TMDB")

    started = time.monotonic()
    done = missing = 0
    batch: list[dict[str, Any]] = []
    with ThreadPoolExecutor(WORKERS) as pool:
        for content_id, regions in pool.map(fetch, pending):
            if regions is None:
                missing += 1
                continue
            batch.append({"content_id": content_id, "by_region": regions,
                          "fetched_at": datetime.now(timezone.utc).isoformat()})
            if len(batch) == BATCH:
                save(batch)
                done += len(batch)
                batch = []
                print(f"  {done}/{len(pending)} ({time.monotonic() - started:.0f} s)")
    if batch:
        save(batch)
        done += len(batch)
    print(f"Guardados {done}; {missing} que TMDB ya no tiene; {time.monotonic() - started:.0f} s")


if __name__ == "__main__":
    main()
