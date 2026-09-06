-- Tablas núcleo del tenant: clínica, perfiles y configuración del agente.
--
-- Convenciones (guía de Postgres de Supabase):
--   · PK `bigint generated always as identity` en vez de uuid v4: un uuid
--     aleatorio como PK fragmenta el índice en tablas grandes. Los identificadores
--     que se exponen hacia fuera no son los PK (la clínica usa `slug`, la cita usa
--     `reference_code`), así que no se pierde nada.
--   · `timestamptz` siempre, nunca `timestamp`.
--   · `text` sin límite artificial en vez de varchar(n).
--   · identificadores en snake_case y sin comillas.

create table public.clinics (
  id                   bigint generated always as identity primary key,
  slug                 text        not null unique,
  name                 text        not null check (length(btrim(name)) between 2 and 120),
  timezone             text        not null default 'America/Mexico_City',
  phone_e164           text,
  address              text,
  -- Vínculo con Vapi. `unique` porque el webhook resuelve la clínica por estos
  -- campos: si se repitieran, el enrutado multi-tenant sería ambiguo.
  vapi_assistant_id    text unique,
  vapi_phone_number_id text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.clinics is 'Tenant. Toda fila del sistema pertenece a exactamente una clínica.';

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  clinic_id  bigint not null references public.clinics (id) on delete cascade,
  role       text   not null default 'owner' check (role in ('owner', 'staff')),
  full_name  text,
  email      text,
  created_at timestamptz not null default now()
);

comment on column public.profiles.id is 'Mismo uuid que auth.users. Es la única PK uuid del esquema, impuesta por Supabase Auth.';

create table public.agent_configs (
  id             bigint generated always as identity primary key,
  clinic_id      bigint not null unique references public.clinics (id) on delete cascade,

  -- Personalidad y guion
  first_message  text not null default 'Gracias por llamar. Soy el asistente virtual de la clínica, ¿le gustaría agendar una cita?',
  tone           text not null default 'profesional y cálido',
  system_prompt_extra text,
  handoff_message text not null default 'Le comunico con recepción, un momento por favor.',

  -- Información que el agente usa para responder preguntas frecuentes
  clinic_info    jsonb not null default '{}'::jsonb,
  -- [{ "name": "Limpieza dental", "duration_minutes": 30, "description": "..." }]
  services       jsonb not null default '[]'::jsonb,
  -- { "mon": [{"start":"09:00","end":"14:00"}], "tue": [...], ... }
  business_hours jsonb not null default '{}'::jsonb,
  closed_dates   date[] not null default '{}',

  -- Voz, idioma y modelo
  voice_provider text not null default 'azure',
  voice_id       text not null default 'es-MX-DaliaNeural',
  language       text not null default 'es',
  model_provider text not null default 'openai',
  model_name     text not null default 'gpt-4o',

  -- Reglas de agenda
  slot_minutes     int not null default 30 check (slot_minutes between 15 and 120),
  min_lead_minutes int not null default 60 check (min_lead_minutes >= 0),
  max_advance_days int not null default 60 check (max_advance_days between 1 and 365),

  -- HIPAA vive bajo `compliancePlan` en la API de Vapi y solo se honra con plan
  -- Enterprise o add-on contratado. Por eso el default es false.
  hipaa_enabled  boolean not null default false,

  -- Estado de publicación en Vapi
  published_at       timestamptz,
  published_hash     text,
  last_publish_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agent_configs_services_is_array   check (jsonb_typeof(services) = 'array'),
  constraint agent_configs_hours_is_object     check (jsonb_typeof(business_hours) = 'object'),
  constraint agent_configs_info_is_object      check (jsonb_typeof(clinic_info) = 'object')
);

create trigger clinics_set_updated_at
  before update on public.clinics
  for each row execute function private.set_updated_at();

create trigger agent_configs_set_updated_at
  before update on public.agent_configs
  for each row execute function private.set_updated_at();
