/**
 * Reglas de «El título del día», sin nada de servidor: las usan el servidor,
 * que corrige, y el navegador, que traduce lo que se teclea a una letra.
 *
 * Solo `import type`: así se puede probar con Node a pelo, sin Astro.
 */
import type { TitleToken } from '@/lib/types';

/**
 * La letra tal como se juega: mayúscula y sin tilde (Á es A, Ü es U), pero la Ñ
 * es una letra propia, como en el abecedario. `null` si no es una letra.
 */
export function foldLetter(char: string): string | null {
  const upper = char.toLocaleUpperCase('es');
  if (upper === 'Ñ') return 'Ñ';
  const base = upper.normalize('NFD').replace(/\p{M}/gu, '');
  return /^[A-Z]$/u.test(base) ? base : null;
}

/** Las letras del título, en orden: lo que hay que adivinar. */
export function titleLetters(title: string): string[] {
  return [...title.normalize('NFC')].flatMap((char) => {
    const letter = foldLetter(char);
    return letter === null ? [] : [letter];
  });
}

/** Cómo se dibuja el título: casillas, huecos entre palabras y la puntuación, fija. */
export function titleTokens(title: string): TitleToken[] {
  const tokens: TitleToken[] = [];
  for (const char of title.normalize('NFC').trim()) {
    if (/\s/u.test(char)) {
      if (tokens.at(-1)?.kind !== 'space') tokens.push({ kind: 'space' });
    } else {
      tokens.push(foldLetter(char) === null ? { kind: 'mark', char } : { kind: 'letter' });
    }
  }
  return tokens;
}

/** Las casillas destapadas por las letras elegidas: la letra donde sale, `null` donde no. */
export function revealLetters(answer: readonly string[], picks: readonly string[]): (string | null)[] {
  const chosen = new Set(picks);
  return answer.map((letter) => (chosen.has(letter) ? letter : null));
}

/** Palabras que no delatan nada: tacharlas dejaría la sinopsis ilegible. */
const COMMON_WORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'los', 'las', 'del', 'una', 'por', 'con', 'sin', 'que', 'mas',
]);

const REDACTED = '████';

function foldWord(word: string): string {
  return word.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * La sinopsis sin las palabras del título, que muchas veces lo nombran («Shrek
 * vive feliz en su pantano»). Se tachan las de los dos títulos, de tres letras o
 * más, sin tildes ni mayúsculas. Todas con el mismo tachón, que no dé su largo.
 */
export function redactTitle(text: string, titles: readonly string[]): string {
  const words = new Set(
    titles
      .flatMap((title) => title.split(/[^\p{L}\p{N}]+/u))
      .map(foldWord)
      .filter((word) => word.length >= 3 && !COMMON_WORDS.has(word)),
  );
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => (words.has(foldWord(word)) ? REDACTED : word));
}
