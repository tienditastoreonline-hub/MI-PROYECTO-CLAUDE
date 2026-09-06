import { describe, expect, it } from 'vitest';

import { buscarHuecosProximosDias, calcularHuecos, type OpcionesHuecos } from '@/lib/google/availability';
import { instanteLocal } from '@/lib/google/datetime';

const CDMX = 'America/Mexico_City';

const HORARIO = {
  mon: [{ start: '09:00', end: '14:00' }, { start: '16:00', end: '19:00' }],
  tue: [{ start: '09:00', end: '14:00' }],
  wed: [{ start: '09:00', end: '14:00' }],
  thu: [{ start: '09:00', end: '14:00' }, { start: '16:00', end: '19:00' }],
  fri: [{ start: '09:00', end: '14:00' }],
  sat: [{ start: '09:00', end: '13:00' }],
  sun: [],
};

// Viernes 11 de septiembre de 2026 a las 06:00 locales: muy antes de abrir.
const AHORA = instanteLocal('2026-09-11', '06:00', CDMX);

function opciones(extra: Partial<OpcionesHuecos> = {}): OpcionesHuecos {
  return {
    fechaISO: '2026-09-11',
    timezone: CDMX,
    businessHours: HORARIO,
    closedDates: [],
    duracionMinutos: 30,
    pasoMinutos: 30,
    minLeadMinutos: 60,
    maxAdvanceDias: 60,
    ocupados: [],
    ahora: AHORA,
    ...extra,
  };
}

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: CDMX,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

describe('cálculo de huecos', () => {
  it('propone huecos desde la apertura, con el paso configurado', () => {
    const huecos = calcularHuecos(opciones());
    expect(huecos.map(hhmm)).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('excluye lo ocupado en Google Calendar', () => {
    const huecos = calcularHuecos(
      opciones({
        ocupados: [
          {
            inicio: instanteLocal('2026-09-11', '09:00', CDMX),
            fin: instanteLocal('2026-09-11', '10:00', CDMX),
          },
        ],
      }),
    );
    expect(huecos.map(hhmm)).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('no parte el horario: descarta el hueco si la cita no cabe entera', () => {
    // Tramo de mañana 09:00-14:00; con 90 minutos el último inicio válido es 12:30.
    const huecos = calcularHuecos(
      opciones({ duracionMinutos: 90, maxResultados: 50, businessHours: { fri: [{ start: '09:00', end: '14:00' }] } }),
    );
    expect(hhmm(huecos[huecos.length - 1] as Date)).toBe('12:30');
  });

  it('devuelve vacío si el tratamiento no cabe en ningún tramo', () => {
    expect(calcularHuecos(opciones({ duracionMinutos: 400 }))).toEqual([]);
  });

  it('respeta la antelación mínima', () => {
    // Son las 09:10 y hacen falta 60 minutos de margen: el primer hueco es 10:30.
    const huecos = calcularHuecos(
      opciones({ ahora: instanteLocal('2026-09-11', '09:10', CDMX) }),
    );
    expect(hhmm(huecos[0] as Date)).toBe('10:30');
  });

  it('no ofrece nada en un día cerrado', () => {
    expect(calcularHuecos(opciones({ closedDates: ['2026-09-11'] }))).toEqual([]);
  });

  it('no ofrece nada en un día sin horario (domingo)', () => {
    expect(calcularHuecos(opciones({ fechaISO: '2026-09-13' }))).toEqual([]);
  });

  it('filtra por franja de la tarde', () => {
    const huecos = calcularHuecos(
      opciones({ fechaISO: '2026-09-10', periodo: 'tarde', ahora: instanteLocal('2026-09-10', '06:00', CDMX) }),
    );
    // "Tarde" es a partir de las 13:00, así que incluye el final del tramo de
    // mañana (que llega hasta las 14:00) además del tramo vespertino.
    expect(huecos.map(hhmm)).toEqual(['13:00', '13:30', '16:00', '16:30']);
  });

  it('filtra por franja de la mañana', () => {
    const huecos = calcularHuecos(
      opciones({ fechaISO: '2026-09-10', periodo: 'manana', ahora: instanteLocal('2026-09-10', '06:00', CDMX) }),
    );
    expect(huecos.every((h) => Number(hhmm(h).slice(0, 2)) < 13)).toBe(true);
  });

  it('respeta el horizonte máximo de reserva', () => {
    expect(calcularHuecos(opciones({ maxAdvanceDias: 0 }))).toEqual([]);
  });

  it('salta el segundo tramo cuando el primero está lleno', () => {
    const huecos = calcularHuecos(
      opciones({
        fechaISO: '2026-09-10',
        ahora: instanteLocal('2026-09-10', '06:00', CDMX),
        ocupados: [
          {
            inicio: instanteLocal('2026-09-10', '09:00', CDMX),
            fin: instanteLocal('2026-09-10', '14:00', CDMX),
          },
        ],
      }),
    );
    expect(huecos.map(hhmm)).toEqual(['16:00', '16:30', '17:00', '17:30']);
  });

  it('trata como ocupado lo que ya está agendado localmente', () => {
    const huecos = calcularHuecos(
      opciones({
        ocupados: [
          {
            inicio: instanteLocal('2026-09-11', '09:30', CDMX),
            fin: instanteLocal('2026-09-11', '10:00', CDMX),
          },
        ],
      }),
    );
    expect(huecos.map(hhmm)).toEqual(['09:00', '10:00', '10:30', '11:00']);
  });
});

describe('búsqueda en días siguientes', () => {
  it('ofrece alternativas cuando el día pedido está lleno', () => {
    const alternativas = buscarHuecosProximosDias({
      ...opciones({ maxResultados: 3 }),
      desdeISO: '2026-09-11',
      diasABuscar: 5,
    });

    // Sábado 12 abre; domingo 13 no; lunes 14 y martes 15 sí.
    expect(alternativas.map((a) => a.fechaISO)).toEqual(['2026-09-12', '2026-09-14', '2026-09-15']);
    expect(hhmm(alternativas[0]?.inicio as Date)).toBe('09:00');
  });

  it('no propone días cerrados', () => {
    const alternativas = buscarHuecosProximosDias({
      ...opciones({ maxResultados: 2, closedDates: ['2026-09-12'] }),
      desdeISO: '2026-09-11',
      diasABuscar: 5,
    });

    expect(alternativas.map((a) => a.fechaISO)).toEqual(['2026-09-14', '2026-09-15']);
  });
});
