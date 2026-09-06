import Link from 'next/link';
import {
  CalendarCheck,
  CheckCircle,
  PhoneCall,
  Timer,
  TrendUp,
  WarningCircle,
} from '@phosphor-icons/react/dist/ssr';

import { BarChart } from '@/components/charts/bar-chart';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { getAgentConfig, requireClinic } from '@/lib/auth/tenant';
import { duracion, fechaCorta, fechaHoraLarga } from '@/lib/format/es';
import { obtenerResumen } from '@/lib/queries/dashboard';
import { obtenerEstadoIntegraciones } from '@/lib/queries/integraciones';

export const metadata = { title: 'Panel · Recepción de voz' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { clinic } = await requireClinic();
  const [resumen, config] = await Promise.all([
    obtenerResumen(clinic.id, clinic.timezone),
    getAgentConfig(clinic.id),
  ]);
  const estado = await obtenerEstadoIntegraciones(clinic.id, config?.published_hash ?? null);

  const metricas = [
    { label: 'Llamadas (7 días)', valor: String(resumen.llamadas7d), Icono: PhoneCall },
    { label: 'Citas agendadas', valor: String(resumen.citas7d), Icono: CalendarCheck },
    { label: 'Duración promedio', valor: duracion(resumen.duracionMediaSegundos), Icono: Timer },
    {
      label: 'Tasa de agendado',
      valor: resumen.tasaAgendado === null ? '—' : `${Math.round(resumen.tasaAgendado * 100)} %`,
      Icono: TrendUp,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Panel</h1>
        <p className="mt-1 text-sm text-tinta-suave">Actividad del agente de {clinic.name}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricas.map(({ label, valor, Icono }) => (
          <Card key={label}>
            <CardBody className="flex items-start justify-between">
              <div>
                <p className="text-sm text-tinta-suave">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-tinta">{valor}</p>
              </div>
              <Icono size={20} className="text-tinta-tenue" />
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Últimos 7 días" description="Llamadas atendidas y citas agendadas por día." />
          <CardBody>
            <BarChart
              titulo="Llamadas y citas por día en los últimos siete días"
              series={['Llamadas', 'Citas']}
              puntos={resumen.serie.map((punto) => ({
                etiqueta: fechaCorta(`${punto.fechaISO}T12:00:00Z`, clinic.timezone),
                etiquetaLarga: fechaCorta(`${punto.fechaISO}T12:00:00Z`, clinic.timezone),
                valores: [punto.llamadas, punto.citas],
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Estado del agente" />
          <CardBody className="flex flex-col gap-4">
            <FilaEstado
              titulo="Google Calendar"
              ok={estado.google.conectado}
              detalle={estado.google.conectado ? (estado.google.email ?? 'Conectado') : 'Sin conectar'}
            />
            <FilaEstado
              titulo="Asistente de Vapi"
              ok={Boolean(estado.vapi.assistantId)}
              detalle={estado.vapi.assistantId ? 'Publicado' : 'Sin publicar'}
            />
            <FilaEstado
              titulo="Número de teléfono"
              ok={Boolean(estado.vapi.phoneNumberId)}
              detalle={estado.vapi.phoneNumberId ? 'Asignado al asistente' : 'Sin asignar'}
            />

            {estado.vapi.hayCambiosSinPublicar ? (
              <p className="rounded-panel border border-aviso/20 bg-aviso-suave px-3 py-2 text-xs text-aviso">
                Hay cambios sin publicar: el agente que atiende las llamadas no es el que ves en
                Personalización.
              </p>
            ) : null}

            <Link href="/integraciones" className="text-sm font-medium text-marca hover:underline">
              Ir a Integraciones
            </Link>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Últimas llamadas"
          action={
            <Link href="/transcripciones" className="text-sm font-medium text-marca hover:underline">
              Ver todas
            </Link>
          }
        />
        {resumen.ultimasLlamadas.length === 0 ? (
          <EmptyState
            icon={<PhoneCall size={28} />}
            title="Todavía no hay llamadas"
            description="Cuando publiques el agente y entre la primera llamada, aparecerá aquí con su transcripción."
          />
        ) : (
          <ul className="divide-y divide-borde">
            {resumen.ultimasLlamadas.map((llamada) => (
              <li key={llamada.id}>
                <Link
                  href={`/transcripciones/${llamada.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-lienzo"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-tinta">
                      {llamada.summary ?? 'Llamada sin resumen'}
                    </p>
                    <p className="mt-0.5 text-xs text-tinta-tenue">
                      {llamada.customer_number ?? 'Número desconocido'} ·{' '}
                      {llamada.started_at ? fechaHoraLarga(llamada.started_at, clinic.timezone) : '—'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-tinta-tenue">
                    {duracion(llamada.duration_seconds)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function FilaEstado({ titulo, ok, detalle }: { titulo: string; ok: boolean; detalle: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-tinta">{titulo}</span>
      <Badge tono={ok ? 'exito' : 'neutro'}>
        {ok ? <CheckCircle size={12} weight="fill" /> : <WarningCircle size={12} />}
        {detalle}
      </Badge>
    </div>
  );
}
