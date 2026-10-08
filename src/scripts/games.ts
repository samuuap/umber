/**
 * Lo común de los juegos del día en el navegador: la partida guardada, tus
 * números, compartir el resultado y la pantalla final.
 *
 * Las partidas se guardan en `localStorage`, y no en Supabase: son tuyas, no
 * hace falta cuenta para jugar y no dicen nada de nadie. (La regla de no usar
 * `localStorage` es para el historial del chat.) Si el navegador no deja
 * guardar (modo privado de algunos), se juega igual y no se recuerda.
 */
import type { ApiErrorBody, GameAnswer, GameKind, Locale } from '@/lib/types';

const STORAGE_KEY = 'umber:games:v1';
/** Lo que se recuerda: más de un año no cambia ninguna racha que se vaya a mirar. */
const KEEP_DAYS = 400;

export interface StoredPlay {
  readonly game: GameKind;
  readonly day: string;
  readonly language: Locale | null;
  /** Las cuatro letras elegidas del título. Vacío en el cartel. */
  readonly picks: readonly string[];
  /** Lo que se mandó al servidor: letras en el título; ids en el cartel. `null`, pedir pista o pasar. */
  readonly guesses: readonly (string | null)[];
  /** Lo que se ve de cada intento del cartel: el título elegido. */
  readonly labels: readonly string[];
  readonly finished: boolean;
  readonly solved: boolean;
}

type Store = Record<string, StoredPlay>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Sin espacio o sin permiso: la partida sigue, solo que no se recuerda.
  }
}

export function playKey(game: GameKind, day: string, language: Locale | null = null): string {
  return language === null ? `${game}:${day}` : `${game}:${day}:${language}`;
}

export function loadPlay(key: string): StoredPlay | null {
  return readStore()[key] ?? null;
}

export function savePlay(key: string, play: StoredPlay): void {
  const store = readStore();
  store[key] = play;
  const oldest = shiftDay(play.day, -KEEP_DAYS);
  for (const [storedKey, stored] of Object.entries(store)) {
    if (stored.day < oldest) delete store[storedKey];
  }
  writeStore(store);
}

// ─── Días ────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` más o menos `days` días. En UTC, donde un día siempre tiene 24 horas. */
function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const MADRID_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** «Quedan 5 h 12 min»: hasta la medianoche de Madrid, cuando cambia el juego. */
export function untilNextGame(now: Date = new Date()): string {
  const parts = Object.fromEntries(MADRID_CLOCK.formatToParts(now).map((part) => [part.type, part.value]));
  const elapsed = Number(parts['hour']) * 3600 + Number(parts['minute']) * 60 + Number(parts['second']);
  const minutes = Math.max(1, Math.ceil((86_400 - elapsed) / 60));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `Quedan ${String(minutes)} min.` : `Quedan ${String(hours)} h ${String(minutes % 60)} min.`;
}

// ─── Números ─────────────────────────────────────────────────────────────────

export interface GameStats {
  readonly played: number;
  readonly won: number;
  /** Días seguidos acertados hasta hoy (o hasta ayer, si hoy aún no ha acabado). */
  readonly streak: number;
  readonly best: number;
}

/** Por día, en cualquier idioma: acertar el título en inglés cuenta igual. */
export function statsFor(game: GameKind, today: string): GameStats {
  const finished = new Map<string, boolean>();
  for (const play of Object.values(readStore())) {
    if (play.game !== game || !play.finished) continue;
    finished.set(play.day, (finished.get(play.day) ?? false) || play.solved);
  }
  const days = [...finished.keys()].sort();

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of days) {
    run = finished.get(day) === true ? (previous !== null && shiftDay(previous, 1) === day ? run + 1 : 1) : 0;
    previous = finished.get(day) === true ? day : null;
    best = Math.max(best, run);
  }

  let streak = 0;
  let cursor = finished.has(today) ? today : shiftDay(today, -1);
  while (finished.get(cursor) === true) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }

  const won = days.filter((day) => finished.get(day) === true).length;
  return { played: days.length, won, streak, best };
}

// ─── Servidor ────────────────────────────────────────────────────────────────

/** POST con JSON. Lanza un `Error` con el mensaje del servidor, que se puede enseñar tal cual. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('No hay conexión. Comprueba la red y vuelve a intentarlo.');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data as ApiErrorBody | null)?.error?.message;
    throw new Error(message ?? 'Algo ha fallado por nuestra parte. Prueba otra vez en un momento.');
  }
  return data as T;
}

// ─── Compartir ───────────────────────────────────────────────────────────────

/**
 * En el móvil, la hoja de compartir del sistema; si no, al portapapeles. El texto
 * no dice la película: solo cómo fue.
 */
async function share(text: string): Promise<string> {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return '';
    } catch (error: unknown) {
      // Cerrar la hoja sin compartir no es un fallo.
      if (error instanceof DOMException && error.name === 'AbortError') return '';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'Copiado. Pégalo donde quieras.';
  } catch {
    return 'No se ha podido copiar. Mantén pulsado el resultado para copiarlo.';
  }
}

