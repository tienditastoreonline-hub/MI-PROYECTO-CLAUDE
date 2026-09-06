'use client';

import { useActionState } from 'react';

import { guardarNumeroVapi, type EstadoNumero } from '@/app/(app)/integraciones/actions';
import { Button, Input } from '@/components/ui';

const ESTADO_INICIAL: EstadoNumero = {};

export function NumeroVapi({ valorActual }: { valorActual: string | null }) {
  const [estado, formAction, pendiente] = useActionState(guardarNumeroVapi, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="vapi_phone_number_id" className="text-xs text-tinta-tenue">
        Identificador del número en Vapi
      </label>

      <div className="flex flex-wrap items-start gap-2">
        <Input
          id="vapi_phone_number_id"
          name="vapi_phone_number_id"
          defaultValue={valorActual ?? ''}
          placeholder="00000000-0000-0000-0000-000000000000"
          className="min-w-72 flex-1 font-mono text-xs"
        />
        <Button type="submit" variante="secundario" disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>

      <p className="text-xs text-tinta-tenue">
        Es el UUID que Vapi asigna al número, no el <code className="font-mono">+52…</code>. Lo
        encuentras en el dashboard de Vapi, en la ficha del número. Déjalo vacío para desvincularlo.
      </p>

      {estado.error ? (
        <p role="alert" className="text-xs text-peligro">
          {estado.error}
        </p>
      ) : null}
      {estado.ok ? (
        <p className="text-xs text-exito">
          Guardado. Vuelve a publicar el agente para que el número apunte a él.
        </p>
      ) : null}
    </form>
  );
}
