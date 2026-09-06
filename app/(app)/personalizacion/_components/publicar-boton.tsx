'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CloudArrowUp } from '@phosphor-icons/react/dist/ssr';

import { Button } from '@/components/ui';

interface Respuesta {
  ok?: boolean;
  aviso?: string | null;
  numeroVinculado?: boolean;
  error?: string;
}

/**
 * Publica la configuración en el asistente de Vapi.
 *
 * Crear el asistente no basta para que atienda llamadas: hace falta además que el
 * número apunte a él, y eso se avisa explícitamente aquí para no dar por
 * desplegado algo que no lo está.
 */
export function PublicarBoton({ hayCambiosSinPublicar }: { hayCambiosSinPublicar: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<'listo' | 'publicando'>('listo');
  const [resultado, setResultado] = useState<Respuesta | null>(null);

  async function publicar() {
    setEstado('publicando');
    setResultado(null);

    try {
      const respuesta = await fetch('/api/agent/publish', { method: 'POST' });
      const cuerpo = (await respuesta.json()) as Respuesta;
      setResultado(cuerpo);
      if (cuerpo.ok) router.refresh();
    } catch {
      setResultado({ error: 'No se pudo contactar con el servidor. Revisa tu conexión.' });
    } finally {
      setEstado('listo');
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" onClick={publicar} disabled={estado === 'publicando'}>
        <CloudArrowUp size={16} />
        {estado === 'publicando' ? 'Publicando…' : 'Publicar en Vapi'}
      </Button>

      {hayCambiosSinPublicar && !resultado ? (
        <p className="text-xs text-aviso">
          Hay cambios guardados que el agente aún no usa. Publica para aplicarlos.
        </p>
      ) : null}

      {resultado?.error ? (
        <p role="alert" className="max-w-md text-right text-xs text-peligro">
          {resultado.error}
        </p>
      ) : null}

      {resultado?.ok ? (
        <div className="max-w-md text-right text-xs">
          <p className="text-exito">Agente publicado.</p>
          {resultado.aviso ? <p className="mt-1 text-aviso">{resultado.aviso}</p> : null}
          {resultado.numeroVinculado === false ? (
            <p className="mt-1 text-aviso">
              La clínica todavía no tiene número de Vapi asignado, así que el asistente aún no recibe
              llamadas entrantes.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
