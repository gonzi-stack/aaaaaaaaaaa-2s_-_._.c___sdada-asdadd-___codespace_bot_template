# 🛡️ Informe de Auditoría Técnica: FurGuard Moderation Suite
**Version:** 1.0.0-PRO
**Estado General:** Operativo ( Hardening Final en curso )

---

## 1. Arquitectura del Sistema
FurGuard es una suite de moderación profesional para Discord construida con **Node.js (TypeScript)** y **Discord.js v14**. Utiliza un motor de base de datos **MariaDB** para persistencia y un gestor de **Caché (L1 In-Memory / L2 Redis)** para optimización de alto rendimiento.

### Flujo de Interacción
1. `BotClient` recibe la interacción.
2. `InteractionRouter` despacha a los handlers de Comandos Slash (`src/commands/slash`).
3. El `PermissionGuard` valida que el usuario sea Administrador o Moderador.
4. Los repositorios (`src/db/repositories`) gestionan la data de forma atómica.
5. El `Risk Engine` evalúa los deltas de riesgo y aplica sanciones automáticas si se superan los umbrales.

---

## 2. Esquema de Base de Datos (MariaDB)
Las tablas están diseñadas para trazabilidad total de acciones:

- **Configuración Global:**
  - `fg_guilds`: Registro de servidores, tier (FREE/PRO) y nivel de tolerancia central.
  - `fg_auditlog_config`: Configura el canal y webhooks para el registro de auditoría.
  - `fg_adaptive_config`: Parámetros para el modo de moderación adaptativa.

- **Gestión de Riesgo y Comportamiento:**
  - `fg_risk_scores`: Puntuación actual de cada usuario (0-1000).
  - `fg_risk_events`: Historial de por qué subió o bajó el riesgo de un usuario (+/-).
  - `fg_behavior_profiles`: Contadores acumulados de infracciones (Warns, Mutes, Bans).
  - `fg_heatmap_points`: Puntos de calor para rastrear comportamiento sospechoso en canales específicos.

- **Protección Avanzada (Nivel PRO):**
  - `fg_antiraid_config/events`: Umbrales de ingreso masivo y registros de ataques mitigados.
  - `fg_nukeguard_config`: Límites de destrucción permitidos para moderadores/tokens robados.
  - `fg_trust_config`: Reglas de veteranía para el sistema de confianza.
  - `fg_deadhand_config`: Parámetros para el protocolo "Hombre Muerto" (inactividad del staff).

- **Colaboración (Cowork):**
  - `fg_cowork_groups/members`: Estructura de redes de servidores aliados.
  - `fg_blacklist`: Lista negra global compartida entre servidores.
  - `fg_cowork_alerts`: Notificaciones cruzadas de ataques en tiempo real.
  - `fg_cases / fg_case_votes`: Sistema de juicio y votación entre staffs de distintos servidores para bans globales.

---

## 3. Análisis de Subsistemas Core

### 📈 Risk Engine (`fg-risk-engine.ts`)
El corazón semántico del bot. No banea por una palabra, banea por acumulación de "entropía maliciosa".
- **Correlación:** Se activa desde el `AutoMod`, comandos manuales y el `Raid Shield`.
- **Decay Automático:** El sistema "cura" a los usuarios descontando riesgo cada 24 horas (`decayAllScores`).
- **Adaptatividad:** Cruza el puntaje con la `Tolerancia` del servidor para decidir si advierte, silencia o banea.

### 🔥 NukeGuard (`fg-guild-audit-log.ts`)
Protección interna contra sabotajes. Vigila los Audit Logs de Discord.
- **Detección:** Borrado masivo de canales, roles, categorías, mensajes o baneos compulsivos.
- **Acción:** Si un moderador (humano o bot) abusa, el sistema le arranca los roles (`revoke`) o banea instantáneamente.
- **Extensión Clear:** Se implementó un mini-nukeguard dentro del comando `/clear` para detectar abuso específico del comando del bot.

