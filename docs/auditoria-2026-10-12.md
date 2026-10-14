# Auditoría completa de Umber — 12 de octubre de 2026

> Informe de dueño, no de consultor: qué está bien, qué hay que arreglar, qué
> riesgos pueden tumbar el proyecto y cómo podría pagarse solo. Solo lectura:
> no se ha tocado código, base de datos ni configuración.
>
> **Método.** Nueve revisiones especializadas en paralelo (seguridad, base de
> datos, RAG/LLM, rendimiento, accesibilidad, SEO, calidad de código y tests,
> producto/UX, mercado y monetización con búsqueda web), más lectura propia de
> `.claude/CLAUDE.md`, los nueve `docs/fase-*.md` y el código. Los hallazgos
> marcados **[verificado]** se han reproducido o leído línea a línea; **[plausible]**
> sale del código pero no se ha probado en vivo; **(E)** es una estimación.

---

## 0. Resumen ejecutivo

**Veredicto.** Umber está muy bien construido para ser obra de una persona en
dos semanas: TypeScript estricto sin `any`, `typecheck` limpio, 44 tests verdes,
RLS en todas las tablas, títulos verificados contra un corpus cerrado, trazas
de coste por llamada y una estética con criterio propio. El problema no es la
ingeniería. Son tres cosas, por este orden:

1. **Riesgos que pueden obligar a cerrar o rehacer**: las condiciones de TMDB
   (uso comercial, IA y caché de más de 6 meses), la transferencia a China con
   la base jurídica más débil del RGPD, y una infraestructura «gratis» que no
   admite uso comercial (Vercel Hobby, `umber365.vercel.app`, Gmail como SMTP).
2. **Un embudo que pierde a casi todo el mundo antes del primer valor**: escribir →
   registro de 4 campos → confirmar el email (frágil en móvil) → consentimiento
   sobre China → 3–5 preguntas → y solo 2 recomendaciones al día, que se gastan
   también al pedir «otra» o al preguntar dónde ver un título.
3. **Límites de coste que son a la vez un agujero y un vector de caída**: el cupo
   de 2/día se salta cortando la conexión, y el techo global de 300 mensajes/día
   lo agota cualquiera con 6 cuentas, dejando Umber caído para todos.

**Monetizar hoy no compensa**: con los números actuales, cualquier modelo
comercial añade unos 300 €/mes de costes fijos (licencia TMDB, Vercel Pro,
Supabase Pro, autónomo, gestor) y no se cubren hasta ~5.000–19.000 usuarios
activos al mes (E). La prioridad es crecer y medir, con los juegos como motor, y
dejar el primer euro para cuando haya respuesta de TMDB y datos de retención.

### Las 12 cosas que haría primero

| # | Acción | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | Cerrar el **open redirect** de `?next=` (`src/lib/auth.ts:126`) | Phishing desde tu dominio justo tras el login. [verificado] | 30 min |
| 2 | **Reservar la recomendación antes** de llamar a DeepSeek, no al acabar el stream | Hoy se salta cortando la conexión, sin negritas o en paralelo. [verificado] | ½ día |
| 3 | Contar en el **techo global** solo los turnos que llaman a DeepSeek, y medirlo en USD, no en mensajes | 6 cuentas tiran el servicio a todos; 300 mensajes son ~0,10 USD | ½ día |
| 4 | Escribir a **TMDB** (sales@themoviedb.org) y registrarse como partner de **JustWatch** | Sin respuesta por escrito, no hay modelo de negocio posible | 1 h |
| 5 | Arreglar el **enlace de confirmación** (plantilla con `{{ .RedirectTo }}` + `token_hash`, y conservar `next` si falla) | Probablemente el mayor punto de abandono en móvil | 1 h |
| 6 | **Contexto en el muro de cuenta** («Tu pregunta te espera: …») y cupo visible («Te quedan 2 hoy») | Recupera intención; es texto | 2 h |
| 7 | No gastar cupo con **«otra»** ni con **«¿dónde veo X?»** | Con 2 al día, corregir no puede castigar | ½ día |
| 8 | **Timeouts** en DeepSeek (hoy 10 min por defecto), Supabase y embeddings | Un DeepSeek mudo deja «Pensando…» hasta que Vercel mata la función, sin traza | ½ día |
| 9 | **Trazas de `/api/search`** sin los 30 candidatos y con retención de 7 días | Pueden llenar los 500 MB del plan gratuito en ~3 semanas y dejar la base en solo lectura | 1 h |
| 10 | **Analítica sin cookies** + Sentry/UptimeRobot | Hoy no se puede medir nada de lo que propone este informe | 2 h |
| 11 | **Textos legales definitivos** (`LEGAL_DRAFT = true` en producción) y consentimiento de IA registrado en servidor y revocable en `/cuenta` | Art. 7 RGPD: demostrar y retirar el consentimiento | 1 día |
| 12 | **Dominio propio** (10–15 €/año) | Sin él no hay SEO, ni correo fiable, ni marca; es el único gasto fijo que recomiendo ya | 1 h |

---

## 1. Dónde está Umber hoy

| | |
|---|---|
| En producción | `umber365.vercel.app` (Vercel Hobby, función en `dub1`; Supabase gratuito en `eu-west-1`) |
| Corpus | 16.035 títulos (14.746 películas, 1.289 series), vectores `halfvec(1024)` con HNSW; base de ~149 MB de 500 |
| Código | ~14.500 líneas en `src/`; 25 commits desde el 29-sep-2026 |
| Calidad | `npm run typecheck`: 0 errores · `npm test`: 44 tests en 4 ficheros, todos verdes · CI con typecheck, test y build · sin ESLint |
| Coste variable | ~0,002–0,004 USD por conversación completa en hora punta, la mitad en valle (E, con `llm-pricing.ts`). Embeddings gratis en Cloudflare |
| Saldo DeepSeek | 6,89 USD (último dato en `docs/fase-6`), con aviso por debajo de 3 USD |
| Juegos | Calendario hasta el 10-oct-2027 |
| Usuarios, retención, conversión | **Desconocidos**: no hay analítica |

**Lo que está especialmente bien** (que no se pierda al cambiar cosas):

- Candidatos cerrados + `tool_choice` por turno + títulos verificados contra el
  corpus: Umber no se inventa películas, y eso es su diferencia frente a ChatGPT.
- Inyección de prompt bien tratada (mensaje citado, plantilla en una pasada, sin
  rol `system` del cliente) y XSS cerrado (`escapeHtml` antes del único `innerHTML`).
- RLS en todo, tablas de servidor con `revoke`, funciones `SECURITY DEFINER` con
  `search_path` fijo, IDOR imposible en conversaciones y favoritos.
- Pasarela de modelos con traza obligatoria: cada llamada tiene tokens y coste.
- Decisiones documentadas con su motivo en `docs/`: es raro y vale oro.
- Peso de la web contenido: 348 kB de assets, JS de 3 kB gzip por página, CLS 0.

---

## 2. Riesgos que pueden tumbar el proyecto

### 2.1 Condiciones de TMDB (riesgo existencial)

