import { notFound } from 'next/navigation';

import { FormularioPersonalizacion } from '@/app/(app)/personalizacion/_components/formulario';
import { PublicarBoton } from '@/app/(app)/personalizacion/_components/publicar-boton';
import { getAgentConfig, requireClinic } from '@/lib/auth/tenant';
import { construirPayload, hashPayload } from '@/lib/vapi/publish';

export const metadata = { title: 'Personalización · Recepción de voz' };
export const dynamic = 'force-dynamic';

export default async function PersonalizacionPage() {
  const { clinic, esOwner } = await requireClinic();
  const config = await getAgentConfig(clinic.id);

  if (!config) notFound();

  // El payload se compone en servidor solo para comparar su huella con la
  // publicada: así el aviso de "cambios sin publicar" refleja lo que realmente
  // se enviaría a Vapi, no una heurística sobre `updated_at`.
  let hayCambiosSinPublicar = false;
  try {
    const hash = hashPayload(
      construirPayload(clinic, config, { provider: config.voice_provider, voiceId: config.voice_id }),
    );
    hayCambiosSinPublicar = config.published_hash !== null && config.published_hash !== hash;
  } catch {
    // `construirPayload` necesita las variables de servidor de Vapi. Si aún no
    // están configuradas, la página sigue siendo editable: solo no se puede
    // saber si hay cambios pendientes.
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-tinta">Personalización</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Guion, tratamientos, horarios y voz del agente de {clinic.name}.
          </p>
        </div>

        {esOwner ? <PublicarBoton hayCambiosSinPublicar={hayCambiosSinPublicar} /> : null}
      </div>

      {config.last_publish_error ? (
        <p className="rounded-panel border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro">
          Último intento de publicación fallido: {config.last_publish_error}
        </p>
      ) : null}

      <FormularioPersonalizacion clinic={clinic} config={config} puedeEditar={esOwner} />
    </div>
  );
}
