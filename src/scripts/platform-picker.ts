/**
 * El selector de plataformas (`PlatformPicker.astro`): «Todas» marca o desmarca
 * el resto, y se marca sola cuando están todas.
 */
for (const picker of document.querySelectorAll<HTMLElement>('[data-platform-picker]')) {
  const all = picker.querySelector<HTMLInputElement>('[data-platform-all]');
  const boxes = [...picker.querySelectorAll<HTMLInputElement>('input[name="platform"]')];
  if (all === null) continue;
  all.addEventListener('change', () => {
    for (const box of boxes) box.checked = all.checked;
  });
  for (const box of boxes) {
    box.addEventListener('change', () => {
      all.checked = boxes.every((other) => other.checked);
    });
  }
}

/** Las marcadas, o `null` si son todas o ninguna: entonces no se filtra. */
export function pickedPlatforms(picker: ParentNode): string[] | null {
  const boxes = [...picker.querySelectorAll<HTMLInputElement>('input[name="platform"]')];
  const picked = boxes.filter((box) => box.checked).map((box) => box.value);
  return picked.length === 0 || picked.length === boxes.length ? null : picked;
}
