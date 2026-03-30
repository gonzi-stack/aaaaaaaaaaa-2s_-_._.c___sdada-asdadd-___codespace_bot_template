import type { BotClient } from '../../bot.js';
import type { RouteHandler } from '../router.js';
import { serializeUser } from '../serializers/user.serializer.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'api:user' });

/**
 * Crea los handlers de rutas relacionadas con usuarios.
 *
 * GET /api/user/:userId
 *   → Retorna la información completa de un usuario de Discord.
 *   → Usa `client.users.fetch()` que consulta la API de Discord directamente,
 *     por lo que funciona con CUALQUIER usuario, incluso si no comparte
 *     servidor con el bot.
 *   → El parámetro `force=true` se usa para obtener datos actualizados
 *     directamente de la API en vez de usar la caché local.
 *   → 200: SerializedUser
 *   → 400: ID inválido
 *   → 404: Usuario no encontrado
 *   → 500: Error interno al obtener datos
 */
export function createUserRoutes(client: BotClient) {
    const getUser: RouteHandler = async (req, res) => {
        const { userId } = req.params;

        if (!userId) {
            res.json(400, { error: 'Se requiere el parámetro userId' });
            return;
        }

        // Validar que el ID tenga formato de snowflake (solo dígitos, 17-20 chars)
        if (!/^\d{17,20}$/.test(userId)) {
            res.json(400, { error: 'El ID proporcionado no tiene un formato válido de snowflake' });
            return;
        }

        log.info({ userId }, 'Solicitud de información de usuario recibida');

        try {
            // force: true → siempre consulta la API de Discord para datos frescos
            // Esto incluye banner y accent color que no vienen del caché
            const user = await client.users.fetch(userId, { force: true });

            const serialized = serializeUser(user);

            log.info({ userId, username: serialized.username }, 'Usuario serializado correctamente');

            res.json(200, {
                success: true,
                data: serialized,
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
            const error = err as Error;

            // Discord API retorna 404 / Unknown User para IDs que no existen
            if (error.message?.includes('Unknown User') || error.message?.includes('404')) {
                log.warn({ userId }, 'Usuario no encontrado en Discord');
                res.json(404, { error: 'Usuario no encontrado en Discord' });
                return;
            }

            log.error({ err, userId }, 'Error al obtener datos del usuario');
            res.json(500, { error: 'Error interno al obtener datos del usuario' });
        }
    };

    return { getUser };
}
