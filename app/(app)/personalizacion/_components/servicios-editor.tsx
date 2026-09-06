'use client';

import { useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react/dist/ssr';

import { Button, Input } from '@/components/ui';
import type { Service } from '@/lib/supabase/database.types';

/**
 * Editor de tratamientos.
 *
 * El estado vive aquí y se serializa a un input oculto: el formulario sigue
 * siendo un `<form>` normal que envía a una Server Action, sin necesidad de una
 * llamada extra al guardar cada fila.
 */
export function ServiciosEditor({ inicial }: { inicial: Service[] }) {
  const [servicios, setServicios] = useState<Service[]>(
    inicial.length > 0 ? inicial : [{ name: '', duration_minutes: 30 }],
  );

  function actualizar(indice: number, cambios: Partial<Service>) {
    setServicios((actual) => actual.map((s, i) => (i === indice ? { ...s, ...cambios } : s)));
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="services" value={JSON.stringify(servicios)} />

      {servicios.map((servicio, indice) => (
        <div key={indice} className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-xs text-tinta-tenue" htmlFor={`servicio-${indice}`}>
              Tratamiento
            </label>
            <Input
              id={`servicio-${indice}`}
              value={servicio.name}
              onChange={(e) => actualizar(indice, { name: e.target.value })}
              placeholder="Limpieza dental"
            />
          </div>

          <div className="w-28">
            <label className="mb-1 block text-xs text-tinta-tenue" htmlFor={`duracion-${indice}`}>
              Minutos
            </label>
            <Input
              id={`duracion-${indice}`}
              type="number"
              min={5}
              max={480}
              step={5}
              value={servicio.duration_minutes}
              onChange={(e) => actualizar(indice, { duration_minutes: Number(e.target.value) })}
            />
          </div>

          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-xs text-tinta-tenue" htmlFor={`descripcion-${indice}`}>
              Descripción (opcional)
            </label>
            <Input
              id={`descripcion-${indice}`}
              value={servicio.description ?? ''}
              onChange={(e) => actualizar(indice, { description: e.target.value })}
              placeholder="Profilaxis y remoción de sarro"
            />
          </div>

          <button
            type="button"
            onClick={() => setServicios((actual) => actual.filter((_, i) => i !== indice))}
            disabled={servicios.length === 1}
            aria-label={`Eliminar ${servicio.name || 'tratamiento'}`}
            className="rounded-panel p-2 text-tinta-tenue transition-colors hover:bg-peligro-suave hover:text-peligro disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash size={16} />
          </button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variante="secundario"
          onClick={() => setServicios((actual) => [...actual, { name: '', duration_minutes: 30 }])}
        >
          <Plus size={16} />
          Añadir tratamiento
        </Button>
      </div>
    </div>
  );
}
