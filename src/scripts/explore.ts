/**
 * En `/explorar`, cambiar el género o el orden aplica el filtro sin pulsar
 * «Buscar». Sin JavaScript, el botón hace lo mismo.
 *
 * Con teclado, cada flecha cambia el `<select>` cerrado (Windows): aplicarlo en
 * cada `change` recargaría la página a la primera (WCAG 3.2.2). Ahí se aplica
 * al salir del campo.
 */
document.querySelectorAll<HTMLSelectElement>('form[data-explore-filters] select').forEach((select) => {
  let keyboard = false;
  let pending = false;
  select.addEventListener('keydown', () => {
    keyboard = true;
  });
  select.addEventListener('pointerdown', () => {
    keyboard = false;
  });
  select.addEventListener('change', () => {
    if (keyboard) pending = true;
    else select.form?.requestSubmit();
  });
  select.addEventListener('blur', () => {
    if (pending) select.form?.requestSubmit();
  });
});
