'use client';

import { useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react/dist/ssr';

import { Input } from '@/components/ui';
import { DIAS } from '@/lib/agent/config-schema';
import type { BusinessHours, HourRange, WeekdayKey } from '@/lib/supabase/database.types';

const NOMBRE: Record<WeekdayKey, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
};

/** Editor de horarios: varios tramos por día, para poder cerrar a mediodía. */
export function HorariosEditor({ inicial }: { inicial: BusinessHours }) {
  const [horarios, setHorarios] = useState<Record<WeekdayKey, HourRange[]>>(() => {
    const base = {} as Record<WeekdayKey, HourRange[]>;
    for (const dia of DIAS) base[dia] = inicial[dia] ?? [];
    return base;
  });

  function cambiar(dia: WeekdayKey, tramos: HourRange[]) {
    setHorarios((actual) => ({ ...actual, [dia]: tramos }));
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="business_hours" value={JSON.stringify(horarios)} />

      {DIAS.map((dia) => (
        <div key={dia} className="flex flex-wrap items-center gap-2 border-b border-borde py-2 last:border-0">
          <span className="w-24 shrink-0 text-sm text-tinta">{NOMBRE[dia]}</span>

          {horarios[dia].length === 0 ? (
            <span className="text-sm text-tinta-tenue">Cerrado</span>
          ) : (
            horarios[dia].map((tramo, indice) => (
              <div key={indice} className="flex items-center gap-1">
                <Input
                  type="time"
                  aria-label={`${NOMBRE[dia]}: apertura del tramo ${indice + 1}`}
                  value={tramo.start}
                  onChange={(e) =>
                    cambiar(
                      dia,
                      horarios[dia].map((t, i) => (i === indice ? { ...t, start: e.target.value } : t)),
                    )
                  }
                  className="w-28"
                />
                <span className="text-tinta-tenue">–</span>
                <Input
                  type="time"
                  aria-label={`${NOMBRE[dia]}: cierre del tramo ${indice + 1}`}
                  value={tramo.end}
                  onChange={(e) =>
                    cambiar(
                      dia,
                      horarios[dia].map((t, i) => (i === indice ? { ...t, end: e.target.value } : t)),
                    )
                  }
                  className="w-28"
                />
                <button
                  type="button"
                  aria-label={`Eliminar tramo ${indice + 1} de ${NOMBRE[dia]}`}
                  onClick={() => cambiar(dia, horarios[dia].filter((_, i) => i !== indice))}
                  className="rounded-panel p-1.5 text-tinta-tenue transition-colors hover:bg-peligro-suave hover:text-peligro"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={() => cambiar(dia, [...horarios[dia], { start: '09:00', end: '14:00' }])}
            className="ml-auto inline-flex items-center gap-1 rounded-panel px-2 py-1 text-xs text-tinta-suave transition-colors hover:bg-lienzo hover:text-tinta"
          >
            <Plus size={12} />
            Añadir tramo
          </button>
        </div>
      ))}
    </div>
  );
}
