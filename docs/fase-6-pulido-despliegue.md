# Fase 6 — Pulido, producto completo y despliegue

**Estado:** 🔄 En curso
**Depende de:** [Fase 5](fase-5-frontend.md) ✅
**Actualizado:** 2026-10-04

## Objetivo

Dejar Umber en producción como **proyecto completo y sin fallos**, no como MVP:
cuenta completa, legal, operación vigilada, en dos idiomas, usable en cualquier
pantalla y con el coste bajo control. Sin cobrar nada: premium es la
[Fase 7](fase-7-premium.md), para más adelante. Solo se paga DeepSeek, por uso:
nada de gastos fijos, ni servidores que mantener ni dominio (ver «Correo de la
cuenta»).

## Hecho

- [x] Adaptador `@astrojs/vercel` configurado y build generando
      `.vercel/output` correctamente
- [x] Tipografías autoalojadas, así que no hay petición a Google Fonts
- [x] `color-scheme: dark`, `prefers-reduced-motion` y `:focus-visible` ya
      contemplados en `src/styles/global.css`

## Pendiente

### Producto completo (añadido el 2026-10-04)

Lo que falta para que no sea un MVP. Orden propuesto: lo que bloquea el
lanzamiento primero.

**Cuenta**
- [x] Recuperar la contraseña («¿La has olvidado?»), 2026-10-10: `/recuperar`
      pide el email (`resetPasswordForEmail`, misma respuesta exista o no la
      cuenta) y `/cuenta/contrasena` fija la nueva tras el enlace
      (`updateUser({ password })`). Mismo canje en `/auth/confirm`
- [x] `/cuenta`: cambiar nombre de usuario, email y contraseña (2026-10-10).
      Tres formularios independientes (`updateUser`); el cambio de email manda
      confirmación al nuevo (y, según «Secure email change», también al
      actual) antes de aplicarse. Probado de punta a punta con un usuario de
      prueba creado y borrado con la Admin API: nombre cogido rechazado,
      nombre libre aplicado (y copiado a `profiles` por el trigger),
      contraseñas que no coinciden rechazadas, contraseña nueva aplicada,
      cambio de email enviado sin error
- [x] Borrar la cuenta y descargar tus datos (RGPD: supresión y portabilidad),
      2026-10-10: `GET /api/account/export` descarga perfil, conversaciones
      completas y favoritos (`listConversationsForExport`, con el cliente de
      sesión, RLS de por medio); `/cuenta/borrar` pide escribir el email tal
      cual, borra con la Admin API por `id` y solo si sale bien cierra la
      sesión (`signOut({ scope: 'global' })`). Probado de punta a punta con un
      usuario de prueba con una conversación y un favorito: exportación con
      los datos reales, confirmación rechazada con otro email, borrado real
      (cuenta, perfil, conversación y favorito desaparecidos en cascada) y
      sesión cerrada después (`/cuenta` vuelve a pedir entrar)
- [x] Entrar con Google (ver la [Fase 5](fase-5-frontend.md)), 2026-10-09
- [x] Límite propio en `/entrar` y `/registro` por IP (2026-10-10), con
      `hit_rate_limit` como el chat: dos ámbitos nuevos en `rate-limit.ts`,
      siempre anónimos (las páginas redirigen si ya hay sesión). `entrar`,
      10 cada 5 minutos y 50 al día; `registro`, 5 cada 5 minutos, 20 al día y
      un global de 300 al día que protege el cupo del SMTP (cada registro manda
      un correo). Más estricto que el de Supabase (30 cada 5 minutos),
      para dar antes el aviso propio en español. Probado contra el dev server:
      10 intentos de `/entrar` pasan, el 11 cae con 429 y el mensaje en
      español; limpiado el cupo de prueba después
- [x] **Reenviar el correo de confirmación** (2026-10-10): botón en «Revisa tu
      correo» (`registro.astro`) y en el aviso de enlace caducado de `/entrar`
      (`?error=enlace`, con un campo de email propio: ese caso no sabe cuál
      es). `auth.resend({ type: 'signup', email })`, con el mismo límite y el
      mismo cupo global que `/registro` (ambos mandan correo por el mismo
      SMTP). Probado de punta a punta con un usuario sin confirmar: el primer
      reenvío llega bien, el segundo antes de 60 s choca con el límite de
      Supabase entre dos correos a la misma persona (mensaje ya mapeado)
