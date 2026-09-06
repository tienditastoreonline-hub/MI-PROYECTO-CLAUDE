import Link from 'next/link';
import {
  CheckCircle,
  GoogleLogo,
  PhoneCall,
  PlugsConnected,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react/dist/ssr';

import { DesconectarGoogle } from '@/app/(app)/integraciones/_components/desconectar-google';
import { Badge, Card, CardBody, CardHeader, cx } from '@/components/ui';
import { getAgentConfig, requireClinic } from '@/lib/auth/tenant';
import { fechaHoraLarga } from '@/lib/format/es';
import { obtenerEstadoIntegraciones } from '@/lib/queries/integraciones';

export const metadata = { title: 'Integraciones · Recepción de voz' };
export const dynamic = 'force-dynamic';

const MENSAJES: Record<string, { texto: string; tono: 'exito' | 'peligro' | 'aviso' }> = {
  conectado: { texto: 'Google Calendar quedó conectado.', tono: 'exito' },
  cancelado: { texto: 'Cancelaste el permiso en Google, no se conectó nada.', tono: 'aviso' },
  'estado-invalido': {
    texto: 'El enlace de retorno no era válido o caducó. Vuelve a iniciar la conexión.',
    tono: 'peligro',
  },
  'error-canje': { texto: 'Google no aceptó el código de autorización. Inténtalo de nuevo.', tono: 'peligro' },
  'sin-refresh-token': {
    texto:
      'Google no entregó un token de renovación, así que la conexión dejaría de funcionar en una hora. Revoca el acceso en tu cuenta de Google y vuelve a conectar.',
    tono: 'peligro',
  },
  'error-guardado': { texto: 'No se pudieron guardar las credenciales.', tono: 'peligro' },
};

export default async function IntegracionesPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { google } = await searchParams;
  const { clinic, esOwner } = await requireClinic();
  const config = await getAgentConfig(clinic.id);
  const estado = await obtenerEstadoIntegraciones(clinic.id, config?.published_hash ?? null);

  const aviso = google ? MENSAJES[google] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-tinta">Integraciones</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Google Calendar y el asistente de voz de {clinic.name}.
        </p>
      </div>

      {aviso ? (
        <p
          className={cx(
            'rounded-panel border px-3 py-2 text-sm',
            aviso.tono === 'exito' && 'border-exito/20 bg-exito-suave text-exito',
            aviso.tono === 'aviso' && 'border-aviso/20 bg-aviso-suave text-aviso',
            aviso.tono === 'peligro' && 'border-peligro/20 bg-peligro-suave text-peligro',
          )}
        >
          {aviso.texto}
        </p>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <GoogleLogo size={18} />
              Google Calendar
            </span>
          }
          description="El agente consulta la disponibilidad real y crea los eventos de cada cita."
          action={
            <Badge tono={estado.google.conectado ? 'exito' : 'neutro'}>
              {estado.google.conectado ? <CheckCircle size={12} weight="fill" /> : <WarningCircle size={12} />}
              {estado.google.conectado ? 'Conectado' : 'Sin conectar'}
            </Badge>
          }
        />
        <CardBody className="flex flex-wrap items-end justify-between gap-4">
          <div className="text-sm">
            {estado.google.conectado ? (
              <>
                <p className="text-tinta">{estado.google.email ?? 'Cuenta de Google conectada'}</p>
                <p className="text-xs text-tinta-tenue">
                  Calendario «{estado.google.calendarId}»
                  {estado.google.conectadoDesde
                    ? ` · desde el ${fechaHoraLarga(estado.google.conectadoDesde, clinic.timezone)}`
                    : ''}
                </p>
              </>
            ) : estado.google.revocado ? (
              <p className="flex items-center gap-1.5 text-aviso">
                <Warning size={16} />
                El acceso fue revocado o expiró. Vuelve a conectarlo.
              </p>
            ) : (
              <p className="text-tinta-suave">
                Sin conectar, el agente no puede consultar huecos ni crear citas.
              </p>
            )}
          </div>

          {esOwner ? (
            <div className="flex items-center gap-2">
              <Link
                href="/api/google/oauth/start"
                className="rounded-panel bg-marca px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marca-oscura"
              >
                {estado.google.conectado ? 'Reconectar' : 'Conectar con Google'}
              </Link>
              {estado.google.conectado ? <DesconectarGoogle /> : null}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <PhoneCall size={18} />
              Agente de Vapi
            </span>
          }
          description="Asistente y número de teléfono de esta clínica."
          action={
            <Badge tono={estado.vapi.assistantId ? 'exito' : 'neutro'}>
              {estado.vapi.assistantId ? 'Publicado' : 'Sin publicar'}
            </Badge>
          }
        />
        <CardBody className="flex flex-col gap-3 text-sm">
          <Fila
            etiqueta="Asistente"
            valor={estado.vapi.assistantId ?? 'Sin crear. Publica desde Personalización.'}
            mono={Boolean(estado.vapi.assistantId)}
          />
          <Fila
            etiqueta="Número de teléfono"
            valor={
              estado.vapi.phoneNumberId ??
              'Sin asignar. Compra un número en Vapi y guarda su identificador en la clínica.'
            }
            mono={Boolean(estado.vapi.phoneNumberId)}
          />
          <Fila
            etiqueta="Última publicación"
            valor={
              estado.vapi.publicadoEn ? fechaHoraLarga(estado.vapi.publicadoEn, clinic.timezone) : 'Nunca'
            }
          />

          {estado.vapi.assistantId && !estado.vapi.phoneNumberId ? (
            <p className="rounded-panel border border-aviso/20 bg-aviso-suave px-3 py-2 text-xs text-aviso">
              El asistente existe pero ningún número apunta a él, así que todavía no atiende llamadas
              entrantes.
            </p>
          ) : null}

          {estado.vapi.hayCambiosSinPublicar ? (
            <p className="rounded-panel border border-aviso/20 bg-aviso-suave px-3 py-2 text-xs text-aviso">
              La configuración guardada no coincide con la publicada.{' '}
              <Link href="/personalizacion" className="font-medium underline">
                Publicar ahora
              </Link>
            </p>
          ) : null}

          {estado.vapi.ultimoError ? (
            <p className="rounded-panel border border-peligro/20 bg-peligro-suave px-3 py-2 text-xs text-peligro">
              Último error de publicación: {estado.vapi.ultimoError}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <PlugsConnected size={18} />
              Webhook
            </span>
          }
          description="La URL que Vapi llama durante y al final de cada llamada."
        />
        <CardBody className="flex flex-col gap-2 text-sm">
          <code className="rounded-panel bg-lienzo px-3 py-2 font-mono text-xs break-all text-tinta-suave">
            {'{APP_URL}'}/api/vapi/webhook
          </code>
          <p className="text-xs text-tinta-tenue">
            Se configura sola al publicar el agente, junto con el secreto compartido. Si cambias{' '}
            <code className="font-mono">APP_URL</code> o rotas{' '}
            <code className="font-mono">VAPI_WEBHOOK_SECRET</code>, vuelve a publicar o el webhook empezará a
            responder 401.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Fila({ etiqueta, valor, mono }: { etiqueta: string; valor: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-xs text-tinta-tenue">{etiqueta}</span>
      <span className={cx('text-right text-tinta', mono && 'font-mono text-xs')}>{valor}</span>
    </div>
  );
}
