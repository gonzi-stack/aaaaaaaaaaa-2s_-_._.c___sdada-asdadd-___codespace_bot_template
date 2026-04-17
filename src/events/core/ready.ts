import { REST, Routes } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { config } from '../../config.js';
import { registerAll, getSlashCommandsJSON } from '../../commands/registry.js';
import { createChildLogger } from '../../lib/logger.js';
import { hashData } from '../../utils/hash.js';
import { CacheKeys } from '../../cache/keys.js';
import { runMigrations } from '../../db/run-migrations.js';
import { startHealthServer } from '../../health.js';
import { decayAllScores } from '../../lib/fg-risk-engine.js';
import { checkDeadHand } from '../../lib/fg-deadhand.js';
import { runAdaptiveModerationJob } from '../../lib/fg-adaptive.js';
import { FG_RISK, FG_DEADHAND, FG_ADAPTIVE } from '../../constants/furguard.js';

const log = createChildLogger({ module: 'event:ready' });

export default {
    name: 'clientReady',
    once: true,

    async execute(client: BotClient): Promise<void> {
        log.info(`Bot listo! Conectado como ${client.user.tag}`);
        log.info(`Sirviendo a ${client.guilds.cache.size} servidores`);

        // 1. Ejecutar migraciones de base de datos
        try {
            await runMigrations();
            log.info('Migraciones de base de datos ejecutadas');
            
            // Limpiar cooldowns expirados después de que la tabla exista asegurada mente
            const { cooldownRepo } = await import('../../db/repositories/cooldown.repo.js');
            const deleted = await cooldownRepo.sweepExpired();
            log.info({ deleted }, 'Limpieza de cooldowns expirados completada');
        } catch (err) {
            log.error({ err }, 'Error al ejecutar migraciones de DB o limpiar cooldowns');
        }

        // 2. Registrar todos los comandos e interaction handlers
        await registerAll(client);

        // 3. Registrar slash commands via REST (solo si cambiaron)
        await registerSlashCommands(client);

        // 4. Iniciar servidor de health check
        startHealthServer(client);

        // 5. FurGuard: Job de decay de puntuaciones de riesgo
        setInterval(() => {
            void decayAllScores(client);
        }, FG_RISK.DECAY_INTERVAL_HOURS * 3_600_000);
        log.info('FurGuard: Job de decay iniciado');

        // 6. FurGuard: Job de Dead Hand
        setInterval(() => {
            void checkDeadHand(client);
        }, FG_DEADHAND.CHECK_INTERVAL_MS);
        log.info('FurGuard: Job de Dead Hand iniciado');

        // 7. FurGuard: Job de Moderación Adaptativa
        setInterval(() => {
            void runAdaptiveModerationJob(client);
        }, FG_ADAPTIVE.CHECK_INTERVAL_MS);
        log.info('FurGuard: Job de Moderación Adaptativa iniciado');

        log.info('Todos los sistemas inicializados correctamente!');
    },
};

/**
 * Registra los slash commands via REST API.
 * Solo llama a la API si las definiciones cambiaron (compara hash).
 */
async function registerSlashCommands(client: BotClient): Promise<void> {
    const commandsJSON = getSlashCommandsJSON(client);
    const currentHash = hashData(commandsJSON);

    // Verificar hash anterior
    const storedHash = await client.cacheManager.get(CacheKeys.commandsHash);
    if (storedHash === currentHash) {
        log.info('Los slash commands no cambiaron, saltando registro en API');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        if (config.devGuildId) {
            // Registro guild-scoped (instantaneo, para desarrollo)
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.devGuildId),
                { body: commandsJSON },
            );
            log.info(
                { count: commandsJSON.length, guildId: config.devGuildId },
                'Slash commands registrados (guild-scoped)',
            );
        } else {
            // Registro global (tarda hasta 1 hora en propagarse)
            await rest.put(Routes.applicationCommands(config.clientId), {
                body: commandsJSON,
            });
            log.info(
                { count: commandsJSON.length },
                'Slash commands registrados (global)',
            );
        }

        // Guardar hash para evitar re-registros innecesarios
        await client.cacheManager.set(CacheKeys.commandsHash, currentHash, 86400 * 7);
    } catch (err) {
        log.error({ err }, 'Error al registrar slash commands via REST');
    }
}
