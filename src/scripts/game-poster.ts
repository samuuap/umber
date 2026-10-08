/**
 * «El cartel del día» en el navegador (`/juegos/cartel`).
 *
 * Se elige una película del buscador (`/api/games/titles`, un combobox con
 * flechas, Intro y Escape) o se pasa. `/api/games/poster` corrige todos los
 * intentos y devuelve la ruta del cartel un poco menos desenfocado; al acabar,
 * la solución y su cartel de verdad, con el título. La partida se guarda en el
 * navegador (`src/scripts/games.ts`).
 */
import { celebrate, loadPlay, pageUrl, playKey, postJson, savePlay, showResult } from '@/scripts/games';
import {
  POSTER_MAX_ATTEMPTS,
  type GameTitleOption,
  type GameTitleSearchResponse,
  type PosterGameRequestBody,
  type PosterGameResponse,
  type PosterGuessResult,
} from '@/lib/types';

const root = document.querySelector<HTMLElement>('[data-poster-game]');

const RESULT_TEXT: Record<PosterGuessResult, string> = {
  correct: '¡Es esta!',
  saga: 'No, pero es de la misma saga',
  miss: 'No es esta',
  skip: 'Pasaste',
};
const RESULT_ICON: Record<PosterGuessResult, string> = { correct: '✓', saga: '≈', miss: '✕', skip: '—' };
const SHARE_SQUARES: Record<PosterGuessResult, string> = { correct: '🟧', saga: '🟨', miss: '⬛', skip: '⬜' };
const SEARCH_DELAY_MS = 180;