### 🤝 Cowork Network (`fg-cowork-broadcast.ts`)
Sistema de inteligencia compartida.
- **Correlación:** Cuando un NukeGuard o un Anti-Raid se activan, emiten una "Alerta Cowork" a la base central.
- **Blacklist:** Un usuario expulsado en un servidor aliado puede ser autobaneado al entrar a tu servidor si está en la lista negra compartida.

### 💀 Dead Hand Protocol (`fg-deadhand.ts`)
Protocolo de defensa definitiva por inactividad.
- **Lógica:** Si hay una amenaza activa (Raid o Riesgo Crítico) y ningún moderador registra actividad (comandos) en X minutos, el bot toma el control total.
- **Acción:** Aplica Lockdown global, slowmode y banea a los atacantes en ausencia del staff.

---

## 4. Comandos Slash Principales (`src/commands/slash`)
- `/activar-pro`: Gestión de licencias temporales.
- `/clear`: Limpieza de canales con protección anti-abuso y anti-self-delete.
- `/furguard setup/tolerance/perfil`: Gestión de configuración y consulta de riesgo.
- `/furguard warn/mute/kick/ban/unban`: Moderación manual que alimenta el Risk Engine.
- `/furguard pardon`: Único comando manual para reducir riesgo acumulado (gestión humana).
- `/furguard cowork`: Creación, unión y gestión de alertas compartidas.

---

## 5. Correlación de Sistemas (Resumen)

| Sistema Iniciador | Afecta a... | Consecuencia en... |
| :--- | :--- | :--- |
| **AutoMod Hit** | Risk Engine | Sube riesgo del usuario, genera Heatmap |
| **Rojo en Risk Engine** | EvaluateAndAct | Ban automático según Tolerancia |
| **Abuso de /clear** | NukeGuard Local | Inyecta +600 riesgo y emite Alerta Cowork |
| **Join de Ex-baneado** | Audit Log / MD | Notifica al Dueño y alerta al canal de Auditoría |
| **Staff Inactivo** | Dead Hand | Lockdown preventivo en Raid activa |
| **Blacklist Cowork** | Member Join | Autoban instantáneo por reputación en red |

---

## 6. Sugerencias de Mejora (Dashboard/IA Claude)
- **Historial del Heatmap:** Actualmente se muestra como texto ASCII; se podría mejorar con la generación de un gráfico vía API.
- **Contextualización de Riesgo:** El sistema `addDelta` podría usar una IA para categorizar la gravedad del mensaje (Spam vs Acoso) y ajustar el puntaje dinámicamente.
- **Logging de Webhooks:** El `fg-audit.ts` es robusto, pero podría beneficiarse de un filtrado dinámico (Logs por categoría).

---
---

## 7. Resultados de Validación: Copilot System & Calidad de Código
- **Copilot System (`fg-copilot.ts`):** Validado exitosamente. Es un sistema real de recomendación heurística exclusivo para servidores PRO. Actúa como un consultor: recolecta datos del servidor (ratió de usuarios nuevos, incidentes recientes, existencia de canal de auditoría y moderadores) y calcula una configuración óptima automatizada (p. ej., umbrales de Anti-Raid, días de veteranía para Trust, tolerancia de riesgo). Funciona emitiendo objetos de configuración tipados que luego se aplican y loguean en la base de datos.
- **Auditoría de Calidad (ESLint y TypeScript):** Se resolvieron más de 100 errores de ESLint, mayoritariamente por aserciones innecesarias, uso indiscriminado de tipos `any` desde respuestas de la base de datos y promesas flotantes. Se restauró el sistema de promesas (`async/await`) en el CacheManager para mantener la integridad de la arquitectura asíncrona (preparada para L2 Redis), suprimiendo la dependencia a operaciones síncronas que causaban fallos en cadena (`await-thenable`). Todo compila en limpio con `tsc --noEmit` y pasa la verificación completa de ESLint.

---
**Auditoría finalizada por Antigravity AI.**
