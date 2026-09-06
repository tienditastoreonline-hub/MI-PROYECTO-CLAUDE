# Recepción de voz para clínicas dentales

SaaS multi-tenant: cada clínica tiene su propio agente de voz de Vapi que atiende
llamadas en español, consulta disponibilidad real y agenda citas en Google
Calendar. El dueño lo administra desde un panel web.

## Stack

- **Next.js 16** (App Router, Turbopack, Node ≥ 20.9) · **React 19.2** · TypeScript estricto
- **TailwindCSS v4** — configuración CSS-first en `app/globals.css` (`@theme`). **No existe `tailwind.config.js`**
- **Supabase** — Postgres + Auth + RLS
- **@vapi-ai/server-sdk** — solo en servidor
- **googleapis** — Google Calendar vía OAuth 2.0
- **@phosphor-icons/react** — toda la iconografía
- **pnpm** — `pnpm add`, `pnpm dlx`, nunca `npm install`

## Reglas que no se negocian

### Aislamiento multi-tenant

El tenant es la clínica. Toda tabla lleva `clinic_id` y toda política RLS lo
comprueba. Ninguna consulta puede devolver datos de otra clínica.

- En vistas y Server Actions se usa `lib/supabase/server.ts`, que pasa por RLS.
- `lib/supabase/admin.ts` (service_role) **ignora la RLS** y existe solo para el
  webhook de Vapi y el callback de OAuth, que llegan sin cookie de sesión. Todo
  acceso desde ahí va por `scopedRepo(clinicId)`: es el único módulo que hay que
  auditar para saber que no se cruzan datos.
- Nunca uses el cliente admin en una página ni en una Server Action. Cuando una
  tabla guarde secretos que el panel necesite *resumir* pero no leer, la salida
  no es el cliente admin: es RLS para las filas más privilegios por columna para
  los campos, como en `google_credentials` (el panel ve `google_email` y
  `revoked_at`; `refresh_token_enc` ni siquiera es seleccionable).

### Secretos

- Solo `NEXT_PUBLIC_*` llega al navegador. `VAPI_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` y
  `VAPI_WEBHOOK_SECRET` son de servidor.
- Los módulos de servidor importan `server-only`: si acaban en un bundle de
  cliente, el build falla.
- Los tokens de Google se guardan cifrados con AES-256-GCM (`lib/crypto/aes.ts`),
  con AAD por clínica y por tipo de token.

### Autenticación

- El middleware de Next 16 se llama **proxy**: `proxy.ts` en la raíz. Un
  `middleware.ts` no se ejecutaría y la sesión no se refrescaría.
- En servidor se usa **`supabase.auth.getClaims()`**, nunca `getUser()` ni
  `getSession()`: `getSession()` no revalida el token.
- No pongas código entre `createServerClient` y `getClaims()` en el proxy.

### Base de datos

- PK `bigint generated always as identity`. La única PK uuid es `profiles.id`,
  impuesta por `auth.users`.
- `timestamptz` siempre. `text` en vez de `varchar(n)`. `numeric` para dinero.
- Índice en toda FK y en toda columna usada en una política RLS.
- En las políticas, envuelve las funciones: `using ((select private.is_clinic_member(clinic_id)))`.
  Sin el `select` se re-evalúan por fila.
- `UPDATE` lleva `USING` **y** `WITH CHECK`, o un usuario puede mover la fila a otra clínica.
- `ADD CONSTRAINT IF NOT EXISTS` no existe en Postgres: usa un bloque `DO $$`.
- Nunca inventes el nombre de un archivo de migración: `pnpm dlx supabase migration new <nombre>`.

### Vapi

Las formas de la API están verificadas contra los tipos de `@vapi-ai/server-sdk`.
No las cambies de memoria:

- El webhook entrante trae `message.toolCallList[]`, con
  `{ id, type, function: { name, arguments } }`, y **`arguments` es un string
  JSON**: hay que parsearlo.
- La respuesta es `{ results: [{ toolCallId, name, result }] }`. **`name` es
  obligatorio**; sin él el turno del agente se corta.
- El assistant no tiene `serverUrl`/`serverUrlSecret`: tiene
  `server: { url, headers, credentialId, timeoutSeconds }`. **No existe
  `server.secret`**; el secreto compartido viaja en `server.headers`.
- `hipaaEnabled` vive en `compliancePlan`, no en la raíz, y exige plan Enterprise.
- Para actualizar un assistant: `get` → deep-merge del `model` completo →
  `update`. Nunca un `model` parcial escrito a mano.
- Para actualizar un número: `get` primero y reenvía su `provider`, o la API
  responde 400.
- `name` del assistant ≤ 40 caracteres. Nombre de función: `^[a-zA-Z0-9_-]+$`.
- El `clinicId` nunca es un parámetro visible al modelo: se deriva en el servidor.

## Convenciones de código

- Comentarios y textos de la interfaz en español. Identificadores en inglés
  cuando son términos técnicos (`clinicId`, `toolCallId`), en español cuando son
  de dominio (`clinica`, `cita`).
- Nada de `any`: el lint lo rechaza. Los payloads externos se validan con Zod.
- Cada vista maneja carga, vacío y error.
- El agente no calcula fechas: la aritmética temporal vive en el servidor y se le
  devuelve ya verbalizada.

## Comandos

```bash
pnpm dev          # desarrollo
pnpm build        # build de producción
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint (en Next 16 `next lint` ya no existe)
pnpm test         # vitest
pnpm db:reset     # aplica migraciones + seed en la base local (requiere Docker)
pnpm db:types     # regenera lib/supabase/database.types.ts
```
