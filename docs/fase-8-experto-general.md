# Fase 8 — Umber, experto general en cine

**Estado:** 🔄 En curso: A, B y C hechos; siguiente, D (panel de administración)
**Depende de:** [Fase 6](fase-6-pulido-despliegue.md) (lo que no cambia con esto sigue allí)
**Actualizado:** 2026-10-04

## Objetivo

Decisión de producto (2026-10-04): Umber deja de ser un recomendador de otoño y
pasa a ser un **experto general en películas**. Le describes tu ánimo, tus gustos
y con quién la ves, y te recomienda. El otoño pasa a ser una **especialidad**,
con su propia sección y su estética, y más adelante habrá otras (Navidad).

Además: un **panel de administración** con usuarios, consultas, consumo de
tokens y trazabilidad, y un diseño **de más nivel**, ya sin tema otoñal salvo en
la especialidad.

Sigue en pie la regla de la Fase 6: sin gastos fijos, solo se paga DeepSeek.

---

## Lo que se ha medido antes de proponer nada

**«Más como esta» falla por tres motivos, no por uno.** Muestras de
`content_similar`:

| Título | Bien | Mal |
|---|---|---|
| *Harry Potter y la piedra filosofal* | Las 7 siguientes de la saga | — |
| *La noche de Halloween* (1978) | La saga y *Scream* | — |
| *El indomable Will Hunting* | *X+Y* | *El bosque*, *La invitación* (thriller y terror), *Los crímenes de Oxford* |
| *Coco* | *El libro de la vida* | *La divertida noche de los zombies* (1988), *La familia Addams* |
| *Otoño en Nueva York* | *Señales de amor* | *Those People*, *Demolición*, *Harold y Maude* |

1. **El corpus es solo otoñal**: los vecinos de *Will Hunting* salen de 4.700
   películas elegidas por su otoño, no por parecerse a nada
2. **El vector compara el argumento** («un genio de las matemáticas», «los
   muertos»), no el tono, el género ni el público: un drama trae un thriller y
   una película infantil trae terror
3. **No hay ninguna señal de popularidad**: salen títulos que nadie conoce
   (*Those People*, *Dos extraños amantes*)

**El universo ya está descargado.** `scripts/seed/data/universe.jsonl` tiene
14.996 películas (las de más votos de TMDB, a partir de 194) y 2.000 series, con
sinopsis en los dos idiomas, keywords, director, nota, votos, popularidad e
idioma original, y la puntuación de otoño de todas. Faltan el reparto, las
recomendaciones de TMDB y el cine en español con pocos votos.

**Cuántas «conocidas» hay en TMDB** (películas, por votos):

| Votos | Películas | Para Umber |
|---|---|---|
| ≥ 5.000 | 1.069 | Las que conoce todo el mundo |
| ≥ 1.000 | 5.005 | Conocidas |
| ≥ 500 | 8.134 | Conocidas para quien ve cine |
| ≥ 200 | 14.993 | El corpus propuesto |
| ≥ 100 | 20.001 | Ya entra relleno |

En español, solo 221 películas pasan de 300 votos: el cine español necesita su
propio umbral, o el corpus se queda sin *Volver* ni *Campeones*.

**Espacio en Supabase** (plan gratuito: 500 MB). Hoy la base ocupa 133 MB, y
`content` 108 MB para 5.241 títulos, sobre todo vectores y el índice HNSW. Con
15.500 títulos, estimado: unos 200 MB con `vector(1024)` y unos 120 MB con
`halfvec(1024)`, que guarda cada número en 2 bytes en vez de 4 y apenas cambia la
búsqueda. Hay que medirlo tras un `VACUUM FULL`; la cifra de hoy lleva filas
muertas de las recargas.

---

## Plan

Cinco bloques. El orden importa: el diseño y la portada dependen del corpus
nuevo, y el panel necesita registros que mirar.

### A. Pasarela de DeepSeek y trazabilidad — ✅ hecho (2026-10-04)

- [x] **Pasarela**: `src/lib/deepseek.ts` y `src/lib/embeddings.ts` exigen una
      traza en cada llamada (TypeScript no deja llamar sin ella). DeepSeek manda
      los tokens al final del stream con `stream_options: { include_usage: true }`,
      con los de caché aparte
