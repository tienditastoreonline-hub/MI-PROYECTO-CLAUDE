import type { ComponentProps, ReactNode } from 'react';

/** Une clases ignorando los valores vacíos. */
export function cx(...clases: Array<string | false | null | undefined>): string {
  return clases.filter(Boolean).join(' ');
}

// ── Card ────────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cx('rounded-panel border border-borde bg-superficie shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-borde px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-tinta">{title}</h2>
        {description ? <p className="mt-1 text-sm text-tinta-suave">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('px-5 py-4', className)} {...props} />;
}

// ── Button ──────────────────────────────────────────────────────────────────

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca text-white hover:bg-marca-oscura disabled:bg-marca/50',
  secundario:
    'border border-borde-fuerte bg-superficie text-tinta hover:bg-lienzo disabled:text-tinta-tenue',
  peligro: 'bg-peligro text-white hover:bg-peligro/90 disabled:bg-peligro/50',
  fantasma: 'text-tinta-suave hover:bg-lienzo hover:text-tinta',
};

export function Button({
  variante = 'primario',
  className,
  ...props
}: ComponentProps<'button'> & { variante?: Variante }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-panel px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        VARIANTES[variante],
        className,
      )}
      {...props}
    />
  );
}

// ── Campos de formulario ────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-tinta">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-tinta-tenue">{hint}</p> : null}
    </div>
  );
}

const CAMPO_BASE =
  'w-full rounded-panel border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue focus:border-marca focus:outline-none';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(CAMPO_BASE, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx(CAMPO_BASE, 'min-h-24 resize-y', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cx(CAMPO_BASE, className)} {...props} />;
}

// ── Badge ───────────────────────────────────────────────────────────────────

type Tono = 'neutro' | 'exito' | 'aviso' | 'peligro' | 'marca';

const TONOS: Record<Tono, string> = {
  neutro: 'bg-lienzo text-tinta-suave border-borde',
  exito: 'bg-exito-suave text-exito border-exito/20',
  aviso: 'bg-aviso-suave text-aviso border-aviso/20',
  peligro: 'bg-peligro-suave text-peligro border-peligro/20',
  marca: 'bg-marca-suave text-marca-oscura border-marca/20',
};

export function Badge({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONOS[tono],
      )}
    >
      {children}
    </span>
  );
}

// ── Estados ─────────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="text-tinta-tenue">{icon}</div> : null}
      <p className="text-sm font-medium text-tinta">{title}</p>
      {description ? <p className="max-w-sm text-sm text-tinta-suave">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-panel bg-borde', className)} />;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-panel border border-peligro/20 bg-peligro-suave px-3 py-2 text-sm text-peligro"
    >
      {children}
    </p>
  );
}
