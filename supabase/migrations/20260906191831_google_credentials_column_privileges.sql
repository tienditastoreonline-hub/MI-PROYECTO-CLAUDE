-- El panel necesita mostrar el ESTADO de la conexión con Google (qué cuenta,
-- qué calendario, si sigue viva), pero jamás los tokens.
--
-- Hasta ahora `google_credentials` tenía RLS y cero políticas, lo que obligaba a
-- leerla desde una página con el cliente `service_role`. Eso funciona, pero
-- rompe la regla central del proyecto —que el aislamiento lo imponga Postgres y
-- que el cliente admin viva solo en el webhook— y amplía lo que hay que auditar.
--
-- La solución correcta son privilegios por COLUMNA: la RLS decide qué FILAS se
-- ven, y los grants deciden qué COLUMNAS. Combinados, el dueño ve el estado de
-- su propia conexión y los tokens cifrados quedan fuera de su alcance incluso
-- pidiéndolos explícitamente.

create policy google_credentials_select on public.google_credentials
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

-- Postgres concede SELECT sobre todas las columnas por defecto: hay que
-- retirarlo antes de conceder el subconjunto.
revoke select on public.google_credentials from authenticated;

grant select (
  id,
  clinic_id,
  google_email,
  calendar_id,
  access_token_expires_at,
  scopes,
  revoked_at,
  created_at,
  updated_at
) on public.google_credentials to authenticated;

-- `access_token_enc` y `refresh_token_enc` quedan deliberadamente fuera: un
-- `select *` desde el Data API falla con "permission denied for column", que es
-- exactamente el comportamiento que se busca. El webhook sigue leyéndolos con
-- service_role, que no pasa por estos grants.

comment on table public.google_credentials is
  'RLS por clínica + privilegios por columna: el panel ve el estado de la conexión, nunca los tokens.';
