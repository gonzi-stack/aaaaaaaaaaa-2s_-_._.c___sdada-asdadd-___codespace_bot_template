import type { BotClient } from '../bot.js';
import { ApiRouter } from './router.js';
import { createGuildRoutes } from './routes/guild.route.js';
import { createUserRoutes } from './routes/user.route.js';
import { createWebhookRoutes } from './routes/webhook.route.js';
import { createChildLogger } from '../lib/logger.js';

const log = createChildLogger({ module: 'api' });

/**
 * Crea y configura el router de la API interna del bot.
 *
 * Rutas disponibles:
 * - GET  /api/guild/:guildId                         → Información completa de un servidor
 * - GET  /api/user/:userId                           → Información completa de un usuario
 * - POST /api/webhook                                → Crear un webhook en un canal
 * - GET  /api/webhook/:guildId/:channelId            → Listar webhooks de un canal
 * - POST /api/webhook/:guildId/:webhookId/delete     → Eliminar un webhook
 */
export function createApiRouter(client: BotClient): ApiRouter {
    const router = new ApiRouter();

    // Registrar rutas de guilds
    const guildRoutes = createGuildRoutes(client);
    router.get('/api/guild/:guildId', guildRoutes.getGuild);

    // Registrar rutas de usuarios
    const userRoutes = createUserRoutes(client);
    router.get('/api/user/:userId', userRoutes.getUser);

    // Registrar rutas de webhooks
    const webhookRoutes = createWebhookRoutes(client);
    router.post('/api/webhook', webhookRoutes.createWebhook);
    router.get('/api/webhook/:guildId/:channelId', webhookRoutes.listWebhooks);
    router.post('/api/webhook/:guildId/:webhookId/delete', webhookRoutes.deleteWebhook);

    log.info('Rutas de API registradas');

    return router;
}
