import { ShardingManager } from 'discord.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { logger } from './lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Detecta si estamos corriendo con tsx (TypeScript directo).
 * tsx ejecuta archivos .ts sin compilar, mientras que en producción
 * compilada los archivos son .js en dist/.
 */
const isRunningTsx = __filename.endsWith('.ts');

/**
 * Punto de entrada principal.
 *
 * - Con tsx (desarrollo o Pterodactyl): ejecuta el bot directamente sin sharding.
 *   ShardingManager NO es compatible con tsx porque spawnea procesos con `node`,
 *   que no puede ejecutar archivos .ts directamente.
 *
 * - Con JS compilado (dist/): usa ShardingManager para escalar automáticamente.
 */
async function main(): Promise<void> {
    if (isRunningTsx || config.nodeEnv === 'development') {
        // Ejecutar directamente sin sharding
        // (necesario con tsx ya que ShardingManager spawnea con `node` que no soporta .ts)
        logger.info('Ejecutando bot en modo directo (sin sharding)');
        const { startBot } = await import('./shard.js');
        await startBot();
    } else {
        // Producción con JS compilado — usar ShardingManager
        const shardFile = join(__dirname, 'shard.js');

        if (!existsSync(shardFile)) {
            logger.error({ shardFile }, 'Archivo de shard no encontrado. Ejecutando en modo directo.');
            const { startBot } = await import('./shard.js');
            await startBot();
            return;
        }

        const manager = new ShardingManager(shardFile, {
            token: config.token,
            totalShards: 'auto',
        });

        manager.on('shardCreate', (shard) => {
            logger.info({ shardId: shard.id }, `Shard #${shard.id} iniciado`);

            shard.on('death', () => {
                logger.error({ shardId: shard.id }, `Shard #${shard.id} murio`);
            });

            shard.on('disconnect', () => {
                logger.warn({ shardId: shard.id }, `Shard #${shard.id} desconectado`);
            });

            shard.on('reconnecting', () => {
                logger.info({ shardId: shard.id }, `Shard #${shard.id} reconectando`);
            });
        });

        logger.info('Iniciando ShardingManager...');
        await manager.spawn();

        // Limpieza apropiada para evitar shards zombies (orphan processes)
        const shutdownCluster = () => {
            logger.info('Señal de cierre recibida, apagando shards...');
            manager.shards.forEach(shard => shard.kill());
            setTimeout(() => process.exit(0), 1000);
        };

        if (process.listenerCount('SIGINT') === 0) process.once('SIGINT', shutdownCluster);
        if (process.listenerCount('SIGTERM') === 0) process.once('SIGTERM', shutdownCluster);
    }
}

// Manejo global de errores -- NUNCA terminar el proceso
if (process.listenerCount('unhandledRejection') === 0) {
    process.on('unhandledRejection', (error) => {
        logger.error({ err: error }, 'Promesa no capturada (unhandledRejection)');
    });
}

if (process.listenerCount('uncaughtException') === 0) {
    process.on('uncaughtException', (error) => {
        logger.error({ err: error }, 'Excepcion no capturada (uncaughtException)');
    });
}

void main();
