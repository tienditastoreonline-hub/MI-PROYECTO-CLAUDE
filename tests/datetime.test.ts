import { describe, expect, it } from 'vitest';

import {
  aFechaISO,
  claveDiaSemana,
  instanteLocal,
  resolverFecha,
  seSolapan,
  tramosDelDia,
} from '@/lib/google/datetime';

const CDMX = 'America/Mexico_City';
// Jueves 10 de septiembre de 2026, 14:00 en CDMX (20:00Z).
const REFERENCIA = new Date('2026-09-10T20:00:00Z');

describe('conversión de hora local a instante absoluto', () => {
  it('interpreta la hora en la zona de la clínica, no en UTC', () => {
    // 09:00 en CDMX (UTC-6) son las 15:00Z.
    expect(instanteLocal('2026-09-11', '09:00', CDMX).toISOString()).toBe('2026-09-11T15:00:00.000Z');
  });

  it('da un instante distinto para la misma hora en otra zona', () => {
    expect(instanteLocal('2026-09-11', '09:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-09-11T07:00:00.000Z',
    );
  });

  it('calcula el día de la semana en local, no en UTC', () => {
    // 2026-09-12T02:00:00Z es viernes 11 en CDMX, no sábado 12.
    expect(claveDiaSemana(new Date('2026-09-12T02:00:00Z'), CDMX)).toBe('fri');
    expect(claveDiaSemana(new Date('2026-09-12T02:00:00Z'), 'Europe/Madrid')).toBe('sat');
  });
});

describe('resolución de expresiones de fecha en español', () => {
  it('acepta un ISO tal cual', () => {
    expect(resolverFecha('2026-09-11', CDMX, REFERENCIA)).toBe('2026-09-11');
  });

  it('recorta un ISO con hora, que el modelo a veces envía', () => {
    expect(resolverFecha('2026-09-11T10:00', CDMX, REFERENCIA)).toBe('2026-09-11');
  });

  it('resuelve hoy, mañana y pasado mañana', () => {
    expect(resolverFecha('hoy', CDMX, REFERENCIA)).toBe('2026-09-10');
    expect(resolverFecha('mañana', CDMX, REFERENCIA)).toBe('2026-09-11');
    expect(resolverFecha('pasado mañana', CDMX, REFERENCIA)).toBe('2026-09-12');
  });

  it('resuelve el próximo día de la semana', () => {
    // Referencia: jueves 10. El próximo martes es el 15.
    expect(resolverFecha('el próximo martes', CDMX, REFERENCIA)).toBe('2026-09-15');
    // Sin "próximo", el siguiente viernes es mañana, el 11.
    expect(resolverFecha('viernes', CDMX, REFERENCIA)).toBe('2026-09-11');
  });

  it('trata "este jueves" como hoy si hoy es jueves', () => {
    expect(resolverFecha('este jueves', CDMX, REFERENCIA)).toBe('2026-09-10');
  });

  it('devuelve null cuando no entiende, en vez de inventar una fecha', () => {
    expect(resolverFecha('cuando se pueda', CDMX, REFERENCIA)).toBeNull();
    expect(resolverFecha('', CDMX, REFERENCIA)).toBeNull();
  });
});

describe('tramos de atención', () => {
  it('convierte los rangos del día en instantes absolutos', () => {
    const tramos = tramosDelDia(
      '2026-09-11',
      [
        { start: '09:00', end: '14:00' },
        { start: '16:00', end: '19:00' },
      ],
      CDMX,
    );

    expect(tramos).toHaveLength(2);
    expect(tramos[0]?.inicio.toISOString()).toBe('2026-09-11T15:00:00.000Z');
    expect(tramos[1]?.fin.toISOString()).toBe('2026-09-12T01:00:00.000Z');
  });

  it('descarta rangos con el fin antes del inicio', () => {
    expect(tramosDelDia('2026-09-11', [{ start: '14:00', end: '09:00' }], CDMX)).toHaveLength(0);
  });
});

describe('solapamiento de intervalos', () => {
  const d = (iso: string) => new Date(iso);

  it('detecta solapamiento parcial', () => {
    expect(
      seSolapan(
        d('2026-09-11T15:00:00Z'),
        d('2026-09-11T15:45:00Z'),
        d('2026-09-11T15:30:00Z'),
        d('2026-09-11T16:00:00Z'),
      ),
    ).toBe(true);
  });

  it('no considera solapamiento cuando uno acaba donde empieza el otro', () => {
    expect(
      seSolapan(
        d('2026-09-11T15:00:00Z'),
        d('2026-09-11T15:30:00Z'),
        d('2026-09-11T15:30:00Z'),
        d('2026-09-11T16:00:00Z'),
      ),
    ).toBe(false);
  });
});

describe('formateo de fecha ISO local', () => {
  it('usa el día local aunque en UTC ya sea otro', () => {
    expect(aFechaISO(new Date('2026-09-12T02:00:00Z'), CDMX)).toBe('2026-09-11');
  });
});
