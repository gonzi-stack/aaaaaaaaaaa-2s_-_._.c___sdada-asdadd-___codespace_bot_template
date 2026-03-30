# 🤖 Discord Bot Template — Arquitectura

> Bot profesional en Node.js + TypeScript con Discord.js v14.25.1, diseñado para servir 500+ servidores con alto rendimiento.

---

## 📁 Estructura de Carpetas

```
src/
├── index.ts                    # Punto de entrada: ShardingManager (prod) o directo (dev)
├── shard.ts                    # Instancia individual del bot (cada shard)
├── bot.ts                      # BotClient: extiende Client con registries y servicios
├── config.ts                   # Configuración central congelada (satisfies Config)
├── health.ts                   # Servidor HTTP de health check (GET /health)
│
├── commands/
│   ├── registry.ts             # Carga dinámica de slash + prefix + interactions
│   ├── slash/                  # Slash commands (un archivo por comando)
│   │   ├── _base.ts            # Clase abstracta BaseSlashCommand
│   │   └── bot.ts              # /bot info|ping|stats (ejemplo con subcomandos)
│   └── prefix/                 # Prefix commands (un archivo por comando)
│       ├── _base.ts            # Clase abstracta BasePrefixCommand
│       └── userinfo.ts         # !userinfo (ejemplo con parsing de argumentos)
│
├── interactions/
│   ├── buttons/                # Handlers de botones
│   │   ├── _base.ts            # Clase abstracta BaseButton
│   │   └── avatar.ts           # Botón "Ver avatar" (ejemplo)
│   ├── modals/                 # Handlers de modales
│   │   ├── _base.ts            # Clase abstracta BaseModal
│   │   └── feedback.ts         # Modal de feedback (ejemplo)
│   ├── selects/                # Handlers de select menus
│   │   └── _base.ts            # Clase abstracta BaseSelect
│   └── autocomplete/           # Handlers de autocomplete
│       └── bot.ts              # Autocomplete para /bot (ejemplo)
│
├── events/
│   ├── loader.ts               # Cargador de eventos con priorización
│   ├── core/                   # Eventos críticos (máxima prioridad)
│   │   ├── ready.ts            # Bot listo: migraciones, registro, health
│   │   ├── interactionCreate.ts # Enruta interacciones al InteractionRouter
│   │   └── messageCreate.ts    # Procesa prefix commands
│   └── logs/                   # Eventos de auditoría (nunca crashean)
│       ├── guildCreate.ts      # Log + config por defecto
│       ├── guildDelete.ts      # Log + limpieza de datos
│       ├── guildMemberAdd.ts   # Log de ingreso
│       ├── guildMemberRemove.ts # Log de salida
│       ├── messageDelete.ts    # Log de eliminación
│       ├── messageUpdate.ts    # Log de edición
│       └── error.ts            # Log de errores del cliente
│
├── db/
│   ├── connection.ts           # Pool de PostgreSQL (pgPool)
│   ├── run-migrations.ts       # Ejecutor de migraciones SQL
│   ├── migrations/             # Archivos SQL numerados
│   │   └── 001_initial.sql     # Tablas: guild_settings, user_profiles, bot_meta
│   └── repositories/           # Patrón repositorio
│       ├── guild.repo.ts       # CRUD de guild_settings
│       └── user.repo.ts        # CRUD de user_profiles
│
├── cache/
│   ├── manager.ts              # CacheManager: L1 (Map) + L2 (Redis)
│   └── keys.ts                 # Constructores de claves de caché
│
├── lib/
│   ├── command-parser.ts       # MessageParser: parsing de prefijo + argumentos
│   ├── interaction-router.ts   # InteractionRouter: despacho O(1) por tipo
│   ├── cooldown.ts             # CooldownManager: Redis + fallback local
│   ├── circuit-breaker.ts      # CircuitBreaker para APIs externas
│   ├── permission-guard.ts     # Verificación unificada de permisos
│   ├── embed-builder.ts        # Fábrica de embeds con estilo de marca
│   └── logger.ts               # Instancia de Pino con child loggers
│
├── types/
│   ├── index.ts                # Barrel: Config, GuildSettings, UserProfile
│   ├── command.types.ts        # SlashCommand, PrefixCommand interfaces
│   └── interaction.types.ts    # ButtonHandler, ModalHandler, SelectHandler
│
└── utils/
    ├── chunk.ts                # Chunking de arrays
    ├── format.ts               # Formateo de números, fechas, bytes
    └── hash.ts                 # Hashing SHA-256 para deduplicación
```

---

## 🔄 Estrategia de Carga de Eventos

```
┌──────────────────────────────────────────┐
│              STARTUP                      │
├──────────────────────────────────────────┤
│  1. BotClient.initialize()               │
│     ├── CacheManager.connect() (Redis)   │
│     └── testConnection() (PostgreSQL)    │
│                                          │
│  2. loadEvents(client)                   │
│     ├── core/ (síncrono, prioridad MAX)  │
│     │   ├── ready.ts                     │
│     │   ├── interactionCreate.ts         │
│     │   └── messageCreate.ts             │
│     │                                    │
│     └── logs/ (envueltos en try/catch)   │
│         ├── guildCreate.ts               │
│         ├── guildDelete.ts               │
│         ├── guildMemberAdd.ts            │
│         ├── guildMemberRemove.ts         │
│         ├── messageDelete.ts             │
│         ├── messageUpdate.ts             │
│         └── error.ts                     │
│                                          │
│  3. client.login(token)                  │
│     └── Dispara evento 'ready'           │
│         ├── runMigrations()              │
│         ├── registerAll(client)          │
│         ├── registerSlashCommands()      │
│         │   └── Hash check → REST.put()  │
│         └── startHealthServer()          │
└──────────────────────────────────────────┘

REGLA: Un error en logs/ NUNCA crashea el bot.
       Se loguea el error y la ejecución continúa.
```