- [x] **Trazas** (`src/lib/trace.ts`, migración `20261004180000`):
      `chat_traces` (una por petición, con pasos cronometrados, búsqueda con sus
      candidatos, recomendadas, títulos inventados y lo que explica el turno:
      herramientas ofrecidas, `tool_choice`, preguntas seguidas) y `llm_calls`
      (tokens, caché, coste, primer token, duración, herramienta y argumentos,
      versión del prompt). Se guardan en una sola llamada, `record_trace`, antes
      de cerrar el stream
- [x] **Agregados que no caducan**: `usage_daily` (tokens y coste por día,
      modelo y propósito) y `request_daily` (peticiones por día, endpoint y
      estado). Las rechazadas por el rate limit o inválidas solo cuentan aquí
- [x] **Coste** con los precios de DeepSeek y su hora punta
      (`src/lib/llm-pricing.ts`); cada llamada guarda el suyo
- [x] **Retención** con `pg_cron`: el texto a los 30 días, la traza a los 90
- [x] **Privacidad**: la IP no se guarda, solo un HMAC de su clave de rate limit
- [x] Probado: `db:verify` 57/57 (anon no lee las tablas ni llama a las
      funciones; una rechazada no deja traza; los agregados suman). Una
      conversación real: las preguntas, 1,1–1,5 s y unos 0,0001 USD, con el
      85–95 % de la entrada en caché; el turno que busca, 6,1 s (2,6 de
      búsqueda, 1,8 de ellos el embedding de Cloudflare) y 0,00065 USD

Medido de paso: **el turno que busca cuesta 6,5 veces lo que una pregunta**, y
la segunda llamada es tres cuartas partes de él. Si el corpus grande alarga los
candidatos, ahí es donde subirá el coste.

Descartados de momento: **Langfuse** y **Helicone** (buenos, gratis hasta un
volumen, pero el panel sería suyo y los datos saldrían a otro proveedor).
**Cloudflare AI Gateway** es gratis y pondría caché, reintentos y límites delante
de DeepSeek sin tocar código, cambiando la URL base; se puede añadir después
sobre esto, no en vez de esto.

### B. Corpus general — ✅ hecho (2026-10-04)

- [x] **Qué entra** (decidido el 2026-10-04): cine internacional, español
      incluido sin trato aparte: películas con ≥ 200 votos y nota > 3,5;
      series de todo tipo, no solo otoñales, con ≥ 500 votos. Y lo que ya era de
      la especialidad de otoño, aunque no llegue (`score.py`). **16.035
      títulos**: 14.746 películas (14.735 conocidas + 11 de otoño) y 1.289 series
      (1.125 conocidas + 164 de otoño). Era 5.241
- [x] **Datos nuevos de TMDB** en una segunda descarga con su propia caché
      (`data/extras-*.jsonl`, 17.000 llamadas, unos 15 minutos, gratis):
      reparto principal (6), recomendaciones de TMDB, saga y votos al día
- [x] **Esquema** (migración `20261004200000`): `vote_count`, `vote_average`,
      `popularity`, `original_language`, `top_cast`, `collection_id`. El vector
      pasa a `halfvec(1024)`
- [x] **Vectorizado en local** (`npm run embeddings`): 10.795 títulos nuevos ×
      2 textos; lo de antes salió de la caché
- [x] **Cargado** con `load-db.py --prune` (1 título que ya no entraba) y el
      índice HNSW reconstruido. **Recall@10 del 97 %** con el triple de títulos
      (99 % antes; el fallo que queda es ruido de «El padrino»: *La tribu de los
      Brady*). **La base ocupa 149 MB de 500** (era 133 con 5.241 títulos)
- [x] **Explorar ordena por «Más conocidas»** por defecto; «Más otoñales» queda
      como opción. Resuelve la pared de Halloween de la vista inicial
- [x] ~~**Especialidades en tabla aparte** (`content_specialty`)~~ Decidido en
      el bloque C: no por ahora. Con una sola especialidad, una tabla duplicaba
      `autumn_score`, que ya está en todos los títulos y usan Explorar y la
      portada. Cuando llegue Navidad: otra columna o, si vienen más, la tabla
