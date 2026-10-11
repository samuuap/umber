/**
 * «El título del día» en el navegador (`/juegos/titulo`).
 *
 * Dos pasos. Primero se eligen cuatro letras con el teclado (dos vocales como
 * mucho) y se destapan: el
 * servidor dice en qué casillas salen y cuáles no están. Después se escribe el
 * título en las casillas que quedan; cada fallo, o pedir pista, destapa la
 * siguiente (año, director, sinopsis, cartel). Quien corrige es
 * `/api/games/title`, que recibe la partida entera cada vez. La partida se
 * guarda en el navegador (`src/scripts/games.ts`): al volver, sale como estaba.
 */
import { countVowels, foldLetter, titleLetters } from '@/lib/game-rules';
import { celebrate, loadPlay, pageUrl, playKey, postJson, savePlay, showResult } from '@/scripts/games';
import {
  TITLE_CLUES,
  TITLE_LETTER_PICKS,
  TITLE_MAX_ATTEMPTS,
  TITLE_MAX_VOWELS,
  isLocale,
  type TitleClue,
  type TitleClueKind,
  type TitleGameRequestBody,
  type TitleGameResponse,
} from '@/lib/types';

const root = document.querySelector<HTMLElement>('[data-title-game]');

/** Cómo se nombra cada pista en una frase: «Pista nueva: el año». */
const CLUE_NAMES: Record<TitleClueKind, string> = {
  year: 'el año',
  director: 'quién la dirige',
  synopsis: 'de qué va',
  poster: 'el cartel',
};
const CLUE_ICONS: Record<TitleClueKind, string> = { year: '📅', director: '🎬', synopsis: '📖', poster: '🖼️' };
/** Con qué acertó, según el intento: el primero solo tenía las letras. */
const WIN_VERDICTS = [
  '¡Con cuatro letras te ha bastado!',
  '¡Acertaste con el año!',
  '¡Acertaste con el director!',
  '¡Acertaste con la sinopsis!',
  '¡Acertaste con el cartel!',
] as const;

const TURN_STAGGER_MS = 85;
const WIN_STAGGER_MS = 55;

type Stage = 'pick' | 'guess' | 'done';

