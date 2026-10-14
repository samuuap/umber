/**
 * Rate limiting de `/api/chat` y `/api/search`, con los contadores en Supabase
 * (`rate_limits`).
 *
 * En Vercel cada petición puede caer en una instancia distinta, así que el
 * contador no puede vivir en memoria. `hit_rate_limit` cuenta en ventanas fijas
 * con un upsert atómico, y solo la puede llamar la secret key: con la
 * publishable, cualquiera podría gastar el cupo de otra IP.
 *
 * Con sesión se cuenta por usuario; sin ella, por IP. Cada ámbito lleva su
 * propia cuenta. Si el contador no responde, el endpoint tampoco: sin límite,
 * quedaría abierto sin que nadie se enterase. La búsqueda depende de la misma
 * base, así que esto no añade ninguna caída que no hubiera ya.
 */
import { RateLimitError } from '@/lib/errors';
import { getSupabaseAdminClient, unwrap } from '@/lib/supabase';
import { MAX_CONVERSATION_MESSAGES } from '@/lib/types';

export interface RateLimitRule {
  readonly windowSeconds: number;
  readonly limit: number;
}

const MINUTE = 60;
const FIVE_MINUTES = 5 * MINUTE;
const DAY = 24 * 60 * 60;

export type RateLimitScope = 'chat' | 'search' | 'entrar' | 'registro';

interface ScopeLimits {
  readonly user: readonly RateLimitRule[];
  readonly anonymous: readonly RateLimitRule[];
  /**
   * Entre todos: el techo del gasto total. Solo cuenta las peticiones que caben
   * en el límite de la persona; si contara las rechazadas, una sola IP
   * insistiendo agotaría el cupo de todos en segundos.
   */
  readonly global?: readonly RateLimitRule[];
  /** Lo que se cuenta, para el mensaje: «Has llegado al límite de {noun} de hoy». */
  readonly noun: string;
}

const ENTRAR_LIMITS: readonly RateLimitRule[] = [
  { windowSeconds: FIVE_MINUTES, limit: 10 },
  { windowSeconds: DAY, limit: 50 },
];
const REGISTRO_LIMITS: readonly RateLimitRule[] = [
  { windowSeconds: FIVE_MINUTES, limit: 5 },
  { windowSeconds: DAY, limit: 20 },
];

export const RATE_LIMITS: Readonly<Record<RateLimitScope, ScopeLimits>> = {
  /*
   * Cada respuesta tarda varios segundos en llegar: nadie escribe ocho mensajes
   * por minuto a mano. Decisión de producto (2026-10-03): con cuenta, 50 al día,
   * dos o tres conversaciones, y así ninguna cuenta sola agota el cupo global.
   * Desde el 2026-10-11 el chat exige cuenta (`/api/chat` responde 401 sin
   * ella) y lo que de verdad limita es `RECOMMENDATIONS_PER_DAY`, abajo: esto
   * queda como freno para quien pregunta sin parar. `anonymous` ya no se usa.
   */
  chat: {
    user: [
      { windowSeconds: MINUTE, limit: 8 },
      { windowSeconds: DAY, limit: 50 },
    ],
    anonymous: [
      { windowSeconds: MINUTE, limit: 8 },
      { windowSeconds: DAY, limit: MAX_CONVERSATION_MESSAGES / 2 },
    ],
    /*
     * Decisión de producto (2026-10-12, Friends and Family): 1.500 al día entre
     * todos, unos 0,60 USD de DeepSeek como mucho. Medido: 0,0004 USD por
     * petición de media (`llm_calls`, última semana). Con 300, unos 25 amigos el
     * mismo día cerraban el chat para todos. Subirlo con el tráfico.
     */
    global: [{ windowSeconds: DAY, limit: 1500 }],
    noun: 'mensajes',
  },
  /*
   * Sin DeepSeek: un embedding y una consulta. Más alto que el chat, pero con
   * techo. El global protege la cuota gratuita de Cloudflare (unas 90.000
   * consultas al día), que comparte con el chat: sin él, muchas IPs podían
   * gastarla buscando y dejar el chat sin embeddings.
   */
  search: {
    user: [
      { windowSeconds: MINUTE, limit: 30 },
      { windowSeconds: DAY, limit: 1000 },
    ],
    anonymous: [
      { windowSeconds: MINUTE, limit: 20 },
      { windowSeconds: DAY, limit: 300 },
    ],
    global: [{ windowSeconds: DAY, limit: 5000 }],
    noun: 'búsquedas',
  },
  /*
   * Propio, además del de Supabase (30 entradas o registros cada 5 minutos por
   * IP, que se queda igual). Quien llama a `/entrar` o `/registro` nunca tiene
   * sesión: las dos páginas redirigen si ya la hay, así que `user` nunca se usa
   * y repite los mismos límites que `anonymous`.
   */
  entrar: {
    user: ENTRAR_LIMITS,
    anonymous: ENTRAR_LIMITS,
    noun: 'intentos',
  },
  /*
   * Más estricto que `entrar`: cada intento que llega a Supabase manda un
   * correo. El global protege el cupo del SMTP (Gmail, unos 500 al día),
   * dejando margen para la confirmación, la recuperación y el cambio de email.
   */
  registro: {
    user: REGISTRO_LIMITS,
    anonymous: REGISTRO_LIMITS,
    global: [{ windowSeconds: DAY, limit: 300 }],
    noun: 'correos',
  },
};

