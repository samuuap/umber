import { describe, expect, test } from 'vitest';

import { pendingMessage } from '@/lib/auth';

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