if (root !== null) {
  const day = root.dataset.day ?? '';
  const language = isLocale(root.dataset.language) ? root.dataset.language : 'es';
  const number = root.dataset.number ?? '';
  const key = playKey('title', day, language);

  const find = <T extends Element = HTMLElement>(selector: string): T | null => root.querySelector<T>(selector);
  const board = find('[data-board]');
  const row = find('[data-row]');
  const burst = find('[data-burst]');
  const slots = [...root.querySelectorAll<HTMLElement>('[data-slot]')];
  /** Cuántas casillas tiene cada palabra: para escribir lo probado con sus espacios. */
  const wordSizes = [...root.querySelectorAll<HTMLElement>('[data-word]')].map(
    (word) => word.querySelectorAll('[data-slot]').length,
  );
  const pickSlots = [...root.querySelectorAll<HTMLElement>('[data-pick-slot]')];
  const pickPanel = find('[data-pick-panel]');
  const pickSubmit = find<HTMLButtonElement>('[data-pick-submit]');
  const guessPanel = find('[data-guess-panel]');
  const guessSubmit = find<HTMLButtonElement>('[data-guess-submit]');
  const clueButton = find<HTMLButtonElement>('[data-guess-clue]');
  const bars = [...root.querySelectorAll<HTMLElement>('.attempt-bar')];
  const attemptLabel = find('[data-attempt-label]');
  const status = find('[data-game-status]');
  const misses = find('[data-misses]');
  const keyboard = find('[data-keyboard]');
  const keys = [...root.querySelectorAll<HTMLButtonElement>('[data-key]')];
  const enterKey = find<HTMLButtonElement>('[data-enter-label]');

  let stage: Stage = 'pick';
  let busy = false;
  let picks: string[] = [];
  let guesses: (string | null)[] = [];
  /** La letra destapada de cada casilla, o `null`. */
  let revealed: (string | null)[] = slots.map(() => null);
  /** Lo escrito en las casillas que no están destapadas, en orden. */
  let typed: string[] = [];
  let openClues = 0;

  const say = (message: string): void => {
    if (status !== null) status.textContent = message;
  };
  const blanks = (): number[] => revealed.flatMap((letter, index) => (letter === null ? [index] : []));

  /** Reinicia una animación de CSS que ya se ha visto: quitar, releer el tamaño, poner. */
  function replay(element: HTMLElement, attribute: string, delayMs = 0): void {
    element.removeAttribute(attribute);
    void element.offsetWidth;
    element.style.animationDelay = `${String(delayMs)}ms`;
    element.setAttribute(attribute, '');
  }

  /** Las letras con los espacios del título: «EL PADRINO». */
  function spaced(letters: readonly string[]): string {
    let offset = 0;
    return wordSizes
      .map((size) => {
        const word = letters.slice(offset, offset + size).join('');
        offset += size;
        return word;
      })
      .join(' ');
  }

  // ─── Paso 1: las letras ────────────────────────────────────────────────────

  function paintPicks(): void {
    pickSlots.forEach((slot, index) => {
      const letter = picks[index] ?? '';
      if (slot.textContent !== letter) {
        slot.textContent = letter;
        if (letter === '') slot.removeAttribute('data-filled');
        else replay(slot, 'data-filled');
      }
    });
    keys.forEach((button) => {
      button.toggleAttribute('data-picked', picks.includes(button.dataset.key ?? ''));
    });
    if (pickSubmit !== null) pickSubmit.disabled = picks.length !== TITLE_LETTER_PICKS;
  }

  function togglePick(letter: string): void {
    if (picks.includes(letter)) {
      picks = picks.filter((picked) => picked !== letter);
    } else if (picks.length < TITLE_LETTER_PICKS && countVowels([...picks, letter]) > TITLE_MAX_VOWELS) {
      say(`Solo ${String(TITLE_MAX_VOWELS)} vocales. Toca una para cambiarla.`);
      return;
    } else if (picks.length < TITLE_LETTER_PICKS) {
      picks = [...picks, letter];
    } else {
      say(`Ya tienes ${String(TITLE_LETTER_PICKS)}. Toca una para cambiarla.`);
      return;
    }
    say('');
    paintPicks();
  }

  // ─── Paso 2: el título ─────────────────────────────────────────────────────

  function paintTyping(): void {
    const open = blanks();
    open.forEach((slotIndex, position) => {
      const slot = slots[slotIndex];
      if (slot === undefined) return;
      const letter = typed[position] ?? '';
      const wasEmpty = slot.textContent === '';
      slot.textContent = letter;
      slot.toggleAttribute('data-cursor', stage === 'guess' && position === typed.length);
      if (letter === '') {
        slot.removeAttribute('data-state');
      } else if (wasEmpty) {
        // Solo la que se acaba de escribir hace «pop».
        slot.removeAttribute('data-state');
        void slot.offsetWidth;
        slot.dataset.state = 'typed';
      }
    });
    if (guessSubmit !== null) guessSubmit.disabled = busy || typed.length < open.length;
  }

  function paintAttempts(response: TitleGameResponse): void {
    const used = response.results.length;
    bars.forEach((bar, index) => {
      if (index < used) bar.dataset.state = response.solved && index === used - 1 ? 'won' : 'used';
      else if (index === used && !response.finished) bar.dataset.state = 'current';
      else bar.removeAttribute('data-state');
    });
    if (attemptLabel !== null && !response.finished) {
      const attempt = used + 1;
      attemptLabel.textContent =
        attempt === TITLE_MAX_ATTEMPTS
          ? `Último intento`
          : `Intento ${String(attempt)} de ${String(TITLE_MAX_ATTEMPTS)}`;
    }
    if (clueButton !== null) {
      // Con todas las pistas fuera, pedir otra es rendirse.
      clueButton.textContent = response.clues.length >= TITLE_CLUES.length ? 'Me rindo' : 'Pedir pista';
    }
  }

  function openClue(clue: TitleClue, animate: boolean): void {
    const item = find(`[data-clue="${clue.kind}"]`);
    if (item === null || item.hasAttribute('data-open')) return;
    const locked = item.querySelector<HTMLElement>('[data-clue-locked]');
    const value = item.querySelector<HTMLElement>('[data-clue-value]');
    if (locked !== null) locked.hidden = true;
    if (value !== null) {
      if (clue.kind === 'poster') {
        const image = value.querySelector('img');
        if (image !== null && clue.value !== null) image.src = clue.value;
      } else {
        value.textContent = clue.value ?? 'No lo sabemos';
      }
      value.hidden = false;
    }
    // Solo la que se acaba de destapar se anima: al volver a la página, quietas.
    item.setAttribute('data-open', animate ? 'animate' : 'quiet');
  }

  function addMiss(guess: string): void {
    if (misses === null) return;
    const chip = document.createElement('li');
    chip.className = 'miss-chip';
    chip.textContent = spaced([...guess]);
    misses.append(chip);
  }

  // ─── El final ──────────────────────────────────────────────────────────────

  function shareText(response: TitleGameResponse): string {
    const score = response.solved
      ? `${String(response.results.length)}/${String(TITLE_MAX_ATTEMPTS)}`
      : `X/${String(TITLE_MAX_ATTEMPTS)}`;
    const path = ['🔤', ...response.clues.map((clue) => CLUE_ICONS[clue.kind]), response.solved ? '✅' : '❌'];
    const name = language === 'es' ? 'español' : 'inglés';
    return [`El título del día #${number} (${name}) · ${score}`, path.join(''), pageUrl()].join('\n');
  }

  function finish(response: TitleGameResponse, animate: boolean): void {
    stage = 'done';
    const answer = response.answer;
    if (answer === null) return;
    if (guessPanel !== null) guessPanel.hidden = true;
    if (pickPanel !== null) pickPanel.hidden = true;
    if (keyboard !== null) keyboard.hidden = true;
    slots.forEach((slot) => {
      slot.removeAttribute('data-cursor');
    });

    let delay = 0;
    if (response.solved) {
      const letters = titleLetters(answer.title);
      slots.forEach((slot, index) => {
        slot.textContent = letters[index] ?? slot.textContent;
        slot.dataset.state = 'solved';
        if (animate) replay(slot, 'data-win', index * WIN_STAGGER_MS);
      });
      if (animate && board !== null) {
        replay(board, 'data-win-glow');
        if (burst !== null) window.setTimeout(() => celebrate(burst), 250);
      }
      say('');
      delay = animate ? slots.length * WIN_STAGGER_MS + 900 : 0;
    } else {
      // Lo que faltaba, apagado: se ve qué letras no salieron.
      const letters = titleLetters(answer.title);
      blanks().forEach((slotIndex, position) => {
        const slot = slots[slotIndex];
        if (slot === undefined) return;
        slot.textContent = letters[slotIndex] ?? '';
        slot.dataset.state = 'answer';
        if (animate) replay(slot, 'data-turn', position * TURN_STAGGER_MS);
      });
      say(`Era «${answer.title}».`);
      delay = animate ? blanks().length * TURN_STAGGER_MS + 700 : 0;
    }

    window.setTimeout(() => {
      showResult({
        game: 'title',
        today: day,
        verdict: response.solved
          ? (WIN_VERDICTS[response.results.length - 1] ?? '¡Acertaste!')
          : 'Esta vez no. Era…',
        answer,
        shareText: shareText(response),
        quiet: !animate,
      });
    }, delay);
  }

  // ─── Lo que dice el servidor ───────────────────────────────────────────────

  function apply(response: TitleGameResponse, animate: boolean): void {
    const firstReveal = stage === 'pick';
    revealed = [...response.revealed];

    if (firstReveal) {
      // Las casillas de tus letras giran una detrás de otra y se quedan.
      let turned = 0;
      slots.forEach((slot, index) => {
        const letter = revealed[index] ?? null;
        if (letter === null) return;
        slot.textContent = letter;
        slot.dataset.state = 'revealed';
        slot.setAttribute('aria-label', `${letter}, destapada`);
        if (animate) replay(slot, 'data-turn', turned * TURN_STAGGER_MS);
        turned += 1;
      });
      const absent = new Set(response.absent);
      const markPicks = (): void => {
        pickSlots.forEach((slot) => {
          slot.dataset.mark = absent.has(slot.textContent) ? 'absent' : 'present';
        });
        keys.forEach((button) => {
          const letter = button.dataset.key ?? '';
          button.removeAttribute('data-picked');
          if (picks.includes(letter)) button.dataset.mark = absent.has(letter) ? 'absent' : 'present';
        });
      };
      if (animate) window.setTimeout(markPicks, turned * TURN_STAGGER_MS + 300);
      else markPicks();

      stage = 'guess';
      if (pickPanel !== null) pickPanel.hidden = true;
      if (guessPanel !== null) guessPanel.hidden = false;
      if (enterKey !== null) enterKey.textContent = 'Probar';
      const present = picks.length - response.absent.length;
      if (animate) {
        say(
          present === 0
            ? 'Ninguna de tus letras está. A escribir a ciegas… o pide una pista.'
            : present === picks.length
              ? '¡Están las cuatro! Ahora, escribe el título.'
              : `${String(present)} de tus ${String(picks.length)} letras están. Ahora, escribe el título.`,
        );
      }
    }

    // Lo probado, y las pistas que han salido.
    if (misses !== null && !animate) misses.replaceChildren();
    response.results.forEach((result, index) => {
      const guess = guesses[index];
      if (result === 'miss' && typeof guess === 'string' && (!animate || index === response.results.length - 1)) {
        addMiss(guess);
      }
    });
    response.clues.forEach((clue, index) => {
      openClue(clue, animate && index >= openClues);
    });
    const newClue = response.clues.length > openClues ? response.clues.at(-1) : undefined;
    openClues = response.clues.length;
    paintAttempts(response);
    savePlay(key, {
      game: 'title',
      day,
      language,
      picks,
      guesses,
      labels: [],
      finished: response.finished,
      solved: response.solved,
    });

    if (response.finished) {
      finish(response, animate);
      return;
    }
    if (!firstReveal && animate) {
      const last = response.results.at(-1);
      if (last === 'miss' && row !== null) replay(row, 'data-shake');
      const clueText = newClue === undefined ? '' : ` Pista nueva: ${CLUE_NAMES[newClue.kind]}.`;
      const lastOne = response.results.length === TITLE_MAX_ATTEMPTS - 1 ? ' Es el último intento.' : '';
      say(`${last === 'miss' ? 'No es ese.' : ''}${clueText}${lastOne}`.trim());
    }
    typed = [];
    paintTyping();
  }

  async function send(nextGuesses: (string | null)[], animate: boolean): Promise<void> {
    busy = true;
    paintTyping();
    if (clueButton !== null) clueButton.disabled = true;
    if (pickSubmit !== null) pickSubmit.disabled = true;
    try {
      const body: TitleGameRequestBody = { day, language, letters: picks, guesses: nextGuesses };
      const response = await postJson<TitleGameResponse>('/api/games/title', body);
      guesses = nextGuesses;
      apply(response, animate);
    } catch (error: unknown) {
      say(error instanceof Error ? error.message : 'Algo ha fallado. Prueba otra vez.');
      if (stage === 'pick') paintPicks();
    } finally {
      busy = false;
      if (clueButton !== null) clueButton.disabled = false;
      if (stage === 'guess') paintTyping();
    }
  }

  // ─── Teclado ───────────────────────────────────────────────────────────────

  function submitGuess(): void {
    const open = blanks();
    if (typed.length < open.length) {
      say(`Faltan ${String(open.length - typed.length)} letras.`);
      if (row !== null) replay(row, 'data-shake');
      return;
    }
    const letters = [...revealed];
    open.forEach((slotIndex, position) => {
      letters[slotIndex] = typed[position] ?? '';
    });
    void send([...guesses, letters.join('')], true);
  }

  function press(input: string): void {
    if (busy || stage === 'done') return;
    if (stage === 'pick') {
      if (input === 'Enter') {
        if (picks.length === TITLE_LETTER_PICKS) void send([], true);
        else say(`Elige ${String(TITLE_LETTER_PICKS - picks.length)} más.`);
      } else if (input === 'Backspace') {
        picks = picks.slice(0, -1);
        paintPicks();
      } else {
        const letter = foldLetter(input);
        if (letter !== null) togglePick(letter);
      }
      return;
    }
    if (input === 'Enter') {
      submitGuess();
      return;
    }
    if (input === 'Backspace') {
      typed = typed.slice(0, -1);
    } else {
      const letter = foldLetter(input);
      if (letter === null || typed.length >= blanks().length) return;
      typed = [...typed, letter];
    }
    say('');
    paintTyping();
  }

  keys.forEach((button) => {
    button.addEventListener('click', () => {
      press(button.dataset.key ?? '');
    });
  });
  pickSubmit?.addEventListener('click', () => {
    press('Enter');
  });
  guessSubmit?.addEventListener('click', () => {
    press('Enter');
  });
  clueButton?.addEventListener('click', () => {
    if (busy || stage !== 'guess') return;
    void send([...guesses, null], true);
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    // Intro sobre un botón o un enlace hace lo suyo.
    if (event.key === 'Enter' && target instanceof HTMLElement && target.closest('button, a') !== null) return;
    if (event.key === 'Enter' || event.key === 'Backspace' || foldLetter(event.key) !== null) {
      event.preventDefault();
      press(event.key);
    }
  });

  // Al volver a la página, la partida de antes.
  const stored = loadPlay(key);
  // Una partida de antes de limitar las vocales ya no la acepta el servidor: se empieza de nuevo.
  if (
    stored !== null &&
    (stored.picks ?? []).length === TITLE_LETTER_PICKS &&
    countVowels(stored.picks ?? []) <= TITLE_MAX_VOWELS
  ) {
    picks = [...stored.picks];
    paintPicks();
    void send([...stored.guesses], false);
  } else {
    paintPicks();
  }
}
