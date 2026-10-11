import { describe, expect, test } from 'vitest';

import { countVowels, foldLetter, redactTitle, revealLetters, titleLetters, titleTokens } from '@/lib/game-rules';

describe('foldLetter', () => {
  test('mayúscula y sin tilde', () => {
    expect(foldLetter('á')).toBe('A');
    expect(foldLetter('ü')).toBe('U');
    expect(foldLetter('z')).toBe('Z');
  });

  test('la Ñ es una letra propia', () => {
    expect(foldLetter('ñ')).toBe('Ñ');
  });

  test('lo que no es letra, null', () => {
    expect(foldLetter('1')).toBeNull();
    expect(foldLetter('-')).toBeNull();
    expect(foldLetter(' ')).toBeNull();
  });
});

test('titleLetters: solo las letras, plegadas y en orden', () => {
  expect(titleLetters('¡El Señor!')).toEqual(['E', 'L', 'S', 'E', 'Ñ', 'O', 'R']);
});

test('titleTokens: un hueco por espacio seguido y la puntuación fija', () => {
  expect(titleTokens(' Ay,  sí ')).toEqual([
    { kind: 'letter' },
    { kind: 'letter' },
    { kind: 'mark', char: ',' },
    { kind: 'space' },
    { kind: 'letter' },
    { kind: 'letter' },
  ]);
});

test('revealLetters destapa todas las casillas de cada letra elegida', () => {
  expect(revealLetters(['A', 'N', 'A', 'S'], ['A', 'Z'])).toEqual(['A', null, 'A', null]);
});

test('countVowels cuenta las vocales ya plegadas', () => {
  expect(countVowels(['A', 'R', 'E', 'Ñ'])).toBe(2);
});

describe('redactTitle', () => {
  test('tacha las palabras del título, sin mirar tildes ni mayúsculas', () => {
    expect(redactTitle('Shrek vive feliz. El ogro SHREK no quiere visitas', ['Shrek'])).toBe(
      '████ vive feliz. El ogro ████ no quiere visitas',
    );
    expect(redactTitle('Una historia de otono', ['Otoño en Nueva York'])).toBe('Una historia de ████');
  });

  test('las palabras comunes y las cortas no se tachan', () => {
    expect(redactTitle('Los de la casa', ['Los de la casa'])).toBe('Los de la ████');
  });

  test('con los dos títulos, el de España y el inglés', () => {
    expect(redactTitle('Un regreso al futuro en el tiempo', ['Regreso al futuro', 'Back to the Future'])).toBe(
      'Un ████ al ████ en el tiempo',
    );
  });
});
