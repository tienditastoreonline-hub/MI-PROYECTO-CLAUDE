import { NextResponse, type NextRequest } from 'next/server';
import { google } from 'googleapis';

import { aadTokenGoogle, encryptSecret } from '@/lib/crypto/aes';
import { crearOAuthClient, verificarState } from '@/lib/google/oauth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

/**
 * Recibe el código de Google, lo canjea por tokens y los guarda cifrados.
 *
 * Se escribe con el cliente admin porque `google_credentials` no tiene políticas
 * RLS: los tokens no deben poder salir por el Data API. La clínica proviene del
 * `state` firmado, así que sigue siendo la de la sesión que inició el flujo.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;

  const errorDeGoogle = searchParams.get('error');
  if (errorDeGoogle) {
    return NextResponse.redirect(`${origin}/integraciones?google=cancelado`);
  }

  const code = searchParams.get('code');
  const state = verificarState(searchParams.get('state'));

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/integraciones?google=estado-invalido`);
  }

  const oauth = crearOAuthClient();

  let tokens;
  try {
    ({ tokens } = await oauth.getToken(code));
  } catch (error) {
    console.error('[google] no se pudo canjear el código', error);
    return NextResponse.redirect(`${origin}/integraciones?google=error-canje`);
  }

  // Sin refresh token la integración no se puede renovar y dejaría de funcionar
  // en una hora. Ocurre si el usuario ya había dado consentimiento antes y
  // Google no lo reemite; se pide reconectar.
  if (!tokens.refresh_token) {
    return NextResponse.redirect(`${origin}/integraciones?google=sin-refresh-token`);
  }

  let email: string | null = null;
  try {
    oauth.setCredentials(tokens);
    const perfil = await google.oauth2({ version: 'v2', auth: oauth }).userinfo.get();
    email = perfil.data.email ?? null;
  } catch {
    // El correo es informativo: no vale la pena abortar la conexión por esto.
  }

  const { error } = await createAdminClient()
    .from('google_credentials')
    .upsert(
      {
        clinic_id: state.clinicId,
        google_email: email,
        calendar_id: 'primary',
        refresh_token_enc: encryptSecret(
          tokens.refresh_token,
          aadTokenGoogle(state.clinicId, 'refresh_token'),
        ),
        access_token_enc: tokens.access_token
          ? encryptSecret(tokens.access_token, aadTokenGoogle(state.clinicId, 'access_token'))
          : null,
        access_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        scopes: tokens.scope ? tokens.scope.split(' ') : [],
        revoked_at: null,
      },
      { onConflict: 'clinic_id' },
    );

  if (error) {
    console.error('[google] no se pudieron guardar las credenciales', error);
    return NextResponse.redirect(`${origin}/integraciones?google=error-guardado`);
  }

  return NextResponse.redirect(`${origin}/integraciones?google=conectado`);
}
