import { WebhookClient, type EmbedBuilder } from 'discord.js';
import { fgProRepo } from '../db/repositories/fg-pro.repo.js';
import { createChildLogger } from './logger.js';
import type { BotClient } from '../bot.js';

const log = createChildLogger({ module: 'fg-audit' });

export async function sendAuditLog(
    guildId: string,
    embed: EmbedBuilder,
    client: BotClient,
): Promise<void> {
    try {
        const config = await fgProRepo.getAuditlogConfig(guildId);
        if (!config || !config.enabled) return;

        if (config.webhookId && config.webhookToken) {
            const webhook = new WebhookClient({ id: config.webhookId, token: config.webhookToken });
            try {
                await webhook.send({
                    username: 'FurGuard Audit',
                    embeds: [embed],
                });
                webhook.destroy();
                return;
            } catch (err) {
                log.debug({ err, guildId }, 'Webhook de auditoría falló, cayendo a canal');
                webhook.destroy();
            }
        }

        const channel = await client.channels.fetch(config.channelId).catch(() => null);
        if (channel && channel.isTextBased() && 'send' in channel) {
            await (channel as { send: (opts: { embeds: EmbedBuilder[] }) => Promise<unknown> }).send({ embeds: [embed] });
        }
    } catch (err) {
        log.error({ err, guildId }, 'Error enviando audit log');
    }
}