// ─── La pantalla final ───────────────────────────────────────────────────────

export interface ResultView {
  readonly game: GameKind;
  readonly today: string;
  /** «¡Acertaste con el año!», «Esta vez no. Era…». */
  readonly verdict: string;
  readonly answer: GameAnswer;
  readonly shareText: string;
  /** Al cargar una partida ya acabada, sin bajar hasta el resultado. */
  readonly quiet?: boolean;
}

/** Rellena y enseña el `GameResult` de la página, y lleva la vista hasta él. */
export function showResult(view: ResultView): void {
  const root = document.querySelector<HTMLElement>('[data-game-result]');
  if (root === null) return;
  const { answer } = view;
  const find = <T extends HTMLElement>(selector: string): T | null => root.querySelector<T>(selector);

  const verdict = find('[data-result-verdict]');
  if (verdict !== null) verdict.textContent = view.verdict;
  const poster = find<HTMLImageElement>('[data-result-poster]');
  if (poster !== null && answer.poster_url !== null) {
    poster.src = answer.poster_url;
    poster.alt = `Cartel de ${answer.title}`;
    if (view.quiet !== true) poster.setAttribute('data-develop-in', '');
  }

  const title = find<HTMLAnchorElement>('[data-result-title]');
  if (title !== null) {
    title.textContent = answer.title;
    title.href = `/explorar/${answer.content_id}`;
  }
  const meta = find('[data-result-meta]');
  if (meta !== null) {
    meta.textContent = [answer.year === null ? null : String(answer.year), answer.director]
      .filter((part) => part !== null)
      .join(' · ');
  }
  const similar = find<HTMLAnchorElement>('[data-result-similar]');
  if (similar !== null) {
    const name = answer.year === null ? answer.title : `${answer.title} (${String(answer.year)})`;
    similar.href = `/chat?${new URLSearchParams({
      mode: 'movie',
      q: `Me encanta ${name}. Recomiéndame algo parecido.`,
    }).toString()}`;
  }

  const stats = statsFor(view.game, view.today);
  const values: Record<string, string> = {
    played: String(stats.played),
    won: `${String(stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100))} %`,
    streak: String(stats.streak),
    best: String(stats.best),
  };
  root.querySelectorAll<HTMLElement>('[data-stat]').forEach((element) => {
    element.textContent = values[element.dataset.stat ?? ''] ?? '0';
  });

  const countdown = find('[data-result-countdown]');
  const tick = (): void => {
    if (countdown !== null) countdown.textContent = untilNextGame();
  };
  tick();
  window.setInterval(tick, 30_000);

  const shareButton = find<HTMLButtonElement>('[data-result-share]');
  const shareStatus = find('[data-result-share-status]');
  if (shareButton !== null && shareButton.dataset.ready === undefined) {
    shareButton.dataset.ready = '';
    shareButton.addEventListener('click', () => {
      void share(view.shareText).then((message) => {
        if (shareStatus !== null) shareStatus.textContent = message;
      });
    });
  }

  const wasHidden = root.hidden;
  root.hidden = false;
  if (wasHidden && view.quiet !== true) {
    root.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Hojas de la marca que salen de `origin` y caen hacia fuera al acertar. Las
 * clona de la `<template data-leaf>` de la página; cada una con su dirección,
 * su giro y su retraso. Sin movimiento reducido no salen.
 */
export function celebrate(origin: HTMLElement, count = 16): void {
  const template = document.querySelector<HTMLTemplateElement>('template[data-leaf]');
  const leaf = template?.content.firstElementChild;
  if (leaf === null || leaf === undefined || reducedMotion()) return;
  const spread = Math.max(origin.clientWidth, 240) * 0.6;
  for (let index = 0; index < count; index += 1) {
    const clone = leaf.cloneNode(true);
    if (!(clone instanceof SVGElement)) continue;
    // Repartidas en abanico hacia arriba y a los lados, y luego caen un poco.
    const angle = Math.PI + (index / (count - 1)) * Math.PI + (Math.random() - 0.5) * 0.35;
    const distance = spread * (0.55 + Math.random() * 0.45);
    clone.style.setProperty('--dx', `${String(Math.round(Math.cos(angle) * distance))}px`);
    clone.style.setProperty('--dy', `${String(Math.round(Math.sin(angle) * distance * 0.55 + 40))}px`);
    clone.style.setProperty('--spin', `${String(Math.round((Math.random() - 0.5) * 540))}deg`);
    clone.style.setProperty('--delay', `${String(Math.round(Math.random() * 180))}ms`);
    origin.append(clone);
    window.setTimeout(() => {
      clone.remove();
    }, 2_000);
  }
}

/** La dirección de la página para el texto que se comparte, sin parámetros. */
export function pageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}
