import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Formateo en español y en la zona horaria de la clínica.
 *
 * Todo lo que el agente verbaliza pasa por aquí: si una fecha se formatea en la
 * zona del servidor en vez de la de la clínica, el paciente oye una hora
 * equivocada.
 */

export function enZona(iso: string | Date, timezone: string): TZDate {
  const fecha = typeof iso === 'string' ? new Date(iso) : iso;
  return new TZDate(fecha, timezone);
}

/** "jueves 11 de septiembre a las 10:00" */
export function fechaHoraLarga(iso: string | Date, timezone: string): string {
  return format(enZona(iso, timezone), "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es });
}

/** "jueves 11 de septiembre" */
export function fechaLarga(iso: string | Date, timezone: string): string {
  return format(enZona(iso, timezone), "EEEE d 'de' MMMM", { locale: es });
}

/** "11 sep" */
export function fechaCorta(iso: string | Date, timezone: string): string {
  return format(enZona(iso, timezone), 'd MMM', { locale: es });
}

/** "10:00" */
export function hora(iso: string | Date, timezone: string): string {
  return format(enZona(iso, timezone), 'HH:mm');
}

/** "2026-09-11" en la zona de la clínica (no en UTC). */
export function fechaISOLocal(iso: string | Date, timezone: string): string {
  return format(enZona(iso, timezone), 'yyyy-MM-dd');
}

/** "3 min 24 s" · "48 s" */
export function duracion(segundos: number | null | undefined): string {
  if (segundos == null || segundos < 0) return '—';
  const min = Math.floor(segundos / 60);
  const seg = Math.round(segundos % 60);
  return min > 0 ? `${min} min ${seg} s` : `${seg} s`;
}

/** Une una lista en prosa: "9:30, 10:00 y 12:30" */
export function listaEnProsa(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Formatea un importe de Vapi (USD) para el panel. */
export function costo(valor: number | null | undefined): string {
  if (valor == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD' }).format(valor);
}
