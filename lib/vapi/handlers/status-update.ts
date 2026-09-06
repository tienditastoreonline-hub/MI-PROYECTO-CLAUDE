import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { CallStatus, Clinic } from '@/lib/supabase/database.types';
import type { VapiServerMessage } from '@/lib/vapi/types';

const ESTADOS: ReadonlySet<CallStatus> = new Set<CallStatus>([
  'queued',
  'ringing',
  'in-progress',
  'forwarding',
  'ended',
]);

/**
 * Registra la llamada en cuanto empieza.
 *
 * Sirve para dos cosas: que el panel muestre llamadas en curso, y que
 * `bookAppointment` pueda vincular la cita con su llamada antes de que termine
 * (el `end-of-call-report` llega demasiado tarde para eso).
 */
export async function manejarActualizacionEstado(
  mensaje: VapiServerMessage,
  clinic: Clinic,
): Promise<void> {
  const vapiCallId = mensaje.call?.id;
  if (!vapiCallId) return;

  const estado = mensaje.status;
  if (typeof estado !== 'string' || !ESTADOS.has(estado as CallStatus)) return;

  // El reporte final es el que manda: no se pisa con un status-update tardío.
  if (estado === 'ended') return;

  const { error } = await createAdminClient()
    .from('calls')
    .upsert(
      {
        clinic_id: clinic.id,
        vapi_call_id: vapiCallId,
        vapi_assistant_id: mensaje.call?.assistantId ?? null,
        customer_number: mensaje.call?.customer?.number ?? mensaje.customer?.number ?? null,
        status: estado as CallStatus,
        started_at: mensaje.startedAt ?? new Date().toISOString(),
      },
      { onConflict: 'vapi_call_id' },
    );

  if (error) {
    console.error('[vapi] no se pudo registrar el estado de la llamada', error);
  }
}
