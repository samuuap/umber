# Fase 9 — Juegos del día

**Estado:** 🔄 En curso: hecho el código; falta aplicar la migración, rellenar los días y probarlo en el navegador
**Depende de:** [Fase 8](fase-8-experto-general.md) (el corpus general)
**Actualizado:** 2026-10-08

## Objetivo

Decisión de producto (2026-10-08): dos juegos diarios para que la gente vuelva
cada día y comparta el resultado, que es difusión gratis. Cero coste: ni
DeepSeek ni embeddings, solo lecturas de la base.

- **El cartel del día** (`/juegos/cartel`): adivinar la película por su
  cartel, que empieza muy desenfocado y se ve un poco más con cada intento. Seis
  intentos; se puede pasar
- **El título del día** (`/juegos/titulo`): el título en español (el de su
  estreno en España) o en inglés, a elegir antes de empezar. Se eligen **cuatro
  letras** y se destapan donde salen; después se escribe el título entero. Cada
  fallo, o pedir pista, destapa la siguiente: **año → director → sinopsis →
  cartel** (desenfocado, pero fácil de reconocer). Cinco intentos
- Películas **muy, muy conocidas**: 10.000 votos o más en TMDB

## Hecho

- [x] **Esquema** (migración `20261008120000_daily_games`): una fila por juego
      y día con la película, su número («#12»), el título de España y el inglés y
      un cartel sin texto. Son las soluciones, también las de mañana: RLS sin
      políticas y sin permisos para `anon` ni `authenticated`, como `rate_limits`.
      Borrar del corpus una película con día asignado falla (`on delete
      restrict`). Validada en PGlite: restricciones, borrado y que `anon` no lee
- [x] **Calendario** (`scripts/seed/games.py`): elige por adelantado las
      películas de los próximos 365 días, solo añade días después del último,
      con las más votadas antes (azar ponderado por votos). Ni la misma saga en
      14 días, ni la misma película en los dos juegos a menos de 120 días
- [x] **Corrección en el servidor** (`src/lib/games.ts`, `src/lib/game-rules.ts`):
      el navegador manda la partida entera en cada petición y el servidor la
      vuelve a corregir; no guarda partidas. La solución solo sale al acabar
- [x] **Cartel desenfocado en el servidor** con `sharp` (15–28 ms por imagen,
      8–16 kB). Las rutas van firmadas con HMAC: sin firma, se podría pedir el
      cartel casi nítido desde el primer intento. La CDN las guarda una semana
- [x] **Endpoints**: `POST /api/games/title`, `POST /api/games/poster`,
      `GET /api/games/poster-image` y `GET /api/games/titles` (el buscador del
      cartel, sobre `explore_content`)
- [x] **Páginas**: `/juegos`, `/juegos/cartel` y `/juegos/titulo`; «Juegos» en la
      cabecera y un apartado con la etiqueta «Nuevo» en la portada
- [x] **Animaciones**: las letras saltan al escribirlas, las destapadas giran una
      detrás de otra, el título tiembla al fallar, las pistas aparecen enfocándose
      y, al acertar, una ola ámbar por las casillas, el marco que se enciende y
      hojas de la marca que salen del título. Todo se apaga con «reducir
      movimiento»
- [x] **Final**: la película (ficha y «Pídele a Umber algo parecido»), compartir
      el resultado sin destripar (`🔤📅✅`, `⬛🟨🟧`), jugadas, porcentaje, racha y
      cuánto falta para el siguiente
- [x] `npm run db:verify` comprueba que existe `daily_games` y que `anon` no la lee
- [x] Typecheck y build sin errores

## Pendiente

- [x] **Migración aplicada** (comprobado el 2026-10-11: ya estaba en remoto).
      `npm run db:types` da para `daily_games` lo mismo que se escribió a mano
      (solo añadió `people_search` en `content` y reordenó `conversations`);
      `npm run db:verify`, 59/59; `npm run typecheck`, 0 errores. Con la
      publishable key, `daily_games` responde 401 (`permission denied`)
- [x] **Días rellenados**: 365 de cartel (2026-10-08 → 2027-10-07) y 169 de
      título (2026-10-08 → 2027-03-25)
- [x] **Probado en el navegador** (2026-10-11, Edge sin interfaz con patchright):
      el título en español a 390 px (fallo con pista, recarga a mitad de partida y
      acierto) y en inglés a 1280 px (perdido con las cuatro pistas); el cartel a
      1280 px con movimiento reducido (pasar, fallo, elegir con flechas e Intro,
      acierto) y perdido pasando hasta el final. Sin errores de consola ni de red.
      Sobre el build, con la CSP real de cabecera: ninguna violación. `astro
      preview` no funciona con el adaptador de Vercel: se sirvió
      `.vercel/output` con un servidor de Node de usar y tirar. Arreglado: «100 %»
      de las estadísticas se partía en dos líneas a 390 px
- [ ] **Antes del 25 de marzo de 2027**: el título se queda sin películas de
      10.000 votos que valgan (169). `games.py --min-votes 8000` añade más. El
      cartel llega hasta el 31 de octubre de 2027
- [ ] Una tarea programada (GitHub Actions, la misma que mantenga despierto
      Supabase) que ejecute `games.py` cada mes
- [ ] Más adelante: la racha en la cuenta, para quien tenga sesión (hoy, en el
      navegador); un archivo de días anteriores (el servidor ya acepta días
      pasados)

## Decisiones tomadas

| Decisión | Motivo |
|---|---|
| El título no es un Wordle tal cual: cuatro letras y luego pistas (2026-10-08) | Decisión de producto, tras ver la propuesta de Wordle. Con títulos de 15 letras, un Wordle era un ahorcado lento |
| Solo películas con 10.000 votos o más (2026-10-08) | Decisión de producto: «muy muy muy conocidas». Son unas 390; con un cartel sin título o cuatro letras, una menos conocida no la saca nadie |
| El título se escribe entero en las casillas; las destapadas quedan fijas | Es lo que da sentido a las letras elegidas. Elegirlo de una lista con autocompletado, con títulos tan conocidos, sería demasiado fácil |
| ~~Las cuatro letras, libres y distintas~~ **Cuatro letras distintas, dos vocales como mucho** (2026-10-11, `TITLE_MAX_VOWELS`) | Decisión de producto: con cuatro vocales el título salía casi solo, muy guiado. Lo valida el servidor (400) y el teclado avisa al elegir la tercera. Una partida guardada de antes con más vocales se empieza de nuevo. Para que no destapen el título entero, solo entran títulos con seis letras distintas o más |
| El título de España sale de las traducciones de TMDB, no de `content.title` | El corpus tiene 1.249 títulos con el latinoamericano cuando TMDB deja vacío el de España (*Joker* → «Guasón», *Pulp Fiction* → «Tiempos violentos»). Ver la Fase 8 |
| Carteles sin texto (`/movie/<id>/images`, idioma nulo) | Con el texto, el título se leería al desenfocarlo menos. Las 389 películas tienen uno |
| El desenfoque, en el servidor y firmado | Con `filter: blur()` en el navegador bastaría abrir la imagen. Con la firma, cada nivel solo se consigue gastando los intentos de antes |
| El servidor no guarda partidas: el navegador manda todos los intentos cada vez | Nada que sincronizar ni que limpiar. Forzarlo (mandar intentos falsos) es lo mismo que perder: enseña las pistas y la solución |
| Partidas y racha en `localStorage` | No hace falta cuenta para jugar y no dicen nada de nadie. La regla de no usar `localStorage` es para el historial del chat |
| El idioma del título se recuerda en una cookie de preferencia | Así el servidor pinta el tablero de ese idioma sin esperar a JavaScript. Es técnica (la pide la persona): sin banner |
| Sin rate limit en los juegos, como `/explorar` | No llaman a ningún modelo ni gastan cupo de nadie. Lo que lee el servidor se queda en memoria todo el día y las imágenes, en la CDN |
| El día cambia a medianoche de Madrid | El público es de España. El servidor acepta días anteriores, para quien empezó antes de medianoche |
| Desplegar construyendo en Vercel, no con `--prebuilt` desde el Mac | `sharp` lleva binarios nativos: el build de macOS empaqueta los de macOS |

## Preguntas abiertas

Ninguna.
