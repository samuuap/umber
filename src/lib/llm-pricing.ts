/**
 * Coste estimado de una llamada a DeepSeek, en USD, para la trazabilidad.
 *
 * Precios por millón de tokens en hora punta, de la página de precios de
 * DeepSeek (api-docs.deepseek.com/quick_start/pricing), consultada el
 * 2026-10-04. Fuera de la hora punta cuestan la mitad. Cada llamada guarda su
 * coste al registrarse: cambiar un precio aquí no reescribe las anteriores.
 *
 * Es una estimación: los festivos chinos no cuentan como hora punta en DeepSeek
 * y aquí sí, así que en esos días el coste sale un poco por encima.
 */

interface TokenPrices {
  /** Entrada que DeepSeek ya tenía en caché (el system prompt, sobre todo). */
  readonly cacheHit: number;
  readonly cacheMiss: number;
  readonly output: number;
}

const PEAK_PRICES_PER_MILLION: Readonly<Record<string, TokenPrices>> = {
  'deepseek-flash': { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
};

/** Hora punta de DeepSeek: 01:00–04:00 y 06:00–10:00 UTC, de lunes a viernes. */
export function isDeepSeekPeak(at: Date): boolean {
  const weekday = at.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const hour = at.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

export interface TokenUsage {
  readonly cacheHitTokens: number;
  readonly cacheMissTokens: number;
  readonly outputTokens: number;
}

/** USD de una llamada. 0 con un modelo sin precio: mejor un hueco visible que un número inventado. */
export function deepSeekCost(model: string, usage: TokenUsage, at: Date): number {
  const prices = PEAK_PRICES_PER_MILLION[model];
  if (prices === undefined) {
    console.warn(`[llm-pricing] Sin precio para ${model}: la llamada cuenta como 0 USD.`);
    return 0;
  }
  const factor = isDeepSeekPeak(at) ? 1 : 0.5;
  const dollars =
    usage.cacheHitTokens * prices.cacheHit +
    usage.cacheMissTokens * prices.cacheMiss +
    usage.outputTokens * prices.output;
  return (dollars * factor) / 1_000_000;
}