- [x] **«Más como esta», rehecho** (`scripts/seed/similar.py`). Ver abajo

**«Más como esta», medido.** `scripts/seed/eval-similar.py`: 40 películas
conocidas y variadas, los 6 primeros parecidos de cada método puntuados de 1 a 5
por un juez que no sabe de qué método salen. El juez final es
`deepseek-v4-pro`, distinto del modelo que sugiere, para que no se puntúe a sí
mismo.

| Método | Media | Buenas (≥ 4) | Malas (≤ 2) |
|---|---|---|---|
| Antes, en producción (corpus otoñal; 30 de las 40) | 3,50 | 53 % | 19 % |
| El de antes sobre el corpus nuevo | 3,54 | 54 % | 20 % |
| Solo las recomendaciones de TMDB | 3,17 | 39 % | 31 % |
| Híbrido sin cinéfilo | 3,69–3,73 | 62–63 % | 12–13 % |
| Solo el cinéfilo | 3,93 | 72 % | 5 % |
| **Híbrido con cinéfilo (el cargado)** | **4,01** | **75 %** | **4 %** |

Sobre las 30 películas que estaban en los dos corpus: de 3,50 a 4,02, y las
malas del 19 % al 3 %. Las otras 10 (*Pulp Fiction*, *Origen*, *Parásitos*…)
antes no tenían lista.

- **El cinéfilo** (`scripts/seed/suggest.py`): deepseek-flash nombra los 10 que
  recomendaría a quien adoró cada título; solo cuentan los que se encuentran en
  el corpus por título y año (el 89 %: 9,1 por película y 6,6 por serie de
  media). 1.604 lotes en unos 25 minutos; unos 1,2 USD estimados por tokens
  (fuera de hora punta). El saldo de DeepSeek queda en 7,48 USD
- **Las recomendaciones de TMDB decepcionaron**: a *Interstellar* le proponía
  *Stargate* y *Vengadores: Endgame*; a *La La Land*, *Pretty Woman*. Con peso
  0,40, el híbrido quedaba por debajo del método de antes; pesan 0,05
- **Lo que no funcionó**, medido: que TMDB pesara más con los títulos muy
  vistos (3,57–3,63) y que la décima sugerencia del cinéfilo pesara más (3,95)
- **El juez cambia la escala, no el orden**: con deepseek-flash de juez, los
  métodos quedaban en el mismo orden con números algo distintos

### C. Recomendador experto — ✅ hecho (2026-10-04)

- [x] **Búsqueda con filtros** (migraciones `20261004220000` y
      `20261004223000`): `buscar_titulos` recibe, además del resumen, géneros
      que sí y que no (lista cerrada; los de series se traducen solos), años,
      duración máxima, idioma original, persona (dirección o reparto) y
      popularidad (conocida, menos conocida). `search_content` los aplica en SQL:
      exacta sobre lo filtrado si hay un filtro selectivo (20–130 ms), por el
      índice si no. La persona va sobre una columna plegada (`people_search`):
      plegar en cada búsqueda llegaba al timeout de `anon`
- [x] **Si los filtros dejan casi nada**, se quitan por orden (popularidad,
      géneros, época y duración) y se le dice al modelo, para que no presente
      como «de los 90» lo que no lo es. Persona, idioma y lo excluido no se quitan
- [x] **Reordenado con popularidad** (`0,08 ×`, de 0 con 200 votos a 1 con
      30.000), y con el otoño solo en la especialidad. Cada candidato llega al
      modelo con votos («conocida», «poco conocida»), nota, duración, idioma y
      reparto
- [x] **«Algo como X»** usa los parecidos de «Más como esta» (bloque B) y no los
      vecinos del nombre. Si Umber recomienda uno parecido, el título pedido no
      cuenta como recomendado: antes salía su ficha la primera
- [x] **Prompt reescrito**: cinéfilo general, que pregunta también por gustos
      (algo que le encantó, algo que no soporta) y no repite lo que ya pidió. El
      otoño, en su capa (`src/prompts/specialty-autumn.md`), que se añade solo
      en esa especialidad. `check:guardrails`: 23/23
- [x] **Especialidad de punta a punta**: `specialty` en la API,
      `conversations.specialty` para retomarla, `?especialidad=otono` en `/chat`.
      La entrada visible, con el diseño (bloque E)