- [x] Mensajes en español para los errores de envío que hoy caían en el
      genérico de `authErrorMessage` (`src/lib/auth.ts`): añadido
      `email_address_not_authorized`

**Legal**
- [x] **Borradores** (2026-10-11): `/aviso-legal`, `/privacidad`, `/cookies` y
      `/condiciones`, con `LegalPage` y el estilo `legal-text`; enlazados desde
      el pie y, en el registro, «aceptas las condiciones y tienes 14 años o
      más». Escritos sobre lo que hace el código: plazos de `prune_traces` (30 y
      90 días), la IP en claro solo en `rate_limits` (un día como mucho),
      `client_hash` en las trazas, proveedores y sus regiones, cookies de
      Supabase, `umber_juego_idioma` y `umber:games:v1`. Probados sobre el
      build: sin violaciones de CSP, 390 y 1280 px
- [ ] **Revisar los textos legales** y, después, `LEGAL_DRAFT = false`. Titular
      (2026-10-11): solo nombre y email, en `src/lib/legal.ts`; sin NIF ni
      domicilio mientras sea un proyecto personal sin ingresos (fuera del art.
      10 de la LSSI; el RGPD pide identidad y contacto). Al cobrar, añadirlos. Pendiente de criterio legal: la
      base de la **transferencia a DeepSeek (China)**, sin decisión de
      adecuación; está marcada en `/privacidad`
- [ ] Decir en el chat que Umber es una IA (AI Act, art. 50, en vigor desde
      agosto de 2026): hoy solo lo dicen las condiciones y el aviso legal

**Operación**
- [x] **Correo de la cuenta sin coste** (2026-10-10): Gmail como SMTP, ver
      «Correo de la cuenta» más abajo. El dominio propio (10–15 €/año) sigue
      sin aprobar: solo si algún día se decide pagarlo
- [ ] Errores en producción con Sentry (plan gratuito) y aviso si la web cae
      (UptimeRobot o similar, gratis)
- [x] **Supabase gratuito pausa el proyecto tras 7 días sin actividad** y no
      tiene copias descargables (2026-10-10): `.github/workflows/supabase-keepalive.yml`,
      semanal (lunes), una lectura trivial más `pg_dump` subido como artefacto
      (90 días). Pendiente de tu parte: añadir `SUPABASE_URL`,
      `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_DB_URL` (Project Settings →
      Database → Connection string, modo Session) en Settings → Secrets and
      variables → Actions del repositorio
- [x] Aviso cuando el saldo de DeepSeek baje de un umbral (2026-10-10):
      `.github/workflows/deepseek-balance.yml`, diario, llama a `/user/balance`
      y falla el workflow por debajo de 3 USD — GitHub avisa por email al fallar
      uno programado, sin ningún servicio nuevo. Probado contra la API real
      (saldo actual: 6,89 USD). Pendiente de tu parte: añadir `DEEPSEEK_API_KEY`
      como secreto del repositorio

**Calidad**
- [ ] Tests automáticos de la lógica pura (`turns`, `rate-limit`, `chat`,
      `locale`, `markdown`) y de los flujos clave en el navegador, en el repo
- [ ] GitHub Actions en cada push: typecheck, build y tests
- [ ] `npm run check:guardrails` antes de cada cambio en `system.md`

**SEO y difusión**
- [ ] Metadatos y vista previa al compartir (Open Graph con el cartel) en cada
      ficha: 5.000 páginas «Dónde ver…»
- [ ] `sitemap.xml` y `robots.txt`
- [ ] Analítica sin cookies (Cloudflare Web Analytics): exige añadirla al CSP

**Producto**
- [ ] «Ya la he visto»: Umber no la vuelve a recomendar
- [ ] Compartir una recomendación
- [ ] Explorar: que la vista inicial no sea una pared de terror (decidir cómo)
- [ ] Instalable en el móvil (PWA)

