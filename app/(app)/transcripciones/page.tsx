import Link from 'next/link';
import { CalendarCheck, ChatsCircle, MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';

import { Badge, Card, EmptyState, Input, Select } from '@/components/ui';
import { requireClinic } from '@/lib/auth/tenant';
import { duracion, fechaHoraLarga } from '@/lib/format/es';
import { listarLlamadas } from '@/lib/queries/calls';

export const metadata = { title: 'Transcripciones · Recepción de voz' };
export const dynamic = 'force-dynamic';

const RANGOS = [
  { valor: '', etiqueta: 'Cualquier fecha' },
  { valor: '7', etiqueta: 'Últimos 7 días' },
  { valor: '30', etiqueta: 'Últimos 30 días' },
  { valor: '90', etiqueta: 'Últimos 90 días' },
] as const;

export default async function TranscripcionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dias?: string; cita?: string; cursor?: string }>;
}) {
  const filtros = await searchParams;
  const { clinic } = await requireClinic();

  const dias = Number(filtros.dias);

  const { llamadas, siguienteCursor } = await listarLlamadas(clinic.id, {
    busqueda: filtros.q,
    soloConCita: filtros.cita === '1',
    diasAtras: Number.isFinite(dias) && dias > 0 ? dias : undefined,
    cursor: filtros.cursor,
  });

  const hayFiltros = Boolean(filtros.q || filtros.dias || filtros.cita);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Transcripciones</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Conversación completa de cada llamada atendida por el agente.
        </p>
      </div>

      {/* Los filtros son un formulario GET: el estado vive en la URL, así que una
          búsqueda se puede compartir o recargar sin perderla. */}
      <form className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-tinta">
            Buscar
          </label>
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tinta-tenue"
            />
            <Input
              id="q"
              name="q"
              defaultValue={filtros.q ?? ''}
              placeholder="Resumen o número de teléfono"
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <label htmlFor="dias" className="mb-1.5 block text-sm font-medium text-tinta">
            Fecha
          </label>
          <Select id="dias" name="dias" defaultValue={filtros.dias ?? ''}>
            {RANGOS.map((rango) => (
              <option key={rango.valor} value={rango.valor}>
                {rango.etiqueta}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="cita" className="mb-1.5 block text-sm font-medium text-tinta">
            Resultado
          </label>
          <Select id="cita" name="cita" defaultValue={filtros.cita ?? ''}>
            <option value="">Todas</option>
            <option value="1">Solo con cita</option>
          </Select>
        </div>

        <button
          type="submit"
          className="rounded-panel bg-marca px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-oscura"
        >
          Filtrar
        </button>

        {hayFiltros ? (
          <Link href="/transcripciones" className="px-2 py-2 text-sm text-tinta-suave hover:text-tinta">
            Limpiar
          </Link>
        ) : null}
      </form>

      <Card>
        {llamadas.length === 0 ? (
          <EmptyState
            icon={<ChatsCircle size={28} />}
            title={hayFiltros ? 'Ninguna llamada coincide con el filtro' : 'Aún no hay llamadas registradas'}
            description={
              hayFiltros
                ? 'Prueba a ampliar el rango de fechas o a quitar la búsqueda.'
                : 'Al terminar cada llamada, Vapi envía la transcripción y el resumen al webhook y quedan guardados aquí.'
            }
          />
        ) : (
          <ul className="divide-y divide-borde">
            {llamadas.map((llamada) => {
              const citas = llamada.citas.filter((c) => c.status !== 'cancelled');
              return (
                <li key={llamada.id}>
                  <Link
                    href={`/transcripciones/${llamada.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-lienzo"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-tinta">
                        {llamada.summary ?? 'Llamada sin resumen'}
                      </p>
                      <p className="mt-1 text-xs text-tinta-tenue">
                        {llamada.customer_number ?? 'Número desconocido'} ·{' '}
                        {llamada.started_at ? fechaHoraLarga(llamada.started_at, clinic.timezone) : '—'} ·{' '}
                        {duracion(llamada.duration_seconds)}
                      </p>
                    </div>
                    {citas.length > 0 ? (
                      <Badge tono="exito">
                        <CalendarCheck size={12} weight="fill" />
                        Cita agendada
                      </Badge>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {siguienteCursor ? (
        <div className="flex justify-center">
          <Link
            href={{
              pathname: '/transcripciones',
              query: { ...filtros, cursor: siguienteCursor },
            }}
            className="rounded-panel border border-borde-fuerte bg-superficie px-4 py-2 text-sm font-medium text-tinta transition-colors hover:bg-lienzo"
          >
            Cargar más
          </Link>
        </div>
      ) : null}
    </div>
  );
}