- [x] **Juego de pruebas** (`scripts/eval-chat.mjs`): 30 peticiones reales
      contra el chat de verdad, de principio a fin, con lo comprobable mirado en
      la ficha y un juez (`deepseek-v4-pro`, otro modelo que el del chat)

| | Antes (corpus general, chat de antes) | Ahora (3 ejecuciones) |
|---|---|---|
| Casos que cumplen lo comprobable | 19/30 | 29/30 las tres veces |
| Juez, media de 5 | 3,77 | 4,90 · 4,90 · 4,67 |
| Juez ≥ 4 | 20/30 | 30 · 30 · 28 de 30 |
| Turnos hasta recomendar | 3,6 | 3,2–3,4 |

Antes fallaba en lo que se puede comprobar: *Christopher Robin* «con Tom
Hanks», *Mujercitas* de 1994 «con Meryl Streep» (inventado), *Cuando Harry
encontró a Sally* (1989) «de los 90», *El padrino* «pero que no sea tan larga»,
*E.T.* «como Interstellar». El caso que falla ahora cambia en cada ejecución
(una vez *Flow*, letona, por «anime»): variación del modelo.

Encontrado al medir, y arreglado:

- Con «algo como Interstellar», Umber hacía sus dos preguntas en vez de
  comprobar el título: el contexto del turno decía «haz tu primera pregunta»
  antes que «si nombra un título, compruébalo». Ahora va primero lo del título
  (3 de 3 veces preguntaba; después, 0)
- Tras comprobarlo, a veces pregunta qué le gustó de ella antes de recomendar:
  es una buena pregunta. El script de pruebas no cuenta como recomendación una
  respuesta que acaba en pregunta

**Cuántas preguntas** (2026-10-04, a propuesta del usuario: «solo 2 me parecen
pocas»). `scripts/eval-dialogue.mjs`: 15 personas simuladas con un perfil oculto
(gustos, ánimo, compañía, lo que no soportan) que abren con algo vago y
contestan solo lo que se les pregunta; un juez que conoce el perfil puntúa la
recomendación. 60 conversaciones por configuración:

| | 2–4 preguntas | **3–5 preguntas** |
|---|---|---|
| Juez, media | 3,85 | 3,97 |
| Aciertos (≥ 4) | 47/60 (78 %) | 49/60 (82 %) |
| Fallos claros (≤ 2) | 11 (18 %) | 4 (7 %) |
| Preguntas de media | 1,6 | 2,4 |

La media apenas cambia, pero los fallos claros bajan a menos de la mitad. Con
30 conversaciones la diferencia no se veía: entre ejecuciones la media salta
±0,4. Quien tiene prisa («recomiéndame ya», «sin preguntas», «sorpréndeme», «tú
eliges») no tiene que esperar a la tercera: `wantsToSkipQuestions`. Con las
peticiones explícitas (`eval-chat.mjs`), 30/30 y juez 4,73, en 3,8 turnos (antes
3,3).

Lo que destapó la prueba con personas, y está arreglado:

- **Recomendaba lo que ya había visto**: a quien adoraba *Mindhunter*,
  *Mindhunter*. `buscar_por_titulo` lleva ahora una intención obligatoria,
  «verlo» o «parecido»; con «parecido», lo nombrado no llega como candidato. Y
  un título que la persona ha nombrado en la conversación no se le recomienda en
  una búsqueda por ánimo (nombres de 5 letras o más, para no confundir *Up*)
- **Búsquedas que pasaban de los 3 s** del rol `anon` con la base en frío y
  varias a la vez: `search_content` cuenta antes lo que dejan los filtros (unos
  30 ms) y va exacta si son 4.000 o menos y por el índice si no; y el servidor
  la llama con la secret key, sin ese tope. En caliente, 0,1–0,6 s; diez a la
  vez, 0,4 s
- **La migración que reescribió las 16.000 filas** (`people_search`) dejó la
  tabla y el índice degradados: 0,5–2,3 s por búsqueda hasta `VACUUM FULL` y
  reconstruir el índice

### D. Panel de administración — tamaño M

Solo para ti, en `/admin`, con datos leídos con la secret key en servidor.

