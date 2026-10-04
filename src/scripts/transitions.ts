/**
 * El cartel que se pulsa en una rejilla viaja hasta la ficha. La transición la
 * hace el navegador (`@view-transition` en `global.css`); aquí solo se le dice
 * qué cartel es: el que lleva el nombre `poster` en las dos páginas. En la ficha
 * lo lleva su cartel grande (`[view-transition-name:poster]`).
 *
 * Dos elementos con el mismo nombre anulan la transición, así que antes de
 * nombrar el pulsado se le quita al que lo tuviera (la ficha, al pulsar uno de
 * «Más como esta»). Sin soporte, no pasa nada: se navega como siempre.
 */
const NAME = 'poster';

document.addEventListener('click', (event) => {
  // Con una tecla pulsada se abre en otra pestaña: no hay transición que preparar.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Element)) return;
  const poster = target.closest('a[data-poster-link]')?.querySelector<HTMLElement>('[data-poster]');
  if (poster === null || poster === undefined) return;

  document.querySelectorAll<HTMLElement>('[data-poster-target]').forEach((element) => {
    element.style.viewTransitionName = 'none';
  });
  poster.style.viewTransitionName = NAME;
});

// Al volver atrás, la página sale de la caché tal cual: sin nombres de antes.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  document.querySelectorAll<HTMLElement>('[data-poster], [data-poster-target]').forEach((element) => {
    element.style.removeProperty('view-transition-name');
  });
});
