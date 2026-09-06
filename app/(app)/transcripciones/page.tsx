import { ChatsCircle } from '@phosphor-icons/react/dist/ssr';

import { Card, EmptyState } from '@/components/ui';
import { requireClinic } from '@/lib/auth/tenant';

export const metadata = { title: 'Transcripciones · Recepción de voz' };

export default async function TranscripcionesPage() {
  await requireClinic();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Transcripciones</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Conversación completa de cada llamada atendida por el agente.
        </p>
      </div>

      <Card>
        <EmptyState
          icon={<ChatsCircle size={28} />}
          title="Aún no hay llamadas registradas"
          description="Al terminar cada llamada, Vapi envía la transcripción y el resumen al webhook y quedan guardados aquí."
        />
      </Card>
    </div>
  );
}
