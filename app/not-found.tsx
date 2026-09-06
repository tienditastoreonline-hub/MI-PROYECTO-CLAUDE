import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-tinta-tenue">Error 404</p>
      <h1 className="text-2xl font-semibold text-tinta">Esta página no existe</h1>
      <p className="max-w-md text-sm text-tinta-suave">
        Puede que el enlace esté mal escrito o que el recurso pertenezca a otra clínica.
      </p>
      <Link
        href="/dashboard"
        className="rounded-panel bg-marca px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-oscura"
      >
        Volver al panel
      </Link>
    </main>
  );
}