Según sus términos (https://www.themoviedb.org/api-terms-of-use; **leer el texto
literal**, los agentes trabajaron con resúmenes):

- Es **uso comercial** generar ingresos con un sitio web o un chatbot, incluida
  la publicidad, cobrar a los usuarios o cobrar por recomendar contenido. Los
  servicios de **IA/ML** basados en su contenido también.
- Prohíben **guardar datos más de 6 meses**. El corpus de Supabase es una copia
  permanente.
- Prohíben sublicenciar: no se pueden revender sus datos en una API B2B.
- Precio de la licencia comercial: no publicado. Un blog de terceros cita
  149 $/mes para empresas de menos de 1 M$ (sin confirmar).

**Qué hacer.** Escribir ya a sales@themoviedb.org describiendo Umber tal cual
(chat con LLM, embeddings, corpus persistente, juegos con carteles) y pedir
respuesta por escrito y precio. Mientras tanto: un refresco del corpus cada
<6 meses (que además trae estrenos) y no lanzar nada comercial. **Plan B** si
la respuesta es no: corpus propio desde Wikidata/Wikipedia + datos de
plataformas vía JustWatch Partners, sin carteles de terceros. Es una decisión
grande que no se ha investigado a fondo.

Los **carteles en los juegos y en los vídeos promocionales** son obras de las
distribuidoras, no de TMDB: el servidor los copia, los desenfoca y los sirve
desde Umber. Riesgo bajo mientras sea un proyecto personal; sube con un
patrocinador. Un informe jurídico breve antes de vender patrocinios.

La **atribución** está en el pie y en `/aviso-legal`. TMDB pide además su logo;
JustWatch, acreditarlo como fuente junto a «Dónde verla» (en la ficha, no solo
en el pie).

### 2.2 DeepSeek en China

- La transferencia se apoya en el consentimiento del art. 49.1.a RGPD, que el
  propio `docs/fase-6` reconoce como la base más débil (pensada para
  transferencias ocasionales). Italia bloqueó DeepSeek y la autoridad de Berlín
  lo denunció a Apple y Google.
- El consentimiento vive solo en una cookie: **no queda constancia en servidor**
  de quién aceptó ni cuándo (art. 7.1), **no se puede retirar** desde la cuenta
  (art. 7.3), y `/api/chat` no lo comprueba (`chat.astro:44-48`, marcado como
  `shortcut`). [verificado]
- Es además un proveedor único sin alternativa probada: un corte o el saldo a
  cero deja el chat caído.

**Qué hacer.** (1) Guardar versión y fecha del consentimiento en `profiles`,
exigirlo en `/api/chat` y permitir retirarlo en `/cuenta`. (2) Hacer el
proveedor intercambiable (ya habla la API de OpenAI: es cambiar `baseURL` y
modelo) y **medir con `eval-chat` y `check:guardrails` un modelo alojado en la
UE**. Aunque cueste 5–10 veces más (E), seguiría en ~0,01 USD por
recomendación. Es requisito para cualquier cliente B2B y elimina la pantalla de
consentimiento, que es un punto de abandono.

### 2.3 Infraestructura «gratis» que no es comercial

| Pieza | Problema | Cuándo resolverlo |
|---|---|---|
| Vercel Hobby | Solo uso no comercial | Antes del primer euro (Pro ~20 $/mes) |
| `umber365.vercel.app` | Sin autoridad SEO, sin marca, migrar después cuesta señales | **Ya** (10–15 €/año) |
| Gmail como SMTP | ~500 destinatarios/día, remitente `@gmail.com` a spam, Google puede suspender el envío automatizado; si cae, **nadie puede registrarse** y el chat lo exige | Con el dominio: un SMTP transaccional con dominio verificado (los hay gratuitos con dominio propio) |
| Supabase gratuito | 500 MB, sin backups reales (dump semanal en GitHub, RPO 7 días), se pausa sin actividad (cubierto por el workflow) | Al pasar de ~350 MB o al cobrar |

### 2.4 Operación a ciegas

Sin analítica, sin Sentry, sin alerta de caída y sin alerta de tamaño de base.
`LEGAL_DRAFT = true` en producción: cada texto legal dice «Borrador pendiente de
revisión», y la página de consentimiento enlaza a esa política. [verificado,
`src/lib/legal.ts:9`]

---

## 3. Seguridad

No hay nada crítico. Lo que hay:

### Alta

**S1. Open redirect en `?next=`** [verificado]. `safeRedirectPath`
(`src/lib/auth.ts:126-131`) rechaza `//` y `\` pero no tabuladores ni saltos de
línea: `/entrar?next=/%09/evil.com` pasa el filtro y el navegador lo resuelve a
`https://evil.com/` (el parser de URLs elimina `\t` y `\n`). Reproducido en
Node. Lo usan `entrar`, `registro`, `auth/confirm`, `auth/google`,
`cuenta/nombre` y `antes-de-hablar`.
*Arreglo:* `const url = new URL(value, 'http://x'); if (url.origin !== 'http://x') return fallback; return url.pathname + url.search;`

**S2. Caída barata del chat para todos.** El techo global de 300 mensajes/día
(`src/lib/rate-limit.ts:75`) se agota con ~6 cuentas a 50 mensajes. Peor: las
peticiones rechazadas con 429 `recommendations_used` **también suman** al global,
porque `enforceRateLimit` corre en paralelo con `enforceRecommendationsLeft`
(`src/pages/api/chat.ts:218-228`), así que se puede tirar el servicio sin gastar
un céntimo de DeepSeek. Crear cuentas cuesta poco (20 por IP al día).
*Arreglo:* comprobar el cupo de recomendaciones antes de contar; contar en el
global solo los turnos que llaman al modelo; techo por USD desde `usage_daily`
con alerta, no por mensajes; Cloudflare Turnstile en el registro.

### Media

**S3. El cupo de 2 recomendaciones al día se salta de tres formas**
[verificado en código]. `countRecommendation` solo se ejecuta si el stream
termina (`src/pages/api/chat.ts:545-556`):
- **cortando la conexión** tras leer el título (el propio botón «Detener»): el
  `catch` marca `CLIENT_CLOSED` y no cuenta; «Reintentar» lo repite gratis;
- **pidiendo que no use negritas**: `findRecommendations` solo detecta `**…**`;
- **en paralelo**: 8 peticiones con `left = 1` pasan la comprobación antes de
  que ninguna cuente, y `countRecommendation` no comprueba el resultado de `hit()`.
Además falla abierto: si el contador falla, se sigue.
*Arreglo:* reservar de forma atómica con `hit_rate_limit(limit=2)` antes de la
llamada que recomienda (y devolver la reserva si no recomienda), o contar en el
`finally` si hubo búsqueda.

**S4. `/recuperar` sin rate limit** (`src/pages/recuperar.astro:18-27`): spam a
terceros y agotar el cupo de Gmail, que es el mismo que el de las
confirmaciones de registro.

