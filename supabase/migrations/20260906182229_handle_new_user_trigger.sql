-- Alta de un dueño de clínica.
--
-- Al registrarse un usuario se crea, en la misma transacción: su clínica, su
-- perfil con rol `owner` y la configuración por defecto del agente (con
-- tratamientos y horarios típicos de una clínica dental).
--
-- Por qué SECURITY DEFINER: el trigger corre en el contexto de GoTrue
-- (`supabase_auth_admin`), que no tiene privilegios sobre `public.*` y además
-- chocaría con la RLS de `clinics` y `profiles` — que en ese instante aún no
-- puede satisfacerse, porque el perfil que daría la pertenencia es justo el que
-- se está creando.
--
-- Por qué `set search_path = ''`: sin él, un objeto malicioso en un esquema
-- anterior de la ruta podría suplantar a `public.clinics` y capturar el alta.
-- La consecuencia práctica es que todo va cualificado, incluido
-- `extensions.unaccent` (`pg_catalog` sí sigue implícito, por eso `lower`,
-- `md5` o `regexp_replace` no llevan prefijo).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic_id   bigint;
  v_clinic_name text;
  v_base_slug   text;
  v_slug        text;
  v_intento     int := 0;
begin
  -- `raw_user_meta_data` lo controla el usuario que se registra. Por eso solo se
  -- usa para el nombre visible de SU PROPIA clínica: nunca se lee de ahí un
  -- clinic_id, que permitiría colarse en el tenant de otro.
  v_clinic_name := nullif(btrim(new.raw_user_meta_data ->> 'clinic_name'), '');

  if v_clinic_name is null then
    raise exception 'El nombre de la clínica es obligatorio para registrarse'
      using errcode = '22023';
  end if;

  -- "Clínica Dental Sonrisa" -> "clinica-dental-sonrisa"
  v_base_slug := btrim(
    regexp_replace(lower(extensions.unaccent(v_clinic_name)), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
  v_base_slug := left(coalesce(nullif(v_base_slug, ''), 'clinica'), 40);

  -- La unicidad la arbitra el índice, no un SELECT previo: comprobar y luego
  -- insertar sería una condición de carrera (TOCTOU) entre dos altas simultáneas.
  loop
    v_intento := v_intento + 1;
    v_slug := case
                when v_intento = 1 then v_base_slug
                else v_base_slug || '-' || substr(md5(random()::text || new.id::text), 1, 6)
              end;
    begin
      insert into public.clinics (slug, name)
      values (v_slug, v_clinic_name)
      returning id into v_clinic_id;
      exit;
    exception when unique_violation then
      if v_intento >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.profiles (id, clinic_id, role, full_name, email)
  values (
    new.id,
    v_clinic_id,
    'owner',
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email
  );

  -- Configuración inicial con valores propios de una clínica dental, para que el
  -- agente sea utilizable desde el primer minuto sin tocar el panel.
  insert into public.agent_configs (clinic_id, services, business_hours, clinic_info)
  values (
    v_clinic_id,
    '[
      {"name": "Valoración",     "duration_minutes": 30, "description": "Primera consulta y diagnóstico."},
      {"name": "Limpieza dental","duration_minutes": 45, "description": "Profilaxis y remoción de sarro."},
      {"name": "Resina",         "duration_minutes": 60, "description": "Restauración de caries."},
      {"name": "Extracción",     "duration_minutes": 45, "description": "Extracción de pieza dental."},
      {"name": "Ortodoncia",     "duration_minutes": 60, "description": "Consulta y ajuste de brackets."},
      {"name": "Urgencia",       "duration_minutes": 30, "description": "Dolor agudo o traumatismo."}
    ]'::jsonb,
    '{
      "mon": [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "19:00"}],
      "tue": [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "19:00"}],
      "wed": [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "19:00"}],
      "thu": [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "19:00"}],
      "fri": [{"start": "09:00", "end": "14:00"}, {"start": "16:00", "end": "19:00"}],
      "sat": [{"start": "09:00", "end": "13:00"}],
      "sun": []
    }'::jsonb,
    jsonb_build_object(
      'payment_methods', 'Efectivo, tarjeta de débito y crédito.',
      'policies',        'Le pedimos llegar 10 minutos antes de su cita.'
    )
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
