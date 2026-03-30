import { BotClient } from './bot.js';
import { loadEvents } from './events/loader.js';
import { logger } from './lib/logger.js';
import { config } from './config.js';

/**
 * Inicializa y arranca una instancia del bot (shard individual).
 */
export async function startBot(): Promise<void> {
    const client = new BotClient();

    // Inicializar sistemas internos (cache, DB)
    await client.initialize();

    // Cargar todos los eventos
    await loadEvents(client);

    // Conectar a Discord
    await client.login(config.token);

    // Shutdown limpio al cerrar
    const shutdown = async () => {
        logger.info('Cerrando bot...');
        await client.shutdown();
    };

    if (process.listenerCount('SIGINT') === 0) {
        process.once('SIGINT', () => void shutdown());
    }
    if (process.listenerCount('SIGTERM') === 0) {
        process.once('SIGTERM', () => void shutdown());
    }
}

// Solo auto-ejecutar cuando este archivo es lanzado directamente
// por el ShardingManager (que establece SHARDING_MANAGER env var).
// Cuando index.ts importa este archivo en modo desarrollo,
// llama a startBot() explícitamente — NO debemos ejecutar dos veces.
if (process.env['SHARDING_MANAGER']) {
    void startBot();
}
