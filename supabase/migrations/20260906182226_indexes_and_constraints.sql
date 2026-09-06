-- Índices y constraints.
--
-- Dos reglas que Postgres no aplica solo:
--   1. Las foreign keys NO se indexan automáticamente. Sin índice, un DELETE en
--      la tabla padre escanea la hija entera y la bloquea.
--   2. Toda columna usada en una política RLS necesita índice: el predicado se
--      evalúa en cada fila candidata de cada consulta.

-- ── Foreign keys ────────────────────────────────────────────────────────────
create index profiles_clinic_id_idx     on public.profiles (clinic_id);
create index calls_clinic_id_idx        on public.calls (clinic_id);
create index transcripts_clinic_id_idx  on public.transcripts (clinic_id);
create index appointments_clinic_id_idx on public.appointments (clinic_id);
create index appointments_call_id_idx   on public.appointments (call_id);

-- ── Compuestos: columnas de igualdad primero, de rango al final ─────────────
create index calls_clinic_started_idx       on public.calls (clinic_id, started_at desc);
create index appointments_clinic_starts_idx on public.appointments (clinic_id, starts_at);
create index appointments_clinic_status_starts_idx
  on public.appointments (clinic_id, status, starts_at);

-- Búsqueda de texto completo sobre transcripciones.
create index transcripts_search_idx on public.transcripts using gin (search_tsv);

-- Búsqueda por teléfono del paciente: la usa la tool findAppointments para
-- localizar las citas de quien está llamando.
create index appointments_clinic_phone_idx
  on public.appointments (clinic_id, patient_phone)
  where patient_phone is not null;

-- ── Idempotencia y unicidad ────────────────────────────────────────────────

-- Un mismo tool call de Vapi no puede producir dos citas. Es la defensa contra
-- los reintentos del webhook.
create unique index appointments_tool_call_id_key
  on public.appointments (tool_call_id)
  where tool_call_id is not null;

-- Un evento de Google mapea a una sola cita dentro de la clínica.
create unique index appointments_google_event_key
  on public.appointments (clinic_id, google_event_id)
  where google_event_id is not null;

-- El código que el agente dicta debe ser inequívoco entre las citas vivas.
create unique index appointments_reference_code_key
  on public.appointments (clinic_id, reference_code)
  where status = 'scheduled';

-- ── Anti doble reserva ─────────────────────────────────────────────────────
--
-- Dos llamadas simultáneas pueden pedir el mismo hueco con tool_call_id
-- distintos: el índice de idempotencia no las detiene, pero esta constraint sí.
-- El conflicto ocurre en Postgres, antes de tocar Google Calendar.
--
-- Se excluye `source = 'google'` a propósito: un evento importado del calendario
-- es la MISMA reunión vista dos veces, o un evento externo que `freebusy` ya
-- tuvo en cuenta antes de reservar. Bloquearlo aquí impediría importar la agenda.
--
-- `ADD CONSTRAINT IF NOT EXISTS` no existe en Postgres, de ahí el bloque DO.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'appointments_no_overlap'
  ) then
    alter table public.appointments
      add constraint appointments_no_overlap
      exclude using gist (
        clinic_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      ) where (status = 'scheduled' and source in ('voice', 'manual'));
  end if;
end $$;
