import 'server-only';

import { borrarEvento } from '@/lib/google/calendar';
import { GoogleDesconectadoError } from '@/lib/google/client';
import { fechaLarga, hora } from '@/lib/format/es';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelAppointmentSchema } from '@/lib/tools/schemas';
import type { ContextoTool, ResultadoTool } from '@/lib/tools/types';

/**
 * Cancela una cita localizada previamente con `findAppointments`.
 *
 * La operación es idempotente por naturaleza: cancelar algo ya cancelado
 * devuelve el mismo mensaje de éxito. Y el borrado en Google trata 404/410 como
 * éxito, porque el estado buscado —que el evento no esté— ya se cumple.
 */
export async function cancelAppointment(
  contexto: ContextoTool,
  argumentosSinValidar: unknown,
): Promise<ResultadoTool> {
  const parseo = cancelAppointmentSchema.safeParse(argumentosSinValidar);
  if (!parseo.success) {
    return {
      result:
        'Necesito el código de la cita para cancelarla. Búscala primero con los datos del paciente.',
    };
  }

  const { clinic, toolCallId } = contexto;
  // El reconocimiento de voz suele meter espacios o guiones al deletrear.
  const codigo = parseo.data.reference_code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const db = createAdminClient();

  const { data: cita } = await db
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinic.id)
    .eq('reference_code', codigo)
    .in('status', ['scheduled', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cita) {
    return {
      result: `No encontré ninguna cita con el código ${codigo}. Pide al paciente que lo repita despacio, o búscala por su nombre.`,
    };
  }

  const descripcion = `la cita del ${fechaLarga(cita.starts_at, clinic.timezone)} a las ${hora(
    cita.starts_at,
    clinic.timezone,
  )}`;

  if (cita.status === 'cancelled') {
    return { result: `Esa cita ya estaba cancelada. Confirma al paciente que ${descripcion} no está activa y ofrécele agendar otra.` };
  }

  const { error } = await db
    .from('appointments')
    .update({
      status: 'cancelled',
      cancel_tool_call_id: toolCallId,
      notes: parseo.data.reason ? `${cita.notes ?? ''}\nCancelada: ${parseo.data.reason}`.trim() : cita.notes,
    })
    .eq('id', cita.id);

  if (error) {
    return { error: 'No pude cancelar la cita. Avisa al paciente de que recepción le confirmará.' };
  }

  if (cita.google_event_id) {
    try {
      await borrarEvento(clinic.id, cita.google_event_id);
    } catch (errorGoogle) {
      if (!(errorGoogle instanceof GoogleDesconectadoError)) {
        console.error('[cancelAppointment] no se pudo borrar el evento en Google', errorGoogle);
      }
      // La cita ya está cancelada en el panel: el evento huérfano se resuelve
      // desde el calendario, no vale la pena romper la llamada por esto.
    }
  }

  return { result: `Cita cancelada. Confirma al paciente que ${descripcion} ya no está y ofrécele agendar otra fecha.` };
}
