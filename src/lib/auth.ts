/**
 * Identidad del usuario en páginas y endpoints.
 *
 * La sesión vive en cookies `httpOnly` (SSR, decisión de la Fase 5): el
 * middleware la lee en cada petición y deja el usuario en `Astro.locals.user`.
 * Los endpoints aceptan además `Authorization: Bearer <access_token>`, para
 * clientes que no son el navegador, como los scripts de verificación.
 */
import { isRecord } from '@/lib/api';
import { AuthError, errorMessage } from '@/lib/errors';
import { readAiConsent, type AiConsentRecord } from '@/lib/legal';
import { parsePlatformNames } from '@/lib/platforms';
import {
  createSupabaseUserClient,
  getSupabaseClient,
  type UmberSupabaseClient,
} from '@/lib/supabase';

/** Lo que las páginas necesitan saber de quien ha iniciado sesión. */
export interface SessionUser {
  readonly id: string;
  readonly email: string | null;
  /** `null` en las cuentas anteriores al nombre de usuario. */
  readonly username: string | null;
  /**
   * `app_metadata.role === 'admin'`: solo lo cambia la Admin API, nadie desde
   * su propia cuenta (ver `scripts/set-admin.mjs`). Decide el acceso a `/admin`.
   */
  readonly isAdmin: boolean;
  /** `app_metadata.role === 'tester'`: las cuentas que crean los scripts de evaluación. */
  readonly isTester: boolean;
  /** El consentimiento para el chat guardado en la cuenta (`src/lib/legal.ts`), o `null`. */
  readonly aiConsent: AiConsentRecord | null;
  /** «Mis plataformas» (`user_metadata.platforms`): las que el chat propone marcadas. `null`, ninguna guardada. */
  readonly platforms: string[] | null;
}

export const MIN_PASSWORD_CHARS = 8;
/** El límite de bcrypt, que es el que aplica Supabase Auth. */
export const MAX_PASSWORD_CHARS = 72;
/** El mismo formato que exige el `CHECK` de `profiles.username`. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/u;
/** Para el `pattern` del input: admite mayúsculas porque el servidor las pasa a minúsculas. */
export const USERNAME_INPUT_PATTERN = '[A-Za-z0-9_]{3,20}';

export type AuthFormField = 'username' | 'email' | 'password' | 'password_confirm';

export interface AuthFormError {
  readonly message: string;
  /** El campo al que se refiere, para pintarlo junto a él; `null`, arriba del formulario. */
  readonly field: AuthFormField | null;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Si el nombre ya es de alguien. Un registro con un nombre cogido falla con un
 * error genérico de base de datos (lo rechaza el UNIQUE de `profiles`); esto
 * dice si fue por eso. Si no se puede saber, `false`: mejor el mensaje genérico
 * que uno falso.
 */
export async function isUsernameTaken(supabase: UmberSupabaseClient, username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', { p_username: username });
  if (error !== null) {
    console.warn('[auth] No se ha podido comprobar el nombre de usuario:', error.message);
    return false;
  }
  return !data;
}

export interface RequestUser {
  readonly id: string;
  /** Admin o cuenta de prueba: fuera de los límites del chat (`rate-limit.ts`). */
  readonly unlimited: boolean;
  /** El consentimiento para el chat guardado en la cuenta, o `null`. */
  readonly aiConsent: AiConsentRecord | null;
  /** Cliente con la sesión del usuario: RLS se evalúa como él. */
  readonly client: UmberSupabaseClient;
}

/**
 * Usuario de la sesión en cookies, o `null`. `getClaims` verifica la firma en
 * local con las claves asimétricas del proyecto, sin llamada de red, y renueva el
 * token si ha caducado: por eso la llama el middleware en cada petición.
 */
/** El rol de `app_metadata`, que solo cambia la Admin API. */
function roleOf(appMetadata: unknown): string | null {
  const role = isRecord(appMetadata) ? appMetadata['role'] : null;
  return typeof role === 'string' ? role : null;
}

export async function getSessionUser(supabase: UmberSupabaseClient): Promise<SessionUser | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (claims === undefined || typeof claims.sub !== 'string' || claims.sub.length === 0) {
      return null;
    }
    // Los triggers de `profiles` lo mantienen igual que en la tabla: no hace falta consultarla.
    const username: unknown = claims.user_metadata?.['username'];
    const appMetadata: unknown = claims.app_metadata;
    return {
      id: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      username: typeof username === 'string' ? username : null,
      isAdmin: roleOf(appMetadata) === 'admin',
      isTester: roleOf(appMetadata) === 'tester',
      aiConsent: readAiConsent(claims.user_metadata),
      platforms: parsePlatformNames(claims.user_metadata?.['platforms']),
    };
  } catch (error: unknown) {
    // Una cookie corrupta o un refresh token revocado no tumban la página: se
    // sigue como anónimo, que es lo que la persona tiene que ver.
    console.warn('[auth] Sesión ilegible, se sigue sin sesión:', errorMessage(error));
    return null;
  }
}

