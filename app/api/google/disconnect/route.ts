import { NextResponse } from 'next/server';

import { aadTokenGoogle, decryptSecret } from '@/lib/crypto/aes';
import { requireClinic } from '@/lib/auth/tenant';
import { crearOAuthClient } from '@/lib/google/oauth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Desconecta Google Calendar: revoca el permiso en Google y borra los tokens.
 *
 * Se revoca antes de borrar; si la revocación falla (el permiso ya no existe,
 * por ejemplo) se continúa igualmente, porque dejar los tokens guardados sería
 * peor que un permiso huérfano en la cuenta de Google.
 */
export async function POST(): Promise<NextResponse> {
  const { clinic, esOwner } = await requireClinic();

  if (!esOwner) {
    return NextResponse.json(
      { error: 'Solo el dueño de la clínica puede desconectar Google Calendar.' },
      { status: 403 },
    );
  }

  const db = createAdminClient();

  const { data: credenciales } = await db
    .from('google_credentials')
    .select('refresh_token_enc')
    .eq('clinic_id', clinic.id)
    .maybeSingle();

  if (credenciales?.refresh_token_enc) {
    try {
      const refresh = decryptSecret(
        credenciales.refresh_token_enc,
        aadTokenGoogle(clinic.id, 'refresh_token'),
      );
      await crearOAuthClient().revokeToken(refresh);
    } catch (error) {
      console.warn('[google] no se pudo revocar el token, se elimina de todos modos', error);
    }
  }

  await db.from('google_credentials').delete().eq('clinic_id', clinic.id);

  return NextResponse.json({ ok: true });
}
