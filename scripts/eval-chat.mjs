/**
 * Juego de pruebas del recomendador: 30 peticiones reales contra el chat de
 * verdad, de principio a fin (Fase 8, bloque C).
 *
 *   node scripts/eval-chat.mjs                                  # contra npm run dev (:4321)
 *   node scripts/eval-chat.mjs http://localhost:4329 --out a.json --reset-global
 *
 * Cada caso abre una conversación con su propio usuario de prueba (Admin API) y
 * hace la petición. A cada pregunta de Umber responde lo mismo, sin añadir nada:
 * así lo que cuenta es la petición. Una respuesta que acaba en pregunta no
 * cuenta como recomendación. Se queda con lo primero que recomiende y
 * mira dos cosas:
 *
 *  - **Lo que se puede comprobar solo**, con la ficha de la base: director o
 *    reparto, años, idioma original, duración, géneros, votos.
 *  - **Si encaja**, de 1 a 5, según `deepseek-v4-pro`: otro modelo que el del chat,
 *    para que no se puntúe a sí mismo.
 *
 * Cada caso son 3 a 5 mensajes: unos 120 del cupo global de 300 al día.
 * `--reset-global` borra antes el contador global del día: solo en local, con
 * datos de prueba. Borra los usuarios al terminar, y con ellos sus conversaciones.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);
const { SUPABASE_URL: SUPA, SUPABASE_PUBLISHABLE_KEY: ANON, SUPABASE_SECRET_KEY: SECRET, DEEPSEEK_API_KEY } = env;
const args = process.argv.slice(2);
const APP = (args.find((arg) => arg.startsWith('http')) ?? 'http://localhost:4321').replace(/\/$/, '');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
// Qué buscó en cada turno, de su traza: para entender un fallo.
const DEBUG = args.includes('--debug');
const CONCURRENCY = 5;
const MAX_TURNS = 6;
const REPLY = 'Me da igual, lo que te he dicho al principio.';
const JUDGE_MODEL = 'deepseek-v4-pro';

const supa = (path, { key = SECRET, token = key, method = 'GET', body } = {}) =>
  fetch(`${SUPA}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const fold = (text) => (text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const hasGenre = (row, ...names) => (row.genres ?? []).some((genre) => names.includes(genre));
const byPerson = (row, name) =>
  fold(row.director).includes(fold(name)) || (row.top_cast ?? []).some((actor) => fold(actor).includes(fold(name)));

/** [id, modo, petición, comprobaciones: [nombre, (ficha, contexto) => boolean]] */
const CASES = [
  ['wes-anderson', 'movie', 'Quiero algo de Wes Anderson', [['de Wes Anderson', (r) => fold(r.director).includes('wes anderson')]]],
  ['romcom-90', 'movie', 'Una comedia romántica de los 90', [['de los 90', (r) => r.year >= 1990 && r.year <= 1999], ['romántica o comedia', (r) => hasGenre(r, 'Romance', 'Comedia')]]],
  ['coreano', 'movie', 'Me apetece un thriller coreano', [['coreana', (r) => r.original_language === 'ko']]],
  ['corta', 'movie', 'Algo cortito, de menos de hora y media, para ver antes de dormir', [['dura ≤ 95 min', (r) => r.runtime !== null && r.runtime <= 95]]],
  ['meryl', 'movie', 'Una película con Meryl Streep', [['con Meryl Streep', (r) => byPerson(r, 'Meryl Streep')]]],
  ['como-interstellar', 'movie', 'Algo parecido a Interstellar', [['entre los parecidos de Interstellar', (r, ctx) => ctx.interstellarSimilar.has(r.id)]]],
  ['animacion-ninos', 'movie', 'Una peli de animación para ver con mis hijos pequeños', [['animación o familiar', (r) => hasGenre(r, 'Animación', 'Familia')]]],
  ['terror', 'movie', 'Algo de terror que dé miedo de verdad', [['de terror', (r) => hasGenre(r, 'Terror')]]],
  ['joya-scifi', 'movie', 'Una película poco conocida de ciencia ficción, una joya escondida', [['ciencia ficción', (r) => hasGenre(r, 'Ciencia ficción')], ['poco conocida (< 3.000 votos)', (r) => r.vote_count < 3000]]],
  ['blanco-negro', 'movie', 'Un clásico en blanco y negro', [['anterior a 1966', (r) => r.year <= 1965]]],
  ['espanola-reciente', 'movie', 'Una película española reciente', [['española', (r) => r.original_language === 'es'], ['de 2015 en adelante', (r) => r.year >= 2015]]],
  ['padrino-corta', 'movie', 'Algo como El padrino pero que no sea tan larga', [['crimen o drama', (r) => hasGenre(r, 'Crimen', 'Drama')], ['menos de 2 h 30', (r) => r.runtime !== null && r.runtime < 150]]],
  ['llorar', 'movie', 'Un drama que me haga llorar', [['drama', (r) => hasGenre(r, 'Drama')]]],
  ['serie-misterio', 'tv', 'Una serie de misterio que me enganche', [['serie', (r) => r.type === 'tv'], ['misterio o crimen', (r) => hasGenre(r, 'Misterio', 'Crimen')]]],
  ['miyazaki', 'movie', 'Algo de Hayao Miyazaki', [['de Miyazaki', (r) => fold(r.director).includes('miyazaki')]]],
  ['accion', 'movie', 'Una peli de acción palomitera para desconectar', [['acción', (r) => hasGenre(r, 'Acción')]]],
  ['documental', 'movie', 'Un documental interesante', [['documental', (r) => hasGenre(r, 'Documental')]]],
  ['francesa-romantica', 'movie', 'Algo francés y romántico', [['francesa', (r) => r.original_language === 'fr'], ['romántica', (r) => hasGenre(r, 'Romance')]]],
  ['aventuras-80', 'movie', 'Una peli de aventuras de los 80', [['de los 80', (r) => r.year >= 1980 && r.year <= 1989], ['aventura', (r) => hasGenre(r, 'Aventura')]]],
  ['comedia-conocida', 'movie', 'Una comedia muy conocida para ver con amigos', [['comedia', (r) => hasGenre(r, 'Comedia')], ['conocida (≥ 2.000 votos)', (r) => r.vote_count >= 2000]]],
  ['nolan', 'movie', 'Algo de Christopher Nolan que no sea Interstellar', [['de Nolan', (r) => fold(r.director).includes('nolan')], ['no es Interstellar', (r) => r.title_en !== 'Interstellar']]],
  ['almodovar', 'movie', 'Una película de Almodóvar', [['de Almodóvar', (r) => fold(r.director).includes('almodovar')]]],
  ['western', 'movie', 'Un buen western', [['western', (r) => hasGenre(r, 'Western')]]],
  ['tom-hanks', 'movie', 'Algo con Tom Hanks', [['con Tom Hanks', (r) => byPerson(r, 'Tom Hanks')]]],
  ['anime', 'movie', 'Una peli de anime', [['animación', (r) => hasGenre(r, 'Animación')], ['japonesa', (r) => r.original_language === 'ja']]],
  ['segunda-guerra', 'movie', 'Una peli bélica de la Segunda Guerra Mundial', [['bélica o historia', (r) => hasGenre(r, 'Bélica', 'Historia')]]],
  ['navidad-familia', 'movie', 'Una película para ver en familia en Navidad', [['familiar o de comedia', (r) => hasGenre(r, 'Familia', 'Comedia', 'Animación')]]],
  ['serie-comedia', 'tv', 'Una serie de comedia para ver a trozos', [['serie', (r) => r.type === 'tv'], ['comedia', (r) => hasGenre(r, 'Comedia')]]],
  ['musical', 'movie', 'Un musical alegre', [['música', (r) => hasGenre(r, 'Música')]]],
  ['lluvia', 'movie', 'Está lloviendo y estoy un poco melancólica, quiero algo que me acompañe', []],
];