// ─── Claves ──────────────────────────────────────────────────────────────────

/** Los ocho grupos de una IPv6, o `null` si no lo es. Admite `::` y una IPv4 al final. */
function ipv6Groups(address: string): string[] | null {
  const halves = (address.split('%')[0] ?? '').split('::');
  if (halves.length > 2) return null;

  const [head = [], tail = []] = halves.map((half) => (half === '' ? [] : half.split(':')));
  const last = tail.at(-1) ?? head.at(-1);
  // Una IPv4 al final (`::ffff:1.2.3.4`) ocupa dos grupos; para el /64 da igual cuáles.
  const ipv4Tail = last?.includes('.') === true;
  const size = head.length + tail.length + (ipv4Tail ? 1 : 0);
  const missing = 8 - size;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const hex = ipv4Tail ? groups.slice(0, -1) : groups;
  return hex.every((group) => /^[0-9a-f]{1,4}$/u.test(group)) ? groups : null;
}

/**
 * Clave de quien no ha iniciado sesión. Una IPv6 se cuenta por su /64, que es lo
 * que un proveedor asigna a cada conexión: dentro de él, cambiar de dirección es
 * gratis, y contar por dirección dejaría el límite en nada.
 */
export function clientKey(address: string | null): string {
  if (address === null || address.length === 0) return 'ip:unknown';
  const ip = address.trim().toLowerCase();

  // Una IPv4 escrita como IPv6 (`::ffff:1.2.3.4`) es la misma IPv4.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(ip)?.[1];
  if (mapped !== undefined) return `ip:${mapped}`;
  if (!ip.includes(':')) return `ip:${ip}`;

  const groups = ipv6Groups(ip);
  if (groups === null) return `ip:${ip}`;
  const prefix = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/u, ''));
  return `ip:${prefix.join(':')}::/64`;
}

// ─── Límite ──────────────────────────────────────────────────────────────────

function formatWait(seconds: number): string {
  if (seconds < MINUTE) return seconds === 1 ? '1 segundo' : `${String(seconds)} segundos`;
  const minutes = Math.ceil(seconds / MINUTE);
  if (minutes < 60) return minutes === 1 ? '1 minuto' : `${String(minutes)} minutos`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? '1 hora' : `${String(hours)} horas`;
}

function limitError(scope: RateLimitScope, retryAfterSeconds: number, anonymous: boolean): RateLimitError {
  // Solo la ventana diaria hace esperar más de un minuto.
  if (retryAfterSeconds <= MINUTE) {
    return new RateLimitError(
      `Vas muy deprisa. Espera ${formatWait(retryAfterSeconds)} y vuelve a intentarlo.`,
      retryAfterSeconds,
    );
  }
  const limits = RATE_LIMITS[scope];
  const message = `Has llegado al límite de ${limits.noun} de hoy. Podrás seguir en ${formatWait(retryAfterSeconds)}.`;
  // Solo tiene sentido el aviso si con sesión el límite es de verdad distinto
  // (`entrar` y `registro` no tienen una versión con sesión: nadie llama a eso
  // con una ya iniciada).
  const higherWithSession = anonymous && limits.user !== limits.anonymous;
  return new RateLimitError(
    higherWithSession ? `${message} Con la sesión iniciada el límite es más alto.` : message,
    retryAfterSeconds,
  );
}

export interface Requester {
  /** `null` sin sesión. */
  readonly userId: string | null;
  /** IP de la petición. En Vercel la pone su proxy, así que el cliente no puede falsearla. */
  readonly clientAddress: string | null;
  /** Admin y cuentas de prueba (rol `admin` o `tester`): sin límites ni cuenta en el global. */
  readonly unlimited?: boolean;
}

