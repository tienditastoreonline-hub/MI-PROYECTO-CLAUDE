import { describe, expect, it } from 'vitest';

import { duracion, fechaISOLocal, hora, listaEnProsa } from '@/lib/format/es';

const CDMX = 'America/Mexico_City';

describe('formateo en la zona horaria de la clínica', () => {
  it('usa la zona de la clínica, no la del servidor', () => {
    // 2026-09-11T15:00:00Z son las 09:00 en Ciudad de México (UTC-6).
    expect(hora('2026-09-11T15:00:00Z', CDMX)).toBe('09:00');
  });

  it('devuelve el día local, que puede no ser el de UTC', () => {
    // 2026-09-12T02:00:00Z sigue siendo 11 de septiembre en CDMX.
    expect(fechaISOLocal('2026-09-12T02:00:00Z', CDMX)).toBe('2026-09-11');
  });

  it('formatea la misma marca de tiempo distinto en otra zona', () => {
    expect(hora('2026-09-11T15:00:00Z', 'Europe/Madrid')).toBe('17:00');
  });
});

describe('duración', () => {
  it('muestra minutos y segundos', () => {
    expect(duracion(204)).toBe('3 min 24 s');
  });

  it('omite los minutos cuando no llega al minuto', () => {
    expect(duracion(48)).toBe('48 s');
  });

  it('devuelve un guion cuando no hay dato', () => {
    expect(duracion(null)).toBe('—');
    expect(duracion(undefined)).toBe('—');
  });
});

describe('lista en prosa', () => {
  it('une con "y" el último elemento', () => {
    expect(listaEnProsa(['9:30', '10:00', '12:30'])).toBe('9:30, 10:00 y 12:30');
  });

  it('no añade separadores con un solo elemento', () => {
    expect(listaEnProsa(['9:30'])).toBe('9:30');
  });

  it('devuelve cadena vacía sin elementos', () => {
    expect(listaEnProsa([])).toBe('');
  });
});
