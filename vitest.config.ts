/// <reference types="vitest/config" />
// La configuración de Vite de Astro: alias `@/` y módulos virtuales, como en la app.
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