### Diseño y rendimiento (2026-10-04)

- [x] **Rediseño «Noche de otoño»**, elegido frente a una versión clara con una
      maqueta de las dos. Misma identidad oscura, menos negra, con ámbar para la
      acción y musgo y mostaza de acento; piezas comunes en `global.css`. Ver
      «Estética» en `CLAUDE.md`
- [x] **Portada nueva, la acción primero**: «¿Qué te apetece ver hoy?» con el
      cuadro de texto, Película/Serie y sugerencias; envía a
      `/chat?mode=…&q=…` (sin JavaScript también) y el chat arranca con ese
      mensaje. «Cómo funciona» en tres pasos y una fila del catálogo. Antes no
      había ninguna acción visible sin bajar, la mitad de los modos eran
      «Próximamente» y el fondo aleatorio sacó una escena de miedo detrás de
      «Cuéntale cómo te sientes»: ahora tres carteles en abanico, de dramas y
      romances otoñales (sin terror, fantasía, misterio ni infantil)
- [x] Chat, explorar, ficha, favoritos, conversaciones, entrar y registro con
      el mismo lenguaje: Umber con avatar de hoja, controles segmentados,
      tarjetas, estados vacíos con una acción
- [x] **Peso**, medido sobre el build con Chromium y sin caché:

      | | Antes | Después |
      |---|---|---|
      | Fuentes, en cada página | 391 kB, 8 archivos | 70 kB, 2 |
      | Carteles de `/explorar` | 1.272 kB | 475 kB |
      | `/entrar` entero | 449 kB | 119 kB |
      | Portada entera | 551 kB | 338 kB |

      Fuentes solo en `latin` y con los pesos que se usan; carteles con
      `srcset` (`w185`/`w342`); sin backdrop `original`. LCP más bajo en todas
      y CLS 0. Probado sin violaciones de CSP, y con los tests del chat, los
      límites y el borrado de conversaciones

### Fallos de la revisión (2026-10-04)

Revisión del proyecto entero; arreglados los fallos de lógica y de interfaz y lo
que era de una o dos líneas. Lo demás queda en sus secciones.

- [x] **Turno forzado sin salida**: con 4 preguntas seguidas, DeepSeek llamaba a
      veces a `buscar_por_titulo` en vez de buscar por ánimo; no contaba como
      búsqueda y el turno siguiente volvía a forzarse. Ahora ese turno solo
      ofrece `buscar_titulos` (`turnToolsFor` en `src/lib/turns.ts`) y, como
      DeepSeek puede llamar a una herramienta que no se le ofreció, el servidor
      la trata como búsqueda por ánimo. Probado dos veces: guarda la búsqueda y
      recomienda
- [x] **Una búsqueda sin resultados** ya no se le presenta al modelo como «quedan
      0 candidatos, saca otra»: le pide otro ángulo o buscar con otras palabras
- [x] El resumen de la búsqueda va entrecomillado y sin `«»` en el contexto del
      modelo: lo escribió el propio modelo a partir de lo que dijo la persona
- [x] `buscar_por_titulo` con «Título/Otro título» (barra sin espacios) prueba
      las dos variantes además del texto entero
- [x] El log de títulos que no vienen de una búsqueda dice cuáles son
- [x] **Sugerencia de la portada**: con texto escrito, pulsar una sugerencia
      enviaba lo escrito. Ahora el chat toma el último `q` no vacío, que es el
      del botón
- [x] **«Entrar» desde el chat** llevaba el `q` en `next` y, al volver, reenviaba
      el primer mensaje: `returnPath()` en `src/lib/auth.ts` lo quita
- [x] **Errores del chat con salida** (`recoveryFor` en `src/scripts/chat.ts`):
      «Reintentar» solo si repetir puede servir; con la sesión caducada,
      «Entrar de nuevo» de vuelta a la conversación; con una conversación que ya
      no existe, «Empezar una nueva». Al mandar otro mensaje, el «Reintentar» de
      antes desaparece
- [x] **`load-db.py --prune`** borraba en cascada favoritos de usuarios. Ahora se
      para sin borrar nada y dice qué títulos guardó alguien; hace falta
      `--drop-favorites`
