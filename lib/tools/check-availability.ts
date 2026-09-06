import 'server-only';

import { addDays } from 'date-fns';

import { buscarHuecosProximosDias, calcularHuecos, type Ocupado } from '@/lib/google/availability';
import { consultarOcupados } from '@/lib/google/calendar';
import { GoogleDesconectadoError } from '@/lib/google/client';
import { instanteLocal, resolverFecha } from '@/lib/google/datetime';
import { fechaLarga, hora, listaEnProsa } from '@/lib/format/es';
import { createAdminClient } from '@/lib/supabase/admin';
import { encontrarServicio, nombresDeServicios } from '@/lib/tools/comun';
import { checkAvailabilitySchema } from '@/lib/tools/schemas';
import type { ContextoTool, ResultadoTool } from '@/lib/tools/types';

/**
 * Consulta huecos reales combinando el calendario de Google y las citas ya
 * registradas.
 *
 * Se consultan ambas fuentes a propósito: Google es la verdad para lo que la
 * clínica apunta a mano, y la tabla local cubre la ventana en la que una cita
 * recién creada aún podría no reflejarse.
 */
export async function checkAvailability(
  contexto: ContextoTool,
  argumentosSinValidar: unknown,
): Promise<ResultadoTool> {
  const parseo = checkAvailabilitySchema.safeParse(argumentosSinValidar);
  if (!parseo.success) {
    return {
      result:
        'No entendí los datos de la consulta. Pregunta al paciente qué tratamiento necesita y para qué día.',
    };
  }

  const { clinic, config } = contexto;
  const { service_name, preferred_date, preferred_period } = parseo.data;

  const servicio = encontrarServicio(config, service_name);
  if (!servicio) {
    return {
      result: `No encuentro ese tratamiento. Los servicios de la clínica son: ${listaEnProsa(
        nombresDeServicios(config),
      )}. Pregunta al paciente cuál necesita.`,
    };
  }

  const fechaISO = resolverFecha(preferred_date, clinic.timezone);
  if (!fechaISO) {
    return {
      result:
        'No entendí la fecha. Pregunta al paciente para qué día quiere la cita, por ejemplo "el martes" o "mañana".',
    };
  }

  const ahora = new Date();
  const ventanaInicio = instanteLocal(fechaISO, '00:00', clinic.timezone);
  const ventanaFin = addDays(ventanaInicio, config.max_advance_days > 10 ? 10 : config.max_advance_days);

  let ocupados: Ocupado[];
  try {
    ocupados = await consultarOcupados(clinic.id, ventanaInicio, ventanaFin, clinic.timezone);
  } catch (error) {
    if (error instanceof GoogleDesconectadoError) {
      return {
        error:
          'No puedo consultar la agenda en este momento. Toma los datos del paciente y dile que la clínica confirmará la cita en breve.',
      };
    }
    throw error;
  }

  ocupados = ocupados.concat(await ocupadosLocales(clinic.id, ventanaInicio, ventanaFin));

  const comun = {
    timezone: clinic.timezone,
    businessHours: config.business_hours,
    closedDates: config.closed_dates,
    duracionMinutos: servicio.duration_minutes,
    pasoMinutos: config.slot_minutes,
    minLeadMinutos: config.min_lead_minutes,
    maxAdvanceDias: config.max_advance_days,
    ocupados,
    ahora,
  };

  const huecos = calcularHuecos({
    ...comun,
    fechaISO,
    periodo: preferred_period ?? 'cualquiera',
    maxResultados: 4,
  });

  if (huecos.length > 0) {
    const horas = listaEnProsa(huecos.map((h) => hora(h, clinic.timezone)));
    return {
      result: `Para ${servicio.name} (${servicio.duration_minutes} minutos) el ${fechaLarga(
        huecos[0] as Date,
        clinic.timezone,
      )} hay estos horarios libres: ${horas}. Ofrécelos de dos en dos y espera a que el paciente elija.`,
    };
  }

  // Sin huecos ese día: se ofrecen alternativas reales en vez de un "no hay nada".
  const alternativas = buscarHuecosProximosDias({
    ...comun,
    desdeISO: fechaISO,
    diasABuscar: 7,
    maxResultados: 3,
  });

  if (alternativas.length === 0) {
    return {
      result: `No hay horarios disponibles para ${servicio.name} en los próximos días. Ofrece tomar los datos del paciente para que la clínica le llame.`,
    };
  }

  const textos = alternativas.map(
    (a) => `${fechaLarga(a.inicio, clinic.timezone)} a las ${hora(a.inicio, clinic.timezone)}`,
  );

  return {
    result: `El ${fechaLarga(
      instanteLocal(fechaISO, '12:00', clinic.timezone),
      clinic.timezone,
    )} no queda ningún horario libre para ${servicio.name}. Las siguientes opciones son: ${listaEnProsa(
      textos,
    )}. Ofrécelas como alternativa.`,
  };
}

/** Citas ya registradas en la ventana, como intervalos ocupados. */
async function ocupadosLocales(clinicId: number, desde: Date, hasta: Date): Promise<Ocupado[]> {
  const { data } = await createAdminClient()
    .from('appointments')
    .select('starts_at, ends_at')
    .eq('clinic_id', clinicId)
    .eq('status', 'scheduled')
    .lt('starts_at', hasta.toISOString())
    .gt('ends_at', desde.toISOString());

  return (data ?? []).map((fila) => ({
    inicio: new Date(fila.starts_at),
    fin: new Date(fila.ends_at),
  }));
}
