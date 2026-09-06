import 'server-only';

import { listaEnProsa } from '@/lib/format/es';
import { getClinicInfoSchema } from '@/lib/tools/schemas';
import type { ContextoTool, ResultadoTool } from '@/lib/tools/types';
import type { HourRange, WeekdayKey } from '@/lib/supabase/database.types';

const NOMBRE_DIA: Record<WeekdayKey, string> = {
  mon: 'lunes',
  tue: 'martes',
  wed: 'miércoles',
  thu: 'jueves',
  fri: 'viernes',
  sat: 'sábado',
  sun: 'domingo',
};

const ORDEN: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * Responde preguntas frecuentes con la información configurada por la clínica.
 *
 * Se resuelve como herramienta y no metiéndolo todo en el prompt para que el
 * agente conteste con lo que hay hoy en la base de datos: si el dueño cambia el
 * horario, la respuesta cambia sin republicar el asistente.
 */
export async function getClinicInfo(
  contexto: ContextoTool,
  argumentosSinValidar: unknown,
): Promise<ResultadoTool> {
  const parseo = getClinicInfoSchema.safeParse(argumentosSinValidar);
  const tema = parseo.success ? (parseo.data.topic ?? 'general') : 'general';

  const { clinic, config } = contexto;
  const info = config.clinic_info;

  const partes: string[] = [];

  if (tema === 'direccion' || tema === 'general') {
    partes.push(clinic.address ? `Dirección: ${clinic.address}.` : 'La dirección no está registrada.');
  }

  if (tema === 'horarios' || tema === 'general') {
    partes.push(`Horario de atención: ${describirHorario(config.business_hours)}.`);
  }

  if (tema === 'pagos' || tema === 'general') {
    if (info.payment_methods) partes.push(`Formas de pago: ${info.payment_methods}`);
  }

  if (tema === 'servicios' || tema === 'general') {
    const nombres = config.services.map((s) => s.name);
    if (nombres.length > 0) partes.push(`Tratamientos: ${listaEnProsa(nombres)}.`);
  }

  if (tema === 'general') {
    if (info.policies) partes.push(`Políticas: ${info.policies}`);
    if (info.parking) partes.push(`Estacionamiento: ${info.parking}`);
    if (info.faq) partes.push(info.faq);
  }

  if (partes.length === 0) {
    return {
      result:
        'No tengo ese dato registrado. Dile al paciente que recepción se lo confirmará y ofrécele agendar una cita.',
    };
  }

  return {
    result: `${partes.join(' ')} Responde solo lo que el paciente preguntó, en una o dos frases.`,
  };
}

function describirHorario(horarios: Partial<Record<WeekdayKey, HourRange[]>>): string {
  const abiertos = ORDEN.filter((dia) => (horarios[dia] ?? []).length > 0);

  if (abiertos.length === 0) return 'no hay horario configurado';

  return listaEnProsa(
    abiertos.map((dia) => {
      const tramos = (horarios[dia] ?? []).map((r) => `de ${r.start} a ${r.end}`);
      return `${NOMBRE_DIA[dia]} ${listaEnProsa(tramos)}`;
    }),
  );
}
