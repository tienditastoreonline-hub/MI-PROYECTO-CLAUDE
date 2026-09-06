import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Clinic } from '@/lib/supabase/database.types';
import type { VapiServerMessage } from '@/lib/vapi/types';

/**
 * Averigua a qué clínica pertenece un evento del webhook.
 *
 * Se prueba primero por `assistantId` porque es el vínculo que escribe esta
 * aplicación al publicar y sobrevive a un cambio de número. `phoneNumberId` es
 * el respaldo: cubre el caso de una publicación a medias, en la que el número ya
 * está asignado pero el asistente aún no se ha guardado.
 *
 * Ambas columnas son UNIQUE en la base de datos, así que la resolución nunca es
 * ambigua. Si devuelve null, el evento no es de ninguna clínica conocida y no
 * debe procesarse.
 */
export async function resolverClinica(mensaje: VapiServerMessage): Promise<Clinic | null> {
  const db = createAdminClient();

  const assistantId = mensaje.call?.assistantId ?? mensaje.assistant?.id ?? null;
  const phoneNumberId = mensaje.call?.phoneNumberId ?? mensaje.phoneNumber?.id ?? null;

  if (assistantId) {
    const { data } = await db
      .from('clinics')
      .select('*')
      .eq('vapi_assistant_id', assistantId)
      .maybeSingle();
    if (data) return data;
  }

  if (phoneNumberId) {
    const { data } = await db
      .from('clinics')
      .select('*')
      .eq('vapi_phone_number_id', phoneNumberId)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}
