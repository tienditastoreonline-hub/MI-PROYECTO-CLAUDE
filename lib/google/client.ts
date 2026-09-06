import 'server-only';

import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';

import { aadTokenGoogle, decryptSecret, encryptSecret } from '@/lib/crypto/aes';
import { crearOAuthClient } from '@/lib/google/oauth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/supabase/database.types';

/** La clínica no tiene Google conectado, o el consentimiento fue revocado. */
export class GoogleDesconectadoError extends Error {
  constructor(mensaje = 'La clínica no tiene Google Calendar conectado.') {
    super(mensaje);
    this.name = 'GoogleDesconectadoError';
  }
}

export interface ClienteCalendario {
  calendar: calendar_v3.Calendar;
  calendarId: string;
}

const MARGEN_REFRESCO_MS = 5 * 60 * 1000;

/**
 * Cliente de Google Calendar de una clínica, con los tokens descifrados y
 * renovados si hace falta.
 *
 * Usa el cliente admin porque `google_credentials` no tiene políticas RLS: los
 * tokens no deben poder salir por el Data API ni para el dueño de la clínica.
 */
export async function getCalendarClient(clinicId: number): Promise<ClienteCalendario> {
  const db = createAdminClient();

  const { data: credenciales, error } = await db
    .from('google_credentials')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudieron leer las credenciales de Google: ${error.message}`);
  }

  if (!credenciales || credenciales.revoked_at) {
    throw new GoogleDesconectadoError();
  }

  const oauth = crearOAuthClient();

  oauth.setCredentials({
    refresh_token: decryptSecret(credenciales.refresh_token_enc, aadTokenGoogle(clinicId, 'refresh_token')),
    access_token: credenciales.access_token_enc
      ? decryptSecret(credenciales.access_token_enc, aadTokenGoogle(clinicId, 'access_token'))
      : null,
    expiry_date: credenciales.access_token_expires_at
      ? new Date(credenciales.access_token_expires_at).getTime()
      : null,
  });

  // Google emite tokens nuevos por su cuenta: se persisten en cuanto llegan para
  // no perder un refresh token rotado.
  oauth.on('tokens', (tokens) => {
    void persistirTokens(clinicId, tokens);
  });

  const expiraEn = credenciales.access_token_expires_at
    ? new Date(credenciales.access_token_expires_at).getTime()
    : 0;

  if (!credenciales.access_token_enc || expiraEn - Date.now() < MARGEN_REFRESCO_MS) {
    try {
      await oauth.getAccessToken();
    } catch (e) {
      // `invalid_grant` significa consentimiento revocado o refresh token
      // caducado: no se arregla reintentando, hay que reconectar.
      if (esInvalidGrant(e)) {
        await marcarRevocado(clinicId);
        throw new GoogleDesconectadoError(
          'El acceso a Google Calendar expiró o fue revocado. Vuelve a conectarlo desde Integraciones.',
        );
      }
      throw e;
    }
  }

  return {
    calendar: google.calendar({ version: 'v3', auth: oauth }),
    calendarId: credenciales.calendar_id,
  };
}

interface TokensGoogle {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}

type CambiosCredenciales = Database['public']['Tables']['google_credentials']['Update'];

async function persistirTokens(clinicId: number, tokens: TokensGoogle): Promise<void> {
  const db = createAdminClient();

  const cambios: CambiosCredenciales = {};

  if (tokens.access_token) {
    cambios.access_token_enc = encryptSecret(tokens.access_token, aadTokenGoogle(clinicId, 'access_token'));
  }
  if (tokens.expiry_date) {
    cambios.access_token_expires_at = new Date(tokens.expiry_date).toISOString();
  }
  if (tokens.refresh_token) {
    cambios.refresh_token_enc = encryptSecret(tokens.refresh_token, aadTokenGoogle(clinicId, 'refresh_token'));
  }

  if (Object.keys(cambios).length === 0) return;

  await db.from('google_credentials').update(cambios).eq('clinic_id', clinicId);
}

async function marcarRevocado(clinicId: number): Promise<void> {
  await createAdminClient()
    .from('google_credentials')
    .update({ revoked_at: new Date().toISOString(), access_token_enc: null })
    .eq('clinic_id', clinicId);
}

function esInvalidGrant(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const texto = JSON.stringify('response' in error ? error.response : error);
  return texto.includes('invalid_grant');
}
