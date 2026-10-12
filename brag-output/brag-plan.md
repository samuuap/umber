# Brag Plan: Umber

## What is this app?
Un cinéfilo con IA: le cuentas cómo estás, te pregunta lo justo y te recomienda una película o una serie de un corpus real de ~16.000 títulos, con el porqué y dónde verla. Y dos juegos diarios de cine.

## The angle
No es un buscador ni un catálogo: es una conversación. El vídeo es esa conversación, en la tipografía de «Programa de mano» (papel, tinta, un solo rojo): alguien escribe que no tiene el día, Umber pregunta una sola cosa, y responde con una película real y dónde verla.

## Hook (first 2-3 seconds)
El titular de la portada, a toda escala sobre papel: «¿Qué te apetece ver *hoy*?», con el rótulo rojo «TU CINÉFILO DE CONFIANZA» encima.

## Key moments (the middle)
- El cuadro de la portada (`composer`) escribiendo, letra a letra, su propio placeholder: «Hoy no tengo el día y me apetece algo que abrace…», y el clic en «PEDIR RECOMENDACIÓN».
- Umber pregunta, con su hoja y su nombre en rojo: «¿Te apetece algo que te acompañe en el bajón, o algo que te saque de él?» (la cita de la portada). Tú: «Que me saque de él.»
- La recomendación: **Intocable** en rojo y la ficha real (`ContentCard`): cartel, Película, 2011, Dirección: Éric Toledano, Olivier Nakache, Drama · Comedia, «Dónde verla: Amazon Prime Video · Acontra Plus».
- Los juegos: «Una película *cada día*», un cartel que se desenfoca menos en cada intento.

## Outro / punchline
Cambio a modo noche (los tokens oscuros): «Umber» con el punto rojo, y «Tu cinéfilo de confianza».

## User flow worth showing
Escribir cómo estás → Umber pregunta lo justo → recomienda una, con el porqué y la plataforma.

## Tone
- Preset: polished
- Creative direction: el programa de mano de una filmoteca, animado
- Interpretation: pocas escenas, holds largos, fundidos suaves; el texto se escribe y se queda. Nada de cortes duros ni de exclamaciones.

## Format: landscape — 1920x1080
## Duration: 25s (lo que piden la conversación y los juegos; cierra en el golpe fuerte de 22,93 s)

## Visual identity (from the project)
- Background: #F3EEE5 (papel); outro #14110E (noche)
- Accent: #B8321C (claro) / #E8664C (oscuro)
- Text: #16130F; secundario #5E564C; filetes #CFC6B8; superficie #EBE4D8
- Display font: Instrument Serif (400 y cursiva)
- Body font: Newsreader (lo que se dice), Archivo y Archivo estrecha en mayúsculas (rótulos y botones)
- Strongest visual element: los titulares enormes en serif con una palabra en cursiva, y el grano de papel

## Share copy (draft)
Umber: le cuentas cómo estás y te recomienda una película o una serie, con el porqué y dónde verla. Sin catálogo infinito.

## Audio direction
- Role: warm bed, sparse professional accents
- Music: happy-beats-business-moves-vol-12 (estable y limpia; para `polished`)
- Music treatment: entra suave, volumen 0.3, fundido al final del outro
- Music cue guidance: preset `assets/music/cues/…vol-12….music-cues.json`, 110 BPM. Golpes fuertes: 13.11 (la recomendación), 18.56 (los juegos), 22.93 (el outro). Rejilla para los intentos del cartel: 19.66, 20.75, 21.84 (uno cada dos pulsos: son imagen, no texto)
- Audio-reactive treatment: sutil; el rojo del punto de la marca y el grano respiran con la música, nada más
- SFX posture: sparse; teclas suaves al escribir, un clic en el botón, una caída suave al llegar la ficha, una campana en el outro
- Audio-coupled moments: el tecleo del cuadro, el clic, la ficha, el logotipo
- Restraint rule: nada agresivo; ningún sonido por encima de la música salvo el clic y la campana final

## Storyboard

### Scene 1 — Portada — 0–3.5s (3.5s)
Rótulo rojo «TU CINÉFILO DE CONFIANZA» y titular «¿Qué te apetece ver *hoy*?» suben (`rise`), y se quedan.
Sequential/interaction: rótulo, luego titular (dos líneas)
Audio intent: la música entra
Transition mood: soft → Scene 2 (el titular sube y se encoge, aparece el cuadro debajo)

### Scene 2 — La conversación — 3.5–13.1s (9.6s)
El `composer` (pestañas «Busco una película / una serie», línea gruesa arriba): se escribe «Hoy no tengo el día y me apetece algo que abrace…»; clic en «PEDIR RECOMENDACIÓN». Pasa a la vista de chat como un guion: «TÚ» y el texto; filete; hoja + «UMBER» en rojo, «Pensando…» y la pregunta. «TÚ»: «Que me saque de él.»
Sequential/interaction: tecleo (~1,8 s), clic, tres intervenciones una a una, cada una con su hold (la pregunta, 14 palabras: ≥4 s)
Audio intent: íntimo; teclas suaves y un clic
Transition mood: soft → Scene 3

### Scene 3 — La recomendación — 13.1–18.5s (5.4s)
Umber: «Te propongo **Intocable**: una amistad imposible que te va a sacar más de una carcajada.» y la ficha llega debajo: cartel, datos, «Dónde verla».
Sequential/interaction: la respuesta, luego la ficha (beat-locked 13.11)
Audio intent: la llegada; una caída suave
Transition mood: soft crossfade → Scene 4

### Scene 4 — Los juegos — 18.5–22.6s (4.1s)
Rótulo «JUEGOS», «Una película *cada día*», «Adivínala por su cartel, cada vez menos desenfocado». Al lado, un cartel muy desenfocado que se aclara en tres intentos.
Sequential/interaction: tres pasos de desenfoque en la rejilla
Transition mood: dip a noche → Scene 5

### Scene 5 — Outro — 22.6–25s (2.4s)
Fondo noche. «Umber» en Instrument Serif con el punto rojo (beat-locked 22.93), «Tu cinéfilo de confianza» debajo. Fundido de la música.

**Music mood for this video:** warm, steady
**Audio summary:** una base cálida que acompaña la conversación, tres acentos discretos y una campana en la marca.

Nota: la conversación es ilustrativa (un ejemplo de cómo habla Umber); la película, sus datos y sus plataformas en España son reales, del corpus y de TMDB.
