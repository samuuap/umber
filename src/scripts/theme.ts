/**
 * El botón de la cabecera que cambia entre claro y oscuro. Lo guarda un año en
 * la cookie `umber_tema` (`src/lib/theme.ts`), que lee Layout.astro.
 */
import { THEME_COOKIE, type Theme } from '@/lib/theme';

const LABELS: Record<Theme, string> = { light: 'Cambiar a modo oscuro', dark: 'Cambiar a modo claro' };

// Sin elegir, la sala: oscuro (`global.css`).
function currentTheme(): Theme {
  return document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark';
}

function sync(button: HTMLButtonElement): void {
  const theme = currentTheme();
  button.setAttribute('aria-label', LABELS[theme]);
  button.dataset['current'] = theme;
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
  sync(button);
  button.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    sync(button);
  });
}
