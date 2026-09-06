'use client';

import { useActionState } from 'react';

import { guardarConfig, type EstadoGuardado } from '@/app/(app)/personalizacion/actions';
import { HorariosEditor } from '@/app/(app)/personalizacion/_components/horarios-editor';
import { ServiciosEditor } from '@/app/(app)/personalizacion/_components/servicios-editor';
import { Button, Card, CardBody, CardHeader, ErrorNote, Field, Input, Select, Textarea } from '@/components/ui';
import { VOCES } from '@/lib/vapi/voices';
import type { AgentConfig, Clinic } from '@/lib/supabase/database.types';

const ESTADO_INICIAL: EstadoGuardado = {};

export function FormularioPersonalizacion({
  clinic,
  config,
  puedeEditar,
}: {
  clinic: Clinic;
  config: AgentConfig;
  puedeEditar: boolean;
}) {
  const [estado, formAction, pendiente] = useActionState(guardarConfig, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={!puedeEditar || pendiente} className="flex flex-col gap-4">
        <Card>
          <CardHeader
            title="Guion del agente"
            description="Lo primero que oye el paciente y cómo se comporta el asistente."
          />
          <CardBody className="flex flex-col gap-4">
            <Field label="Mensaje de bienvenida" htmlFor="first_message">
              <Textarea id="first_message" name="first_message" defaultValue={config.first_message} required />
            </Field>

            <Field label="Tono" htmlFor="tone" hint="Por ejemplo: profesional y cálido.">
              <Input id="tone" name="tone" defaultValue={config.tone} required />
            </Field>

            <Field
              label="Mensaje al transferir a recepción"
              htmlFor="handoff_message"
              hint="Lo que dice antes de pasar la llamada a una persona."
            >
              <Input id="handoff_message" name="handoff_message" defaultValue={config.handoff_message} required />
            </Field>

            <Field
              label="Indicaciones adicionales"
              htmlFor="system_prompt_extra"
              hint="Se añaden al final del prompt. Útil para políticas propias de la clínica."
            >
              <Textarea
                id="system_prompt_extra"
                name="system_prompt_extra"
                defaultValue={config.system_prompt_extra ?? ''}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Información de la clínica" description="El agente la usa para responder dudas." />
          <CardBody className="flex flex-col gap-4">
            <Field label="Dirección" htmlFor="address">
              <Input id="address" name="address" defaultValue={clinic.address ?? ''} />
            </Field>

            <Field
              label="Teléfono de recepción"
              htmlFor="phone_e164"
              hint="Formato internacional. Es el destino al que se transfieren las llamadas."
            >
              <Input
                id="phone_e164"
                name="phone_e164"
                defaultValue={clinic.phone_e164 ?? ''}
                placeholder="+525512345678"
              />
            </Field>

            <Field label="Formas de pago" htmlFor="payment_methods">
              <Input
                id="payment_methods"
                name="payment_methods"
                defaultValue={config.clinic_info.payment_methods ?? ''}
              />
            </Field>

            <Field label="Políticas" htmlFor="policies">
              <Textarea id="policies" name="policies" defaultValue={config.clinic_info.policies ?? ''} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Tratamientos"
            description="La duración determina los huecos que ofrece el agente."
          />
          <CardBody>
            <ServiciosEditor inicial={config.services} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Horarios de atención" description="El agente no ofrece citas fuera de estos tramos." />
          <CardBody>
            <HorariosEditor inicial={config.business_hours} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Voz e idioma" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Voz"
              htmlFor="voz"
              hint="Las voces marcadas como sin verificar pueden ser rechazadas por Vapi al publicar; si ocurre, se usa una de respaldo y se te avisa."
            >
              <Select
                id="voz"
                name="voz_combinada"
                defaultValue={`${config.voice_provider}|${config.voice_id}`}
                onChange={(e) => {
                  const [proveedor, voz] = e.target.value.split('|');
                  const campoProveedor = document.getElementById('voice_provider') as HTMLInputElement | null;
                  const campoVoz = document.getElementById('voice_id') as HTMLInputElement | null;
                  if (campoProveedor) campoProveedor.value = proveedor ?? '';
                  if (campoVoz) campoVoz.value = voz ?? '';
                }}
              >
                {VOCES.map((voz) => (
                  <option key={`${voz.provider}|${voz.voiceId}`} value={`${voz.provider}|${voz.voiceId}`}>
                    {voz.etiqueta}
                    {voz.verificada ? '' : ' · sin verificar'}
                  </option>
                ))}
              </Select>
            </Field>

            <input type="hidden" id="voice_provider" name="voice_provider" defaultValue={config.voice_provider} />
            <input type="hidden" id="voice_id" name="voice_id" defaultValue={config.voice_id} />

            <Field label="Idioma de transcripción" htmlFor="language">
              <Select id="language" name="language" defaultValue={config.language}>
                <option value="es">Español</option>
                <option value="en">Inglés</option>
              </Select>
            </Field>

            <Field label="Proveedor del modelo" htmlFor="model_provider">
              <Input id="model_provider" name="model_provider" defaultValue={config.model_provider} required />
            </Field>

            <Field label="Modelo" htmlFor="model_name">
              <Input id="model_name" name="model_name" defaultValue={config.model_name} required />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Reglas de agenda" />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label="Intervalo entre citas (min)" htmlFor="slot_minutes">
              <Input
                id="slot_minutes"
                name="slot_minutes"
                type="number"
                min={15}
                max={120}
                step={5}
                defaultValue={config.slot_minutes}
              />
            </Field>

            <Field label="Antelación mínima (min)" htmlFor="min_lead_minutes">
              <Input
                id="min_lead_minutes"
                name="min_lead_minutes"
                type="number"
                min={0}
                max={10080}
                defaultValue={config.min_lead_minutes}
              />
            </Field>

            <Field label="Horizonte máximo (días)" htmlFor="max_advance_days">
              <Input
                id="max_advance_days"
                name="max_advance_days"
                type="number"
                min={1}
                max={365}
                defaultValue={config.max_advance_days}
              />
            </Field>

            <label className="flex items-start gap-2 sm:col-span-3">
              <input
                type="checkbox"
                name="hipaa_enabled"
                defaultChecked={config.hipaa_enabled}
                className="mt-0.5"
              />
              <span className="text-sm text-tinta">
                Almacenamiento conforme a HIPAA
                <span className="block text-xs text-tinta-tenue">
                  Solo surte efecto si tu organización de Vapi tiene plan Enterprise o el complemento
                  contratado. Restringe los proveedores de modelo, voz y transcripción disponibles.
                </span>
              </span>
            </label>
          </CardBody>
        </Card>
      </fieldset>

      {estado.error ? <ErrorNote>{estado.error}</ErrorNote> : null}
      {estado.ok ? (
        <p className="rounded-panel border border-exito/20 bg-exito-suave px-3 py-2 text-sm text-exito">
          Cambios guardados. Publica para que el agente empiece a usarlos.
        </p>
      ) : null}

      {puedeEditar ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pendiente}>
            {pendiente ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-tinta-tenue">
          Solo el dueño de la clínica puede modificar la configuración del agente.
        </p>
      )}
    </form>
  );
}
