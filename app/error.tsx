'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El detalle se queda en el servidor; al usuario solo se le muestra el digest.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-tinta">Algo salió mal</h1>
      <p className="max-w-md text-sm text-tinta-suave">
        Ocurrió un error inesperado al cargar esta sección. Vuelve a intentarlo; si persiste,
        revisa los registros del servidor.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-tinta-tenue">Referencia: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-panel bg-marca px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-oscura"
      >
        Reintentar
      </button>
    </main>
  );
}
