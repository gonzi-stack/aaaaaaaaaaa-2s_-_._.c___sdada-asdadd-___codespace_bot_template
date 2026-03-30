import type { BotClient } from '../../bot.js';
import type { RouteHandler } from '../router.js';
import { serializeGuild } from '../serializers/guild.serializer.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'api:guild' });

/**
 * Crea los handlers de rutas relacionadas con guilds.
 *
 * GET /api/guild/:guildId
 *   → Retorna la información completa del servidor (canales, roles, emojis, etc.)
 *   → 200: SerializedGuild
 *   → 404: El bot no está en ese servidor
 *   → 500: Error interno al obtener datos
 */
export function createGuildRoutes(client: BotClient) {
    const getGuild: RouteHandler = async (req, res) => {
        const { guildId } = req.params;

        if (!guildId) {
            res.json(400, { error: 'Se requiere el parámetro guildId' });
            return;
        }

        log.info({ guildId }, 'Solicitud de información de guild recibida');

        // Verificar que el bot está en ese servidor
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            log.warn({ guildId }, 'Guild no encontrado en la caché del bot');
            res.json(404, { error: 'El bot no está en ese servidor o el ID es inválido' });
            return;
        }

        try {
            const serialized = await serializeGuild(guild);

            log.info(
                { guildId, channels: serialized.categories.reduce((acc, c) => acc + c.channels.length, 0) + serialized.uncategorizedChannels.length, roles: serialized.roles.length },
                'Guild serializado correctamente',
            );

            res.json(200, {
                success: true,
                data: serialized,
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
            log.error({ err, guildId }, 'Error al serializar guild');
            res.json(500, { error: 'Error interno al obtener datos del servidor' });
        }
    };

    return { getGuild };
}