/** Cuenta una petición en `key`. Devuelve 0 si cabe; si no, los segundos hasta poder repetir. */
async function hit(key: string, rules: readonly RateLimitRule[]): Promise<number> {
  return unwrap(
    await getSupabaseAdminClient().rpc('hit_rate_limit', {
      p_key: key,
      p_window_seconds: rules.map((rule) => rule.windowSeconds),
      p_limits: rules.map((rule) => rule.limit),
    }),
  );
}

/** Cuenta una petición del ámbito. Lanza `RateLimitError` (429) si no cabe. */
export async function enforceRateLimit(scope: RateLimitScope, requester: Requester): Promise<void> {
  // Las evaluaciones mandan cientos de mensajes: sin esto, se comían el cupo de todos (2026-10-11).
  if (requester.unlimited === true) return;
  const { userId } = requester;
  const anonymous = userId === null;
  const limits = RATE_LIMITS[scope];
  const rules = anonymous ? limits.anonymous : limits.user;
  const identity = userId === null ? clientKey(requester.clientAddress) : `user:${userId}`;

  const retryAfterSeconds = await hit(`${scope}:${identity}`, rules);
  if (retryAfterSeconds > 0) throw limitError(scope, retryAfterSeconds, anonymous);

  // Después, y no a la vez: ver `ScopeLimits.global`.
  if (limits.global === undefined) return;
  const globalRetryAfter = await hit(`${scope}:global`, limits.global);
  if (globalRetryAfter > 0) {
    throw new RateLimitError(
      `Umber ha llegado a su límite de ${limits.noun} de hoy. Podrás seguir en ${formatWait(globalRetryAfter)}.`,
      globalRetryAfter,
    );
  }
}

// ─── Recomendaciones al día ──────────────────────────────────────────────────

/**
 * Decisión de producto (2026-10-11): el chat exige cuenta y cada cuenta recibe
 * 2 recomendaciones al día; 5 desde el 2026-10-14, para el friends and family
 * (100 cuentas: unas 1.500 al día, el tope global de mensajes). Cuenta cada respuesta de Umber que recomienda algo,
 * también «otra» de los mismos candidatos. Al llegar, el chat se cierra hasta el
 * día siguiente (UTC, como el resto de contadores), preguntas incluidas. Quedan
 * fuera las cuentas con rol `admin` o `tester` (las de los scripts de
 * evaluación), que tampoco cuentan para los demás límites ni para el global.
 */
export const RECOMMENDATIONS_PER_DAY = 5;

const recommendationsKey = (userId: string): string => `recommend:user:${userId}`;

/** El inicio del día UTC de ahora: la ventana diaria de `hit_rate_limit`, alineada con la época. */
function dayWindowStart(now: number): Date {
  return new Date(Math.floor(now / (DAY * 1000)) * DAY * 1000);
}

/** Las que le quedan hoy y los segundos hasta que vuelvan a ser 2. */
export async function recommendationsLeft(userId: string): Promise<{ left: number; resetsInSeconds: number }> {
  const now = Date.now();
  const start = dayWindowStart(now);
  const rows = unwrap(
    await getSupabaseAdminClient()
      .from('rate_limits')
      .select('hits')
      .eq('key', recommendationsKey(userId))
      .eq('window_seconds', DAY)
      .eq('window_start', start.toISOString()),
  );
  const used = rows[0]?.hits ?? 0;
  return {
    left: Math.max(0, RECOMMENDATIONS_PER_DAY - used),
    resetsInSeconds: Math.max(1, Math.ceil((start.getTime() + DAY * 1000 - now) / 1000)),
  };
}

/** Lanza `RateLimitError` (`recommendations_used`) si ya no le quedan. Antes de llamar a nada que cueste. */
export async function enforceRecommendationsLeft(userId: string): Promise<void> {
  const { left, resetsInSeconds } = await recommendationsLeft(userId);
  if (left > 0) return;
  throw new RateLimitError(
    `Ya tienes tus ${String(RECOMMENDATIONS_PER_DAY)} recomendaciones de hoy. Podrás pedir más en ${formatWait(resetsInSeconds)}.`,
    resetsInSeconds,
    'recommendations_used',
  );
}

/** Suma una recomendación hecha. Si dos llegan a la vez puede pasarse en una: se acepta. */
export async function countRecommendation(userId: string): Promise<void> {
  await hit(recommendationsKey(userId), [{ windowSeconds: DAY, limit: RECOMMENDATIONS_PER_DAY }]);
}
