import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BotClient } from '../bot.js';
import { createChildLogger } from '../lib/logger.js';

const log = createChildLogger({ module: 'event-loader' });
const __filename = fileURLToPath(import.meta.url);

// El event loader puede ser ejecutado en dos contextos:
// 1. Dev (con tsx): import.meta.url apunta a src/events/loader.ts
// 2. Prod (con tsup): import.meta.url apunta a dist/index.js (por el bundling)
const isTsNode = __filename.endsWith('.ts');
const basePath = isTsNode
    ? dirname(__filename)
    : join(process.cwd(), 'dist', 'events');

interface EventModule {
    name: string;
    once?: boolean;
    execute: (...args: unknown[]) => Promise<void>;
}

/**
 * Carga y registra todos los eventos del bot.
 * - core/: se cargan primero, máxima prioridad
 * - logs/: se cargan después, envueltos en try/catch (nunca crashean el bot)
 *
 * IMPORTANTE: El client se pasa como ÚLTIMO argumento a cada handler,
 * ya que Discord.js NO lo incluye en los argumentos de los eventos.
 */
export async function loadEvents(client: BotClient): Promise<void> {
    const eventsDir = basePath;

    // 1. Cargar eventos core (sincrónico, prioridad máxima)
    await loadEventFolder(client, join(eventsDir, 'core'), 'core');

    // 2. Cargar eventos de logs (envueltos en try/catch)
    await loadEventFolder(client, join(eventsDir, 'logs'), 'logs');

    // 3. Cargar eventos de FurGuard (prioridad core)
    await loadEventFolder(client, join(eventsDir, 'furguard'), 'core');
}

async function loadEventFolder(
    client: BotClient,
    folderPath: string,
    source: 'core' | 'logs',
): Promise<void> {
    let files: string[];
    try {
        files = readdirSync(folderPath).filter(
            (f) => f.endsWith('.js') || f.endsWith('.ts'),
        );
    } catch {
        log.warn({ folderPath }, 'Carpeta de eventos no encontrada');
        return;
    }

    for (const file of files) {
        try {
            const filePath = join(folderPath, file);
            const fileUrl = pathToFileURL(filePath).href;
            const imported = (await import(fileUrl)) as { default?: EventModule };
            const eventModule = imported.default;

            if (!eventModule?.name) {
                log.warn({ file, source }, 'Módulo de evento sin nombre, saltando');
                continue;
            }

            if (source === 'logs') {
                // Eventos de logs envueltos en try/catch — NUNCA crashean el bot
                const wrappedExecute = (...args: unknown[]) => {
                    // Pasar el client como último argumento
                    eventModule.execute(...args, client).catch((err: unknown) => {
                        log.error({ err, event: eventModule.name, source }, 'Error en evento de logs (no fatal)');
                    });
                };

                if (eventModule.once) {
                    client.once(eventModule.name, wrappedExecute);
                } else {
                    client.on(eventModule.name, wrappedExecute);
                }
            } else {
                // Eventos core: se ejecutan directamente, con client como último argumento
                if (eventModule.once) {
                    client.once(eventModule.name, (...args: unknown[]) => {
                        void eventModule.execute(...args, client);
                    });
                } else {
                    client.on(eventModule.name, (...args: unknown[]) => {
                        void eventModule.execute(...args, client);
                    });
                }
            }

            log.debug({ event: eventModule.name, source, once: eventModule.once ?? false }, 'Evento registrado');
        } catch (err) {
            log.error({ err, file, source }, 'Error al cargar módulo de evento');
        }
    }
}
