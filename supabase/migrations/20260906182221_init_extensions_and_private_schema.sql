-- Extensiones y schema privado.
--
-- `unaccent` normaliza los slugs de clínica ("Clínica Sonrisa" -> "clinica-sonrisa").
-- `btree_gist` es imprescindible para la exclusion constraint que impide dos citas
-- solapadas en la misma clínica: permite combinar `clinic_id with =` (btree) y
-- `tstzrange with &&` (gist) en el mismo índice.
create extension if not exists unaccent   with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Schema para los helpers de autorización. No se añade a los "exposed schemas"
-- de PostgREST, así que nada de aquí es invocable por RPC desde el cliente:
-- esa es la frontera de seguridad real de estas funciones.
create schema if not exists private;

revoke all on schema private from public;

-- `authenticated` necesita USAGE porque las expresiones de las políticas RLS se
-- evalúan con los privilegios del usuario que consulta. Sin esto, cada SELECT
-- fallaría con "permission denied for schema private".
grant usage on schema private to authenticated;

-- Función genérica de updated_at, usada por varias tablas.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
