'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarBlank,
  ChartLine,
  ChatsCircle,
  PlugsConnected,
  SlidersHorizontal,
} from '@phosphor-icons/react/dist/ssr';

import { cx } from '@/components/ui';

const NAVEGACION = [
  { href: '/dashboard', label: 'Panel', Icono: ChartLine },
  { href: '/calendario', label: 'Calendario', Icono: CalendarBlank },
  { href: '/transcripciones', label: 'Transcripciones', Icono: ChatsCircle },
  { href: '/personalizacion', label: 'Personalización', Icono: SlidersHorizontal },
  { href: '/integraciones', label: 'Integraciones', Icono: PlugsConnected },
] as const;

export function Sidebar({ clinicName }: { clinicName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-borde bg-superficie px-4 py-4 md:h-dvh md:w-60 md:border-r md:border-b-0 md:py-6">
      <div className="px-2">
        <p className="text-xs font-medium tracking-wide text-tinta-tenue uppercase">Clínica</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-tinta" title={clinicName}>
          {clinicName}
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {NAVEGACION.map(({ href, label, Icono }) => {
          const activo = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={activo ? 'page' : undefined}
              className={cx(
                'flex shrink-0 items-center gap-2.5 rounded-panel px-3 py-2 text-sm font-medium transition-colors',
                activo ? 'bg-marca-suave text-marca-oscura' : 'text-tinta-suave hover:bg-lienzo hover:text-tinta',
              )}
            >
              <Icono size={18} weight={activo ? 'fill' : 'regular'} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
