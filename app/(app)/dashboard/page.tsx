import { CalendarCheck, PhoneCall, Timer, TrendUp } from '@phosphor-icons/react/dist/ssr';

import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import { requireClinic } from '@/lib/auth/tenant';

export const metadata = { title: 'Panel · Recepción de voz' };

const METRICAS = [
  { label: 'Llamadas (7 días)', Icono: PhoneCall },
  { label: 'Citas agendadas', Icono: CalendarCheck },
  { label: 'Duración promedio', Icono: Timer },
  { label: 'Tasa de agendado', Icono: TrendUp },
] as const;

export default async function DashboardPage() {
  const { clinic } = await requireClinic();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Panel</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Actividad del agente de voz de {clinic.name}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICAS.map(({ label, Icono }) => (
          <Card key={label}>
            <CardBody className="flex items-start justify-between">
              <div>
                <p className="text-sm text-tinta-suave">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-tinta">—</p>
              </div>
              <Icono size={20} className="text-tinta-tenue" />
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Últimas llamadas" />
        <EmptyState
          icon={<PhoneCall size={28} />}
          title="Todavía no hay llamadas"
          description="Cuando publiques el agente y recibas la primera llamada, aparecerá aquí junto con su transcripción."
        />
      </Card>
    </div>
  );
}
