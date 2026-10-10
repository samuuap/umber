/**
 * GET /api/account/export — tus datos para descargar (RGPD: portabilidad).
 *
 * Perfil, conversaciones completas y favoritos: nada que la cuenta no pueda
 * ver ya en /conversaciones y /favoritos. Con el cliente de sesión, para que
 * RLS garantice que es solo lo suyo.
 */
import type { APIRoute } from 'astro';

import { errorResponse } from '@/lib/api';
import { AuthError, SupabaseError } from '@/lib/errors';
import { listConversationsForExport } from '@/lib/conversations';
import { listFavorites } from '@/lib/favorites';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { user, supabase } = locals;
    if (user === null) throw new AuthError('Inicia sesión para descargar tus datos.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError !== null) throw new SupabaseError(profileError.message, profileError);
    if (profile === null) throw new SupabaseError('No se ha encontrado el perfil de la cuenta.');
    const [conversaciones, favoritos] = await Promise.all([
      listConversationsForExport(supabase),
      listFavorites(supabase),
    ]);

    const body = JSON.stringify(
      {
        exportado_el: new Date().toISOString(),
        cuenta: {
          id: user.id,
          email: user.email,
          nombre_usuario: user.username,
          creada_el: profile.created_at,
        },
        conversaciones,
        favoritos,
      },
      null,
      2,
    );

    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="umber-datos.json"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: unknown) {
    return errorResponse(error, 'api/account/export');
  }
};
