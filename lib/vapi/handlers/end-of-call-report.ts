import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Clinic, TranscriptMessage } from '@/lib/supabase/database.types';
import type { VapiServerMessage } from '@/lib/vapi/types';

/**
 * Persiste la llamada terminada, con su transcripción y su resumen.
 *
 * Todo son upserts: Vapi reintenta los eventos, y un reintento debe actualizar
 * la misma fila en vez de duplicarla.
 */
export async function manejarFinDeLlamada(mensaje: VapiServerMessage, clinic: Clinic): Promise<void> {
  const vapiCallId = mensaje.call?.id;
  if (!vapiCallId) {
    console.warn('[vapi] end-of-call-report sin identificador de llamada');
    return;
  }

  const db = createAdminClient();

  const inicio = mensaje.startedAt ? new Date(mensaje.startedAt) : null;
  const fin = mensaje.endedAt ? new Date(mensaje.endedAt) : null;
  const duracion =
    inicio && fin ? Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 1000)) : null;

  const { data: llamada, error } = await db
    .from('calls')
    .upsert(
      {
        clinic_id: clinic.id,
        vapi_call_id: vapiCallId,
        vapi_assistant_id: mensaje.call?.assistantId ?? null,
        customer_number: mensaje.call?.customer?.number ?? mensaje.customer?.number ?? null,
        status: 'ended',
        ended_reason: mensaje.endedReason ?? null,
        started_at: inicio?.toISOString() ?? null,
        ended_at: fin?.toISOString() ?? null,
        duration_seconds: duracion,
        cost: mensaje.cost ?? null,
        // `recordingUrl` solo llega si la grabación está habilitada en el asistente.
        recording_url: mensaje.artifact?.recordingUrl ?? mensaje.artifact?.stereoRecordingUrl ?? null,
        summary: mensaje.analysis?.summary ?? null,
      },
      { onConflict: 'vapi_call_id' },
    )
    .select()
    .single();

  if (error || !llamada) {
    console.error('[vapi] no se pudo guardar la llamada', error);
    return;
  }

  const transcripcion = mensaje.artifact?.transcript ?? null;
  const turnos = normalizarTurnos(mensaje.artifact?.messages);

  if (!transcripcion && turnos.length === 0) {
    return;
  }

  const { error: errorTranscripcion } = await db.from('transcripts').upsert(
    {
      call_id: llamada.id,
      clinic_id: clinic.id,
      full_text: transcripcion,
      messages: turnos,
    },
    { onConflict: 'call_id' },
  );

  if (errorTranscripcion) {
    console.error('[vapi] no se pudo guardar la transcripción', errorTranscripcion);
  }
}

/**
 * Los turnos vienen como `{ role, message }`, no como `{ role, content }`.
 * Se descartan los mensajes de sistema y de herramientas: no aportan nada a
 * quien lee la conversación en el panel.
 */
function normalizarTurnos(mensajes: unknown): TranscriptMessage[] {
  if (!Array.isArray(mensajes)) return [];

  return mensajes.flatMap((turno) => {
    if (typeof turno !== 'object' || turno === null) return [];
    const { role, message, secondsFromStart } = turno as {
      role?: unknown;
      message?: unknown;
      secondsFromStart?: unknown;
    };

    if (typeof message !== 'string' || message.trim() === '') return [];
    if (role !== 'assistant' && role !== 'user' && role !== 'bot') return [];

    return [
      {
        role: role === 'bot' ? 'assistant' : role,
        message,
        ...(typeof secondsFromStart === 'number' ? { secondsFromStart } : {}),
      } satisfies TranscriptMessage,
    ];
  });
}