**S5. Amplificación en `/api/games/poster-image`** (`src/lib/games.ts:396-401`):
la firma vale con parámetros extra o `level` en otro formato (`01`, `1e0`), y
cada variante es un fallo de CDN con descarga de TMDB y `sharp`. Exigir formato
canónico, rechazar parámetros desconocidos y limitar por IP.

**S6. CSRF por GET en `/chat?q=`** (`src/pages/chat.astro:82-88`): un enlace
envía un mensaje con la sesión de la víctima y gasta su cupo. Precargar `q` en
el cuadro y exigir un clic.

### Baja e informativa

- Login CSRF si la plantilla de confirmación usa `token_hash` sin paso de
  confirmación [plausible].
- Fuerza bruta de contraseñas solo limitada por IP; añadir contador por email.
- `/api/games/titles` y `/api/tmdb` sin límite; `/api/tmdb` puede quemar la
  cuota de TMDB recorriendo los 16.000 ids públicos.
- `search_content` sigue ejecutable por `anon` aunque la app ya la llama con la
  secret key: revocarla (y ajustar `scripts/verify-schema.mjs:65`).
- `is_username_available` enumerable por `anon` (bajo).
- JWT de usuarios borrados o admins degradados válidos hasta 1 h (`getClaims`
  local).
- `rate_limits.key` guarda la IP en claro un día: la documentación dice «la IP
  nunca se guarda». Aclararlo en `/privacidad` o aplicar el HMAC también ahí.
- `robots.txt` lista `/admin`, que se esconde con 404.
- Faltan `Permissions-Policy` y `Cross-Origin-Opener-Policy`.
- `npm audit --omit=dev`: 5 altas transitivas, dos en `@astrojs/vercel` cuyo
  «arreglo» es un *downgrade*: no aplicarlo a ciegas.
- Cuentas `tester` (sin límites) que los scripts de evaluación crean contra
  producción y pueden quedar huérfanas si el proceso muere. Y `eval-chat.mjs
  --reset-global` borra el contador global **de producción**: `.env.local`
  apunta a ella.

---

## 4. Fiabilidad y calidad del código

**Fuerte:** convenciones cumplidas al pie de la letra, errores tipados,
`catch (e: unknown)`, sin `process.env` sueltos, `typecheck` y tests verdes.

### Problemas

| # | Problema | Dónde | Escenario | Arreglo |
|---|---|---|---|---|
| C1 | **Sin timeouts** en DeepSeek (SDK: 10 min y 2 reintentos), Supabase, ni `signal` en embeddings | `src/lib/deepseek.ts:67`, `embeddings.ts:106`, `search.ts:265` | DeepSeek acepta y se queda mudo: «Pensando…» hasta que Vercel mata la función; no se guarda traza ni error | `timeout: 30_000, maxRetries: 1`; `AbortSignal.any([abort.signal, AbortSignal.timeout(55_000)])`; vigilancia de inactividad entre chunks |
| C2 | Dos turnos a la vez en la misma conversación leen el mismo historial | `api/chat.ts:233` | «Otra» repetida, tope de 40 mensajes superado, multiplica S3 | Concurrencia optimista: `p_expected_len` en `append_conversation_messages` y 409 |
| C3 | `getSessionUser` trata cualquier fallo como anónimo | `src/lib/auth.ts:103-107` | Supabase caído → usuarios con sesión mandados a `/registro` | Distinguir error de auth de error de red (503) |
| C4 | Guardado que falla en silencio | `api/chat.ts:480-484` | `done` llega con `conversation_id: null`; la conversación no aparece luego | `saved: false` en `done` y aviso en la UI |
| C5 | `history` del cliente de confianza | `src/lib/chat.ts:82-105` | Turnos `assistant` inventados (jailbreak más fácil) y conversaciones infladas | Ya se manda `conversation_id`: limitar `history` a conversación nueva o quitarlo |
| C6 | `as` sobre datos externos | `tmdb.ts:139`, `scripts/games.ts:36,150`, `scripts/chat.ts:73`, `chat-stream.ts:41` | Un `localStorage` con otra forma deja los juegos inservibles; un JSON roto mata el chat | Validar con guardas de tipo |
| C7 | Módulos grandes | `src/lib/chat.ts` (826 líneas, 4 responsabilidades), `api/chat.ts` (614, `prepareChat` de ~236 con estado mutable compartido) | Cada cambio del cupo o del flujo toca lo mismo | Extraer `src/lib/chat-turn.ts`; `prepareChat` devuelve un resultado inmutable |
| C8 | `TMDB_BACKDROP_SIZE = 'original'` por defecto | `src/lib/tmdb.ts:25` | Contradice CLAUDE.md («nunca `original`») | Cambiar el valor por defecto |

### Tests: lo que falta

251 líneas de test para ~14.500 de código. Sin test: el endpoint del chat
(cupo, abort, SSE), `rate-limit.ts`, `search.ts`, la firma HMAC de los juegos,
`conversations.ts`, `trace.ts`, `locale.ts` y la paridad de embeddings con
Python. **Los diez de más valor**, por orden:

1. Cupo de recomendaciones en `/api/chat` (cuenta al terminar, al cancelar, sin negritas, en paralelo con `left = 1`) — la regresión de S3.
2. `rate-limit.ts`: `clientKey` (IPv6 /64, `::ffff:`, malformada), global solo tras el personal, `unlimited`.
3. Fallos del SSE: error a mitad, stream vacío, timeout → traza con el estado correcto.
4. `continueText`/`turnEvents`: preámbulo de <280 caracteres descartado, argumentos de herramienta partidos en chunks.
5. Menciones: `mentionMatches` (es/en, año que desempata, tildes), `unknownTitleMentions`.
6. Parsers de herramientas: `parseSearchFilters` (años invertidos, géneros fuera de enum), `parseTitleQuery` (`Face/Off`).
7. Juegos: firma con parámetros alterados, día futuro, `gameDay` en el cambio de hora de Madrid, la solución solo al terminar.
8. **Paridad TS/Python de embeddings** con un fixture compartido (NBSP, U+FEFF, `\x1c`, emoji, >8.000 caracteres): hoy fallaría en U+FEFF y `\x1c` (efecto mínimo, pero sin red de seguridad).
9. Escape de `renderReply` con payloads (`**<img onerror>**`, doble escape).
10. `conversations.ts` y `chat-stream.ts`: JSONB corrupto, multibyte partido entre chunks.

Tooling: añadir ESLint, `concurrency` y `npm audit` al CI, y fijar las actions por SHA.

---

## 5. Base de datos, escalado y costes

### Hallazgos

- **D1 (alta). Las trazas pueden llenar la base.** `/api/search` es público
  (300/día por IP, 5.000 global) y guarda los 30 candidatos por petición (~4–5 KB).
  A tope, ~25 MB/día con texto 30 días: con ~17 IPs se llega a 500 MB en unas
  3 semanas y Supabase pasa la base a **solo lectura** (registro, login y chat
  caídos), sin alerta. *Arreglo:* sin `search.candidates` (o solo ids) en las
  trazas de `search`, retención de 7 días para ese endpoint, y alerta de tamaño.