- [x] Foco visible en el cuadro de la portada; anillo en la opción elegida del
      control segmentado (después, con el rediseño, pestañas con línea)
- [x] Probado sobre el build: sugerencia frente a texto escrito, sin conexión,
      mensaje nuevo tras un error y sesión caducada, en Chromium; la parada de
      `--prune` con un favorito de un usuario temporal; y sin regresiones en
      CSP, chat, límites y los 17 casos de `check:guardrails`

### Rediseño editorial (2026-10-04)

Pedido: que no parezca una plantilla generada, con paleta madura y un solo
acento, asimetría y ritmo editorial, tipografías cuidadas, transiciones suaves,
responsive y otoñal sin ser infantil. Detalle en «Estética» de `CLAUDE.md`.

- [x] **Tipografía**: Newsreader (titular fino con cursiva, y un corte de
      lectura para lo que dice Umber) y Schibsted Grotesk para la interfaz, en
      vez de Playfair e Inter, que son las de cualquier plantilla. Elegidas
      comparando cinco parejas renderizadas sobre el fondo oscuro
- [x] **Un solo acento**: fuera el musgo y la mostaza. El ámbar queda para la
      acción, lo elegido y los títulos que recomienda Umber
- [x] **Portada**: titular grande, el cuadro, un fotograma etalonado con su
      cartel montado encima; «Cómo funciona» en dos columnas con numeración
      romana; una frase de Umber como cita; y un índice tipográfico de seis
      títulos cuyo cartel cambia al señalarlos. El escaparate son películas de
      drama y romance otoñales (`src/lib/showcase.ts`): las series y las
      comedias sacaban carteles chillones
- [x] **Chat**: Umber escribe en serif de lectura y sin burbuja, como una carta;
      fichas a todo el ancho, con las plataformas en una línea; el cuadro fijo
      se funde con el fondo
- [x] **Explorar, ficha, favoritos, conversaciones y cuenta** con la misma
      composición: cabecera asimétrica, filetes, campos de línea, pestañas con
      línea ámbar. La ficha, con el fotograma a sangre y la ficha técnica como
      unos créditos; entrar y registrarse, con un fotograma al lado
- [x] **Movimiento**: entradas escalonadas, fotogramas que se revelan,
      secciones que aparecen al hacer scroll (CSS, sin JavaScript), fundido
      entre páginas y el cartel que viaja de la rejilla a la ficha. Todo se
      apaga con «reducir movimiento»
- [x] Grano de película, favicon con la hoja (era el de Astro)
- [x] Probado sobre el build: sin violaciones de CSP en ninguna página; chat,
      errores del chat y límites sin regresiones; transición del cartel, índice
      de la portada con ratón y teclado, y movimiento reducido. Capturas a 390 y
      1280 px de todas las pantallas
- [x] **Peso**, sin caché: fuentes 149 kB en las páginas con texto de lectura
      (eran 70; la de lectura no se baja en entrar ni registro, 92 kB). Imágenes
      de `/explorar`, 492 kB, como antes; portada, unos 340 kB, con el
      fotograma. LCP en local entre 0,04 y 0,4 s
- [ ] **Explorar, vista inicial**: con «Más otoñales» la primera página es
      Halloween, Scooby-Doo y Halloweentown, justo lo infantil que el diseño
      evita. Decidir cómo (ver «Producto completo»)

### Responsive y accesibilidad

- [ ] Repasar las tres pantallas en móvil, tablet y escritorio
- [x] Contraste de la paleta contra WCAG AA (calculado, 2026-10-04, tras el
      rediseño): crema 15:1, ceniza 7:1, ámbar 6,8:1. La pestaña elegida se
      distingue por color y por una línea ámbar (6,8:1); con colores forzados,
      subrayada
- [x] **Bordes de los campos**: eran `umber-line`, a 1,3:1. Ahora los campos
      llevan solo la línea de abajo, en `umber-rule` (3,4:1); WCAG 1.4.11 pide
      3:1 en lo que identifica un control