function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header === null) return null;

  const token = /^Bearer\s+(\S+)$/iu.exec(header.trim())?.[1];
  if (token === undefined) {
    throw new AuthError('La cabecera Authorization tiene que ser «Bearer <token>».');
  }
  return token;
}

/**
 * Destino tras iniciar sesión, solo si es una ruta de esta misma web. Un
 * `?next=https://otra-web.com` convertiría el login en una redirección abierta.
 */
export function safeRedirectPath(value: string | null, fallback = '/'): string {
  if (value === null || !value.startsWith('/')) return fallback;
  // Se resuelve como lo haría el navegador, que quita tabuladores y saltos de
  // línea y lee «\» como «/»: «/%09/otra-web.com» acababa en https://otra-web.com.
  const base = 'https://umber.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return fallback;
  }
  return url.origin === base ? url.pathname + url.search + url.hash : fallback;
}

/**
 * La página actual como destino de vuelta (`?next=`), sin `q`: el chat envía
 * ese mensaje al abrirse, y al volver tras entrar lo mandaría otra vez y abriría
 * otra conversación.
 */
export function returnPath(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete('q');
  const search = params.toString();
  return search === '' ? url.pathname : `${url.pathname}?${search}`;
}

/**
 * El mensaje que traía quien llega a entrar o registrarse desde el chat (el `q`
 * de `next`, el último con texto, como lee el chat), o `null`.
 */
export function pendingMessage(next: string): string | null {
  const url = new URL(next, 'http://umber.invalid');
  if (url.pathname !== '/chat') return null;
  return url.searchParams.getAll('q').map((value) => value.trim()).findLast((value) => value.length > 0) ?? null;
}

/**
 * Para las páginas de `/admin`: 404 y no una redirección a `/entrar`, para no
 * revelar a quien no es admin que la ruta existe. `return` el resultado si no
 * es `null`.
 */
export function adminGate(user: SessionUser | null): Response | null {
  return user?.isAdmin === true ? null : new Response(null, { status: 404 });
}

/** Códigos de error de Supabase Auth que la persona puede resolver por sí misma. */
const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_credentials: 'El email o la contraseña no son correctos.',
  email_not_confirmed: 'Falta confirmar la cuenta: revisa tu correo y abre el enlace que te enviamos.',
  weak_password: 'Esa contraseña es demasiado débil. Prueba con una más larga.',
  user_already_exists: 'Ya hay una cuenta con ese email. Inicia sesión.',
  email_exists: 'Ya hay una cuenta con ese email. Inicia sesión.',
  over_email_send_rate_limit: 'Hemos enviado demasiados correos seguidos. Prueba dentro de unos minutos.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Prueba dentro de unos minutos.',
  validation_failed: 'Revisa el email: no parece válido.',
  email_address_invalid: 'Revisa el email: no parece válido.',
  signup_disabled: 'El registro está cerrado ahora mismo.',
  // Del mailer de pruebas de Supabase (solo entrega al equipo del proyecto) o
  // de un problema puntual del SMTP: en los dos casos, no ha salido el correo.
  email_address_not_authorized: 'No hemos podido enviarte el correo. Prueba otra vez en un momento.',
};

/** Mensaje en español para un error de Supabase Auth. El detalle técnico va al log. */
export function authErrorMessage(error: { code?: string | undefined; message: string }): string {
  const known = error.code === undefined ? undefined : AUTH_ERROR_MESSAGES[error.code];
  if (known !== undefined) return known;
  console.warn('[auth] Error sin mensaje propio:', error.code, error.message);
  return 'No se ha podido completar. Prueba otra vez en un momento.';
}

export interface RequestUserContext {
  readonly request: Request;
  readonly locals: App.Locals;
}

/**
 * Usuario de la petición: el del token Bearer si lo hay y si no, el de la
 * sesión en cookies. Un token presente pero inválido o caducado es un 401, no un
 * usuario anónimo: así el cliente sabe que tiene que renovar la sesión en vez de
 * perder el historial sin enterarse.
 */
export async function getRequestUser(context: RequestUserContext): Promise<RequestUser | null> {
  const token = readBearerToken(context.request);

  if (token === null) {
    const user = context.locals.user;
    return user === null
      ? null
      : {
          id: user.id,
          unlimited: user.isAdmin || user.isTester,
          aiConsent: user.aiConsent,
          client: context.locals.supabase,
        };
  }

  const { data, error } = await getSupabaseClient().auth.getClaims(token);
  const userId: unknown = data?.claims.sub;
  if (error !== null || typeof userId !== 'string' || userId.length === 0) {
    throw new AuthError('La sesión no es válida o ha caducado.', error ?? undefined);
  }
  const role = roleOf(data?.claims.app_metadata);
  return {
    id: userId,
    unlimited: role === 'admin' || role === 'tester',
    aiConsent: readAiConsent(data?.claims.user_metadata),
    client: createSupabaseUserClient(token),
  };
}