- **D2 (alta). `explore_content` con texto es caro y abierto.** Tres
  `fold_search_text` por fila (~48.000 por llamada), `count(*) over ()` y
  ordenación completa; `LIKE '%…%'` sin índice. Lo llaman `/explorar` y el
  autocompletado del juego del cartel, sin sesión ni límite; variar `q` rompe la
  caché de la CDN. *Arreglo:* columna generada plegada + índice GIN trigram, y
  una función ligera para el autocompletado (sin total, `limit 8`).
- **D3. `conversations.messages` sin tope en la base**: el límite de 40 vive en
  la app y las políticas RLS permiten INSERT/UPDATE directos de JSON arbitrario.
  `CHECK (jsonb_array_length(messages) <= 44 and pg_column_size(messages) < 200000)`
  y escritura solo vía funciones.
- **D4. RGPD**: `/api/account/export` no incluye `chat_traces` (hasta 30 días de
  mensajes ligados al `user_id`); `conversations` no caduca nunca (purga por
  inactividad y decirlo en `/privacidad`).
- **D5. Mantenimiento**: `reindex index concurrently` en vez de `reindex` (no
  bloquear búsquedas); `load-db.py` reescribe las 16.000 filas aunque no cambien
  (saltar por `text_hash`); `hnsw.max_scan_tuples` (20.000 por defecto) recortará
  candidatos cuando el corpus pase de 20.000 títulos.
- **D6. Egress**: `search_content` devuelve 30 filas con las dos sinopsis
  (~60 KB) y se usan 10. Devolver id + similitud y pedir los 10 elegidos.
- Deriva CLAUDE.md ↔ SQL: `created_at` nullables en el doc y `NOT NULL` en el
  SQL; comentarios de «corpus otoñal»; `content_similar` documenta 12 y el CHECK
  permite 30.

### Escalado (E)

| Escenario | Chat/día | Base aprox. | ¿Cabe en gratuito? |
|---|---|---|---|
| Hoy | ≤300 mensajes (≈55 conversaciones) | 150–230 MB | Sí |
| 10.000 usuarios (5 % activos) | ~3.000 | ~1,2 GB (la mayor parte, trazas) | No |
| 100.000 usuarios | ~30.000 | ~10 GB | Ni Pro sin recortar trazas |

**Lo que limita hoy no es la base ni el dinero: es el techo de 300 mensajes**,
que satura con ~1.000 usuarios activos al mes. Pasar a Supabase Pro (~25 $/mes)
cuando la base pase de ~350 MB, cuando el techo suba de ~1.000/día, o al cobrar
(backups diarios).

---

## 6. El recomendador (RAG + LLM)

Veredicto del revisor: **aprobado con condiciones**. El diseño es sólido; faltan
evaluación de verdad y personalización.

### Lo que hay que arreglar

- **R1. Evaluaciones que no miden lo que importa.** El juez de
  `eval-chat.mjs:98` ve la ficha del título, no la respuesta de Umber: los datos
  inventados en la prosa no se puntúan. No hay recall@k ni MRR del buscador, ni
  baseline versionado, ni umbrales, ni puerta en CI. El ruido entre ejecuciones
  de `eval-dialogue` (±0,4) es del tamaño de las mejoras que se han decidido con
  él. Jueces y simuladores son de la misma familia que el chat.
  *Arreglo:* set dorado de ~60 consultas con títulos esperados medido contra
  `/api/search` (0 USD de DeepSeek); resultados con fecha y `PROMPT_VERSION` en
  el repo; `unknown_titles` en el informe; workflow manual con delta máximo.
- **R2. Más fricción de la necesaria.** `turnToolsFor` (`src/lib/turns.ts:149-152`)
  impide buscar por ánimo antes de 3 preguntas aunque la petición ya sea
  explícita («una de Almodóvar de los 90»), y `SKIP_QUESTIONS_PATTERN`
  (`turns.ts:127`) no reconoce «qué veo hoy», «recomiéndame una peli» ni «me da
  igual». *Arreglo:* buscar tras 1 pregunta si hay filtros explícitos; tratar
  como «sin preguntas» una respuesta no informativa; medir el abandono por
  pregunta con `chat_traces`, no con personas simuladas.
- **R3. Búsqueda por título en el espacio equivocado.** `buscar_por_titulo`
  vectoriza el título con la instrucción de ánimo y mira solo un pool de 50:
  «Her», «Up» o «Heat» pueden dar un falso «no está», y cuesta 1–4 s de
  Cloudflare. `explore_content` ya busca por título sin tildes en los dos
  idiomas: usarlo primero.
- **R4. Recuperación débil para el ánimo.** El documento vectorizado es
  argumento + keywords; la consulta es tono («buena fotografía» trae películas
  sobre fotógrafos). El suelo de 0,30 no filtra («hola» saca 0,39). La
  popularidad (0,08) pesa tanto como el rango útil de similitud: sesgo a lo
  famoso. Sin diversidad: cuatro de una saga en el top 10 y «otra» da la
  secuela. *Arreglo rápido:* máximo 2 por saga, suelo relativo al mejor
  (mejor − 0,10). *Apuesta (~1–2 USD una vez):* una frase de «vibe» por título
  (tono, ritmo, público) generada offline y añadida al documento, medida con el
  set dorado.
- **R5. Alucinaciones detectadas tarde.** `unknownTitleMentions` corre al final
  y solo va al log; un título inventado sin negrita no se detecta y queda
  guardado como «ya recomendado». *Apuesta:* que el modelo devuelva el índice del
  candidato y el servidor pinte título y ficha.
- **R6. El servidor ejecuta `buscar_titulos` aunque no se ofreciera**
  (`api/chat.ts:381`): salta el mínimo de preguntas sin que nadie lo decida, en
  contra de lo que dice `turns.ts:17-19`.
- **R7. Idioma**: solo es/en; catalán, gallego o portugués caen al idioma de la
  interfaz; `system.md:126` y `user-context.md:74` se contradicen.

### Lo que falta y es el producto

- **Personalización: cero.** Favoritos, conversaciones anteriores y lo ya
  recomendado no influyen. Una conversación nueva puede repetir la de ayer, y
  `/conversaciones` dice «Umber recuerda lo que hablasteis», que se entiende
  como memoria entre conversaciones (`conversaciones.astro:45`).
  *Apuestas, por orden:* excluir lo ya recomendado y lo visto → centroide de los
  favoritos como señal de ranking (sin llamar a Cloudflare) → memoria de gustos
  (un JSON extraído al acabar cada conversación) que permite saltarse 1–2
  preguntas.
- **Frescura: corpus congelado.** Los estrenos casi no entran (200 votos
  mínimos) y `vote_count`/`popularity` no se actualizan. Un workflow mensual que
  añada estrenos y refresque el corpus resuelve además el límite de 6 meses de
  TMDB.
- **Plataformas**: solo suscripción y gratis; alquiler y compra se ignoran, y
  «No está en plataformas» es una respuesta pobre.

### Coste y latencia

Por conversación (3–5 preguntas + búsqueda + una «otra»): ~0,002–0,004 USD en
pico (E). **El cuello de botella es el cupo, no el dinero.** La espera larga es
el embedding de Cloudflare (mediana 1,2 s, p90 5,8 s, máx. 11,7 s) más hasta
2 s de TMDB por candidatos sin caché. Ver §8.