- [ ] Navegación completa por teclado y lector de pantalla. Ya hay enlace
      «Saltar al contenido». **Revisión del 2026-10-04**: la lista entera del
      chat es región `aria-live` y su HTML se rehace en cada fotograma, así que
      NVDA o JAWS pueden releer la respuesta; mejor una región aparte que anuncie
      el estado y la respuesta final una vez. Además: el foco se pierde al
      ocultarse «Detener», «Reintentar» o el cuadro de texto; en `/explorar`,
      las flechas de un desplegable navegan; el cuadro fijo del chat tapa lo que
      recibe el foco; las respuestas en inglés no llevan `lang`. Falta probarlo
      con VoiceOver o NVDA
- [x] Textos alternativos: los carteles llevan «Cartel de <título>». El backdrop
      de la portada es decorativo (`alt=""`) y su título va escrito al pie

### i18n

- [ ] Español e inglés. `src/lib/types.ts` ya tiene `LOCALES`, `Locale` y
      `DEFAULT_LOCALE`
- [ ] Umber ya responde en el idioma de la persona: lo detecta el servidor
      (Fase 4). Falta traducir la interfaz
- [x] Usar `title_en` y `synopsis_en` del corpus cuando el idioma sea inglés:
      hecho en la Fase 4 para el chat y sus fichas. Queda `/favoritos`, que
      muestra el título español
- [x] Ajustar la región de streaming de TMDB según el idioma, en vez de `ES`
      fijo: el chat, `/favoritos` y `/api/tmdb` ya la sacan de `Accept-Language`
- [x] **Encontrar un título por su nombre en español** (2026-10-03). Eran dos
      fallos:
      1. **El texto vectorizado** solo llevaba el título inglés. Ahora
         `document_text()` añade el español cuando es otro (3.944 de 5.000).
         Corpus revectorizado en Cloudflare (124 lotes, gratis) y recargado.
         Búsqueda exacta, puesto del título antes → después: «El padrino» 72 → 3,
         «Cadena perpetua» 225 → 9, «Perdida» 45 → 2, «El silencio de los
         corderos» 17 → 1; los títulos ingleses siguen en el 1. En las búsquedas
         por ánimo con resúmenes en inglés (lo que usa el chat) coinciden 7,1 de
         cada 10 resultados, sin empeorar a ojo
      2. **Umber no llegaba a buscar.** `system.md` le pedía decir «no lo tengo»
         de cualquier título que no le hubiera dado una búsqueda, y en los dos
         primeros turnos no puede buscar. Ahora tiene `buscar_por_titulo`, en
         cualquier turno (ver la Fase 4). Probado con el chat: *El padrino*,
         *Cadena perpetua*, *Perdida*, *The Godfather* y *Stranger Things*
         encontrados, también como primer mensaje; *Titanic*, que no está, lo
         dice y sigue preguntando
- [x] **Índice HNSW tras la recarga.** Actualizar casi todo el corpus degradó el
      grafo: devolvía el 92,5 % de los 10 mejores frente a la búsqueda exacta, y
      se dejaba *La llegada* buscando «La llegada». `REINDEX` (de 70 a 39 MB) lo
      subió al 94 %, y `ef_search` 100 en `search_content`, al 97,5 %; las
      búsquedas por ánimo, al 100 %. Medido en 20 consultas

### Correo de la cuenta (2026-10-04)

A raíz de una pregunta del usuario («¿la confirmación por correo no tiene un
límite?»). Tiene varios, y uno bloquea el lanzamiento:

- **El correo que trae Supabase es solo para pruebas**: 2 correos por hora en
  todo el proyecto (no por persona), sin forma de subirlo, y **solo entrega a
  las direcciones del equipo del proyecto**. A cualquier otra falla con
  `email_address_not_authorized`: hoy, alguien de fuera que se registre no
  recibe el enlace y ve «No se ha podido completar»
- **El enlace caduca a la hora** (*Email OTP Expiration*, en Authentication →
  Sign In / Providers → Email; se puede subir hasta 24 horas). Abierto caducado
  o ya usado, `/auth/confirm` manda a `/entrar?error=enlace`, pero no hay forma
  de pedir otro
