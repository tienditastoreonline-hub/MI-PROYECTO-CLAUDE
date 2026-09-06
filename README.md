# Recepción de voz para clínicas dentales

Plataforma SaaS multi-tenant donde cada clínica dental administra su propio
agente de voz. Un paciente llama a un número, Vapi enruta la llamada al asistente
de esa clínica, el agente conversa en español, consulta huecos reales en Google
Calendar, agenda o cancela la cita, y al colgar deja la transcripción en el panel.

## Requisitos

- Node ≥ 20.9 (probado con 22.22.2)
- pnpm 10
- Docker, solo si vas a levantar Supabase en local
- Una cuenta de Supabase, una de Vapi y un proyecto en Google Cloud

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local     # y rellena los valores (ver más abajo)
pnpm dev
```

### 1. Supabase

Crea un proyecto en [supabase.com](https://supabase.com) y copia de
**Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o la `anon` legacy)
- `SUPABASE_SERVICE_ROLE_KEY` — **secreto**, solo servidor

Aplica las migraciones:

```bash
# Contra tu proyecto remoto
pnpm dlx supabase link --project-ref <tu-ref>
pnpm dlx supabase db push

# O en local (necesita Docker). Incluye los datos de demo de supabase/seed.sql
pnpm dlx supabase start
pnpm db:reset
```

Las migraciones de `supabase/migrations/` crean, en este orden: extensiones y el
esquema `private`; las tablas núcleo; las operativas; índices y constraints; los
helpers de RLS y todas las políticas; y el trigger de alta de usuario.

Con el seed local puedes entrar con `demo@clinica.test` / `demo1234` y ver el
panel poblado sin conectar Vapi ni Google.

Cuando cambies el esquema, regenera los tipos:

```bash
pnpm db:types
```

### 2. Cifrado

Los tokens de Google se guardan cifrados. Genera la clave:

```bash
openssl rand -hex 32     # → ENCRYPTION_KEY
```

### 3. Google Calendar

En [Google Cloud Console](https://console.cloud.google.com):

1. Habilita la **Google Calendar API**.
2. Configura la pantalla de consentimiento OAuth.
3. Crea unas credenciales **ID de cliente OAuth** de tipo *Aplicación web*.
4. Añade como URI de redirección autorizado exactamente el valor que pongas en
   `GOOGLE_REDIRECT_URI` (en desarrollo,
   `http://localhost:3000/api/google/oauth/callback`).

Copia el ID y el secreto a `.env.local`.

### 4. Vapi

En el [dashboard de Vapi](https://dashboard.vapi.ai):

1. Copia tu clave privada de API a `VAPI_API_KEY`. **Nunca la pongas en una
   variable `NEXT_PUBLIC_`**: viajaría al navegador.
2. Inventa un secreto compartido para el webhook y ponlo en
   `VAPI_WEBHOOK_SECRET` (`openssl rand -hex 32`). La app lo publica en el
   asistente como cabecera `x-vapi-secret` y lo exige en cada webhook entrante.
   Si lo rotas, hay que volver a publicar el agente.
3. Compra un número de teléfono.

El asistente y el número se crean y se vinculan desde la vista de
Personalización con el botón **Publicar**: no hace falta configurarlos a mano en
el dashboard, y no existe un `VAPI_ASSISTANT_ID` global — cada clínica guarda el
suyo.

### 5. Webhooks en desarrollo

Vapi necesita alcanzar tu máquina desde internet. Con la CLI de Vapi:

```bash
pnpm dlx @vapi-ai/cli listen --forward-to localhost:3000/api/vapi/webhook
ngrok http 4242     # `vapi listen` escucha en el 4242 y no expone nada por sí solo
```

O directo con ngrok:

```bash
ngrok http 3000
```

Pon la URL pública resultante en `APP_URL` y vuelve a publicar el agente para que
el asistente apunte al túnel nuevo.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm lint` | ESLint (en Next 16 `next lint` fue eliminado) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Tests con Vitest |
| `pnpm db:reset` | Migraciones + seed en la base local |
| `pnpm db:types` | Regenera los tipos desde el esquema |

## Estructura

```
app/(auth)/        login y registro
app/(app)/         panel: dashboard, calendario, transcripciones,
                   personalización e integraciones
app/api/           webhook de Vapi, OAuth de Google, publicación del agente
lib/supabase/      clientes (navegador, servidor, proxy, admin) y tipos
lib/crypto/        AES-256-GCM para los tokens de Google
lib/auth/          resolución del tenant
supabase/          migraciones y datos de demo
docs/referencias/  material de apoyo, no forma parte de la app
```

## Seguridad

- Todas las tablas tienen RLS activada y políticas por `clinic_id`.
  `google_credentials` tiene RLS y **cero políticas**: los tokens no salen por el
  Data API ni para el dueño de la clínica.
- El webhook verifica el secreto compartido en tiempo constante antes de tocar
  nada. Un secreto inválido responde `401`.
- Los fallos de negocio (hueco ocupado, Google desconectado) responden `200` con
  el error dentro de `results[]`: un reintento de Vapi no los arreglaría y podría
  duplicar reservas.
- Las citas creadas por voz son idempotentes por el `toolCallId` de Vapi, y una
  exclusion constraint impide dos citas solapadas en la misma clínica.

## Notas sobre HIPAA

`hipaaEnabled` vive bajo `compliancePlan` en la API de Vapi y solo se honra con
una suscripción Enterprise o el add-on contratado. Está expuesto en la
configuración de cada clínica pero por defecto es `false`. Con HIPAA activo, Vapi
almacena registros y grabaciones en infraestructura conforme y restringe los
proveedores disponibles de modelo, voz y transcripción.
