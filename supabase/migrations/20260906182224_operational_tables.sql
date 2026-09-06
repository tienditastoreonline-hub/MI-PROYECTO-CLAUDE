-- Tablas operativas: credenciales de Google, llamadas, transcripciones y citas.

create table public.google_credentials (
  id        bigint generated always as identity primary key,
  clinic_id bigint not null unique references public.clinics (id) on delete cascade,

  google_email text,
  calendar_id  text not null default 'primary',

  -- Cifrado AES-256-GCM con formato "v1.<iv>.<tag>.<ciphertext>" (base64url).
  -- El refresh token es el que da acceso persistente, por eso es not null: una
  -- fila sin él no sirve para nada y solo generaría errores diferidos.
  access_token_enc        text,
  refresh_token_enc       text not null,
  access_token_expires_at timestamptz,
  scopes                  text[] not null default '{}',

  -- Se marca en vez de borrar la fila para poder mostrar "reconecta Google" en
  -- la UI sabiendo que antes estuvo conectado.
  revoked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_credentials is
  'RLS activa y CERO políticas: denegación total para authenticated. Solo se lee desde el servidor con service_role.';

create table public.calls (
  id        bigint generated always as identity primary key,
  clinic_id bigint not null references public.clinics (id) on delete cascade,

  -- Clave natural del webhook: hace idempotente el end-of-call-report frente a
  -- los reintentos de Vapi.
  vapi_call_id      text not null unique,
  vapi_assistant_id text,

  customer_number text,
  direction       text not null default 'inbound' check (direction in ('inbound', 'outbound', 'web')),
  status          text not null default 'in-progress'
                    check (status in ('queued', 'ringing', 'in-progress', 'forwarding', 'ended')),
  ended_reason    text,

  started_at       timestamptz,
  ended_at         timestamptz,
  duration_seconds int,
  cost             numeric(10, 4),
  recording_url    text,
  summary          text,

  created_at timestamptz not null default now()
);

create table public.transcripts (
  id        bigint generated always as identity primary key,
  call_id   bigint not null unique references public.calls (id) on delete cascade,
  clinic_id bigint not null references public.clinics (id) on delete cascade,

  full_text text,
  -- [{ "role": "assistant" | "user", "message": "...", "secondsFromStart": 1.2 }]
  messages  jsonb not null default '[]'::jsonb,

  -- Búsqueda de texto completo en español para la vista de Transcripciones.
  search_tsv tsvector generated always as (to_tsvector('spanish', coalesce(full_text, ''))) stored,

  created_at timestamptz not null default now()
);

create table public.appointments (
  id        bigint generated always as identity primary key,
  clinic_id bigint not null references public.clinics (id) on delete cascade,
  call_id   bigint references public.calls (id) on delete set null,

  -- Código corto que el agente dicta por teléfono. El PK nunca se verbaliza.
  reference_code text not null,

  patient_name  text not null,
  patient_phone text,
  patient_email text,
  is_new_patient boolean not null default false,

  treatment                text not null,
  service_duration_minutes int  not null check (service_duration_minutes between 5 and 480),

  starts_at timestamptz not null,
  ends_at   timestamptz not null,

  status text not null default 'scheduled'
           check (status in ('scheduled', 'cancelled', 'completed', 'no_show')),
  source text not null default 'voice'
           check (source in ('voice', 'manual', 'google')),

  google_event_id    text,
  google_calendar_id text,

  -- Clave de idempotencia: es el id del tool call de Vapi que creó la cita.
  -- Si Vapi reintenta el mismo tool call, no se crea una segunda cita.
  tool_call_id        text,
  cancel_tool_call_id text,

  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint appointments_time_order check (ends_at > starts_at)
);

create trigger google_credentials_set_updated_at
  before update on public.google_credentials
  for each row execute function private.set_updated_at();

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function private.set_updated_at();