- [ ] **Acceso**: rol en `app_metadata` del usuario, que solo se cambia con la
      Admin API (nadie se lo puede poner desde su cuenta), y **verificación en
      dos pasos obligatoria** para entrar (MFA con TOTP de Supabase, gratis). A
      quien no es admin, `/admin` le responde 404
- [ ] **Resumen**: hoy, 7 y 30 días. Mensajes, conversaciones, usuarios nuevos,
      tokens, coste en USD, porcentaje de caché, primer token (p50 y p95),
      errores por código, 429 y cuánto queda del cupo global. Saldo de
      DeepSeek en vivo (`/user/balance`)
- [ ] **Usuarios**: todos los registrados (email, nombre, alta, último acceso,
      confirmado), con sus conversaciones, favoritos, mensajes, tokens y coste.
      Acciones: bloquear y desbloquear, borrar la cuenta (RGPD) y reiniciar su
      límite del día
- [ ] **Consultas**: todas las peticiones, con filtros (fecha, usuario o
      anónimo, estado, especialidad). Detalle con la conversación, las
      llamadas a herramientas, el resumen de la búsqueda, los candidatos con su
      puntuación, la recomendación y una cascada de tiempos
- [ ] **Consumo**: tokens y coste por día, por modelo y por propósito; usuarios
      que más gastan; proyección del mes

Sugerencias sobre los tres puntos pedidos (el 4):

- [ ] **Calidad, no solo coste**: títulos nombrados que no venían de una
      búsqueda (hoy solo van al log), búsquedas sin resultados, conversaciones
      con el aviso de crisis, y la señal de que una recomendación gustó (se
      guardó, se abrió «Más como esta» o «Dónde verla»). Más adelante, un 👍/👎
      en cada recomendación
- [ ] **Límites editables** desde el panel (tabla de configuración) en vez de
      constantes en el código: subir el cupo global sin desplegar
- [ ] **Alertas** en el panel y por email: coste del día por encima de un
      umbral, saldo de DeepSeek bajo, pico de errores. El email, con el mismo
      correo gratuito que la cuenta (Fase 6, «Correo de la cuenta»): Resend pide
      un dominio, y no hay dominio
- [ ] **Registro de lo que hace el admin** (`admin_audit`): qué usuario se miró
      y qué se cambió. Leer conversaciones ajenas es delicado; que quede
      constancia
- [ ] **Privacidad**: la IP de los anónimos se guarda con hash, nunca en claro,
      y la política de privacidad (pendiente en la Fase 6) tiene que contar qué
      se registra y cuánto dura

### E. Diseño de más nivel — tamaño L

- [x] **Contenido general, sin otoño** (2026-10-04, a propuesta del usuario: «si
      Umber es general, la portada no debería hablar de otoño»). Portada, pie,
      título y descripción por defecto y el modo futuro «Un mes de cine» (era
      «Mes otoñal»). El fotograma de la portada y el de entrar y registrarse salen
      de películas muy conocidas y bien valoradas; debajo, «Si te gustó *X*» con
      sus parecidos conocidos (*Seven* → *Zodiac*, *Perdida*, *El silencio de los
      corderos*, *Prisioneros*…): el punto 6, conocidas y relacionadas
- [x] **El apartado de otoño** en la portada, con la etiqueta «Nuevo»: lleva al
      chat de la especialidad (película o serie) y a lo más otoñal del catálogo.
      Conserva su estética; la identidad general, nueva, es lo que queda de este
      bloque

- [ ] **Identidad general nueva**, ya sin otoño: dos o tres direcciones en
      maqueta, renderizadas a 390 y 1280 px, para elegir, como se hizo con la
      paleta. Más rica que la de ahora (imagen grande, filas de carteles,
      profundidad, movimiento), sin caer en lo genérico
- [ ] **Temas por especialidad** con variables CSS (`data-theme`): la general,
      y «Otoño» con la estética «Noche de otoño» de hoy, que no se tira.
      Navidad, otro tema cuando llegue
- [ ] **Sección de especialidad** (`/otono`, con la etiqueta «Nuevo»):
      portada propia, su chat y su catálogo