---

## 7. Producto y experiencia

### 7.1 El embudo

Recorrido real desde la portada hasta la primera recomendación: **7 pantallas,
un salto al correo y 3–5 turnos** de 5–6 s.

1. Escribe en la portada y envía. **En móvil no ha visto** que hace falta cuenta
   (el aviso es `hidden sm:block`, `index.astro:103`).
2. `/chat` lo manda a `/registro` sin decir por qué ni enseñarle su mensaje
   (`chat.astro:39-41`); también a quien ya tiene cuenta y caducó la sesión.
3. Cuatro campos y «Revisa tu correo».
4. El enlace caduca en 1 h y avisa «en este mismo navegador» (`registro.astro:155`):
   en móvil el correo se abre en la app de Gmail y el enlace PKCE falla. Si
   falla, `auth/confirm.ts:228` vuelve a `/entrar` **sin `next`**: el mensaje se
   pierde. El remitente `@gmail.com` puede acabar en spam.
5. Pantalla sobre China y sus autoridades, en tono de advertencia, justo después
   de todo el esfuerzo.
6. 3–5 preguntas; la salida rápida («recomiéndame ya») existe pero no se ve.
7. Una recomendación. Quedan 1, y nada lo dice.

**Es demasiado.** El consentimiento es obligatorio (mientras siga DeepSeek),
pero cuenta antes del primer valor + confirmación de email + un cupo que castiga
corregir se suman en el peor orden. Lo que sí funciona: los primeros 5 segundos
(«¿Qué te apetece ver *hoy*?» con el cuadro a la vista se entiende al instante).

### 7.2 Problemas concretos

| # | Dónde | Problema | Propuesta |
|---|---|---|---|
| U1 | `registro.astro:130-136` | Muro sin contexto | «Tu pregunta te espera: “…”. Crea la cuenta y Umber te contesta» |
| U2 | `auth/confirm.ts:228`, plantilla de email | Se pierde `next`; el enlace solo funciona en el mismo navegador | `/entrar?error=enlace&next=…`; plantilla `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` |
| U3 | `chat.astro` | Sin contador ni salida rápida visible | «Te quedan 2 hoy» (dato en `done`) y un chip «Recomiéndame ya» |
| U4 | `api/chat.ts:551` | «Otra» y «¿dónde veo X?» gastan cupo | Contar por conversación con recomendación; «otra» y la intención «verlo», gratis |
| U5 | `chat.astro:228-248` | «Hasta mañana» sin hora; el cupo reinicia a las 00:00 UTC (01:00/02:00 en Madrid) y los juegos a medianoche de Madrid | Alinear el cupo con Madrid y enseñar la hora |
| U6 | `chat.astro:212-248` | Paneles de fin `sticky` que tapan media pantalla en móvil al releer | Barra compacta, no sticky |
| U7 | `SiteHeader.astro` | Ningún enlace al chat (¡el producto!); sin «Crear cuenta»; en móvil «Cuenta» y «Salir» quedan fuera por scroll horizontal | «Pedir recomendación» como acción principal; menú en móvil |
| U8 | `chat.astro:105-118` | Sugerencias otoñales en el chat general | Sugerencias generales y de compañía |
| U9 | `entrar.astro:91-93` | Presenta la cuenta como opcional | «Entra para hablar con Umber» |
| U10 | `ContentCard.astro`, `scripts/chat.ts:409-425` | Restos de cuando se chateaba sin cuenta: «Más como esta» en otra pestaña | Misma pestaña; borrar el código muerto |
| U11 | Ficha del chat | Sin «Ya la he visto», compartir ni enlace a la plataforma | Añadirlos (pendientes de la Fase 6) |
| U12 | `explorar/index.astro:155-161` | Estado vacío sin salida | «Quitar filtros» y «Pregúntale a Umber por “…”» |
| U13 | `GameResult.astro` | La racha vive en el navegador; el final del juego no invita a crear cuenta | Racha en la cuenta e invitación |
| U14 | `public/` | Sin `manifest` ni `apple-touch-icon` | PWA mínima para un ritual diario |
| U15 | Portada | Modos `weekend`/`month` «En preparación» sin fecha | Quitarlos de la portada hasta que existan |

---

## 8. Rendimiento

Assets medidos en `dist/`: 348 kB en total, CSS 12,7 kB gzip, JS ≤3,3 kB gzip
por página, 159 kB de fuentes (124 kB precargados), CLS 0. **El problema no es el
peso, es la latencia del chat y que nada se cachea en la CDN.**

**Quick wins (≤1 h cada uno):**

1. **Embedding con reintento rápido o petición duplicada** (*hedging*): hoy
   `timeout: 15_000, maxRetries: 1` (`embeddings.ts:64`). Lanzar una segunda
   petición a los ~2,5 s y quedarse con la primera bajaría el p90 de ~5,8 s a
   ~3,5 s (E), dentro del cupo gratuito. Es la mayor mejora de espera percibida
   por una línea.
2. **Sacar TMDB del camino crítico**: servir la caché de plataformas aunque esté
   caducada y refrescar en segundo plano; pedir plataformas solo del título
   elegido, no de los 10.
3. `import()` dinámico de `sharp` (`games.ts:13`): hoy lo cargan también
   `/juegos`, `/juegos/cartel` y `/juegos/titulo`, que no desenfocan nada.
   Desenfocar a ¼ de tamaño y volver a escalar: ~10× menos CPU (E).
4. `<link rel="preconnect" href="https://image.tmdb.org">` en `Layout.astro`.
5. Saltarse la sesión del middleware en endpoints públicos cacheados
   (`poster-image`, `games/titles`, `/api/tmdb`, `sitemap.xml`, `robots.txt`).
6. Cachear `content_genres` y `pickRelated` (la portada hace 2–3 consultas en
   serie por visita) y paralelizar las de `/explorar` y `/chat`.
7. Quitar `rise`/`develop` de lo que está sobre el pliegue (retrasan el LCP
   ~100–300 ms) y el fondo de la ficha a `w780` (−100 kB).

**Cambios medios:** cron que caliente `platforms_cache` por popularidad y los
carteles del día a medianoche; plataformas de la ficha en cliente vía `/api/tmdb`
(ya existe, con CDN de un día, y no lo usa nadie); Speculation Rules.

**Cambio mayor (solo si lo anterior no basta):** fichas, `/explorar` y legales
cacheables en CDN (cabecera de sesión como *server island*, tema por script
externo). **No activar el ISR del adaptador tal cual**: el HTML depende de la
sesión, del tema y de `Accept-Language`, y se mezclaría el estado de usuarios.

---

## 9. Accesibilidad

Revisión WCAG 2.2 AA leyendo código, sin lector de pantalla real. **Bien:**
skip link, `lang="es"`, formularios de acceso (`label`, `autocomplete`,
`aria-invalid`, foco en el campo erróneo), `:focus-visible` con acento,
`prefers-reduced-motion` en todas las animaciones, tamaños de objetivo de 44 px.
Contraste de los tokens: tinta 16:1, secundario 6,2:1 (el comentario dice 6,5),
acento 5,2:1, borde de control 3,35:1; todo pasa.

