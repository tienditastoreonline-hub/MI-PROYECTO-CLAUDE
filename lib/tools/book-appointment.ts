import 'server-only';

import { crearEvento } from '@/lib/google/calendar';
import { GoogleDesconectadoError } from '@/lib/google/client';
import { calcularHuecos, type Ocupado } from '@/lib/google/availability';
import { instanteLocal, resolverFecha, sumarMinutos } from '@/lib/google/datetime';
import { fechaLarga, hora, listaEnProsa } from '@/lib/format/es';
import { createAdminClient } from '@/lib/supabase/admin';
import { deletrear, encontrarServicio, generarCodigoReferencia, nombresDeServicios } from '@/lib/tools/comun';
import { bookAppointmentSchema } from '@/lib/tools/schemas';
import type { ContextoTool, ResultadoTool } from '@/lib/tools/types';

/**
 * Agenda la cita: la escribe en la base de datos y crea el evento en Google.
 *
 * Es la operación más delicada del sistema, con tres protecciones encadenadas:
 *
 *   1. **Idempotencia por `tool_call_id`.** Si Vapi reintenta el mismo tool call
 *      —cosa que ocurre— no se crea una segunda cita: se devuelve el mismo
 *      mensaje de éxito.
 *   2. **Exclusion constraint en Postgres.** Dos llamadas simultáneas al mismo
 *      hueco con tool calls distintos chocan en la base de datos, antes de tocar
 *      Google. La perdedora recibe alternativas, no un error.
 *   3. **La cita se escribe primero y el evento después.** Si Google falla, la
 *      cita queda registrada y visible en el panel; el caso contrario —evento
 *      creado y cita perdida— sería invisible para la clínica.
 */
export async function bookAppointment(
  contexto: ContextoTool,
  argumentosSinValidar: unknown,
): Promise<ResultadoTool> {
  const parseo = bookAppointmentSchema.safeParse(argumentosSinValidar);
  if (!parseo.success) {
    return {
      result:
        'Me faltan datos para agendar. Confirma con el paciente su nombre completo, el tratamiento y la hora exacta.',
    };
  }

  const { clinic, config, callerNumber, toolCallId, vapiCallId } = contexto;
  const datos = parseo.data;
  const db = createAdminClient();

  // 1) Idempotencia: ¿ya se ejecutó esta misma invocación?
  const { data: existente } = await db
    .from('appointments')
    .select('*')
    .eq('tool_call_id', toolCallId)
    .maybeSingle();

  if (existente) {
    return { result: mensajeConfirmacion(existente.patient_name, existente.treatment, new Date(existente.starts_at), existente.reference_code, clinic.timezone) };
  }

  const servicio = encontrarServicio(config, datos.service_name);
  if (!servicio) {
    return {
      result: `No encuentro ese tratamiento. Los servicios son: ${listaEnProsa(
        nombresDeServicios(config),
      )}. Confirma cuál necesita el paciente antes de agendar.`,
    };
  }

  const inicio = interpretarInicio(datos.start_time, clinic.timezone);
  if (!inicio) {
    return {
      result:
        'No entendí la fecha y hora. Vuelve a consultar los horarios disponibles y confirma uno con el paciente.',
    };
  }

  const fin = sumarMinutos(inicio, servicio.duration_minutes);

  // El hueco debe seguir siendo válido: entre la consulta y la confirmación el
  // paciente ha estado hablando, y la agenda pudo cambiar.
  const sigueLibre = calcularHuecos({
    fechaISO: fechaISOde(inicio, clinic.timezone),
    timezone: clinic.timezone,
    businessHours: config.business_hours,
    closedDates: config.closed_dates,
    duracionMinutos: servicio.duration_minutes,
    pasoMinutos: config.slot_minutes,
    minLeadMinutos: config.min_lead_minutes,
    maxAdvanceDias: config.max_advance_days,
    ocupados: await ocupadosDelDia(clinic.id, inicio, fin),
    ahora: new Date(),
    maxResultados: 50,
  }).some((h) => h.getTime() === inicio.getTime());

  if (!sigueLibre) {
    return { result: await mensajeHuecoOcupado(contexto, servicio.duration_minutes, inicio) };
  }

  const telefono = datos.patient_phone?.trim() || callerNumber;
  const codigo = generarCodigoReferencia();

  const { data: cita, error } = await db
    .from('appointments')
    .insert({
      clinic_id: clinic.id,
      call_id: await idDeLlamada(vapiCallId),
      reference_code: codigo,
      patient_name: datos.patient_name.trim(),
      patient_phone: telefono,
      patient_email: datos.patient_email?.trim() || null,
      is_new_patient: datos.is_new_patient ?? false,
      treatment: servicio.name,
      service_duration_minutes: servicio.duration_minutes,
      starts_at: inicio.toISOString(),
      ends_at: fin.toISOString(),
      status: 'scheduled',
      source: 'voice',
      tool_call_id: toolCallId,
      notes: datos.notes?.trim() || null,
    })
    .select()
    .single();

  if (error || !cita) {
    // 23P01 = violación de exclusion constraint: alguien ganó la carrera.
    if (error?.code === '23P01') {
      return { result: await mensajeHuecoOcupado(contexto, servicio.duration_minutes, inicio) };
    }
    return { error: 'No pude registrar la cita. Toma los datos del paciente y avisa a recepción.' };
  }

  // 3) El evento en Google va después: si falla, la cita ya está a salvo.
  try {
    const evento = await crearEvento(clinic.id, {
      titulo: `${servicio.name} — ${cita.patient_name}`,
      descripcion: [
        `Paciente: ${cita.patient_name}`,
        cita.patient_phone ? `Teléfono: ${cita.patient_phone}` : null,
        `Tratamiento: ${servicio.name}`,
        `Código: ${codigo}`,
        cita.is_new_patient ? 'Paciente nuevo' : null,
        cita.notes ? `Notas: ${cita.notes}` : null,
        'Agendada por el asistente de voz.',
      ]
        .filter(Boolean)
        .join('\n'),
      inicio,
      fin,
      timezone: clinic.timezone,
      emailInvitado: cita.patient_email,
    });

    await db
      .from('appointments')
      .update({ google_event_id: evento.eventId, google_calendar_id: evento.calendarId })
      .eq('id', cita.id);
  } catch (errorGoogle) {
    if (!(errorGoogle instanceof GoogleDesconectadoError)) {
      console.error('[bookAppointment] no se pudo crear el evento en Google', errorGoogle);
    }
    // La cita existe en el panel; el agente puede confirmarla igualmente.
  }

  return { result: mensajeConfirmacion(cita.patient_name, servicio.name, inicio, codigo, clinic.timezone) };
}