if (root !== null) {
  const day = root.dataset.day ?? '';
  const number = root.dataset.number ?? '';
  const key = playKey('poster', day);

  const image = root.querySelector<HTMLImageElement>('[data-poster-image]');
  const frame = root.querySelector<HTMLElement>('.poster-frame');
  const burst = root.querySelector<HTMLElement>('[data-burst]');
  const bars = [...root.querySelectorAll<HTMLElement>('.attempt-bar')];
  const form = root.querySelector<HTMLFormElement>('[data-guess-form]');
  const input = root.querySelector<HTMLInputElement>('#guess');
  const listbox = root.querySelector<HTMLUListElement>('[data-options]');
  const submit = root.querySelector<HTMLButtonElement>('[data-guess-submit]');
  const skip = root.querySelector<HTMLButtonElement>('[data-guess-skip]');
  const attemptLabel = root.querySelector<HTMLElement>('[data-attempt-label]');
  const list = root.querySelector<HTMLOListElement>('[data-guess-list]');
  const status = root.querySelector<HTMLElement>('[data-game-status]');

  const stored = loadPlay(key);
  const guesses: (string | null)[] = [...(stored?.guesses ?? [])];
  const labels: string[] = [...(stored?.labels ?? [])];
  let options: GameTitleOption[] = [];
  let active = -1;
  let selected: GameTitleOption | null = null;
  let busy = false;
  let finished = false;
  let searchTimer: number | undefined;
  let searchSeq = 0;

  const say = (message: string): void => {
    if (status !== null) status.textContent = message;
  };

  const optionLabel = (option: GameTitleOption): string => {
    const other = option.title_en !== null && option.title_en !== option.title ? ` · ${option.title_en}` : '';
    return `${option.title}${other}${option.year === null ? '' : ` (${String(option.year)})`}`;
  };

  // ─── El cartel ─────────────────────────────────────────────────────────────

  /**
   * Cambia el cartel cuando el nuevo ya se ha descargado: sin parpadeo. Con
   * `develop`, el del final, se revela como una foto.
   */
  function showImage(url: string, alt: string, develop = false): void {
    if (image === null || image.getAttribute('src') === url) return;
    const next = new Image();
    next.onload = () => {
      image.style.opacity = '0';
      window.setTimeout(() => {
        image.src = url;
        image.alt = alt;
        image.style.opacity = '1';
        if (develop) {
          image.removeAttribute('data-develop-in');
          void image.offsetWidth;
          image.setAttribute('data-develop-in', '');
        }
      }, 250);
    };
    next.src = url;
  }

  const WIN_VERDICTS = [
    '¡A la primera!',
    '¡Acertaste en el segundo!',
    '¡Acertaste en el tercero!',
    '¡Acertaste en el cuarto!',
    '¡Acertaste en el quinto!',
    '¡Por los pelos, en el último!',
  ] as const;

  function paintBars(results: readonly PosterGuessResult[], solved: boolean): void {
    bars.forEach((bar, index) => {
      if (index < results.length) bar.dataset.state = solved && index === results.length - 1 ? 'won' : 'used';
      else if (index === results.length && !solved) bar.dataset.state = 'current';
      else bar.removeAttribute('data-state');
    });
  }

  function paintList(results: readonly PosterGuessResult[]): void {
    if (list === null) return;
    list.replaceChildren(
      ...results.map((result, index) => {
        const item = document.createElement('li');
        item.className = 'flex items-baseline gap-4 py-3';
        const icon = document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        icon.className = result === 'correct' ? 'text-umber-amber w-4 font-semibold' : 'text-umber-ash w-4';
        icon.textContent = RESULT_ICON[result];
        const text = document.createElement('span');
        text.className = 'min-w-0 flex-1';
        const title = document.createElement('span');
        title.className = result === 'skip' ? 'text-umber-ash' : 'font-serif text-umber-cream';
        title.textContent = result === 'skip' ? 'Pasaste' : (labels[index] ?? '');
        text.append(title);
        if (result !== 'skip') {
          const verdict = document.createElement('span');
          verdict.className = `ml-3 text-xs ${result === 'saga' ? 'text-umber-amber' : 'text-umber-ash'}`;
          verdict.textContent = RESULT_TEXT[result];
          text.append(verdict);
        }
        item.append(icon, text);
        return item;
      }),
    );
  }

  function shareText(response: PosterGameResponse): string {
    const score = response.solved
      ? `${String(response.results.length)}/${String(POSTER_MAX_ATTEMPTS)}`
      : `X/${String(POSTER_MAX_ATTEMPTS)}`;
    const squares = response.results.map((result) => SHARE_SQUARES[result]).join('');
    return [`El cartel del día #${number} · ${score}`, squares, pageUrl()].join('\n');
  }

  function apply(response: PosterGameResponse, fresh: boolean): void {
    finished = response.finished;
    paintBars(response.results, response.solved);
    paintList(response.results);
    savePlay(key, {
      game: 'poster',
      day,
      language: null,
      picks: [],
      guesses,
      labels,
      finished: response.finished,
      solved: response.solved,
    });

    if (response.finished && response.answer !== null) {
      if (form !== null) form.hidden = true;
      if (response.answer.poster_url !== null) {
        showImage(response.answer.poster_url, `Cartel de ${response.answer.title}`, fresh);
      }
      if (fresh && response.solved && frame !== null) {
        frame.removeAttribute('data-win-glow');
        void frame.offsetWidth;
        frame.setAttribute('data-win-glow', '');
        if (burst !== null) window.setTimeout(() => celebrate(burst), 300);
      }
      say(response.solved ? '' : `Era «${response.answer.title}».`);
      const answer = response.answer;
      window.setTimeout(
        () => {
          showResult({
            game: 'poster',
            today: day,
            verdict: response.solved
              ? (WIN_VERDICTS[response.results.length - 1] ?? '¡Acertaste!')
              : 'Esta vez no. Era…',
            answer,
            shareText: shareText(response),
            quiet: !fresh,
          });
        },
        fresh ? 1_100 : 0,
      );
      return;
    }

    const attempt = response.results.length + 1;
    if (attemptLabel !== null) attemptLabel.textContent = `Intento ${String(attempt)} de ${String(POSTER_MAX_ATTEMPTS)}`;
    if (response.image_url !== null) {
      showImage(response.image_url, `El cartel del día, desenfocado: intento ${String(attempt)} de ${String(POSTER_MAX_ATTEMPTS)}`);
    }
    const last = response.results.at(-1);
    if (fresh && last !== undefined) {
      const left = POSTER_MAX_ATTEMPTS - response.results.length;
      say(`${RESULT_TEXT[last]}. ${left === 1 ? 'Queda un intento' : `Quedan ${String(left)} intentos`}: el cartel se ve un poco más.`);
    }
  }

  // ─── Jugar ─────────────────────────────────────────────────────────────────

  async function send(all: (string | null)[], allLabels: string[], fresh: boolean): Promise<void> {
    busy = true;
    if (submit !== null) submit.disabled = true;
    if (skip !== null) skip.disabled = true;
    try {
      const body: PosterGameRequestBody = { day, guesses: all };
      const response = await postJson<PosterGameResponse>('/api/games/poster', body);
      guesses.splice(0, guesses.length, ...all);
      labels.splice(0, labels.length, ...allLabels);
      apply(response, fresh);
      if (input !== null) input.value = '';
      selected = null;
    } catch (error: unknown) {
      say(error instanceof Error ? error.message : 'Algo ha fallado. Prueba otra vez.');
    } finally {
      busy = false;
      if (submit !== null) submit.disabled = selected === null;
      if (skip !== null) skip.disabled = false;
      if (fresh && !finished) input?.focus();
    }
  }

  // ─── El buscador ───────────────────────────────────────────────────────────

  function closeOptions(): void {
    if (listbox !== null) listbox.hidden = true;
    input?.setAttribute('aria-expanded', 'false');
    input?.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function highlight(index: number): void {
    if (listbox === null || input === null) return;
    active = index;
    [...listbox.children].forEach((child, position) => {
      child.setAttribute('aria-selected', String(position === index));
      child.classList.toggle('bg-umber-raised', position === index);
    });
    const option = listbox.children[index];
    if (option instanceof HTMLElement) {
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function choose(option: GameTitleOption): void {
    selected = option;
    if (input !== null) input.value = optionLabel(option);
    if (submit !== null) submit.disabled = busy;
    closeOptions();
  }

  function renderOptions(found: readonly GameTitleOption[]): void {
    if (listbox === null || input === null) return;
    // Lo que ya se ha probado no vuelve a salir.
    options = found.filter((option) => !guesses.includes(option.id));
    if (options.length === 0) {
      listbox.replaceChildren();
      closeOptions();
      if (input.value.trim().length >= 2) say('No está en el catálogo. Prueba con otro nombre.');
      return;
    }
    say('');
    listbox.replaceChildren(
      ...options.map((option, index) => {
        const item = document.createElement('li');
        item.id = `guess-option-${String(index)}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        item.className = 'hover:bg-umber-raised cursor-pointer px-4 py-2.5 font-serif text-[1.05rem]';
        item.textContent = optionLabel(option);
        // `mousedown` y no `click`: el clic llega después de que el campo pierda el foco.
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          choose(option);
        });
        return item;
      }),
    );
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(-1);
  }

  async function search(query: string): Promise<void> {
    const seq = (searchSeq += 1);
    try {
      const response = await fetch(`/api/games/titles?${new URLSearchParams({ q: query }).toString()}`);
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as GameTitleSearchResponse;
      // Una respuesta que llega tarde no pisa la de lo último que se escribió.
      if (seq === searchSeq) renderOptions(data.results);
    } catch {
      if (seq === searchSeq) say('El buscador no responde ahora mismo. Prueba otra vez en un momento.');
    }
  }

  input?.addEventListener('input', () => {
    selected = null;
    if (submit !== null) submit.disabled = true;
    window.clearTimeout(searchTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      closeOptions();
      return;
    }
    searchTimer = window.setTimeout(() => {
      void search(query);
    }, SEARCH_DELAY_MS);
  });

  input?.addEventListener('keydown', (event) => {
    const open = listbox !== null && !listbox.hidden && options.length > 0;
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      highlight((active + 1) % options.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      highlight(active <= 0 ? options.length - 1 : active - 1);
    } else if (event.key === 'Enter' && open) {
      // Con la lista abierta, Intro elige; con una ya elegida, envía el formulario.
      event.preventDefault();
      const option = options[active === -1 ? 0 : active];
      if (option !== undefined) choose(option);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeOptions();
    }
  });

  input?.addEventListener('blur', () => {
    closeOptions();
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy || finished) return;
    if (selected === null) {
      say('Elige una película de la lista.');
      return;
    }
    void send([...guesses, selected.id], [...labels, optionLabel(selected)], true);
  });

  skip?.addEventListener('click', () => {
    if (busy || finished) return;
    void send([...guesses, null], [...labels, ''], true);
  });

  // Al volver a la página, la partida de antes.
  if (guesses.length > 0) void send([...guesses], [...labels], false);
}
