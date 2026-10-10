/**
 * GET /auth/google — inicia el inicio de sesión con Google (OAuth, PKCE).
 *
 * `signInWithOAuth` guarda el code verifier en una cookie (vía el cliente de
 * `locals.supabase`) y devuelve la URL de consentimiento de Google. Esta vuelve
 * a `/auth/confirm?code=…`, que ya sabe canjearlo (mismo flujo que el enlace de
 * confirmación del email).
 */
import type { APIRoute } from 'astro';

import { safeRedirectPath } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const next = safeRedirectPath(url.searchParams.get('next'));

  const { data, error } = await locals.supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${url.origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });

  if (error !== null || data.url.length === 0) {
    console.warn('[auth/google] signInWithOAuth:', error === null ? 'sin URL' : errorMessage(error));
    return redirect('/entrar?error=google', 303);
  }
  return redirect(data.url, 303);
};
