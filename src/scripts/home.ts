/**
 * Portada.
 *
 * El cuadro se comporta como el del chat: Intro envía y Mayúsculas + Intro hace
 * un salto de línea. Sin JavaScript, envía el botón.
 *
 * En el índice «Del catálogo», el cartel de al lado es el del título que se
 * señala (ratón o teclado). Sin JavaScript se ve el del primero.
 */
const form = document.querySelector<HTMLFormElement>('form[data-home-composer]');
const input = form?.querySelector<HTMLTextAreaElement>('textarea');

input?.addEventListener('keydown', (event) => {
  // `isComposing`: no cortar un acento a medias.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (input.value.trim().length > 0) form?.requestSubmit();
});

const index = document.querySelector<HTMLElement>('[data-index]');
const posters = index?.querySelectorAll<HTMLElement>('[data-index-poster]') ?? [];

function show(position: string): void {
  posters.forEach((poster) => {
    poster.toggleAttribute('data-active', poster.dataset.indexPoster === position);
  });
}

index?.querySelectorAll<HTMLElement>('[data-index-item]').forEach((item) => {
  const position = item.dataset.indexItem ?? '0';
  item.addEventListener('pointerenter', () => {
    show(position);
  });
  item.addEventListener('focus', () => {
    show(position);
  });
});
