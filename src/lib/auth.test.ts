import { describe, expect, test } from 'vitest';

import { pendingMessage, safeRedirectPath } from '@/lib/auth';

describe('safeRedirectPath', () => {
  test('una ruta de la web pasa, con su búsqueda', () => {
    expect(safeRedirectPath('/chat?mode=movie&q=Algo%20lento')).toBe('/chat?mode=movie&q=Algo%20lento');
  });

  test.each([
    ['otra web', 'https://otra-web.com'],
    ['sin esquema', '//otra-web.com'],
    ['barra invertida', '/\\otra-web.com'],
    ['tabulador, que el navegador quita', '/\t/otra-web.com'],
    ['salto de línea', '/\n/otra-web.com'],
    ['javascript', 'javascript:alert(1)'],
  ])('%s: va al destino por defecto', (_, value) => {
    expect(safeRedirectPath(value)).toBe('/');
  });
});

describe('pendingMessage', () => {
  test('el último q con texto del chat', () => {
    expect(pendingMessage('/chat?mode=movie&q=Algo%20lento&q=%20')).toBe('Algo lento');
    expect(pendingMessage('/chat?mode=movie&q=uno&q=dos')).toBe('dos');
  });

  test('null fuera del chat o sin mensaje', () => {
    expect(pendingMessage('/favoritos?q=hola')).toBeNull();
    expect(pendingMessage('/chat?mode=movie')).toBeNull();
    expect(pendingMessage('/')).toBeNull();
  });
});
