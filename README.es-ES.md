

# AI Recruitment Copilot

Plataforma de entrevistas por voz y filtro de currículums impulsada por IA. Localización principal en chino:
las instrucciones del agente, los prompts del sistema y los flujos de entrevista están escritos en
chino simplificado.

## Arquitectura

- **Aplicación web** (`apps/ai-recruitment-copilot/`): TanStack Start + React 19,
  TanStack Router, TanStack Query, cliente de Better Auth, shadcn/ui, Tailwind CSS
  v4 y salida Vite/Nitro. Gestiona la interfaz de usuario en el navegador, los cargadores de rutas, las funciones
  del servidor, SSR/SSG y el adaptador montado de la API de Hono.
- **Aplicación backend** (`apps/ai-recruitment-copilot-backend/`): runtime de la API de Hono,
  Drizzle ORM, PostgreSQL, Better Auth, almacenamiento de objetos, correo electrónico y utilidades de IA en el servidor.
  Puede ser montado por la aplicación web en `/api` o iniciarse como un
  servicio Node independiente.
- **Trabajador de currículums** (`apps/ai-recruitment-copilot-worker/`): trabajador asíncrono de
  análisis de currículums en cola para el procesamiento PDF/OCR.
- **Agente de voz** (`apps/livekit-agent/`): SDK de Python LiveKit Agents con OpenAI,
  Google, ElevenLabs, Minimax, Silero VAD y complementos de detector de turnos.
- **Paquetes compartidos** (`packages/`): `@arc/shared`, `@arc/db-schema` y
  `@arc/resume-parse-queue`.

Se utilizan dos administradores de paquetes: **pnpm** para aplicaciones/paquetes de TypeScript y **uv**
para el agente de Python. No los mezcles.

## Inicio Rápido

```bash
make install
cp apps/ai-recruitment-copilot/.env.example apps/ai-recruitment-copilot/.env
cp apps/ai-recruitment-copilot-backend/.env.example apps/ai-recruitment-copilot-backend/.env
cp apps/livekit-agent/.env.example apps/livekit-agent/.env
pnpm db:migrate
make dev
```

`make agent-console` ejecuta un chat en la terminal contra el agente sin abrir
una sala de LiveKit. `make help` enumera todos los objetivos de Make.

## Configuración

Cada entorno de ejecución tiene su propio archivo `.env`:

- `apps/ai-recruitment-copilot/.env` para la aplicación web TanStack Start.
- `apps/ai-recruitment-copilot-backend/.env` para ejecuciones independientes del backend de Hono.
- `apps/livekit-agent/.env` para el agente LiveKit de Python.

Requisitos clave:

- **Base de datos**: `DATABASE_URL`
- **Better Auth**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `NEXT_PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **Proveedores de LLM**: `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
  `ALIBABA_API_KEY`, `AI_GATEWAY_API_KEY`
- **Proveedores de voz**: `ELEVENLABS_API_KEY`, `MINIMAX_API_KEY`
- **LiveKit Cloud**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `AGENT_NAME`, `NEXT_PUBLIC_AGENT_NAME`
- **Almacenamiento de objetos**: `S3_*` para cargas y `RECORDING_R2_*` para grabaciones
- **Integraciones opcionales**: `FEISHU_*`, `RESEND_*`

La aplicación web mantiene intencionalmente los nombres de variables `NEXT_PUBLIC_*` existentes.
Vite los expone a través de `envPrefix: ["VITE_", "NEXT_PUBLIC_"]`, por lo que el código del cliente
los lee desde `import.meta.env.NEXT_PUBLIC_*`.

## Comandos Comunes

### Raíz

| Command                   | Propósito                                          |
| ------------------------- | -------------------------------------------------- |
| `pnpm dev`                | Desarrollo Turbo en todas las aplicaciones          |
| `pnpm build`              | Compilación de producción Turbo                     |
| `pnpm typecheck`          | Verificaciones de TypeScript Turbo                  |
| `pnpm test`               | Pruebas Turbo                                      |
| `pnpm check` / `pnpm fix` | Verificación Ultracite / corrección automática      |
| `pnpm db:generate`        | Genera migraciones de Drizzle a través de la app   |
| `pnpm db:migrate`         | Aplica migraciones de Drizzle a través de la app   |
| `pnpm db:studio`          | Estudio de Drizzle                                 |
| `pnpm hooks`              | Instala hooks de git de lefthook                   |

