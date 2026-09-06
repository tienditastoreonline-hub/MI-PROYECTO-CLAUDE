import { addDays, startOfDay } from 'date-fns';
import { TZDate } from '@date-fns/tz';

import { aFechaISO, claveDiaSemana, seSolapan, sumarMinutos, tramosDelDia } from '@/lib/google/datetime';
import type { BusinessHours } from '@/lib/supabase/database.types';

/** Un intervalo ocupado, venga de Google Calendar o de una cita ya registrada. */
export interface Ocupado {
  inicio: Date;
  fin: Date;
}

export type Periodo = 'manana' | 'tarde' | 'cualquiera';

export interface OpcionesHuecos {
  /** Día a evaluar, "YYYY-MM-DD" en hora local de la clínica. */
  fechaISO: string;
  timezone: string;
  businessHours: BusinessHours;
  /** Fechas "YYYY-MM-DD" en las que la clínica no abre. */
  closedDates: string[];
  /** Duración del tratamiento solicitado. */
  duracionMinutos: number;
  /** Granularidad con la que se proponen inicios de cita. */
  pasoMinutos: number;
  /** Antelación mínima: no se ofrece una cita dentro de este margen. */
  minLeadMinutos: number;
  /** Horizonte máximo de reserva, en días. */
  maxAdvanceDias: number;
  ocupados: Ocupado[];
  ahora: Date;
  periodo?: Periodo;
  maxResultados?: number;
}

/**
 * Calcula los huecos libres de un día.
 *
 * Es una función pura: recibe los intervalos ocupados ya resueltos (freebusy de
 * Google más las citas locales) y no toca la red ni la base de datos. Toda la
 * lógica delicada —zonas horarias, cambios de horario de verano, tratamientos
 * más largos que el tramo de atención— se puede probar sin credenciales.
 *
 * Un candidato se acepta si:
 *   a) la cita COMPLETA cabe dentro de un tramo de atención (no se parte el horario),
 *   b) no se solapa con nada ocupado,
 *   c) empieza después del margen mínimo de antelación,
 *   d) no supera el horizonte máximo de reserva,
 *   e) cae en la franja pedida (mañana / tarde).
 */
export function calcularHuecos(opciones: OpcionesHuecos): Date[] {
  const {
    fechaISO,
    timezone,
    businessHours,
    closedDates,
    duracionMinutos,
    pasoMinutos,
    minLeadMinutos,
    maxAdvanceDias,
    ocupados,
    ahora,
    periodo = 'cualquiera',
    maxResultados = 4,
  } = opciones;

  if (closedDates.includes(fechaISO)) {
    return [];
  }

  const limiteInferior = sumarMinutos(ahora, minLeadMinutos);
  const limiteSuperior = addDays(ahora, maxAdvanceDias);

  // El día de la semana se calcula sobre el mediodía local para que un cambio de
  // horario de verano a medianoche no desplace el día.
  const referenciaDia = new Date(`${fechaISO}T12:00:00Z`);
  const diaSemana = claveDiaSemana(referenciaDia, timezone);
  const rangos = businessHours[diaSemana] ?? [];

  if (rangos.length === 0) {
    return [];
  }

  const huecos: Date[] = [];

  for (const tramo of tramosDelDia(fechaISO, rangos, timezone)) {
    for (
      let inicio = tramo.inicio;
      // La cita completa debe caber en el tramo.
      sumarMinutos(inicio, duracionMinutos).getTime() <= tramo.fin.getTime();
      inicio = sumarMinutos(inicio, pasoMinutos)
    ) {
      if (huecos.length >= maxResultados) return huecos;

      const fin = sumarMinutos(inicio, duracionMinutos);

      if (inicio.getTime() < limiteInferior.getTime()) continue;
      if (inicio.getTime() > limiteSuperior.getTime()) return huecos;
      if (!coincideConPeriodo(inicio, timezone, periodo)) continue;

      const chocaConAlgo = ocupados.some((o) => seSolapan(inicio, fin, o.inicio, o.fin));
      if (chocaConAlgo) continue;

      huecos.push(inicio);
    }
  }

  return huecos;
}

function coincideConPeriodo(instante: Date, timezone: string, periodo: Periodo): boolean {
  if (periodo === 'cualquiera') return true;
  const horaLocal = new TZDate(instante, timezone).getHours();
  return periodo === 'manana' ? horaLocal < 13 : horaLocal >= 13;
}

/**
 * Busca huecos en los días siguientes cuando el día pedido está lleno.
 *
 * Se usa para que el agente pueda ofrecer una alternativa real en vez de un
 * "no hay nada disponible" que deja la llamada sin salida.
 */
export function buscarHuecosProximosDias(
  opciones: Omit<OpcionesHuecos, 'fechaISO'> & { desdeISO: string; diasABuscar: number },
): Array<{ fechaISO: string; inicio: Date }> {
  const { desdeISO, diasABuscar, ...resto } = opciones;
  const encontrados: Array<{ fechaISO: string; inicio: Date }> = [];

  const base = startOfDay(new TZDate(new Date(`${desdeISO}T12:00:00Z`), resto.timezone));

  for (let offset = 1; offset <= diasABuscar; offset += 1) {
    const fechaISO = aFechaISO(addDays(base, offset), resto.timezone);
    const huecos = calcularHuecos({ ...resto, fechaISO, maxResultados: 1 });

    const primero = huecos[0];
    if (primero) {
      encontrados.push({ fechaISO, inicio: primero });
      if (encontrados.length >= (resto.maxResultados ?? 3)) break;
    }
  }

  return encontrados;
}
