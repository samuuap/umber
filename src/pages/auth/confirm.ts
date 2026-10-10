/**
 * GET /auth/confirm — adonde vuelve el enlace del email de confirmación.
 *
 * Acepta los dos formatos que puede traer, según la plantilla de email:
 *  - `?code=…`: la plantilla por defecto de Supabase (flujo PKCE). Solo funciona
 *    en el navegador que se registró, que es el que guarda el verificador.
 *  - `?token_hash=…&type=…`: la plantilla recomendada para SSR. Funciona en
 *    cualquier navegador. Ver `CLAUDE.md`, sección de auth.
 */
import type { EmailOtpType } from '@supabase/supabase-js';
import type { APIRoute } from 'astro';

import { safeRedirectPath } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return EMAIL_OTP_TYPES.some((type) => type === value);
}

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const next = safeRedirectPath(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  let failure: string | null = 'el enlace no trae ni código ni token';
  let username: unknown;
  if (code !== null) {
    const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
    failure = error === null ? null : errorMessage(error);
    username = data.user?.user_metadata?.['username'];
  } else if (tokenHash !== null && isEmailOtpType(type)) {
    const { data, error } = await locals.supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failure = error === null ? null : errorMessage(error);
    username = data.user?.user_metadata?.['username'];
  }

  if (failure === null) {
    // Google (y cualquier proveedor sin nombre en sus metadatos) llega sin
    // `profiles.username`: hace falta elegirlo antes de seguir.
    if (typeof username === 'string') return redirect(next, 303);
    return redirect(`/cuenta/nombre?next=${encodeURIComponent(next)}`, 303);
  }
  console.warn('[auth/confirm] Enlace rechazado:', failure);
  return redirect('/entrar?error=enlace', 303);
};