- **Límites de Supabase por IP y por persona**, que se quedan como están: 30
  registros o entradas cada 5 minutos por IP, 30 verificaciones cada 5 minutos
  por IP y 60 s entre dos correos a la misma persona
  (`over_email_send_rate_limit`, que ya tiene mensaje). Con un SMTP propio, el
  tope por hora pasa a 30 y se cambia en Authentication → Rate Limits
- `supabase/config.toml` solo vale para el Supabase local: nada de lo de arriba
  sale de ahí. No usar `supabase config push`, que pisaría la configuración de
  Auth del proyecto remoto

**Sin servidores ni gastos fijos** (el usuario, el 2026-10-04: «eso tiene un
coste y dijimos que no»). Un «SMTP propio» no es un servidor: es darle a
Supabase el usuario y la contraseña de un servicio de correo que ya existe, para
que envíe con él.

- [x] **Una cuenta de Gmail solo para Umber como SMTP** (2026-10-10,
      Authentication → Emails → SMTP Settings): verificación en dos pasos,
      contraseña de aplicación, `smtp.gmail.com`, puerto 465, remitente la propia
      dirección (Gmail cambia cualquier otra). Probado con un email externo (no
      del equipo): llega bien. Pendiente, más adelante: una plantilla de email
      menos básica que la que trae Supabase por defecto
- [x] **Entrar con Google** (ver arriba): no necesita correo de confirmación,
      porque Google ya ha comprobado el email. Completa lo de Gmail, no lo
      sustituye: recuperar la contraseña también envía un correo
- [ ] Reenviar el correo, mensajes de envío en español y límite propio en
      `/entrar` y `/registro`: en «Cuenta», arriba. Son código y no cuestan nada

**Site URL / Redirect URLs** (2026-10-10): con el SMTP ya probado, el enlace
redirigía a `umber365.vercel.app` con el puerto y la ruta equivocados —
Authentication → URL Configuration tenía el *Site URL* por defecto
(`localhost:3000`) y `/auth/confirm` no estaba en *Redirect URLs*. Un enlace
fuera de esa lista cae al *Site URL* en vez de al `emailRedirectTo` que manda
la app. Corregido: *Site URL* a `https://umber365.vercel.app`, y
`https://umber365.vercel.app/auth/confirm` + `http://localhost:4321/auth/confirm`
en *Redirect URLs*. El código ya construye el `emailRedirectTo` con
`Astro.url.origin` (no con una URL fija), así que no hizo falta tocarlo

Descartado:

- **Resend o Brevo sin dominio**: Resend solo envía a tu propia dirección, y con
  Brevo los correos suelen acabar en spam
- **Quitar la confirmación**: cualquiera podría registrarse con un email ajeno, y
  recuperar la contraseña seguiría necesitando correo
- **Dominio propio** (10–15 €/año): es un gasto fijo. Solo si el usuario lo decide

### Despliegue

- [ ] Proyecto de Vercel conectado al repositorio
- [ ] Variables de entorno en producción. El build falla si falta alguna
      obligatoria, que es justo el comportamiento que queremos
- [ ] `PUBLIC_APP_URL` apuntando al dominio real
- [ ] **Auth de Supabase apuntando solo a producción** (Authentication → URL
      Configuration): *Site URL* `https://<dominio>` y en *Redirect URLs*
      `https://<dominio>/auth/confirm`. Nada de `localhost` en este proyecto:
      `registro.astro` pide volver a `${Astro.url.origin}/auth/confirm`, y
      Supabase solo lo respeta si está en la lista. Para desarrollar con registro
      en local, un proyecto de Supabase aparte
- [ ] Plantilla *Confirm signup* con
      `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`: con la
      de por defecto (`?code=`), el enlace solo funciona en el navegador del
      registro
- [ ] **SMTP propio** (Authentication → Emails → SMTP Settings). El correo por
      defecto de Supabase es para pruebas: 2 correos por hora y solo al equipo
      del proyecto. Con qué, en «Correo de la cuenta»
