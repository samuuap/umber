import { describe, expect, test } from 'vitest';

import { escapeHtml, renderReply } from '@/lib/markdown';

describe('renderReply', () => {
  test('escapa el HTML que escriba el modelo', () => {
    expect(renderReply('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  test('la negrita no deja pasar HTML dentro', () => {
    expect(renderReply('**<img src=x onerror=alert(1)>**')).toBe(
      '<p><strong>&lt;img src=x onerror=alert(1)&gt;</strong></p>',
    );
  });

  test('títulos en negrita, párrafos y saltos de línea', () => {
    expect(renderReply('Te propongo **Amélie** (2001).\n\nY si no,\notra.')).toBe(
      '<p>Te propongo <strong>Amélie</strong> (2001).</p><p>Y si no,<br>otra.</p>',
    );
  });

  test('sin párrafos vacíos', () => {
    expect(renderReply('\n\n\nHola\n\n\n')).toBe('<p>Hola</p>');
  });
});

test('escapeHtml escapa las comillas, para atributos', () => {
  expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
});
