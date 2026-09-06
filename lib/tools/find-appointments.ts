import 'server-only';

import { fechaLarga, hora, listaEnProsa } from '@/lib/format/es';
import { createAdminClient } from '@/lib/supabase/admin';
import { deletrear, mismoTelefono, normalizar, soloDigitos } from '@/lib/tools/comun';
import { findAppointmentsSchema } from '@/lib/tools/schemas';
import type { ContextoTool, ResultadoTool } from '@/lib/tools/types';

/**
 * Busca las citas futuras del paciente que está llamando.
 *
 * Existe porque `cancelAppointment` necesita un identificador, y nadie puede
 * dictar por teléfono el id de un evento de Google. Por defecto se busca por el
 * número desde el que llama, que resuelve el servidor: así el caso normal no
 * exige que el paciente recuerde ningún código.
 */
export async function findAppointments(
  contexto: ContextoTool,
  argumentosSinValidar: unknown,
): Promise<ResultadoTool> {
  const parseo = findAppointmentsSchema.safeParse(argumentosSinValidar);
  const datos = parseo.success ? parseo.data : {};

  const { clinic, callerNumber } = contexto;
  const telefonoBuscado = datos.patient_phone?.trim() || callerNumber;

  const { data: citas, error } = await createAdminClient()
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinic.id)
    .eq('status', 'scheduled')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(25);

  if (error) {
    return { error: 'No pude consultar la agenda. Pide al paciente que llame más tarde.' };
  }

  const candidatas = (citas ?? []).filter((cita) => {
    if (telefonoBuscado && mismoTelefono(cita.patient_phone, telefonoBuscado)) return true;
    if (datos.patient_name) {
      return normalizar(cita.patient_name).includes(normalizar(datos.patient_name));
    }
    return false;
  });

  if (candidatas.length === 0) {
    const pista = telefonoBuscado
      ? `No hay citas futuras registradas con el número ${soloDigitos(telefonoBuscado).slice(-10)}.`
      : 'No encontré citas futuras con esos datos.';
    return { result: `${pista} Pregunta el nombre completo del paciente para volver a buscar.` };
  }

  if (candidatas.length === 1) {
    const cita = candidatas[0];
    if (!cita) {
      return { result: 'No encontré citas futuras con esos datos.' };
    }
    return {
      result: `Encontré una cita: ${cita.treatment} el ${fechaLarga(
        cita.starts_at,
        clinic.timezone,
      )} a las ${hora(cita.starts_at, clinic.timezone)}, a nombre de ${
        cita.patient_name
      }, con código ${deletrear(cita.reference_code)}. Confirma con el paciente que es esa antes de cancelarla.`,
    };
  }

  const descripciones = candidatas
    .slice(0, 3)
    .map(
      (cita) =>
        `${cita.treatment} el ${fechaLarga(cita.starts_at, clinic.timezone)} a las ${hora(
          cita.starts_at,
          clinic.timezone,
        )} con código ${deletrear(cita.reference_code)}`,
    );

  return {
    result: `Hay varias citas: ${listaEnProsa(
      descripciones,
    )}. Pregunta al paciente a cuál se refiere antes de hacer nada.`,
  };
}
