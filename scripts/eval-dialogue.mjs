/**
 * ¿Acierta Umber con alguien que no lo cuenta todo de golpe? Conversaciones con
 * personas simuladas que tienen un perfil oculto: gustos, ánimo, con quién la
 * ven, lo que no soportan (Fase 8).
 *
 *   node scripts/eval-dialogue.mjs [url] [--out a.json] [--runs 2] [--reset-global]
 *
 * Cada persona abre con algo vago («me apetece una peli esta noche») y responde a
 * las preguntas de Umber según su perfil, sin adelantar lo que no le preguntan:
 * la simula deepseek-flash. Cuando Umber recomienda, un juez que sí conoce el
 * perfil entero (`deepseek-v4-pro`, otro modelo) puntúa de 1 a 5 si acierta
 * para esa persona. Sirve para decidir cuántas preguntas hace Umber antes de
 * buscar (`MIN_QUESTIONS` y `MAX_QUESTIONS` en src/lib/turns.ts), que
 * `eval-chat.mjs` no puede medir: allí cada pregunta recibe un «me da igual».
 *
 * Unos 5 mensajes por conversación. Cada usuario de prueba se borra al terminar.
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
const RUNS = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 2;
const CONCURRENCY = 5;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const DEBUG = args.includes('--debug');
const MAX_TURNS = 8;

const supa = (path, { key = SECRET, token = key, method = 'GET', body } = {}) =>
  fetch(`${SUPA}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

/** [id, modo, cómo abre, perfil oculto] */
const PERSONAS = [
  ['aburrido', 'movie', 'Estoy aburrido, ¿qué veo?', 'Tiene 35 años. Le encantaron Zodiac y Prisioneros. Odia las comedias tontas. Hoy tiene energía y la ve sin nadie. Prefiere algo que no haya visto todo el mundo.'],
  ['pareja', 'movie', 'Me apetece una peli esta noche', 'La ve con su pareja. Quiere algo romántico pero no cursi. Le encantaron Antes del amanecer y Her. No soporta el terror.'],
  ['padres', 'movie', 'Busco algo para ver con mis padres', 'Sus padres tienen 70 años. Algo clásico y amable, sin violencia ni escenas de sexo. A ellos les gustan Cinema Paradiso y las películas de Spielberg.'],
  ['desconectar', 'movie', 'Necesito desconectar un rato', 'Sale cansada del trabajo y quiere reírse. Le encantaron Paddington 2 y Supersalidos. No quiere nada de drama ni de pensar.'],
  ['cabeza', 'movie', 'Quiero algo que me vuele la cabeza', 'Le encantaron Primer y Coherence. Quiere ciencia ficción que haga pensar, con giros. Tiene energía y la ve sin nadie.'],
  ['serie-finde', 'tv', 'Busco una serie para el fin de semana', 'Le encantaron Mindhunter y True Detective. Le va lo oscuro y adulto, crimen e investigación. Le da igual que sea conocida.'],
  ['miedo', 'movie', '¿Me recomiendas algo de miedo?', 'La ve con amigos. Nada de gore ni casquería: quiere miedo de atmósfera. Le encantaron Los otros y Babadook.'],
  ['bonito', 'movie', 'Quiero ver algo bonito', 'Está melancólica y quiere que la película la acompañe en eso, no que la anime. Le encantaron Aftersun y Lost in Translation. La ve sin nadie y le da igual que sea poco conocida.'],
  ['hijos', 'movie', 'Una peli para ver con mis hijos', 'Sus hijos tienen 6 y 9 años. Les encantaron Coco y Paddington. Nada que dé demasiado miedo.'],
  ['accion', 'movie', 'Me apetece algo de acción', 'Le encantaron John Wick y Mad Max: Furia en la carretera. No quiere superhéroes. Tiene mucha energía.'],
  ['antiguas', 'movie', 'Me gustan las películas antiguas', 'Le encanta el cine negro clásico: Perdición y Casablanca. Quiere algo de esa época, en blanco y negro mejor.'],
  ['llorar', 'movie', 'Hoy me apetece llorar un poco', 'Le encantaron Up y Manchester frente al mar. Quiere un drama que remueva, pero no cruel. La ve sin nadie.'],
  ['espanol', 'movie', 'Quiero ver algo en español', 'Le encantaron Relatos salvajes y El secreto de sus ojos. Busca un thriller o drama de España o Latinoamérica.'],
  ['romcom', 'movie', 'Me apetece una comedia romántica', 'Le encanta Cuando Harry encontró a Sally y odia las comedias románticas modernas de Netflix. Prefiere las de los 80 y 90.'],
  ['diferente', 'movie', 'Quiero algo diferente, que no haya visto todo el mundo', 'Le encantaron Paterson y Columbus: cine lento y contemplativo. La ve sin nadie, con calma.'],
];

async function deepseek(model, messages, { temperature = 0.1, json = false, maxTokens = 300 } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        thinking: { type: 'disabled' },
        messages,
      }),
    });
    try {
      return (await response.json()).choices[0].message.content;
    } catch {
      // otro intento
    }
  }
  return null;
}

/** Lo que contesta la persona simulada a lo último que dijo Umber. */
async function answer(profile, transcript) {
  const system = `Eres una persona que habla por chat con un recomendador de películas y series. Tu perfil, que el recomendador no conoce:
${profile}
Responde a lo que te acaba de decir en una o dos frases cortas, con naturalidad y en español. Contesta solo a lo que te pregunta: no cuentes todo tu perfil de golpe. Si te pregunta por tus gustos o por algo que te haya gustado, nombra alguna de tus películas favoritas. Si te pregunta algo que tu perfil no dice, contesta algo razonable para esa persona. Sin comillas.`;
  const messages = [
    { role: 'system', content: system },
    ...transcript.map((message) => ({ role: message.role === 'user' ? 'assistant' : 'user', content: message.content })),
  ];
  return (await deepseek('deepseek-flash', messages, { temperature: 0.7 }))?.trim() || 'Lo que tú veas.';
}