- [ ] Probar un registro de punta a punta con un email real, ya en producción
- [x] **Servicio de embeddings en producción: Cloudflare Workers AI**
      (`@cf/qwen/qwen3-embedding-0.6b`), por su API compatible con la de OpenAI.
      Gratis hasta 10.000 neuronas al día (el modelo gasta 1.075 por millón de
      tokens: unos 90.000 mensajes del chat); al pasarse, falla en vez de cobrar.
      **Da los mismos vectores que el corpus**: similitud 1,000000 en 20
      documentos y en 3 consultas con nuestra instrucción (no añade la suya), y el
      mismo top 10 en el mismo orden. No hay que reindexar
- [x] El nombre del modelo va en `EMBEDDINGS_MODEL` (el servidor local lo llama
      `Qwen/Qwen3-Embedding-0.6B`); `.env.local` ya apunta a Cloudflare y el
      servidor local queda para trabajar sin conexión.
      `scripts/seed/check-embeddings.py` comprueba cualquier servicio antes de
      usarlo
- [x] **Latencia de Cloudflare medida y aceptada** (decisión de producto). La red
      no es el problema (179 ms de mediana, desde Madrid); lo lento es la
      inferencia. Una consulta por minuto durante una hora (60): mediana 1,2 s,
      el 25 % por encima de 3,0 s, el 10 % por encima de 5,8 s, máximo 9,2 s,
      **0 errores**. Primer byte del chat con mensajes nuevos: mediana 5,0 s
      (1,9–7,4 s), frente a 1,9 s con el servidor local. El cliente espera ahora
      hasta 15 s por consulta (antes 10): en una ráfaga anterior hubo una de 11,7 s
- [ ] `EMBEDDINGS_URL`, `EMBEDDINGS_API_KEY` y `EMBEDDINGS_MODEL` en Vercel
- [ ] Comprobar que el despliegue de vista previa de Vercel también alcanza ese
      servicio

### Seguridad

- [x] **CSP y cabeceras de seguridad** (2026-10-03). CSP con `security.csp` de
      Astro: hashes de scripts y estilos propios, imágenes solo de
      `image.tmdb.org`, `frame-ancestors 'none'`. El middleware añade
      `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`. Probado
      sobre el build con Chromium: las seis páginas sin ninguna violación, y un
      script en línea y una imagen externa inyectados a propósito, bloqueados
- [ ] Comprobar en el despliegue de vista previa: la barra de Vercel
      (`vercel.live`) es un script externo y el CSP la bloqueará. No afecta a la
      web, pero ensuciará la consola

### Operación

- [x] Rate limiting en `/api/chat`: hecho en la [Fase 4](fase-4-api-chat.md),
      por usuario o por IP (`src/lib/rate-limit.ts`)
- [x] `SUPABASE_SECRET_KEY` en las variables de Vercel, que el rate limiting del
      chat necesita
- [x] **Región de las funciones de Vercel junto a Supabase** (`eu-west-1`,
      Irlanda: `dub1`), en `vercel.json` (2026-10-03). Al desplegar, comprobar
      en los logs de la función que corre en `dub1`; si no, se elige en Project
      Settings → Functions. Por defecto Vercel las pone en `iad1` (Washington). Cada
      mensaje del chat hace al menos tres viajes a Supabase antes del primer token
      (rate limit, búsqueda, caché de plataformas), y desde local ya cuestan unos
      120 ms cada uno. En `iad1` los tres cruzarían el Atlántico, con el primer
      byte ya en el límite de los 2 s (ver la tabla de la Fase 4)
- [ ] Alguna forma de ver los errores en producción, aunque sea los logs de
      Vercel
- [x] **Tope global de gasto de DeepSeek** (2026-10-03): 300 mensajes al día
      entre todos (`chat:global` en `src/lib/rate-limit.ts`), unos 0,30 USD como
      mucho. Solo cuenta lo que cabe en el límite de cada persona: si contara lo
      rechazado, una sola IP insistiendo agotaría el cupo de todos. Por persona,
      50 al día con cuenta y una conversación de prueba (20) sin ella: ninguna
      sola agota el cupo global (ver la Fase 4)
- [x] **Tope global de `/api/search`** (2026-10-04): 5.000 búsquedas al día entre
      todos. No gasta DeepSeek, pero sí la cuota gratuita de Cloudflare que
      comparte con el chat: sin tope, muchas IPs buscando podían dejar el chat
      sin embeddings