### Críticos

- **A11Y-1. El título del día no se puede jugar con lector de pantalla.** Las
  casillas son `<span>` vacíos sin rol (`titulo.astro:193`); las destapadas
  llevan `aria-label` en un `<span>` sin rol, que ARIA prohíbe y muchos lectores
  ignoran (`game-title.ts:295`); lo que se escribe no se anuncia; las teclas
  elegidas no tienen `aria-pressed` y «está / no está» solo se ve por color y
  tachado; las pistas se anuncian sin su valor («Pista nueva: el año»,
  `:361`). *Arreglo robusto:* un `<input>` real para el título, las casillas
  `aria-hidden` y un texto oculto con el tablero («Palabra 1, 3 letras: _ A _»).
- **A11Y-2. El final de partida no se anuncia y el foco se pierde** en los dos
  juegos (`say('')` en `game-poster.ts:174` y `game-title.ts:251`; el resultado
  aparece 1 s después sin foco). Llevar el foco al resultado o escribir el
  veredicto en el `role="status"`.
- **A11Y-3. El chat entero es una región `aria-live`** (`chat.astro:170`) que se
  rehace en cada fragmento del stream (`chat.ts:299`): previsiblemente, texto
  repetido o un aviso enorme al final, y tus propios mensajes leídos en voz alta.
  Región de estado aparte («Pensando», «Buscando», «Umber ha respondido») y el
  texto final una sola vez.
- **A11Y-4. Foco perdido** al enviar (el botón se deshabilita), al pulsar una
  sugerencia, al desaparecer «Reintentar» o «Detener» y al aparecer los paneles
  de fin. No hay ni un `.focus()` en `chat.ts`.
- **A11Y-5. Campos sin etiqueta** (nivel A): nombre de usuario y email en
  `cuenta/index.astro:123-136,166-174`; reenvío de correo en `entrar.astro:102-108`.
- **A11Y-6. Cambio de contexto al elegir en un select** (nivel A): `explore.ts`
  envía el formulario en cada `change`; con teclado en Windows, la primera
  flecha recarga la página. Quitarlo (el botón «Buscar» ya existe).

### Altos

- **Combobox del cartel** casi completo, pero: su nombre accesible es «Intento 1
  de 6» y no dice qué escribir; Intro con la lista abierta elige la primera
  opción en silencio; no se anuncia el número de resultados; las opciones solo
  responden a `mousedown` (posible fallo con VoiceOver iOS y TalkBack); faltan
  Inicio, Fin y Alt+↓.
- **El cartel desenfocado excluye a las personas ciegas.** Cumple la excepción
  de 1.1.1 para pruebas, pero se puede hacer mejor: un modo «con pistas de
  texto» que reutilice las del título (año, director, género, un actor), o
  descripciones de composición y color precalculadas en `games.py`.
- **Contrastes que fallan por opacidad**: placeholders `muted/70` y `/75`
  (~3,2–3,6:1), géneros de la ficha `muted/85` (~4,2:1), teclas y casillas
  «presente» acento sobre `raised` (4,28:1), letras «ausente» `muted/55`
  (~2,3:1), bordes de casilla vacía `rule/45` (~1,6:1, piden 3:1). Texto sobre
  el fondo de la ficha con fotogramas muy claros u oscuros: medir con
  herramienta.
- **Zoom al 400 %**: el compositor `sticky` ocupa más de media pantalla y los
  paneles de fin pueden tapar toda la conversación. `position: static` con
  `max-height: 480px` y `scroll-padding-bottom`.

### Medios y bajos

Regiones de estado que salen de `hidden` y no se anuncian (favorito, coincidencia
de contraseñas); `role="alert"` en carga de página que nadie lee; «Revisa tu
correo» sin `<h1>`; atajo global de una sola tecla en el título (2.1.4); «Guardar»
y «Más como esta» repetidos sin contexto; `lang="en"` en títulos y respuestas en
inglés; foco del cuadro de escribir apurado (solo cambia el color del filete);
saltos de `h1` a `h3`; página actual de los textos legales marcada solo por color.

**Probar con lector real** (NVDA, VoiceOver iOS, TalkBack): el streaming del
chat, el título del día entero sin pantalla, el combobox en móvil, y el zoom al
400 %.

---

## 10. SEO

**Hoy Umber no compite en buscadores**, y no por el código: por el dominio
`vercel.app`, por las URLs con uuid y porque las fichas son sinopsis de TMDB que
tienen decenas de webs. Competir de frente por «dónde ver X» contra JustWatch,
Filmaffinity o SensaCine es de muy baja probabilidad (E: de 16.000 fichas, entre
300 y 1.500 indexadas el primer año).

### Problemas técnicos

| Severidad | Problema | Dónde | Arreglo |
|---|---|---|---|
| Crítica | Dominio `vercel.app` | — | Dominio propio, 301 desde vercel.app, Search Console |
| Crítica | Ficha inexistente → 302 a `/explorar` (soft 404) | `explorar/[id].astro:23` | 404 real (o 301 si cambió de URL) |
| Alta | Cero datos estructurados | `Layout.astro` | JSON-LD `Movie`/`TVSeries` + `BreadcrumbList` en la ficha; `WebSite` en la portada. Un `ld+json` no se ejecuta: no choca con la CSP (comprobar en el build) |
| Alta | URLs con uuid | `[id].astro`, `sitemap.xml.ts` | Slugs `/pelicula/cadena-perpetua-1994`, `/serie/dark-2017`, con 301 desde el uuid. Cuanto antes: cada semana indexada con uuid encarece la migración |
| Alta | Canonical que borra `page`, `type` y `genre`; enlaces de tarjeta con `?genre=&sort=&page=` | `Layout.astro:24-25`, `explorar/index.astro` | Canonical por página y género; `noindex,follow` con búsqueda u orden no por defecto; enlaces sin parámetros |
| Alta | Título y descripción | `[id].astro:71-78` | «Dónde ver X (año) en streaming \| Umber»; descripción con las plataformas reales («X está en Netflix y Max en España») y ≤160 caracteres; `og:type` `video.movie` |
| Media | Ficha pobre | `[id].astro`, `explore.ts:173` | Reparto, nota, saga, «Actualizado el …», «Dónde ver» como `<h2>`, alquiler y compra |
| Media | `noindex` en `/entrar`, `/registro`, `/recuperar`; `lastmod` en el sitemap | `robots.txt.ts`, `sitemap.xml.ts` | |

### Estrategia

La ficha como página de «dónde ver» (con slug, schema y datos propios) y el
peso en **hubs donde la competencia es débil**, por olas de 300–500 páginas con
texto propio y revisión por muestreo, midiendo cada ola en Search Console:

1. Ficha con slug.
2. **«Películas como X»** desde `content_similar` (la mayor palanca), para los 1.000–2.000 más votados.
3. **Otoño**: `/otono/peliculas-romanticas`, `/halloween/peliculas` (nadie más tiene `autumn_score`). Estacional: o se publica en 2–3 semanas o queda para 2027.
4. Plataforma × género (`/netflix/peliculas-de-comedia`; requiere cargar `platforms_cache` por lotes).
5. Género × década.
6. Director y actor (desde `director` y `top_cast`).
7. Sagas (desde `collection_id`), con el orden para verlas.
8. Duración y formato (`/peliculas-de-menos-de-90-minutos`, `/series-cortas`).
9. País o idioma (`original_language`).
10. Ánimo (`/peliculas-para-un-domingo-de-lluvia`): consultas curadas con `search_content`, cacheadas y con texto editorial.

**Ojo:** todo esto es «uso comercial» de datos de TMDB si genera tráfico para
monetizar (§2.1). Primero la respuesta de TMDB, luego las olas.

---

## 11. Monetización

### 11.1 Antes del primer euro

Hay cuatro bloqueos y ninguno es código: **licencia de TMDB**, **proveedor de
LLM fuera de China** (o consentimiento sólido), **hosting comercial** (Vercel
Pro) y **alta fiscal** (autónomo + gestor). Más textos legales de venta
(desistimiento en contenido digital, condiciones de contratación).

### 11.2 Competencia y ventaja defendible

| Rival | Qué es | Hueco que deja |
|---|---|---|
| JustWatch | «Dónde ver», ~55 M usuarios/mes en el mundo | Es un buscador: no conversa ni decide por ti |
| Letterboxd | Red social y diario, >30 M miembros; Pro ~20 $/año | Exige saber ya qué te gusta; sin plataformas de España |
| Filmaffinity | ~30 M visitas/mes, 64 % de España | Sin recomendador conversacional |
| Netflix y plataformas | Buscador con IA dentro de su catálogo | Solo lo suyo |
| ChatGPT/Gemini | Chat general, gratis | Sin catálogo verificado ni plataformas en España; se inventa cosas |
| Apps de IA (MovieWiser, WatchNow…) | Clones en inglés | Nadie en español de España, ni con juegos |

**La tecnología no es defendible** (ChatGPT conversa igual de bien). Lo
defendible: (1) **criterio**: pocas preguntas y una recomendación decidida, no
listas; (2) **cero títulos inventados y «dónde verla» en España**, verificable
(medirlo frente a ChatGPT con 50 consultas y publicarlo); (3) **los juegos como
hábito diario**; (4) a medio plazo, **la memoria de gustos**; (5) costes casi
cero, que le dejan sobrevivir donde otros no.

Mercado: el 63 % de los hogares españoles con internet paga plataformas de vídeo
(CNMC, 2T 2025), y quiere acertar para no desperdiciar la cuota.

### 11.3 Modelos, con números (E)

Hipótesis: el 30 % de los usuarios activos usa el chat 5 veces al mes, 15
páginas vistas por usuario, 1 % de pago, 1 USD = 0,92 €.

| €/mes | 1.000 MAU | 10.000 MAU | 100.000 MAU |
|---|---|---|---|
| Suscripción Plus (~1,6 € netos por suscriptor) | 16 | 160 | 1.600 |
| Afiliación | 15 | 150 | 1.500 |
| Patrocinio de juegos | 0 | 300 | 3.000 |
| B2B (widgets/motor para medios, cines, Filmin) | 0 | 300 | 2.500 |
| **Total sin anuncios** | **31** | **910** | **8.600** |
| Anuncios display (RPM ~3 €) | 45 | 450 | 4.500 |
| Costes fijos comerciales | ~307 | ~307 | ~430 |
| **Resultado sin anuncios** | **−278** | **+553** | **+7.800** |

Costes fijos al pasar a comercial: licencia TMDB ~137 € (sin confirmar), Vercel
Pro ~18 €, Supabase Pro ~23 €, autónomo con tarifa plana ~88 € (luego ~206 €),
gestor ~40 €. **Equilibrio: ~19.000 MAU solo con suscripciones; 4.000–6.000 con
patrocinio y B2B.**

### 11.4 Qué vendería y qué no

- **Suscripción «Umber Plus»: 14,99 €/año (principal) o 2,99 €/mes**, con 200
  plazas de fundador a 9,99 €/año. El plan de la Fase 7 (24,99 €/año) está por
  encima de Letterboxd Pro y su tabla está desfasada (habla de 50 mensajes
  gratis y de conversación sin cuenta). Propuesta:
  - **Gratis**: 2 recomendaciones al día (sin castigar «otra»), **mis
    plataformas** (es el «para qué» de una recomendación; lo haría gratis),
    juegos, catálogo.
  - **Plus**: 10 al día, memoria de gustos y de lo visto, avisos «ya está en tu
    plataforma», modos fin de semana y mes (ya diseñados), archivo de juegos y
    racha en la cuenta.
  - Pasarela: **Stripe** (1,5 % + 0,25 € + 0,7 % de Billing) sale más barato que
    un *merchant of record* (5 % + 0,50 $, que se come el 30 % de un pago de
    1,99 €). Con público español, IVA del 21 %; el OSS solo pasa a importar por
    encima de 10.000 €/año de ventas a otros países UE. Confirmarlo con el
    gestor.
- **Patrocinio de los juegos («El cartel del día, presentado por…»)**: lo más
  original. Distribuidoras con un estreno o salas independientes que aportan
  cartel con licencia, lo que además resuelve el riesgo de derechos.
- **Afiliación**: poco prometedora. Netflix no tiene programa verificable;
  Prime Video paga por prueba nueva (~3 $ en EE. UU., pedir el dato de
  Amazon.es); Apple TV vía Partnerize; Filmin y Movistar Plus+ sin nada
  verificable. Como el 63 % ya paga, cuenta como extra del 10–20 %.
- **B2B**: solo el motor conversacional con datos del cliente (TMDB prohíbe
  sublicenciar) y tras resolver DeepSeek.
- **Anuncios: no.** Rompen la promesa de «sin publicidad» de `/sobre-umber`,
  exigen banner de cookies (y sin consentimiento el RPM cae) y las redes buenas
  no aceptan bien tráfico español. Si algún día, solo en juegos y catálogo,
  nunca en el chat, y no antes de 20.000 MAU.
- **Merchandising: no** (carteles ajenos y logística).

### 11.5 Mi decisión como dueño

1. **Hoy no se cobra nada.** Con decenas o cientos de usuarios, el resultado es
   negativo en cualquier escenario, y cobrar obliga a romper la decisión de
   «cero gastos fijos» (~300 €/mes). Se gana más arreglando el embudo.
2. **Se pregunta ya a TMDB** y se prepara el cambio de LLM: son los dos bloqueos
   que no dependen de crecer.
3. **Puerta de decisión al día 90**, con datos: si los juegos superan ~1.500
   jugadores diarios y el paso juego → cuenta supera el 3 %, se monta Plus y se
   buscan los primeros patrocinadores. Si no, Umber sigue como proyecto
   personal de coste ~0, que también es un resultado válido.

---

## 12. Crecimiento y métricas

