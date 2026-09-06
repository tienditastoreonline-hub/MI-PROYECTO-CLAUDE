import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarCheck, Robot, User } from '@phosphor-icons/react/dist/ssr';

import { Badge, Card, CardBody, CardHeader, EmptyState, cx } from '@/components/ui';
import { requireClinic } from '@/lib/auth/tenant';
import { costo, duracion, fechaHoraLarga } from '@/lib/format/es';
import { obtenerLlamada } from '@/lib/queries/calls';

export const dynamic = 'force-dynamic';

export default async function DetalleTranscripcionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { clinic } = await requireClinic();

  const numero = Number(id);
  if (!Number.isInteger(numero)) notFound();

  // La consulta pasa por RLS: un id de otra clínica no devuelve fila y termina
  // en el mismo 404 que un id inexistente.
  const detalle = await obtenerLlamada(clinic.id, numero);
  if (!detalle) notFound();

  const { llamada, transcripcion } = detalle;
  const citas = llamada.citas.filter((c) => c.status !== 'cancelled');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/transcripciones"
          className="inline-flex items-center gap-1.5 text-sm text-tinta-suave transition-colors hover:text-tinta"
        >
          <ArrowLeft size={16} />
          Transcripciones
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-tinta">
          {llamada.started_at ? fechaHoraLarga(llamada.started_at, clinic.timezone) : 'Llamada'}
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">
          {llamada.customer_number ?? 'Número desconocido'} · {duracion(llamada.duration_seconds)} ·{' '}
          {costo(llamada.cost)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {llamada.summary ? (
            <Card>
              <CardHeader title="Resumen" />
              <CardBody>
                <p className="text-sm text-tinta-suave">{llamada.summary}</p>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Conversación" />
            {transcripcion && transcripcion.messages.length > 0 ? (
              <CardBody className="flex flex-col gap-3">
                {transcripcion.messages.map((turno, indice) => (
                  <div
                    key={indice}
                    className={cx('flex gap-3', turno.role === 'user' ? 'flex-row-reverse' : '')}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                        turno.role === 'user' ? 'bg-lienzo text-tinta-suave' : 'bg-marca-suave text-marca-oscura',
                      )}
                    >
                      {turno.role === 'user' ? <User size={14} /> : <Robot size={14} />}
                    </span>
                    <div
                      className={cx(
                        'max-w-[85%] rounded-panel px-3 py-2 text-sm',
                        turno.role === 'user'
                          ? 'bg-lienzo text-tinta'
                          : 'border border-borde bg-superficie text-tinta',
                      )}
                    >
                      <p className="mb-0.5 text-xs text-tinta-tenue">
                        {turno.role === 'user' ? 'Paciente' : 'Asistente'}
                      </p>
                      {turno.message}
                    </div>
                  </div>
                ))}
              </CardBody>
            ) : transcripcion?.full_text ? (
              <CardBody>
                <p className="text-sm whitespace-pre-line text-tinta-suave">{transcripcion.full_text}</p>
              </CardBody>
            ) : (
              <EmptyState
                title="Sin transcripción"
                description="Vapi entrega la transcripción en el reporte de fin de llamada. Si la llamada sigue en curso o el reporte no llegó, aparecerá vacía."
              />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Detalles" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <Dato etiqueta="Estado" valor={llamada.status} />
              <Dato etiqueta="Motivo de fin" valor={llamada.ended_reason ?? '—'} />
              <Dato etiqueta="Dirección" valor={llamada.direction} />
              <Dato etiqueta="ID en Vapi" valor={llamada.vapi_call_id} mono />
              {llamada.recording_url ? (
                <div>
                  <p className="mb-1 text-xs text-tinta-tenue">Grabación</p>
                  <audio controls preload="none" src={llamada.recording_url} className="w-full" />
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Cita generada" />
            {citas.length === 0 ? (
              <EmptyState title="Esta llamada no terminó en cita" />
            ) : (
              <CardBody className="flex flex-col gap-3">
                {citas.map((cita) => (
                  <div key={cita.id} className="flex items-start gap-2">
                    <CalendarCheck size={18} className="mt-0.5 shrink-0 text-marca" />
                    <div>
                      <p className="text-sm text-tinta">{cita.treatment}</p>
                      <p className="text-xs text-tinta-tenue">
                        {fechaHoraLarga(cita.starts_at, clinic.timezone)}
                      </p>
                      <Badge tono="marca">Código {cita.reference_code}</Badge>
                    </div>
                  </div>
                ))}
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-tinta-tenue">{etiqueta}</span>
      <span className={cx('text-right text-sm text-tinta', mono && 'font-mono text-xs')}>{valor}</span>
    </div>
  );
}
