# Hyperframes Composition Brief: Umber

## Objective
Vídeo corto de lanzamiento de Umber, el cinéfilo con IA.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 25 s

## Source Material
- Project root: el repositorio de Umber (Astro + Tailwind)
- Primary files read: `src/pages/index.astro`, `src/components/ChatMessage.astro`, `src/components/ContentCard.astro`, `src/components/LeafMark.astro`, `src/styles/global.css`, `astro.config.mjs`, `.claude/CLAUDE.md`
- Product name: Umber
- Tagline: «Tu cinéfilo de confianza»
- Key UI to recreate: el `composer` de la portada, el chat como guion (`ChatMessage`) y la ficha (`ContentCard`)
- Copy verbatim:
  - «Tu cinéfilo de confianza»
  - «¿Qué te apetece ver hoy?» (hoy en cursiva)
  - «Hoy no tengo el día y me apetece algo que abrace…»
  - «Pedir recomendación»
  - «¿Te apetece algo que te acompañe en el bajón, o algo que te saque de él?»
  - «Una película cada día» (cada día en cursiva)
  - «Adivínala por su cartel, cada vez menos desenfocado»
  - «Dónde verla»

## Creative Direction
- Tone preset: polished — el programa de mano de una filmoteca, animado
- Hook: el titular de la portada a toda escala
- Outro: «Umber» con el punto rojo sobre noche
- Avoid: lenguaje SaaS genérico, relleno abstracto, degradados, sombras, esquinas redondeadas (salvo 3 px en carteles)

## Visual Identity
- Papel #F3EEE5, superficie #EBE4D8, filetes #CFC6B8, borde de control #8A8073, tinta #16130F, secundario #5E564C, rojo #B8321C
- Noche (outro): base #14110E, tinta #EDE6DA, rojo #E8664C
- Fuentes locales en `assets/fonts/`: Instrument Serif (titulares), Newsreader (lo que se dice), Archivo y Archivo estrecha (rótulos en mayúsculas, tracking 0.16em)
- Grano: `assets/img/grain.svg` al 4 %
- Carteles reales de TMDB en `assets/img/` (Intocable; El viaje de Chihiro para el juego)

## Storyboard
Ver `brag-plan.md`. 1) Portada 0–3.5 · 2) Conversación 3.5–13.1 · 3) Recomendación 13.1–18.5 · 4) Juegos 18.5–22.6 · 5) Outro 22.6–25.

## Audio
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`, 0.3, fundido final
- Cues: 13.11 (ficha), 18.56 (juegos), 22.93 (marca); rejilla 19.66/20.75/21.84 para el cartel
- SFX: pocos y suaves (teclas, clic, caída, campana), según `sfx-analysis.md`
- Audio-reactive: sutil (el punto rojo de la marca)