### Web

```bash
pnpm --filter @arc/ai-recruitment-copilot dev
pnpm --filter @arc/ai-recruitment-copilot build
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot test
```

### Backend

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend dev:standalone
pnpm --filter @arc/ai-recruitment-copilot-backend start
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot-backend test
```

### Agente

```bash
cd apps/livekit-agent
uv sync
uv run src/agent.py download-files
uv run src/agent.py dev
uv run src/agent.py console
uv run pytest
uv run ruff format
uv run ruff check
```

## Estructura del Proyecto

```text
apps/
  ai-recruitment-copilot/
    src/routes/                 Rutas de archivos de TanStack Router
    src/lib/start/              Funciones del servidor y utilidades exclusivas de Start
    src/lib/client/             Utilidades del navegador y cliente RPC de Hono
    src/lib/server/             Pequeñas utilidades del servidor web
    src/components/             shadcn/ui + componentes del proyecto
    src/server.ts               Entrada del servidor de TanStack Start
    src/client.tsx              Entrada del navegador
    vite.config.ts              Configuración de TanStack Start / Vite / Nitro
  ai-recruitment-copilot-backend/
    src/server/app.ts           Fábrica de aplicaciones Hono
    src/server/routes/          Carpetas de rutas con route.ts/schema.ts/dao
    src/lib/server/             Utilidades del entorno de ejecución del backend
    src/index.ts                Punto de entrada independiente de Node
  ai-recruitment-copilot-worker/
    src/                        Trabajador asíncrono de análisis de currículums
  livekit-agent/
    src/agent.py                Punto de entrada del agente LiveKit en Python
    tests/                      Suite de pruebas pytest
packages/
  shared/
  db-schema/
  resume-parse-queue/
```

## Flujo de Datos del Frontend

- Los datos SSR poseídos por la ruta utilizan `createServerFn` de TanStack Start.
- Las entradas de las funciones del servidor deben usar `.validator(...)` con esquemas de Zod.
- TanStack Query se integra con TanStack Start a través de
  `@tanstack/react-router-ssr-query`; los cargadores de ruta precargan/deshidratan los datos de consulta cuando sea necesario.
- La página de inicio pública se prerrenderiza con TanStack Start.
- Las llamadas a la API JSON utilizan el cliente RPC tipado de Hono en `@/lib/client/rpc` y
  `rpcFetch`.
- Las cargas multipart, transmisiones (streams) y respuestas binarias permanecen en `fetch` o
  `apiFetch` estándar.

## Estructura de Rutas del Backend

Cada carpeta de ruta bajo
`apps/ai-recruitment-copilot-backend/src/server/routes/` es independiente:

- `route.ts` exporta un enrutador Hono.
- `schema.ts` contiene esquemas de Zod cuando sea necesario.
- `dao.ts` o `dao/` contiene las consultas a la base de datos propias de la ruta.
- `utils.ts` o `utils/` contiene utilidades internas de la funcionalidad.
- Los subrecursos anidados viven bajo `routes/` y se montan desde el padre.

Mantén los middlewares dentro del enrutador propietario más cercano. `server/app.ts` debe permanecer
de solo montaje.

## Referencias Externas

Al trabajar con APIs de evolución rápida, prefiere la documentación canónica:

- TanStack Start: <https://tanstack.com/start/latest/docs/framework/react/overview>
- TanStack Router: <https://tanstack.com/router/latest/docs/framework/react/overview>
- TanStack Query: <https://tanstack.com/query/latest/docs/framework/react/overview>
- Hono: <https://hono.dev/llms.txt> y <https://hono.dev/llms-full.txt>
- LiveKit: `lk docs overview` / `lk docs search`

Consulta `AGENTS.md` y `CLAUDE.md` para conocer las convenciones detalladas del repositorio.
