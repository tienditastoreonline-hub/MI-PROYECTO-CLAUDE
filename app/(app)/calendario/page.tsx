import { CalendarBlank } from '@phosphor-icons/react/dist/ssr';

import { Card, EmptyState } from '@/components/ui';
import { requireClinic } from '@/lib/auth/tenant';

export const metadata = { title: 'Calendario · Recepción de voz' };

export default async function CalendarioPage() {
  await requireClinic();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Calendario</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Citas agendadas por el agente y eventos de Google Calendar.
        </p>
      </div>

      <Card>
        <EmptyState
          icon={<CalendarBlank size={28} />}
          title="Conecta Google Calendar para ver la agenda"
          description="En cuanto vincules el calendario de la clínica, aquí aparecerán las citas del agente junto con los eventos creados directamente en Google."
        />
      </Card>
    </div>
  );
}
