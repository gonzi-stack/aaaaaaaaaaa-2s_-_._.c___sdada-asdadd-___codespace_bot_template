import type { EmbedBuilder } from 'discord.js';
import { fgCoworkRepo } from '../db/repositories/fg-cowork.repo.js';
import { fgProRepo } from '../db/repositories/fg-pro.repo.js';
import { createChildLogger } from './logger.js';
import type { BotClient } from '../bot.js';

const log = createChildLogger({ module: 'fg-cowork-broadcast' });

export async function broadcastAlert(
    groupId: string,
    embed: EmbedBuilder,
    client: BotClient,
): Promise<void> {
    try {
        const members = await fgCoworkRepo.getGroupMembers(groupId);

        for (const member of members) {
            try {
                const guild = client.guilds.cache.get(member.guildId);
                if (!guild) {
                    if (client.shard) {
                        await client.shard.broadcastEval(
                            async (c, { gId, embedData }) => {
                                const g = c.guilds.cache.get(gId);
                                if (!g) return;
                                const { fgProRepo: proRepo } = await import('../db/repositories/fg-pro.repo.js');
                                const auditConfig = await proRepo.getAuditlogConfig(gId);
                                if (!auditConfig?.channelId) return;
                                const ch = await c.channels.fetch(auditConfig.channelId).catch(() => null);
                                if (ch && ch.isTextBased() && 'send' in ch) {
                                    const { EmbedBuilder } = await import('discord.js');
                                    const rebuilt = new EmbedBuilder(embedData);
                                    await (ch as unknown as { send: (opts: unknown) => Promise<unknown> }).send({ embeds: [rebuilt] });
                                }
                            },
                            { context: { gId: member.guildId, embedData: embed.toJSON() } },
                        ).catch((err: unknown) => {
                            log.debug({ err, guildId: member.guildId }, 'Error en broadcastEval');
                        });
                    }
                    continue;
                }

                const auditConfig = await fgProRepo.getAuditlogConfig(member.guildId);
                if (!auditConfig?.channelId) continue;

                const channel = await client.channels.fetch(auditConfig.channelId).catch(() => null);
                if (channel && channel.isTextBased() && 'send' in channel) {
                    await (channel as unknown as { send: (opts: { embeds: EmbedBuilder[] }) => Promise<unknown> }).send({ embeds: [embed] });
                }
            } catch (err) {
                log.error({ err, guildId: member.guildId }, 'Error enviando alerta cowork a guild');
            }
        }
    } catch (err) {
        log.error({ err, groupId }, 'Error en broadcastAlert');
    }
}
