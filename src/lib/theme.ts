/**
 * El modo claro u oscuro que eligió la persona con el botón de la cabecera.
 * Sin elegir, la sala: oscuro (`global.css`), como un cine, sea cual sea el del
 * sistema.
 * Va en una cookie y no en localStorage para que el servidor pinte ya el
 * bueno: con un script que lo cambiase al cargar, la página parpadearía.
 */
export const THEME_COOKIE = 'umber_tema';

export type Theme = 'light' | 'dark';

export function parseTheme(value: string | undefined): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}
