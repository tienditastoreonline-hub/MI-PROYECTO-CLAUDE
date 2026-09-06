import { createClient } from '@/lib/supabase/server';

export interface EstadoIntegraciones {
  google: {
    conectado: boolean;
    email: string | null;
    calendarId: string | null;
    revocado: boolean;
    conectadoDesde: string | null;
  };
  vapi: {
    assistantId: string | null;
    phoneNumberId: string | null;
    publicadoEn: string | null;
    hayCambiosSinPublicar: boolean;
    ultimoError: string | null;
  };
}

/**
 * Estado de las integraciones de la clínica.
 *
 * Todo pasa por el cliente de cookies, incluidas las credenciales de Google: la
 * RLS filtra las filas por clínica y los privilegios por columna dejan fuera
 * `access_token_enc` y `refresh_token_enc`. Pedir esas columnas desde aquí
 * fallaría con "permission denied for column", que es la garantía que se busca.
 */
export async function obtenerEstadoIntegraciones(
  clinicId: number,
  hashActual: string | null,
): Promise<EstadoIntegraciones> {
  const supabase = await createClient();

  const [{ data: clinica }, { data: config }, { data: credenciales }] = await Promise.all([
    supabase.from('clinics').select('vapi_assistant_id, vapi_phone_number_id').eq('id', clinicId).maybeSingle(),
    supabase
      .from('agent_configs')
      .select('published_at, published_hash, last_publish_error')
      .eq('clinic_id', clinicId)
      .maybeSingle(),
    // Columnas explícitas: un `select *` sería rechazado por los grants.
    supabase
      .from('google_credentials')
      .select('google_email, calendar_id, revoked_at, created_at')
      .eq('clinic_id', clinicId)
      .maybeSingle(),
  ]);

  return {
    google: {
      conectado: Boolean(credenciales && !credenciales.revoked_at),
      email: credenciales?.google_email ?? null,
      calendarId: credenciales?.calendar_id ?? null,
      revocado: Boolean(credenciales?.revoked_at),
      conectadoDesde: credenciales?.created_at ?? null,
    },
    vapi: {
      assistantId: clinica?.vapi_assistant_id ?? null,
      phoneNumberId: clinica?.vapi_phone_number_id ?? null,
      publicadoEn: config?.published_at ?? null,
      // Si el hash del payload actual no coincide con el publicado, lo que
      // atiende las llamadas no es lo que se ve en el panel.
      hayCambiosSinPublicar:
        hashActual !== null && config?.published_hash !== null && config?.published_hash !== hashActual,
      ultimoError: config?.last_publish_error ?? null,
    },
  };
}
