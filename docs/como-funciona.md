# Cómo busca Umber una película a partir de la conversación

Umber es un chat que recomienda películas y series. Primero hace unas preguntas
y, con las respuestas, busca en su catálogo de unos 16.000 títulos **por
significado**, no por palabras clave. Este documento explica ese paso, de las
respuestas a la recomendación, pensando en aplicarlo a un buscador de destinos
de viaje.

```
1. Preguntas        Umber pregunta 3–5 cosas: ánimo, compañía, gustos…
2. Resumen          El modelo de chat convierte las respuestas en una búsqueda: resumen + filtros
3. Búsqueda         El resumen se vectoriza y se buscan las fichas del catálogo más parecidas
4. Recomendación    El modelo de chat recibe los 10 mejores, elige uno y explica por qué
```

---

## 1. Las preguntas

Umber pregunta antes de buscar: por el ánimo, con quién va a verla, algo que le
haya encantado, si la quiere conocida o no. Cada pregunta trae 2 o 3 respuestas
para pulsar («Algo que me haga reír», «Una que me deje pensando»), pero la
persona puede escribir lo que quiera.

El número de preguntas **no se deja a la buena voluntad del modelo**: lo impone
el servidor.

- Con menos de 3 preguntas hechas, el servidor no le ofrece la herramienta de
  búsqueda, así que el modelo no puede buscar todavía.
- A partir de la tercera, puede buscar cuando lo vea claro.
- A la quinta, el servidor le obliga a buscar.
- Si la persona dice «sorpréndeme» o «sin preguntas», se salta el mínimo.

**En viajes**, las preguntas serían del tipo: ¿con quién viajas? ¿qué te
apetece, desconectar o moverte mucho? ¿algún viaje que te encantara?

---

## 2. De las respuestas a una búsqueda

Esta es la clave: **no se busca con lo que ha escrito la persona tal cual.**
Respuestas como «sí», «con mi pareja» o «la segunda» no le dicen nada a un
buscador. Cuando el modelo de chat (DeepSeek) decide que ya sabe lo que quiere,
llama a una herramienta (*function calling*) que se llama `buscar_titulos`, con
dos cosas:

- **Un resumen** de una o dos frases que junta todas las respuestas: tono, ritmo,
  temas y con quién la ve. Va **en inglés**, porque las fichas del catálogo están
  en inglés. Lo que la persona no quiere se escribe en positivo: en vez de «nada
  de terror», *«something calm and gentle»*. Al buscar por parecido, la palabra
  «terror» acercaría justo lo que no quiere.
- **Filtros**, solo los que la persona ha pedido de forma explícita: género,
  época, duración máxima, idioma, director o actor, y si la quiere conocida o
  poco vista. El modelo no puede inventarse filtros: son condiciones que se
  cumplen sí o sí.

Un ejemplo:

```
Umber:    ¿Cómo llegas hoy?                      Persona: Cansada, semana horrible
Umber:    ¿La ves sola o acompañada?             Persona: Con mi pareja
Umber:    ¿Alguna que os encantara?              Persona: Amélie
Umber:    ¿Os vale cualquier época?              Persona: Mejor algo reciente, y que no sea larga
```

Con eso, el modelo llama a la herramienta así:

```json
{
  "resumen": "A warm, light and charming film for a tired couple to unwind with, whimsical and feel-good like Amélie, nothing heavy",
  "desde_anio": 2015,
  "duracion_maxima": 120
}
```

Lo subjetivo («cálida, ligera, como Amélie») va en el resumen. Lo que es un dato
exacto («reciente», «que no sea larga») va en los filtros.

Si la llamada llega mal formada, se busca con los últimos tres mensajes de la
persona. Una búsqueda peor es mejor que un error.

**En viajes**: resumen *«a relaxed coastal town for a couple, good food, slow
pace, not touristy»* y filtros de presupuesto, fechas o región.

---

## 3. Qué se vectorizó del catálogo

Para que el resumen pueda compararse con el catálogo, antes se convirtió cada
título en un vector, una sola vez y con un script. Se vectoriza **una ficha de
texto** por título, no la fila entera de la base de datos:

```
Amélie (2001). Spanish title: Amélie.
At a tiny Parisian café, the adorable yet painfully shy Amélie accidentally
discovers a gift for helping others…
Genres: Comedy, Romance. Keywords: paris, whimsical, shyness, …
```

- **Qué va en la ficha**: título, sinopsis, géneros y palabras clave, es decir,
  lo que describe cómo es la película. La duración, el año o los votos no van en
  la ficha: van en columnas aparte para poder filtrar.
- **En inglés**, con el título español cuando es distinto. El modelo es
  multilingüe y entiende consultas en español contra fichas en inglés.
- **Modelo**: Qwen3-Embedding-0.6B, abierto y gratuito. Da vectores de 1024
  números. El catálogo se vectorizó en local; las consultas se vectorizan con el
  mismo modelo en Cloudflare Workers AI, también gratis.