function mensajeConfirmacion(
  paciente: string,
  tratamiento: string,
  inicio: Date,
  codigo: string,
  timezone: string,
): string {
  return `Cita confirmada. ${paciente}, ${tratamiento}, ${fechaLarga(inicio, timezone)} a las ${hora(
    inicio,
    timezone,
  )}. Su código es ${deletrear(codigo)}. Repítele la fecha, la hora y el código, y pídele llegar diez minutos antes.`;
}

/** Acepta "2026-09-11T10:00", "2026-09-11 10:00" y también expresiones relativas. */
function interpretarInicio(entrada: string, timezone: string): Date | null {
  const texto = entrada.trim();

  const conHora = texto.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (conHora?.[1] && conHora[2]) {
    return instanteLocal(conHora[1], conHora[2], timezone);
  }

  // "el martes a las 10:00"
  const soloHora = texto.match(/(\d{1,2}):(\d{2})/);
  const fechaISO = resolverFecha(texto.replace(/\s*a?\s*las?\s*\d{1,2}:\d{2}\s*/i, ' ').trim(), timezone);

  if (fechaISO && soloHora?.[1] && soloHora[2]) {
    return instanteLocal(fechaISO, `${soloHora[1].padStart(2, '0')}:${soloHora[2]}`, timezone);
  }

  return null;
}

function fechaISOde(fecha: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

async function ocupadosDelDia(clinicId: number, inicio: Date, fin: Date): Promise<Ocupado[]> {
  const { data } = await createAdminClient()
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('clinic_id', clinicId)
    .eq('status', 'scheduled')
    .lt('starts_at', fin.toISOString())
    .gt('ends_at', inicio.toISOString());

  return (data ?? []).map((f) => ({ inicio: new Date(f.starts_at), fin: new Date(f.ends_at) }));
}

/** Alternativas cercanas cuando el hueco elegido ya no está libre. */
async function mensajeHuecoOcupado(
  contexto: ContextoTool,
  duracionMinutos: number,
  inicioPedido: Date,
): Promise<string> {
  const { clinic, config } = contexto;

  const huecos = calcularHuecos({
    fechaISO: fechaISOde(inicioPedido, clinic.timezone),
    timezone: clinic.timezone,
    businessHours: config.business_hours,
    closedDates: config.closed_dates,
    duracionMinutos,
    pasoMinutos: config.slot_minutes,
    minLeadMinutos: config.min_lead_minutes,
    maxAdvanceDias: config.max_advance_days,
    ocupados: await ocupadosDelDia(
      clinic.id,
      instanteLocal(fechaISOde(inicioPedido, clinic.timezone), '00:00', clinic.timezone),
      instanteLocal(fechaISOde(inicioPedido, clinic.timezone), '23:59', clinic.timezone),
    ),
    ahora: new Date(),
    maxResultados: 3,
  });

  if (huecos.length === 0) {
    return 'Ese horario acaba de ocuparse y ya no quedan huecos ese día. Ofrece consultar otra fecha.';
  }

  return `Ese horario acaba de ocuparse. El mismo día quedan libres ${listaEnProsa(
    huecos.map((h) => hora(h, clinic.timezone)),
  )}. Ofrécelos al paciente.`;
}

/** Traduce el id de llamada de Vapi al id local, si la llamada ya está registrada. */
async function idDeLlamada(vapiCallId: string | null): Promise<number | null> {
  if (!vapiCallId) return null;

  const { data } = await createAdminClient()
    .from('calls')
    .select('id')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle();

  return data?.id ?? null;
}