async function judge(opening, profile, row) {
  const content = `Perfil completo de la persona: ${profile}
Le dijo al recomendador: «${opening}» (y contestó a sus preguntas).
Le recomendó: ${row.title_en ?? row.title} (${row.year}) · ${row.type === 'tv' ? 'serie' : 'película'} · dir. ${row.director ?? '—'} · ${(row.genres ?? []).join(', ')} · ${row.vote_count} votos en TMDB · ${(row.synopsis ?? row.synopsis_en ?? '').slice(0, 300)}`;
  const raw = await deepseek(
    'deepseek-v4-pro',
    [
      {
        role: 'system',
        content: `Eres un crítico de cine exigente. Puntúa de 1 a 5 cuánto acierta una recomendación para una persona concreta, con su perfil completo: 5 = justo lo que le iría bien; 4 = le encajaría; 3 = a medias; 2 = poco; 1 = nada que ver o va contra lo que no soporta. Si le recomienda una de las películas o series que su perfil dice que le encantaron, ya la ha visto: puntúa 1. Responde solo con json: {"score": 4, "why": "una frase"}`,
      },
      { role: 'user', content },
    ],
    { json: true },
  );
  try {
    const parsed = JSON.parse(raw ?? '');
    if (Number.isInteger(parsed.score)) return parsed;
  } catch {
    // sin veredicto
  }
  return { score: null, why: 'el juez no respondió' };
}

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

async function runPersona([id, mode, opening, profile]) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = { email: `umber-dialogue-${stamp}@example.com`, password: `Dl${stamp}!xY` };
  const userId = (await (await supa('/auth/v1/admin/users', { method: 'POST', body: { ...user, email_confirm: true } })).json()).id;
  try {
    const token = (await (await supa('/auth/v1/token?grant_type=password', { key: ANON, method: 'POST', body: user })).json()).access_token;
    const transcript = [];
    let conversationId = null;
    let message = opening;
    for (let turns = 1; turns <= MAX_TURNS; turns += 1) {
      transcript.push({ role: 'user', content: message });
      const reply = await turn(token, mode, message, conversationId);
      if (reply.error) return { id, error: reply.error, turns };
      conversationId = reply.conversationId;
      transcript.push({ role: 'assistant', content: reply.text });
      const asking = reply.text.trim().endsWith('?');
      const first = asking ? undefined : reply.recommendations[0];
      if (first) {
        const row = (await (await supa(`/rest/v1/content?id=eq.${first.id}&select=type,title,title_en,year,director,genres,vote_count,synopsis,synopsis_en`)).json())[0];
        const verdict = await judge(opening, profile, row);
        const questions = transcript.filter((item) => item.role === 'assistant' && item.content.trim().endsWith('?')).length;
        // Qué buscó en cada turno, de sus trazas, antes de borrar el usuario.
        const traces = DEBUG
          ? await (await supa(`/rest/v1/chat_traces?user_id=eq.${userId}&select=search&order=created_at`)).json()
          : [];
        const searches = traces.map((trace) =>
          trace.search === null ? '—' : `${trace.search.kind}${trace.search.intent ? `/${trace.search.intent}` : ''}: ${trace.search.query.slice(0, 70)}`,
        );
        return { id, turns, questions, title: `${row.title} (${row.year})`, score: verdict.score, why: verdict.why, transcript, searches };
      }
      message = await answer(profile, transcript);
    }
    return { id, error: `sin recomendar en ${MAX_TURNS} turnos`, turns: MAX_TURNS };
  } finally {
    if (userId) await supa(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
  }
}

if (args.includes('--reset-global')) await supa('/rest/v1/rate_limits?key=eq.chat:global', { method: 'DELETE' });

const chosen = ONLY ? PERSONAS.filter(([id]) => ONLY.includes(id)) : PERSONAS;
const jobs = Array.from({ length: RUNS }, () => chosen).flat();
console.log(`\nChat: ${APP} · ${chosen.length} personas × ${RUNS}\n`);
const results = [];
for (let start = 0; start < jobs.length; start += CONCURRENCY) {
  for (const result of await Promise.all(jobs.slice(start, start + CONCURRENCY).map(runPersona))) {
    results.push(result);
    console.log(
      result.error
        ? `✗ [${result.id}] ${result.error}`
        : `${result.score >= 4 ? '✓' : '·'} [${result.id}] ${result.title} · juez ${result.score} · ${result.questions} preguntas · ${result.why}` +
            (DEBUG
              ? `\n    ${result.transcript.map((m) => `${m.role === 'user' ? 'P' : 'U'}: ${m.content.replace(/\s+/gu, ' ').slice(0, 110)}`).join('\n    ')}\n    búsquedas: ${result.searches.join(' → ')}`
              : ''),
    );
  }
}

const done = results.filter((result) => !result.error);
const scores = done.map((result) => result.score).filter((score) => score !== null);
const mean = (values) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
console.log(`\nRecomiendan: ${done.length}/${results.length}`);
console.log(`Juez: media ${mean(scores).toFixed(2)}, ≥4 en ${scores.filter((score) => score >= 4).length}/${scores.length}, ≤2 en ${scores.filter((score) => score <= 2).length}`);
console.log(`Preguntas antes de recomendar: media ${mean(done.map((result) => result.questions)).toFixed(1)}`);
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
