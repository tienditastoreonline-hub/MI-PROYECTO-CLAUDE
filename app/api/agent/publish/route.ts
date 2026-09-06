import { NextResponse } from 'next/server';

import { getAgentConfig, requireClinic } from '@/lib/auth/tenant';
import { publicarAsistente } from '@/lib/vapi/publish';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Publica la configuración de la clínica en su asistente de Vapi.
 *
 * Crear el asistente no significa que reciba llamadas: hace falta además que el
 * número apunte a él. `publicarAsistente` hace las dos cosas y devuelve un aviso
 * si tuvo que cambiar algo por el camino (por ejemplo, la voz).
 */
export async function POST(): Promise<NextResponse> {
  const { clinic, esOwner } = await requireClinic();

  if (!esOwner) {
    return NextResponse.json(
      { error: 'Solo el dueño de la clínica puede publicar el agente.' },
      { status: 403 },
    );
  }

  const config = await getAgentConfig(clinic.id);
  if (!config) {
    return NextResponse.json({ error: 'La clínica no tiene configuración del agente.' }, { status: 400 });
  }

  if (config.services.length === 0) {
    return NextResponse.json(
      { error: 'Añade al menos un tratamiento antes de publicar: el agente no podría agendar nada.' },
      { status: 400 },
    );
  }

  const hayHorario = Object.values(config.business_hours).some((tramos) => (tramos ?? []).length > 0);
  if (!hayHorario) {
    return NextResponse.json(
      { error: 'Configura al menos un día de atención antes de publicar.' },
      { status: 400 },
    );
  }

  try {
    const resultado = await publicarAsistente(clinic, config);

    return NextResponse.json({
      ok: true,
      assistantId: resultado.assistantId,
      aviso: resultado.aviso,
      numeroVinculado: Boolean(clinic.vapi_phone_number_id),
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido al publicar.';
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }
}
