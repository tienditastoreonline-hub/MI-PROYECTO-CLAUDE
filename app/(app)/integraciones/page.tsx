import { PlugsConnected } from '@phosphor-icons/react/dist/ssr';

import { Card, EmptyState } from '@/components/ui';
import { requireClinic } from '@/lib/auth/tenant';

export const metadata = { title: 'Integraciones · Recepción de voz' };

export default async function IntegracionesPage() {
  await requireClinic();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Integraciones</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Google Calendar y el número de teléfono del agente.
        </p>
      </div>

      <Card>
        <EmptyState
          icon={<PlugsConnected size={28} />}
          title="Sin integraciones conectadas"
          description="Conecta Google Calendar para que el agente pueda consultar disponibilidad y agendar citas reales."
        />
      </Card>
    </div>
  );
}
