-- Row Level Security: el aislamiento entre clínicas.
--
-- Es la pieza crítica del sistema. Todo lo demás (queries, Server Components,
-- Server Actions) puede tener un bug; esto es lo que impide que ese bug filtre
-- datos de otra clínica.

-- ── Helpers de autorización ────────────────────────────────────────────────
--
-- Son PREDICADOS (`¿pertenece este usuario a esta clínica?`), no getters
-- (`¿cuál es mi clínica?`). La diferencia importa: un getter usado en la
-- política de `profiles` tendría que leer `profiles`, disparando otra vez su
-- propia política → recursión infinita.
--
-- `security definer` es lo que rompe ese ciclo: la función se ejecuta con los
-- privilegios de su creador e ignora la RLS de las tablas que consulta. Por eso
-- lleva dentro la comprobación explícita de identidad contra `auth.uid()`.
--
-- `set search_path = ''` cierra el vector clásico de secuestro de esquema: todo
-- objeto va cualificado.

create or replace function private.is_clinic_member(target_clinic_id bigint)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = target_clinic_id
  );
$$;

create or replace function private.is_clinic_owner(target_clinic_id bigint)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.clinic_id = target_clinic_id
      and p.role = 'owner'
  );
$$;

-- Postgres concede EXECUTE a PUBLIC en toda función nueva, así que hay que
-- retirarlo explícitamente. `authenticated` sí lo necesita: las expresiones de
-- las políticas se evalúan con los privilegios de quien consulta, y sin EXECUTE
-- toda consulta fallaría con "permission denied for function".
-- La frontera de seguridad no es el EXECUTE sino que el schema `private` no
-- está expuesto a PostgREST: nadie puede invocarlas por RPC.
revoke execute on function private.is_clinic_member(bigint) from public, anon;
revoke execute on function private.is_clinic_owner(bigint)  from public, anon;
grant  execute on function private.is_clinic_member(bigint) to authenticated;
grant  execute on function private.is_clinic_owner(bigint)  to authenticated;

-- ── RLS activada en todas las tablas ───────────────────────────────────────
alter table public.clinics            enable row level security;
alter table public.profiles           enable row level security;
alter table public.agent_configs      enable row level security;
alter table public.google_credentials enable row level security;
alter table public.calls              enable row level security;
alter table public.transcripts        enable row level security;
alter table public.appointments       enable row level security;

-- Nota sobre el patrón que se repite abajo:
--   · `to authenticated` es obligatorio (`auth.role()` está deprecado y se rompe
--     si se habilitan los sign-ins anónimos), pero por sí solo es autenticación
--     SIN autorización: dejaría a cualquier usuario logueado ver todo. El
--     predicado de tenant es lo que realmente aísla.
--   · La llamada al helper va envuelta en `(select ...)` para que Postgres la
--     evalúe una vez por consulta y no una vez por fila.
--   · UPDATE lleva USING y WITH CHECK. Sin WITH CHECK, un usuario podría
--     reasignar su propia fila a otra `clinic_id` y sacarla de su tenant.

-- ── clinics ────────────────────────────────────────────────────────────────
create policy clinics_select on public.clinics
  for select to authenticated
  using ((select private.is_clinic_member(id)));

create policy clinics_update on public.clinics
  for update to authenticated
  using      ((select private.is_clinic_owner(id)))
  with check ((select private.is_clinic_owner(id)));

-- Sin políticas de INSERT/DELETE: las clínicas solo nacen desde el trigger de
-- alta de usuario, y no se borran desde la aplicación.

-- ── profiles ───────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

-- Cada quien edita únicamente su propia ficha, y no puede cambiarse de clínica
-- ni ascenderse a owner (el WITH CHECK vuelve a fijar la identidad).
create policy profiles_update_self on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()) and (select private.is_clinic_member(clinic_id)));

-- ── agent_configs ──────────────────────────────────────────────────────────
create policy agent_configs_select on public.agent_configs
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

create policy agent_configs_update on public.agent_configs
  for update to authenticated
  using      ((select private.is_clinic_owner(clinic_id)))
  with check ((select private.is_clinic_owner(clinic_id)));

-- ── google_credentials ─────────────────────────────────────────────────────
-- RLS activada y CERO políticas = denegación total para anon y authenticated.
-- Los tokens cifrados nunca deben poder salir por el Data API, ni siquiera al
-- dueño de la clínica. El servidor los lee con service_role.

-- ── calls y transcripts ────────────────────────────────────────────────────
-- Solo lectura: las escribe el webhook de Vapi con service_role. Un cliente no
-- tiene ninguna razón legítima para insertar o modificar el registro de una
-- llamada.
create policy calls_select on public.calls
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

create policy transcripts_select on public.transcripts
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

-- ── appointments ───────────────────────────────────────────────────────────
-- Los cuatro comandos: el panel permite crear y gestionar citas manualmente.
create policy appointments_select on public.appointments
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check ((select private.is_clinic_member(clinic_id)));

create policy appointments_update on public.appointments
  for update to authenticated
  using      ((select private.is_clinic_member(clinic_id)))
  with check ((select private.is_clinic_member(clinic_id)));

create policy appointments_delete on public.appointments
  for delete to authenticated
  using ((select private.is_clinic_member(clinic_id)));
