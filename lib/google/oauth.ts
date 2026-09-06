import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';

import { serverEnv } from '@/lib/env.server';

/**
 * Scopes mínimos:
 *   · `calendar.events`   → crear, modificar y borrar las citas.
 *   · `calendar.readonly` → consultar freebusy y listar los eventos existentes,
 *                           incluidos los que la clínica crea a mano en Google.
 * No se pide el scope `calendar` completo: no hace falta para nada de esto.
 */
export const SCOPES_GOOGLE = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
];

/** `google-auth-library` no es dependencia directa: se toma el tipo del constructor. */
export type OAuthClient = InstanceType<typeof google.auth.OAuth2>;

export function crearOAuthClient(): OAuthClient {
  const env = serverEnv();
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

/**
 * `state` firmado para el flujo OAuth.
 *
 * Lleva la clínica y un nonce, y va firmado con HMAC: sin firma, cualquiera
 * podría inducir a un usuario a conectar SU cuenta de Google a OTRA clínica
 * manipulando el parámetro.
 */
export function firmarState(clinicId: number): string {
  const payload = `${clinicId}.${Date.now()}.${randomBytes(8).toString('hex')}`;
  const firma = createHmac('sha256', serverEnv().ENCRYPTION_KEY).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${firma}`;
}

const VALIDEZ_STATE_MS = 15 * 60 * 1000;

export function verificarState(state: string | null): { clinicId: number } | null {
  if (!state) return null;

  const separador = state.lastIndexOf('.');
  if (separador <= 0) return null;

  const payloadB64 = state.slice(0, separador);
  const firmaRecibida = state.slice(separador + 1);

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const firmaEsperada = createHmac('sha256', serverEnv().ENCRYPTION_KEY).update(payload).digest('base64url');

  const a = Buffer.from(firmaRecibida);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [clinicIdTexto, emitidoTexto] = payload.split('.');
  const clinicId = Number(clinicIdTexto);
  const emitido = Number(emitidoTexto);

  if (!Number.isInteger(clinicId) || clinicId <= 0 || !Number.isFinite(emitido)) return null;
  if (Date.now() - emitido > VALIDEZ_STATE_MS) return null;

  return { clinicId };
}

/**
 * URL de consentimiento.
 *
 * `access_type: 'offline'` y `prompt: 'consent'` son necesarios para recibir un
 * refresh token: sin ellos Google solo lo entrega la primera vez y una
 * reconexión dejaría la integración sin poder renovarse.
 */
export function urlDeConsentimiento(clinicId: number): string {
  return crearOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES_GOOGLE,
    include_granted_scopes: true,
    state: firmarState(clinicId),
  });
}
