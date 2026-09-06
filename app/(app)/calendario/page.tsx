import Link from 'next/link';
import { addDays, subDays } from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarBlank, GoogleLogo, Warning } from '@phosphor-icons/react/dist/ssr';

import { Badge, Card, CardBody, EmptyState, cx } from '@/components/ui';
import { requireClinic } from '@/lib/auth/tenant';
import { fechaISOLocal, fechaLarga, hora } from '@/lib/format/es';
import { obtenerAgenda, type EntradaAgenda } from '@/lib/queries/agenda';

export const metadata = { title: 'Calendario · Recepción de voz' };
export const dynamic = 'force-dynamic';

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const { semana } = await searchParams;
  const { clinic } = await requireClinic();

  // Si no se pide semana, `obtenerAgenda` usa la actual: resolver "hoy" aquí
  // sería una llamada impura dentro del render.
  const referencia = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? new Date(`${semana}T12:00:00Z`) : undefined;
  const agenda = await obtenerAgenda(clinic.id, clinic.timezone, referencia);

  const dias = Array.from({ length: 7 }, (_, i) => addDays(agenda.inicioSemana, i));
  const porDia = new Map<string, EntradaAgenda[]>();

  for (const entrada of agenda.entradas) {
    const clave = fechaISOLocal(entrada.inicio, clinic.timezone);
    porDia.set(clave, [...(porDia.get(clave) ?? []), entrada]);
  }

  const semanaAnterior = fechaISOLocal(subDays(agenda.inicioSemana, 7), clinic.timezone);
  const semanaSiguiente = fechaISOLocal(addDays(agenda.inicioSemana, 7), clinic.timezone);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-tinta">Calendario</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Semana del {fechaLarga(agenda.inicioSemana, clinic.timezone)}
          </p>
        </div>

        <nav className="flex items-center gap-1">
          <EnlaceSemana href={`/calendario?semana=${semanaAnterior}`} etiqueta="Semana anterior">
            <ArrowLeft size={16} />
          </EnlaceSemana>
          <Link
            href="/calendario"
            className="rounded-panel px-3 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:bg-lienzo hover:text-tinta"
          >
            Hoy
          </Link>
          <EnlaceSemana href={`/calendario?semana=${semanaSiguiente}`} etiqueta="Semana siguiente">
            <ArrowRight size={16} />
          </EnlaceSemana>
        </nav>
      </div>

      {!agenda.googleConectado ? (
        <p className="flex items-start gap-2 rounded-panel border border-aviso/20 bg-aviso-suave px-3 py-2 text-sm text-aviso">
          <Warning size={18} className="mt-0.5 shrink-0" />
          <span>
            {agenda.errorGoogle} Se muestran solo las citas registradas por el agente.{' '}
            <Link href="/integraciones" className="font-medium underline">
              Conectar Google Calendar
            </Link>
          </span>
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-7">
        {dias.map((dia) => {
          const clave = fechaISOLocal(dia, clinic.timezone);
          const entradas = porDia.get(clave) ?? [];
          const esHoy = clave === fechaISOLocal(new Date(), clinic.timezone);

          return (
            <Card key={clave} className={cx('min-h-40', esHoy && 'border-marca')}>
              <div
                className={cx(
                  'border-b border-borde px-3 py-2',
                  esHoy ? 'bg-marca-suave text-marca-oscura' : 'text-tinta-suave',
                )}
              >
                <p className="text-xs font-medium capitalize">
                  {fechaLarga(dia, clinic.timezone).replace(/ de \w+$/, '')}
                </p>
              </div>

              <CardBody className="flex flex-col gap-2 px-2 py-2">
                {entradas.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-tinta-tenue">Sin citas</p>
                ) : (
                  entradas.map((entrada) => <Entrada key={entrada.clave} entrada={entrada} timezone={clinic.timezone} />)
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {agenda.entradas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarBlank size={28} />}
            title="No hay nada agendado esta semana"
            description="Las citas que agende el agente por teléfono y los eventos que crees en Google Calendar aparecerán aquí."
          />
        </Card>
      ) : null}
    </div>
  );
}

function Entrada({ entrada, timezone }: { entrada: EntradaAgenda; timezone: string }) {
  const cuerpo = (
    <>
      <p className="text-xs font-medium text-tinta-tenue">
        {entrada.esTodoElDia ? 'Todo el día' : hora(entrada.inicio, timezone)}
      </p>
      <p className="mt-0.5 line-clamp-2 text-sm text-tinta">{entrada.titulo}</p>
      {entrada.cita ? (
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge tono="marca">{entrada.cita.reference_code}</Badge>
          {entrada.cita.is_new_patient ? <Badge tono="aviso">Nuevo</Badge> : null}
        </div>
      ) : (
        <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-tinta-tenue">
          <GoogleLogo size={10} />
          Externo
        </span>
      )}
    </>
  );

  const clases = cx(
    'block rounded-panel border px-2 py-1.5 transition-colors',
    entrada.origen === 'cita'
      ? 'border-marca/20 bg-marca-suave/40 hover:bg-marca-suave'
      : 'border-borde bg-lienzo hover:bg-borde/40',
  );

  // La cita enlaza a la llamada que la originó; el evento externo, a Google.
  if (entrada.cita?.call_id) {
    return (
      <Link href={`/transcripciones/${entrada.cita.call_id}`} className={clases}>
        {cuerpo}
      </Link>
    );
  }

  if (entrada.enlaceGoogle) {
    return (
      <a href={entrada.enlaceGoogle} target="_blank" rel="noopener noreferrer" className={clases}>
        {cuerpo}
      </a>
    );
  }

  return <div className={clases}>{cuerpo}</div>;
}

function EnlaceSemana({
  href,
  etiqueta,
  children,
}: {
  href: string;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as never}
      aria-label={etiqueta}
      className="rounded-panel border border-borde-fuerte bg-superficie p-2 text-tinta-suave transition-colors hover:bg-lienzo hover:text-tinta"
    >
      {children}
    </Link>
  );
}