const JUDGE_PROMPT = `Eres un crítico de cine exigente. Alguien le ha pedido a un recomendador una película o serie, y este le ha recomendado un título.
Puntúa de 1 a 5 cuánto encaja la recomendación con lo que pidió:
5 = exactamente lo que pedía; 4 = encaja bien; 3 = encaja a medias; 2 = encaja poco; 1 = no tiene nada que ver.
Responde solo con json: {"score": 4, "why": "una frase"}`;

async function judge(request, row) {
  const description = `${row.title_en ?? row.title} (${row.year}) · ${row.type === 'tv' ? 'serie' : 'película'} · dir. ${row.director ?? '—'} · ${(row.genres ?? []).join(', ')} · ${row.vote_count} votos en TMDB · ${(row.synopsis ?? row.synopsis_en ?? '').slice(0, 300)}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: JUDGE_PROMPT },
          { role: 'user', content: `Pidió: «${request}»\nLe recomendó: ${description}` },
        ],
      }),
    });
    try {
      const parsed = JSON.parse((await response.json()).choices[0].message.content);
      if (Number.isInteger(parsed.score) && parsed.score >= 1 && parsed.score <= 5) return parsed;
    } catch {
      // otro intento
    }
  }
  return { score: null, why: 'el juez no respondió' };
}

/** Un turno del chat por la API, como el navegador. */
async function turn(token, mode, message, conversationId) {
  for (;;) {
    const response = await fetch(`${APP}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode, message, ...(conversationId ? { conversation_id: conversationId } : {}) }),
    });
    const wait = Number(response.headers.get('retry-after'));
    if (response.status === 429 && wait > 0 && wait <= 60) {
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
      continue;
    }
    const raw = await response.text();
    if (!response.ok) return { error: `HTTP ${response.status}: ${raw.slice(0, 200)}` };
    const events = raw.split('\n\n').filter(Boolean).map((block) => ({
      name: /^event: (.*)$/mu.exec(block)?.[1],
      data: JSON.parse(/^data: (.*)$/mu.exec(block)?.[1] ?? 'null'),
    }));
    const failure = events.find((event) => event.name === 'error');
    const done = events.find((event) => event.name === 'done')?.data;
    return {
      error: failure ? `${failure.data.code}: ${failure.data.message}` : null,
      text: events.filter((event) => event.name === 'delta').map((event) => event.data.text).join(''),
      conversationId: done?.conversation_id ?? conversationId,
      recommendations: done?.recommendations ?? [],
    };
  }
}