---

## 🔀 Flujo del InteractionRouter

```
interactionCreate event
        │
        ▼
  InteractionRouter.route()
        │
        ├── isChatInputCommand() ──► SlashCommand Map
        │   └── Verificar: guildOnly → permisos → cooldown → execute()
        │
        ├── isButton() ──────────► Button Map (customId prefix match)
        │   └── handler.handle()
        │
        ├── isModalSubmit() ─────► Modal Map (customId prefix match)
        │   └── handler.handle()
        │
        ├── isAnySelectMenu() ───► Select Map (customId prefix match)
        │   └── handler.handle()
        │
        └── isAutocomplete() ────► Autocomplete Map (commandName key)
            └── handler.handle()

CADA handler envuelto en try/catch individual.
Si falla → error embed efímero al usuario.
```

---

## 📋 Flujo de Registro de Comandos

```
ready event
    │
    ├── registerAll(client)
    │   ├── Scan /commands/slash/*.js → Map<name, SlashCommand>
    │   ├── Scan /commands/prefix/*.js → Map<name+aliases, PrefixCommand>
    │   ├── Scan /interactions/buttons/*.js → Map<customId, ButtonHandler>
    │   ├── Scan /interactions/modals/*.js → Map<customId, ModalHandler>
    │   ├── Scan /interactions/selects/*.js → Map<customId, SelectHandler>
    │   └── Scan /interactions/autocomplete/*.js → Map<commandName, Handler>
    │
    └── registerSlashCommands()
        ├── getSlashCommandsJSON() → JSON[]
        ├── hashData(JSON[]) → currentHash
        ├── cache.get('bot:commands:hash') → storedHash
        │
        ├── currentHash === storedHash?
        │   ├── SÍ: Skip REST.put() (evitar rate limits)
        │   └── NO: REST.put(commands)
        │       └── cache.set('bot:commands:hash', currentHash, 7d)
        │
        └── devGuildId definido?
            ├── SÍ: Registro guild-scoped (instantáneo)
            └── NO: Registro global (propagación ~1h)
```

---

## 🧠 Decisiones Técnicas

| Tecnología | Decisión | Justificación |
|---|---|---|
| **Discord.js v14.25.1** | Versión exacta pinneada | Evitar breaking changes inesperados en producción |
| **TypeScript strict** | `strict: true` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` | Máxima seguridad de tipos, prevenir bugs en runtime |
| **ESM** | `"type": "module"` + `target: ES2022` | Estándar moderno de Node.js, mejores tree-shaking y top-level await |
| **tsup (esbuild)** | Build tool | 10-100x más rápido que tsc para compilación, ideal para CI/CD |
| **PostgreSQL + pgPool** | Base de datos principal | ACID compliance, JSONB para features flags, excelente soporte de concurrencia |
| **Redis (ioredis)** | Caché L2 compartida | Cooldowns atómicos (SET NX EX), caché de prefijos, hash de comandos |
| **Caché L1 (Map)** | In-process memory | Acceso sub-microsegundo, reduce calls a Redis para datos frecuentes |
| **Pino** | Logger | Más rápido que Winston/Bunyan, JSON nativo, child loggers con contexto |
| **ShardingManager** | Producción | Escala automáticamente según guilds, cada shard = proceso independiente |
| **Ejecución directa** | Desarrollo | Sin sharding en dev para facilitar debugging con breakpoints |
| **systemd** | Process manager | Integración nativa con Linux, auto-restart, journald para logs |
| **Circuit Breaker** | Resiliencia | Prevenir cascadas de fallos cuando APIs externas están caídas |
| **Hash deduplication** | REST registration | Compara SHA-256 de definiciones antes de llamar a Discord API |

---

## 🔐 Intents Justificados

```typescript
GatewayIntentBits.Guilds            // Eventos de servidores y canales
GatewayIntentBits.GuildMembers      // guildMemberAdd/Remove
GatewayIntentBits.GuildMessages     // Recibir mensajes en servidores
GatewayIntentBits.MessageContent    // REQUERIDO: leer contenido para prefix commands
GatewayIntentBits.GuildMessageReactions // Tracking de reacciones
GatewayIntentBits.DirectMessages    // Comandos en DMs
```

---

## 🚀 Inicio Rápido

```bash
# 1. Instalar dependencias
pnpm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 3. Desarrollo
pnpm run dev

# 4. Producción
pnpm run build
pnpm start

# 5. Deployment con systemd
sudo bash setup.sh
sudo systemctl start discord-bot
```

---

## 📊 Health Check

```bash
curl http://localhost:3000/health
```

Respuesta:
```json
{
  "status": "ok",
  "uptime": "2d 5h 30m 15s",
  "uptimeMs": 191415000,
  "guilds": 523,
  "ping": 45,
  "memoryMB": 256,
  "memoryRSS": "312.5 MB",
  "timestamp": "2026-02-27T15:48:00.000Z"
}
```
