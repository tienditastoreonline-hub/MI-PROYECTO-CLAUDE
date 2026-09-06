import { SlidersHorizontal } from '@phosphor-icons/react/dist/ssr';

import { Card, EmptyState } from '@/components/ui';
import { requireClinic } from '@/lib/auth/tenant';

export const metadata = { title: 'Personalización · Recepción de voz' };

export default async function PersonalizacionPage() {
  await requireClinic();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Personalización</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Guion del agente, tratamientos, horarios de atención y voz.
        </p>
      </div>

      <Card>
        <EmptyState
          icon={<SlidersHorizontal size={28} />}
          title="Editor en construcción"
          description="Desde aquí podrás ajustar el mensaje de bienvenida, los tratamientos, los horarios y la voz, y publicar los cambios al asistente de Vapi."
        />
      </Card>
    </div>
  );
}