- [ ] **Portada con títulos conocidos y relacionados** (el punto 6): una
      película muy conocida y sus parecidas («Si te gustó *Interstellar*…»),
      filas temáticas, y el escaparate saliendo de los títulos con más votos.
      Depende del bloque B: con los parecidos de hoy, la relación no se sostiene
- [ ] Lo que quedó pendiente del rediseño de hoy: la vista inicial de
      Explorar (que pasa a ordenarse por popularidad), y la accesibilidad del
      chat (región `aria-live`, foco)

### Después: perfil de gustos — tamaño M (opcional)

- [ ] «Elige 5 películas que te encanten» al registrarse, «Ya la he visto» y
      👍/👎. Umber las tiene en cuenta y no recomienda lo visto

---

## Orden propuesto

1. **A** (pasarela y registros): pequeño, y desde ese momento todo se mide
2. **B** (corpus) y, mientras se descarga y vectoriza, maquetas de **E** para
   elegir dirección
3. **C** (recomendador), medido con su juego de pruebas
4. **D** (panel), ya con datos de verdad
5. **E** (diseño) sobre el producto nuevo
6. Lo de la Fase 6 que sigue igual (recuperar contraseña, legal, despliegue) y,
   si se quiere, el perfil de gustos

Conviene hacer esto **antes de lanzar**: cambian el nombre del producto, el
diseño y el corpus. Lanzar la versión de otoño y cambiarla después haría dos
veces lo legal y la difusión.

**Dónde lo dejamos (2026-10-04, fin del día).** A, B y C hechos; de E, la
portada general con el apartado de otoño. Lo siguiente, a elegir por el
usuario: **D** (el panel) o la **identidad general nueva** de E (maquetas de
dos o tres direcciones). Aparte, en la Fase 6, el correo de la cuenta: hoy nadie
de fuera del equipo puede activar su cuenta, y hay una propuesta sin coste
(Gmail como SMTP) pendiente de su sí.

## Decisiones tomadas

| Decisión | Motivo |
|---|---|
| Umber, experto general; el otoño, una especialidad (2026-10-04) | Decisión de producto: más ambición. Las especialidades se suman sin rehacer nada |
| El nombre sigue siendo Umber, «por ahora» (2026-10-04) | Decisión de producto. Revisarlo antes de lanzar |
| Corpus de películas: internacional, ≥ 200 votos y nota > 3,5; sin umbral propio para el cine español (2026-10-04) | Decisión de producto: lo conocido en todo el mundo, con lo español dentro como uno más. La nota solo quita lo malo de verdad; la popularidad ya ordena |
| Series ampliadas a todas las conocidas, no solo las otoñales (2026-10-04) | Decisión de producto: un experto general recibe peticiones de series. Propuesta de umbral: ≥ 500 votos, unas 1.100 |
| El texto de las consultas, también de quien no tiene cuenta, se guarda 30 días (2026-10-04) | Decisión de producto: el panel tiene que poder enseñar qué se pregunta. Va en la política de privacidad, y la IP solo con hash |
| Sin tabla de especialidades por ahora (2026-10-04) | Con solo otoño, duplicaba `autumn_score`. Se añade cuando haya una segunda |
| Los filtros de búsqueda los pone el modelo, y solo con lo pedido de forma explícita (2026-10-04) | Son condiciones duras: adivinarlos dejaba sin candidatos. Si sobran, el servidor los quita por orden y se lo dice |
| ~~Se mantienen de 2 a 4 preguntas~~ **De 3 a 5 preguntas antes de buscar**, salvo que pida que le recomiende ya (2026-10-04) | Propuesta del usuario, medida con personas simuladas: los fallos claros bajan del 18 % al 7 % (60 conversaciones por configuración). La salida rápida evita castigar a quien tiene prisa |
| `buscar_por_titulo` con intención obligatoria, «verlo» o «parecido» (2026-10-04) | Con un título nombrado como referencia («me encantó X»), X llegaba como candidato y acababa recomendándolo. Con «parecido» no llega |

## Preguntas abiertas

Resueltas el 2026-10-04 (ver Decisiones): nombre, umbral del corpus, series y
registro de consultas de anónimos.

Resuelta: cuántas preguntas (de 3 a 5, ver Decisiones). Ninguna abierta.