/** Lo que buscó Umber en cada turno, de las trazas: herramientas ofrecidas y búsqueda. */
async function searchesOf(userId) {
  const rows = await (await supa(`/rest/v1/chat_traces?user_id=eq.${userId}&select=meta,search&order=created_at`)).json();
  return rows.map((row) =>
    row.search === null
      ? `pregunta (ofrecidas: ${(row.meta.tools ?? []).join(', ') || 'ninguna'})`
      : `${row.search.kind}: «${row.search.query}» ${JSON.stringify(row.search.filters ?? {})}${row.search.relaxed?.length ? ` relajado: ${row.search.relaxed.join(', ')}` : ''}`,
  );
}

async function runCase([id, mode, request, checks], ctx) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = { email: `umber-eval-${stamp}@example.com`, password: `Ev${stamp}!xY` };
  const userId = (await (await supa('/auth/v1/admin/users', { method: 'POST', body: { ...user, email_confirm: true } })).json()).id;
  const started = Date.now();
  try {
    const token = (await (await supa('/auth/v1/token?grant_type=password', { key: ANON, method: 'POST', body: user })).json()).access_token;
    let conversationId = null;
    let message = request;
    for (let turns = 1; turns <= MAX_TURNS; turns += 1) {
      const reply = await turn(token, mode, message, conversationId);
      if (reply.error) return { id, request, error: reply.error, turns };
      conversationId = reply.conversationId;
      // Si acaba preguntando, aún no ha recomendado: la ficha es de un título que
      // ha nombrado (dónde ver el que pidió, antes de buscarle uno parecido).
      const asking = reply.text.trim().endsWith('?');
      const first = asking ? undefined : reply.recommendations[0];
      if (first && DEBUG) console.log(`    [${id}] fichas: ${reply.recommendations.map((card) => card.title).join(' · ')}\n    «${reply.text.replace(/\s+/gu, ' ').slice(0, 260)}…»`);
      if (first) {
        const row = (await (await supa(`/rest/v1/content?id=eq.${first.id}&select=id,type,title,title_en,year,director,top_cast,original_language,runtime,genres,vote_count,synopsis,synopsis_en`)).json())[0];
        const passed = checks.map(([name, test]) => ({ name, ok: Boolean(test(row, ctx)) }));
        const verdict = await judge(request, row);
        const searches = DEBUG ? await searchesOf(userId) : [];
        return { id, request, turns, seconds: Math.round((Date.now() - started) / 1000), title: `${row.title} (${row.year})`, checks: passed, score: verdict.score, why: verdict.why, searches };
      }
      message = REPLY;
    }
    return { id, request, error: `sin recomendar en ${MAX_TURNS} turnos`, turns: MAX_TURNS };
  } finally {
    if (userId) await supa(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
  }
}

