-- Datos de demostración para desarrollo local (`supabase db reset`).
--
-- NUNCA se ejecuta en producción: `supabase db reset` solo actúa sobre la base
-- de datos local.
--
-- Crea un dueño de prueba y deja que el trigger `handle_new_user()` construya la
-- clínica, el perfil y la configuración del agente. Así el seed también sirve de
-- prueba de humo del trigger: si falla, el reset falla.
--
--   Correo:     demo@clinica.test
--   Contraseña: demo1234

do $$
declare
  v_user_id   uuid := '11111111-1111-4111-8111-111111111111';
  v_clinic_id bigint;
  v_call_id   bigint;
  v_hoy       timestamptz := date_trunc('day', now());
begin
  -- Usuario de Auth. `handle_new_user()` se dispara con este INSERT.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'demo@clinica.test',
    extensions.crypt('demo1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"clinic_name":"Clínica Dental Sonrisa","full_name":"Ana Ruiz"}'::jsonb,
    now(), now()
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  )
  values (
    v_user_id::text, v_user_id,
    format('{"sub":"%s","email":"demo@clinica.test"}', v_user_id)::jsonb,
    'email', now(), now(), now()
  )
  on conflict (provider, provider_id) do nothing;

  select id into v_clinic_id from public.clinics where slug = 'clinica-dental-sonrisa';

  if v_clinic_id is null then
    raise exception 'El trigger handle_new_user() no creó la clínica: revisa la migración del trigger';
  end if;

  update public.clinics
     set phone_e164 = '+525512345678',
         address    = 'Av. Insurgentes Sur 1234, Col. Del Valle, CDMX'
   where id = v_clinic_id;

  -- ── Llamadas con transcripción ───────────────────────────────────────────
  for i in 1..12 loop
    insert into public.calls (
      clinic_id, vapi_call_id, customer_number, status, ended_reason,
      started_at, ended_at, duration_seconds, cost, summary
    )
    values (
      v_clinic_id,
      'demo-call-' || i,
      '+52551000' || lpad(i::text, 4, '0'),
      'ended',
      case when i % 5 = 0 then 'customer-ended-call' else 'assistant-ended-call' end,
      v_hoy - make_interval(days => (i % 7), hours => 9 + (i % 8)),
      v_hoy - make_interval(days => (i % 7), hours => 9 + (i % 8)) + interval '3 minutes',
      160 + (i * 7) % 120,
      0.08 + (i % 5) * 0.02,
      case
        when i % 3 = 0 then 'El paciente preguntó por el horario y las formas de pago.'
        else 'El paciente agendó una cita de limpieza dental.'
      end
    )
    returning id into v_call_id;

    insert into public.transcripts (call_id, clinic_id, full_text, messages)
    values (
      v_call_id,
      v_clinic_id,
      'Asistente: Gracias por llamar a Clínica Dental Sonrisa, ¿le gustaría agendar una cita? '
      || 'Paciente: Sí, quiero una limpieza. '
      || 'Asistente: Con gusto. Tengo disponible mañana a las diez de la mañana, ¿le funciona? '
      || 'Paciente: Perfecto. '
      || 'Asistente: Su cita quedó confirmada, le esperamos diez minutos antes.',
      '[
        {"role":"assistant","message":"Gracias por llamar a Clínica Dental Sonrisa, ¿le gustaría agendar una cita?","secondsFromStart":0.5},
        {"role":"user","message":"Sí, quiero una limpieza.","secondsFromStart":6.2},
        {"role":"assistant","message":"Con gusto. Tengo disponible mañana a las diez de la mañana, ¿le funciona?","secondsFromStart":9.1},
        {"role":"user","message":"Perfecto.","secondsFromStart":15.0},
        {"role":"assistant","message":"Su cita quedó confirmada, le esperamos diez minutos antes.","secondsFromStart":17.4}
      ]'::jsonb
    );

    -- Dos de cada tres llamadas acaban en cita.
    if i % 3 <> 0 then
      insert into public.appointments (
        clinic_id, call_id, reference_code, patient_name, patient_phone,
        is_new_patient, treatment, service_duration_minutes,
        starts_at, ends_at, status, source, notes
      )
      values (
        v_clinic_id,
        v_call_id,
        upper(substr(md5('demo' || i), 1, 6)),
        (array['Ana López','Carlos Pérez','María Sánchez','Jorge Ramírez','Lucía Torres'])[1 + (i % 5)],
        '+52551000' || lpad(i::text, 4, '0'),
        i % 4 = 0,
        (array['Limpieza dental','Valoración','Resina','Ortodoncia'])[1 + (i % 4)],
        (array[45, 30, 60, 60])[1 + (i % 4)],
        v_hoy + make_interval(days => (i % 9) - 2, hours => 9 + (i % 7)),
        v_hoy + make_interval(days => (i % 9) - 2, hours => 9 + (i % 7))
          + make_interval(mins => (array[45, 30, 60, 60])[1 + (i % 4)]),
        'scheduled',
        'voice',
        case when i % 4 = 0 then 'Primera visita.' else null end
      )
      -- `ON CONFLICT ON CONSTRAINT` exige una constraint ÚNICA; nombrar aquí la
      -- exclusion constraint sería un error. La forma sin destino sí cubre las
      -- violaciones de exclusión, que es justo lo que puede pasar al generar
      -- citas de demo en huecos solapados.
      on conflict do nothing;
    end if;
  end loop;

  raise notice 'Seed listo. Entra con demo@clinica.test / demo1234';
end $$;
