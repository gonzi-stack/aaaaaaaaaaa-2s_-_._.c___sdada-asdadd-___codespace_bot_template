import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { BotClient } from '../../bot.js';
import type { RouteHandler } from '../router.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'api:webhook' });

const MAX_WEBHOOKS_PER_CHANNEL = 15;

interface CreateWebhookBody {
    guildId: string;
    channelId: string;
    name: string;
    avatar?: string;
}

export function createWebhookRoutes(client: BotClient) {
    const createWebhook: RouteHandler = async (req, res) => {
        const body = req.body as Partial<CreateWebhookBody> | null;

        if (!body || !body.guildId || !body.channelId || !body.name) {
            res.json(400, { error: 'Se requieren los campos: guildId, channelId, name' });
            return;
        }

        const { guildId, channelId, name, avatar } = body;

        log.info({ guildId, channelId, name }, 'Solicitud de creación de webhook recibida');

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            res.json(404, { error: 'El bot no está en ese servidor' });
            return;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            res.json(404, { error: 'Canal no encontrado en ese servidor' });
            return;
        }

        if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
            res.json(400, { error: 'El canal debe ser de tipo texto o anuncios' });
            return;
        }

        const botMember = guild.members.me;
        if (!botMember) {
            res.json(500, { error: 'No se pudo obtener al bot como miembro del servidor' });
            return;
        }

        const botPerms = channel.permissionsFor(botMember);
        if (!botPerms?.has(PermissionFlagsBits.ManageWebhooks)) {
            res.json(403, { error: 'El bot no tiene el permiso "Gestionar webhooks" en ese canal' });
            return;
        }

        if (!botPerms.has(PermissionFlagsBits.ViewChannel)) {
            res.json(403, { error: 'El bot no tiene acceso a ese canal' });
            return;
        }

        try {
            if (!('fetchWebhooks' in channel)) {
                res.json(400, { error: 'Este tipo de canal no soporta webhooks' });
                return;
            }

            const existingWebhooks = await channel.fetchWebhooks();

            if (existingWebhooks.size >= MAX_WEBHOOKS_PER_CHANNEL) {
                res.json(409, {
                    error: `El canal ya tiene el máximo de webhooks permitidos (${MAX_WEBHOOKS_PER_CHANNEL})`,
                    current: existingWebhooks.size,
                    max: MAX_WEBHOOKS_PER_CHANNEL,
                });
                return;
            }

            const webhook = await channel.createWebhook({
                name,
                avatar: avatar ?? null,
                reason: `Creado desde el dashboard por la API del bot`,
            });

            client.webhooks.register(`${guildId}:${webhook.id}`, {
                id: webhook.id,
                token: webhook.token ?? '',
                channelId,
            });

            log.info({ guildId, channelId, webhookId: webhook.id }, 'Webhook creado exitosamente');

            res.json(201, {
                success: true,
                data: {
                    id: webhook.id,
                    token: webhook.token,
                    channelId,
                    name: webhook.name,
                    avatar: webhook.avatarURL(),
                    url: webhook.url,
                },
            });
        } catch (err) {
            log.error({ err, guildId, channelId }, 'Error al crear webhook');
            res.json(500, { error: 'Error interno al crear el webhook' });
        }
    };

    const listWebhooks: RouteHandler = async (req, res) => {
        const { guildId, channelId } = req.params;

        if (!guildId || !channelId) {
            res.json(400, { error: 'Se requieren los parámetros guildId y channelId' });
            return;
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            res.json(404, { error: 'El bot no está en ese servidor' });
            return;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            res.json(404, { error: 'Canal no encontrado' });
            return;
        }

        if (!('fetchWebhooks' in channel)) {
            res.json(400, { error: 'Este tipo de canal no soporta webhooks' });
            return;
        }

        const botPerms = channel.permissionsFor(guild.members.me!);
        if (!botPerms?.has(PermissionFlagsBits.ManageWebhooks)) {
            res.json(403, { error: 'El bot no tiene permiso para gestionar webhooks en ese canal' });
            return;
        }

        try {
            const webhooks = await channel.fetchWebhooks();

            res.json(200, {
                success: true,
                data: webhooks.map((wh) => ({
                    id: wh.id,
                    name: wh.name,
                    channelId: wh.channelId,
                    avatar: wh.avatarURL(),
                    createdAt: wh.createdAt?.toISOString(),
                })),
                count: webhooks.size,
                max: MAX_WEBHOOKS_PER_CHANNEL,
            });
        } catch (err) {
            log.error({ err, guildId, channelId }, 'Error al listar webhooks');
            res.json(500, { error: 'Error interno al listar webhooks' });
        }
    };

    const deleteWebhook: RouteHandler = async (req, res) => {
        const { guildId, webhookId } = req.params;

        if (!guildId || !webhookId) {
            res.json(400, { error: 'Se requieren los parámetros guildId y webhookId' });
            return;
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            res.json(404, { error: 'El bot no está en ese servidor' });
            return;
        }

        try {
            const guildWebhooks = await guild.fetchWebhooks();
            const webhook = guildWebhooks.get(webhookId);

            if (!webhook) {
                res.json(404, { error: 'Webhook no encontrado en ese servidor' });
                return;
            }

            await webhook.delete('Eliminado desde el dashboard por la API del bot');
            client.webhooks.remove(`${guildId}:${webhookId}`);

            log.info({ guildId, webhookId }, 'Webhook eliminado exitosamente');

            res.json(200, { success: true, message: 'Webhook eliminado correctamente' });
        } catch (err) {
            log.error({ err, guildId, webhookId }, 'Error al eliminar webhook');
            res.json(500, { error: 'Error interno al eliminar el webhook' });
        }
    };

    return { createWebhook, listWebhooks, deleteWebhook };
}
