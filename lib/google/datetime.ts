import { TZDate } from '@date-fns/tz';
import { addDays, addMinutes, format, startOfDay } from 'date-fns';

import type { HourRange, WeekdayKey } from '@/lib/supabase/database.types';

/**
 * Aritmética de fechas en la zona horaria de la clínica.
 *
 * Todo el cálculo temporal vive aquí y NO en el prompt del agente. Un LLM que
 * calcula "el próximo martes" es la primera causa de citas fantasma: dice una
 * fecha, reserva otra. El modelo pasa la expresión tal cual y el servidor la
 * resuelve.
 */

const DIAS: readonly WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Clave de día de la semana ('mon', 'tue'…) para una fecha en la zona dada. */
export function claveDiaSemana(fecha: Date, timezone: string): WeekdayKey {
  const local = new TZDate(fecha, timezone);
  return DIAS[local.getDay()] as WeekdayKey;
}

/** Ahora mismo, en la zona de la clínica. */
export function ahoraEnZona(timezone: string): TZDate {
  return new TZDate(new Date(), timezone);
}

/** "2026-09-11" a partir de una fecha en la zona de la clínica. */
export function aFechaISO(fecha: Date, timezone: string): string {
  return format(new TZDate(fecha, timezone), 'yyyy-MM-dd');
}

/**
 * Combina "2026-09-11" y "09:30" en un instante absoluto, interpretando la hora
 * como local de la clínica.
 *
 * Es la conversión que evita el error clásico de tratar la hora local como UTC:
 * las 9:00 en CDMX son las 15:00Z, no las 9:00Z.
 */
export function instanteLocal(fechaISO: string, horaHHMM: string, timezone: string): Date {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const [horas, minutos] = horaHHMM.split(':').map(Number);

  if (anio === undefined || mes === undefined || dia === undefined) {
    throw new Error(`Fecha inválida: ${fechaISO}`);
  }

  // Se devuelve un Date plano y no el TZDate: `TZDate.toISOString()` imprime el
  // offset local ("...-06:00") en vez de UTC, lo que confunde a quien lo pase
  // luego a Google o a Postgres. El instante es el mismo; el formato, no.
  return new Date(new TZDate(anio, mes - 1, dia, horas ?? 0, minutos ?? 0, 0, 0, timezone).getTime());
}

const DIAS_TEXTO: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Resuelve la fecha que pide el paciente.
 *
 * Acepta tanto un ISO ("2026-09-11") como las expresiones que la gente usa por
 * teléfono: "hoy", "mañana", "pasado mañana", "el próximo martes", "este viernes".
 * Devuelve null si no la entiende, para que el agente pregunte en vez de inventar.
 */
export function resolverFecha(entrada: string, timezone: string, referencia?: Date): string | null {
  const texto = sinAcentos(entrada);
  const hoy = startOfDay(new TZDate(referencia ?? new Date(), timezone));

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  // A veces el modelo manda un ISO completo aunque se le pida solo la fecha.
  const isoConHora = texto.match(/^(\d{4}-\d{2}-\d{2})t/);
  if (isoConHora?.[1]) {
    return isoConHora[1];
  }

  if (texto === 'hoy') return aFechaISO(hoy, timezone);
  if (texto === 'manana' || texto === 'el dia de manana') return aFechaISO(addDays(hoy, 1), timezone);
  if (texto === 'pasado manana') return aFechaISO(addDays(hoy, 2), timezone);

  // "el próximo martes", "este viernes", "martes"
  const coincidencia = texto.match(
    /(?:el\s+)?(?:proximo|siguiente|este|el)?\s*(domingo|lunes|martes|miercoles|jueves|viernes|sabado)/,
  );
  const nombreDia = coincidencia?.[1];

  if (nombreDia !== undefined) {
    const objetivo = DIAS_TEXTO[nombreDia];
    if (objetivo === undefined) return null;

    const actual = hoy.getDay();
    let delta = (objetivo - actual + 7) % 7;

    // "este martes" siendo martes se entiende como hoy; "el próximo martes",
    // como el de la semana que viene.
    if (delta === 0 && /proximo|siguiente/.test(texto)) {
      delta = 7;
    } else if (delta === 0 && !/hoy|este/.test(texto)) {
      delta = 7;
    }

    return aFechaISO(addDays(hoy, delta), timezone);
  }

  return null;
}

/** Los tramos de atención de un día concreto, ya como instantes absolutos. */
export function tramosDelDia(
  fechaISO: string,
  rangos: HourRange[],
  timezone: string,
): Array<{ inicio: Date; fin: Date }> {
  return rangos
    .map((rango) => ({
      inicio: instanteLocal(fechaISO, rango.start, timezone),
      fin: instanteLocal(fechaISO, rango.end, timezone),
    }))
    .filter((tramo) => tramo.fin.getTime() > tramo.inicio.getTime());
}

export function sumarMinutos(fecha: Date, minutos: number): Date {
  return addMinutes(fecha, minutos);
}

/** ¿Se solapan [aInicio, aFin) y [bInicio, bFin)? */
export function seSolapan(aInicio: Date, aFin: Date, bInicio: Date, bFin: Date): boolean {
  return aInicio.getTime() < bFin.getTime() && bInicio.getTime() < aFin.getTime();
}