- **Dónde se guarda**: en PostgreSQL con la extensión pgvector (Supabase), en la
  misma tabla que el resto de datos del título, con un índice para buscar rápido
  entre miles de vectores.

**En viajes**, la ficha de un destino describiría la experiencia: *«Oporto,
Portugal. Ciudad atlántica de cuestas y azulejos, bodegas junto al río, comida
barata, ambiente bohemio. Etiquetas: vino, río, arquitectura, escapada,
pareja»*. El precio, el clima o la distancia irían en columnas para filtrar.

---

## 4. Cómo se recupera

Cuando llega el resumen:

1. **Se vectoriza el resumen.** Este modelo funciona mejor si la consulta lleva
   delante una instrucción que diga qué se busca (*«dada la descripción de lo
   que le apetece ver a alguien, encuentra una película que encaje con ese
   ánimo»*). Las fichas del catálogo se vectorizaron sin ella. Es como el modelo
   está entrenado, y sin la instrucción se pierde algo de precisión.
2. **La base de datos filtra y ordena por parecido** en una sola consulta.
   Descarta lo que no cumple los filtros y, de lo que queda, devuelve los 50
   vectores más cercanos al del resumen (similitud del coseno, de -1 a 1).
3. **Se limpia la lista**:
   - se quitan los que tienen un parecido por debajo de 0,30, que es solo ruido;
   - se quita lo ya recomendado en la conversación;
   - se quita lo que la persona ha dicho que ya ha visto (*Amélie* no vuelve como
     candidata).
4. **Se reordena** sumando un poco de popularidad al parecido
   (`parecido + 0,08 × popularidad`). Con el parecido solo, arriba salían
   películas que no conoce nadie.
5. **Si quedan menos de 3, se aflojan filtros** en este orden: popularidad,
   géneros, época y duración. Se le dice al modelo qué se quitó, para que lo
   cuente. Los filtros innegociables, como un director concreto o un idioma, no
   se quitan nunca: mejor decir «no tengo nada así».
6. **Se quedan los 10 mejores.**

---

## 5. De los resultados a la recomendación

Los 10 candidatos vuelven al modelo de chat. Cada uno lleva su ficha completa
(sinopsis, año, duración, nota, reparto y plataformas donde verla), junto con la
instrucción de recomendar **uno solo** y explicar por qué encaja con esta
persona ahora.

- **Solo puede recomendar de esa lista.** Si nombra un título que no venía en
  ella, el servidor lo detecta y lo registra.
- **El orden no manda.** La lista llega ordenada, pero se le pide que elija el
  que de verdad encaje. El vector acerca candidatos y el modelo, que entiende
  matices («pero que no sea triste»), decide.
- **«Dame otra»** no vuelve a buscar: el modelo elige otra de las 10 que le
  quedan. Solo busca de nuevo cuando se agotan o la persona cambia de idea, y
  entonces con un resumen actualizado.

---

## Llevarlo a viajes

| En Umber | En un buscador de destinos |
|---|---|
| Preguntas sobre ánimo, compañía y gustos | Con quién viajas, qué ritmo quieres, un viaje que te encantó |
| Resumen en inglés de lo que apetece | Resumen del viaje que quiere: tono, actividades, compañía |
| Filtros: época, duración, idioma, director | Filtros: presupuesto, fechas, región, distancia, clima |
| Ficha: sinopsis, géneros, palabras clave | Ficha: descripción, tipo de viaje, etiquetas |
| Reordenar con la popularidad | Reordenar con la valoración o las reseñas |
| El modelo elige 1 de 10 y explica por qué | El modelo elige 1 de 10 y explica por qué |

Lo que más importó en Umber:

1. **Buscar con un resumen de la conversación**, no con el último mensaje.
2. **Separar lo subjetivo de lo exacto**: lo subjetivo va al vector, y lo exacto
   a los filtros.
3. **Escribir buenas fichas**, con las palabras que usaría quien busca.
4. **Que la búsqueda acerque y el modelo decida**: el número de parecido sirve
   para ordenar, pero no para saber si algo encaja de verdad.
5. **Probar con una lista fija de búsquedas de control** cada vez que se cambia
   algo.

---

## Dónde está en el código

| Qué | Archivo |
|---|---|
| Cuántas preguntas y cuándo puede buscar | `src/lib/turns.ts` |
| La herramienta `buscar_titulos` (resumen y filtros) | `src/lib/chat.ts` (`SEARCH_TOOL`) |
| Las reglas que sigue el modelo | `src/prompts/system.md` |
| La ficha de cada título | `scripts/seed/common.py` (`document_text`) |
| Vectorizar la consulta | `src/lib/embeddings.ts` |
| Filtros, limpieza, reordenado y aflojar filtros | `src/lib/search.ts` |
| La consulta en la base de datos | `supabase/migrations/` (`search_content`) |