**Canales, por orden de apuesta:**

1. **Los juegos como puerta de entrada.** Ya tienen resultado compartible. Falta
   imagen Open Graph del resultado, el número del día en el enlace, copiar con
   un clic y quitar la barrera de después: hoy «Pídele a Umber algo parecido»
   lleva al registro. **Una recomendación anónima al día protegida con
   Turnstile** cuesta ~0,001 € y probaría el chat a quien acaba de jugar.
2. **Vídeo corto**: «¿Qué película es?» con el cartel desenfocándose en 15 s (se
   genera con el mismo `sharp`), y conversaciones reales de Umber. Los vídeos
   de lanzamiento de hoy (`brag-output/`) sirven de base.
3. **Newsletter semanal** con doble opt-in: «3 películas para este finde» + la
   racha. El único canal propio.
4. **SEO** (§10), en olas y tras TMDB.
5. **Comunidades** (subreddits en español, Menéame, X cinéfilo), aportando, no
   soltando enlaces.

**Métricas mínimas** (Plausible, Umami o Cloudflare Web Analytics, sin cookies):

| Métrica | Objetivo de partida (E) |
|---|---|
| Jugadores diarios | Tendencia |
| Comparte / termina partida | > 8 % |
| Visitas por cada resultado compartido | > 0,3 |
| Retención de juegos D1 / D7 / D30 | 35 % / 18 % / 8 % |
| Juego → cuenta | > 3 % |
| Cuenta → primera recomendación | > 60 % |
| Abandono por pregunta del chat | Medirlo antes de tocar el 3–5 |
| Clic en «dónde verla» por recomendación | > 15 % |
| Coste por recomendación | < 0,002 € |

---

## 13. Plan de 90 días

### Semanas 1–2 · Cerrar agujeros y desbloquear

- [ ] ~~S1 open redirect~~ (2026-10-12) · S3 reservar el cupo antes · S2 techo global por USD y solo turnos con modelo (de momento, 1.500 mensajes al día)
- [ ] ~~S4 rate limit en `/recuperar`~~ (2026-10-12) · S5 formato canónico en `poster-image`
- [ ] C1 timeouts en DeepSeek, Supabase y embeddings
- [ ] D1 trazas de `search` sin candidatos y 7 días · alerta de tamaño de base
- [ ] Correo a TMDB y alta en JustWatch Partners
- [ ] Dominio propio + 301 + Search Console; SMTP con el dominio
- [ ] Analítica sin cookies, Sentry y UptimeRobot
- [x] U2 enlace de confirmación (plantillas hechas; falta pegarlas en el dashboard) · U1 contexto en el muro · U3 cupo visible (2026-10-12)
- [ ] Verificar que Google OAuth funciona en producción (los docs se contradicen)

### Semanas 3–6 · Embudo, confianza y calidad

- [x] Consentimiento de IA en servidor, revocable, exigido en `/api/chat`; textos legales definitivos (`LEGAL_DRAFT = false`) (2026-10-12)
- [ ] U4 «otra» y «verlo» sin gastar cupo · R2 buscar antes con filtros explícitos · R6
- [ ] R3 título por SQL · R4 tope por saga y suelo relativo
- [ ] Rendimiento: hedging del embedding, TMDB fuera del camino crítico, preconnect, `sharp` dinámico
- [ ] Tests 1–5 de §4 y set dorado de recuperación (R1)
- [ ] Juegos: imagen OG del resultado, recomendación anónima con Turnstile
- [ ] SEO técnico: 404 real, JSON-LD, canonical; si TMDB lo permite, hubs de otoño antes de noviembre
- [ ] Probar un LLM alojado en la UE con `eval-chat` y `check:guardrails`
- [ ] Accesibilidad rápida: A11Y-5 etiquetas, A11Y-6 select, A11Y-3 región de estado del chat, A11Y-4 foco, contrastes por opacidad

### Semanas 7–12 · Retención

- [ ] «Ya la he visto» + no repetir lo recomendado entre conversaciones
- [x] «Mis plataformas» (gratis), 2026-10-13: ver la Fase 6
- [ ] Separar «Quiero verla» de «Me encantó»
- [ ] Racha de juegos en la cuenta + invitación al terminar
- [ ] Compartir una recomendación; PWA mínima
- [ ] Refresco del corpus (estrenos + límite de 6 meses de TMDB)
- [ ] Newsletter semanal
- [ ] Juegos accesibles: A11Y-1 (título con `<input>` real) y A11Y-2; modo «con pistas» en el cartel
- [ ] **Día 90: revisión con datos** y decisión de monetizar o no (§11.5)

---

## 14. Deuda documental

`docs/` es la fuente de verdad del estado y hoy va por detrás:

- **Fase 6, «Despliegue»**: casillas sin marcar (Vercel, variables, SMTP, Site
  URL) con la web en producción; «SMTP propio» pendiente en un sitio y hecho en
  otro.
- **Fase 6, «Calidad»**: tests y CI pendientes, pero existen `ci.yml` y 4 ficheros
  de test (commit `64e428f`). «Explorar, vista inicial» pendiente dos veces, y
  ya resuelto (`DEFAULT_SORT = 'popular'`).
- **Fase 5**: «Recuperar la contraseña» pendiente, y hecho.
- **Google OAuth**: «pendiente» en la Fase 5 y en CLAUDE.md, «hecho» en la
  Fase 6. Comprobarlo.
- **Fase 8, bloque E**: pide una identidad nueva que «Programa de mano» ya
  sustituyó; la pregunta 3 del README («¿panel o identidad?») está obsoleta.
- **Fase 9**: dice que falta aplicar la migración, y está aplicada.
- **Fase 7**: tabla de planes desfasada (50 mensajes gratis, conversación sin cuenta).
- **CLAUDE.md**: el contrato de `/api/chat` dice «sin sesión se chatea sin
  guardar» y hoy da 401; describe `created_at` como nullables; Google como
  pendiente.
- Higiene del repositorio (de hoy): `.agents/`, `skills-lock.json` y
  `brag-output/` sin seguimiento y fuera de `.gitignore`.

---

## 15. Lo que no se ha verificado

- Nada en vivo: ni cabeceras ni CSP desplegadas, ni TTFB/LCP reales, ni la
  configuración de Supabase Auth (plantilla de email, proveedor de Google, Site
  URL, comportamiento ante un re-registro de un email sin confirmar).
- Tamaños reales por tabla (conviene una consulta de solo lectura a
  `pg_total_relation_size` de `chat_traces`, `conversations` y `auth.users`).
- El texto literal de las condiciones de TMDB y JustWatch, el precio de la
  licencia, las tarifas de afiliación en España y el RPM real del nicho.
- Los porcentajes de conversión y tráfico de §11 y §12: son hipótesis para
  ordenar decisiones, no previsiones.
- Que Vercel propague el cierre del cliente como `cancel()` (S3 no depende de
  ello: el botón «Detener» de la propia web ya lo provoca).
- Lo legal es lectura de un no abogado: TMDB, RGPD/China y fiscalidad, con un
  profesional antes de cobrar.