// ─── Ejecución ───────────────────────────────────────────────────────────────

if (args.includes('--reset-global')) {
  await supa('/rest/v1/rate_limits?key=eq.chat:global', { method: 'DELETE' });
}
const interstellar = (await (await supa("/rest/v1/content?title_en=eq.Interstellar&type=eq.movie&select=id")).json())[0];
const similar = await (await supa(`/rest/v1/content_similar?content_id=eq.${interstellar.id}&select=similar_id`)).json();
const ctx = { interstellarSimilar: new Set(similar.map((row) => row.similar_id)) };

const cases = ONLY ? CASES.filter(([id]) => ONLY.includes(id)) : CASES;
console.log(`\nChat: ${APP} · ${cases.length} casos · juez ${JUDGE_MODEL}\n`);
const results = [];
for (let start = 0; start < cases.length; start += CONCURRENCY) {
  const batch = await Promise.all(cases.slice(start, start + CONCURRENCY).map((item) => runCase(item, ctx)));
  for (const result of batch) {
    results.push(result);
    if (result.error) {
      console.log(`✗ [${result.id}] ${result.error}`);
      continue;
    }
    const failed = result.checks.filter((check) => !check.ok).map((check) => check.name);
    console.log(
      `${failed.length === 0 ? '✓' : '✗'} [${result.id}] ${result.title} · juez ${result.score} · ${result.turns} turnos, ${result.seconds} s` +
        (failed.length > 0 ? `\n    no cumple: ${failed.join(', ')}` : '') +
        `\n    ${result.why}` +
        (result.searches.length > 0 ? `\n    turnos: ${result.searches.join(' → ')}` : ''),
    );
  }
}

const done = results.filter((result) => !result.error);
const checks = done.flatMap((result) => result.checks);
const scores = done.map((result) => result.score).filter((score) => score !== null);
const mean = (values) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
console.log(`\nRecomiendan: ${done.length}/${results.length}`);
console.log(`Cumplen lo comprobable: ${checks.filter((check) => check.ok).length}/${checks.length} comprobaciones; ${done.filter((result) => result.checks.every((check) => check.ok)).length}/${done.length} casos enteros`);
console.log(`Juez: media ${mean(scores).toFixed(2)}, ≥4 en ${scores.filter((score) => score >= 4).length}/${scores.length}`);
console.log(`Turnos hasta recomendar: media ${mean(done.map((result) => result.turns)).toFixed(1)}`);
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