- [ ] Vigilar el gasto de DeepSeek. `deepseek-flash` es barato, pero el coste va
      por conversación. El endpoint
      `/user/balance` de DeepSeek sirve para consultarlo por API. A 2026-09-30 la
      cuenta tiene 9,58 USD, tras recargar; el 2026-10-04, tras el corpus general de la Fase 8, 7,48 USD,
      y tras las pruebas del recomendador (bloque C), 6,91 USD. Repuntuar el corpus entero (3 pasadas)
      costó unos 1,20 USD

## Decisiones tomadas

| Decisión | Motivo |
|---|---|
| `output: 'server'` con adaptador de Vercel | El chat necesita streaming en servidor. La portada podría prerenderizarse más adelante si interesa |
| Fuentes autoalojadas | Sin terceros, sin salto de fuente y una petición externa menos |
| **Sin gastos fijos**: Vercel Hobby, Supabase Free, subdominio `vercel.app` y un SMTP con plan gratuito. Solo se paga DeepSeek, por uso | Decisión de producto. El plan Hobby de Vercel es para uso no comercial |
| **Ni servidores ni dominio de pago, tampoco para el correo** (2026-10-04) | Decisión de producto, reafirmada al hablar del correo de la cuenta. El correo, con un servicio gratuito sin dominio (propuesta: Gmail, ver «Correo de la cuenta»). Si un día hace falta pagar algo, se dice y se deja para después |
| **Correo de la cuenta con Gmail como SMTP**, aprobada y montada (2026-10-10) | El mailer de Supabase por defecto (2/hora, solo al equipo) no sirve para gente real; Resend y Brevo sin dominio quedaban descartados (ver «Correo de la cuenta»). Probado con un email externo al equipo: llega bien |
| **Embeddings en Cloudflare Workers AI**, gratis, aceptando su latencia | El mismo modelo, con vectores idénticos a los del corpus: no hay que reindexar ni mantener un servidor, no se duerme y al pasarse del límite gratuito falla en vez de cobrar. Descartados: un servicio de pago (decisión de producto); un Space de Hugging Face, que desde julio de 2026 exige PRO (9 $/mes) para Docker y Gradio en CPU; el modelo que Supabase ejecuta gratis (gte-small), que solo entiende inglés y obligaría a reindexar. Se acepta la latencia (mediana de 1,2 s por consulta, picos de varios segundos) a cambio de no mantener nada. Si algún día molesta, dos alternativas gratuitas, en este orden: **`@cf/baai/bge-m3` en el mismo Cloudflare** (99 ms de mediana y 186 de máximo en 12 muestras; multilingüe y de 1024 dimensiones, pero obliga a revectorizar el corpus y recalibrar la búsqueda), o una **VM de Oracle Cloud «Always Free»** en Madrid con `server.py` (2 CPU ARM y 12 GB; se estima entre 0,3 y 1 s por consulta en CPU, sin medir; pide tarjeta, que no se cobra sin pasar a pago, y Oracle recupera las máquinas inactivas 7 días) |

## Preguntas abiertas

**1. ~~¿Dónde corre el servicio de embeddings en producción?~~** Resuelta el
2026-09-30 con un Space de Hugging Face y cambiada después: en Cloudflare Workers
AI, gratis (ver Decisiones).

**2. ¿Región de despliegue?**
El público objetivo es España. Conviene que la función de Vercel, el proyecto de
Supabase y el servicio de embeddings estén en la misma región europea: cada salto
transatlántico se suma antes del primer token que ve el usuario.

**3. ~~¿Correo de la cuenta con una cuenta de Gmail como SMTP?~~** Resuelta el
2026-10-10: sí, montada y probada con un email externo al equipo (ver
Decisiones).

## Verificación

- Umber funciona en producción de punta a punta: mensaje, búsqueda, respuesta en
  streaming y guardado
- Contraste AA verificado con herramienta, no a ojo
- La interfaz cambia de idioma y Umber responde en el mismo
- Ningún secreto en el bundle de cliente, comprobado sobre el build de producción
