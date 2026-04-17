# AGENTS.md — Guía Rápida para FurGuard Bot

> **Este archivo contiene información específica del proyecto que un agente podría pasar por alto.**
> Cada punto responde a la pregunta: "¿Un agente probablemente omitiría esto sin ayuda?"

---

## 🚀 Comandos de Desarrollo

| Comando | Descripción | Nota |
|---|---|---|
| `pnpm install` | Instala dependencias y **construye automáticamente** (postinstall) | Usa pnpm, no npm/yarn |
| `pnpm run dev` | Modo desarrollo con recarga en caliente (tsx watch) | Sin sharding, ejecución directa |
| `pnpm start` | Producción (tsx src/index.ts) | Usa tsx, no el JS compilado; no activa sharding |
| `pnpm run build` | Compila con tsup a `dist/` | Sharding solo funciona con JS compilado |
| `pnpm run lint` | ESLint en `src/` (TypeScript) | Reglas estrictas: `no-explicit-any: error` |
| `pnpm run typecheck` | Verificación de tipos (tsc --noEmit) | TypeScript strict con `exactOptionalPropertyTypes` |
| `pnpm run migrate` | Ejecuta migraciones de base de datos | SQL en `src/db/migrations/` |

**Orden recomendado antes de commit:** `lint → typecheck`.

---

## ⚙️ Configuración de Entorno

- Copiar `.env.example` a `.env`.
- Variables **obligatorias**: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`.
- Base de datos: MySQL/MariaDB (no PostgreSQL). Puerto por defecto 3306.
- Redis: caché L2 y cooldowns. URL por defecto `redis://localhost:6379`.
- `API_PORT` (default 25569) sobreescribe `HEALTH_PORT` (3000 en .env.example).

---

## 🗃️ Base de Datos y Migraciones

- Driver: `mysql2`. Config en `src/config.ts`.
- Migraciones: archivos SQL numerados en `src/db/migrations/`. Ejecutar con `pnpm run migrate`.
- **No asumas PostgreSQL** (la arquitectura.md menciona PostgreSQL por error).

---

## 🤖 Comportamiento del Bot

- **Desarrollo (`pnpm run dev`)**: ejecución directa sin sharding (tsx).
- **Producción (`pnpm start`)**: también ejecución directa; para sharding, compilar (`pnpm run build`) y ejecutar `node dist/index.js` manualmente.
- Health check: servidor HTTP en puerto `API_PORT`. Endpoint `GET /health`.
- API interna: rutas bajo `src/api/` (webhook, guild, user).

---

## 🧱 Estructura de Carpetas (src/)

| Carpeta | Contenido |
|---|---|
| `commands/` | Slash (`slash/`) y prefix (`prefix/`) commands |
| `interactions/` | Handlers de botones, modales, selects, autocomplete |
| `events/` | Eventos de Discord (`core/`, `logs/`, `furguard/`) |
| `db/repositories/` | Acceso a base de datos (patrón repositorio) |
| `lib/` | Utilidades: cooldown, circuit‑breaker, embed‑builder, etc. |
| `cache/` | Gestor de caché (L1 Map + L2 Redis) |
| `api/` | Rutas de API interna (Express) |
| `types/` | Tipos TypeScript |
| `utils/` | Funciones auxiliares (chunk, format, hash) |

**Módulos FurGuard:** prefijo `fg-*` (risk‑engine, automod, audit, pro‑guard, etc.). Ver `furguard_audit_report.md`.

---

## 📏 Convenciones de Código

- TypeScript strict con `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess`.
- ESLint: `@typescript-eslint/no-explicit-any: error`, `consistent-type-imports: error`.
- **Nunca uses `any`**. Siempre hay un tipo correcto.
- **Nunca dejes `catch` vacíos** que silencien errores.
- **Nunca uses `SELECT *`** en queries de producción.
- **Nunca hardcodees credenciales** (usar variables de entorno).

---

## 🧪 Testing

- **No hay suite de tests configurada.** No hay scripts `test` en package.json.

---

## ⚠️ Posibles Fuentes de Confusión

1. **PostgreSQL vs MySQL**: El archivo `ARCHITECTURE.md` menciona PostgreSQL, pero el código usa MySQL/MariaDB (config.ts, .env.example). Confiar en `src/config.ts`.
2. **Sharding**: Solo se activa al ejecutar el JS compilado (`dist/`). En desarrollo y con `pnpm start` no hay sharding.
3. **Puerto health check**: `API_PORT` tiene prioridad sobre `HEALTH_PORT`. Default 25569.
4. **Comandos slash**: Se registran automáticamente en el evento `ready` con deduplicación por hash (Redis).
5. **Prefijo por defecto**: `!` (configurable con `DEFAULT_PREFIX`).

---

## 🔍 Lecturas Recomendadas

- `ARCHITECTURE.md` – descripción detallada de la arquitectura (algunos detalles desactualizados).
- `furguard_audit_report.md` – funcionalidades específicas de FurGuard.
- `src/config.ts` – configuración central y validación de variables de entorno.
- `src/index.ts` – lógica de entrada (sharding vs. directo).

---

*Última actualización: 2026-04-17*  
*Mantenido por: OpenCode agent*
