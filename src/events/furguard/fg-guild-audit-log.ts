import { AuditLogEvent } from 'discord.js';
import type { GuildAuditLogsEntry, Guild } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { fgGuildRepo } from '../../db/repositories/fg-guild.repo.js';
import { fgProRepo } from '../../db/repositories/fg-pro.repo.js';
import { fgCoworkRepo } from '../../db/repositories/fg-cowork.repo.js';
import { CacheKeys } from '../../cache/keys.js';
import { createBrandedEmbed } from '../../lib/embed-builder.js';
import { sendAuditLog } from '../../lib/fg-audit.js';
import { broadcastAlert } from '../../lib/fg-cowork-broadcast.js';
import { evaluateCopilotTriggers } from '../../lib/fg-copilot-triggers.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'fg-event:auditLog' });

const MONITORED_EVENTS = new Set([
    AuditLogEvent.MessageBulkDelete,
    AuditLogEvent.MemberBanAdd,
    AuditLogEvent.ChannelDelete,
    AuditLogEvent.RoleDelete,
    AuditLogEvent.ChannelCreate,
    AuditLogEvent.RoleCreate,
]);

export default {
    name: 'guildAuditLogEntryCreate',
    once: false,

    async execute(entry: GuildAuditLogsEntry, guild: Guild, client: BotClient): Promise<void> {
        if (!MONITORED_EVENTS.has(entry.action)) return;

        try {
            const isPro = await fgGuildRepo.isPro(guild.id, client.cacheManager);
            if (!isPro) return;

            const nukeConfig = await fgProRepo.getNukeguardConfig(guild.id);
            if (!nukeConfig || !nukeConfig.enabled) return;

            const executorId = entry.executorId;
            if (!executorId) return;

        if (executorId === client.user.id) return;

        // Determine Copilot trigger type
        let eventType: string;
        switch (entry.action) {
            case AuditLogEvent.ChannelDelete:
            case AuditLogEvent.ChannelCreate:
                eventType = 'CHANNEL_MANIPULATION';
                break;
            case AuditLogEvent.RoleDelete:
            case AuditLogEvent.RoleCreate:
                eventType = 'ROLE_MANIPULATION';
                break;
            case AuditLogEvent.MemberBanAdd:
            case AuditLogEvent.MessageBulkDelete:
                eventType = 'MODERATION_ACTION_SPIKE';
                break;
            default:
                eventType = 'AUDIT_LOG_SPIKE';
        }

        await evaluateCopilotTriggers(
            guild.id,
            eventType,
            { action: entry.action, executorId },
            client,
        );

        const isBanOrDelete = entry.action === AuditLogEvent.MemberBanAdd ||
                               entry.action === AuditLogEvent.MessageBulkDelete;

            const nukeKey = CacheKeys.fg.nukeWindow(guild.id, executorId);
            const raw = await client.cacheManager.get(nukeKey);
            const timestamps: number[] = raw ? JSON.parse(raw) as number[] : [];
            const now = Date.now();
            const windowMs = nukeConfig.windowSeconds * 1000;

            const recent = timestamps.filter(t => now - t < windowMs);
            recent.push(now);

            await client.cacheManager.set(nukeKey, JSON.stringify(recent), nukeConfig.windowSeconds);

            const threshold = isBanOrDelete ? nukeConfig.banThreshold : nukeConfig.deleteThreshold;

            if (recent.length < threshold) return;

            log.warn({
                guildId: guild.id,
                executorId,
                action: entry.action,
                count: recent.length,
            }, 'NukeGuard activado');

            const embed = createBrandedEmbed()
                .setColor(0xFF0000)
                .setTitle('🔥 NukeGuard Activado')
                .setDescription(
                    `Actividad destructiva detectada por <@${executorId}>\n` +
                    `**${recent.length} acciones** en **${nukeConfig.windowSeconds}s**\n` +
                    `Acción: **${nukeConfig.action}**`,
                );

            await sendAuditLog(guild.id, embed, client);

            if (nukeConfig.action === 'revoke' || nukeConfig.action === 'ban') {
                try {
                    const executor = await guild.members.fetch(executorId).catch(() => null);
                    if (executor) {
                        const botMember = guild.members.me;
                        if (botMember && executor.roles.highest.position < botMember.roles.highest.position) {
                            for (const [, role] of executor.roles.cache) {
                                if (role.id !== guild.roles.everyone.id) {
                                    await executor.roles.remove(role, '[FurGuard NukeGuard] Roles revocados').catch(() => {});
                                }
                            }

                            if (nukeConfig.action === 'ban') {
                                await executor.ban({ reason: '[FurGuard NukeGuard] Actividad destructiva masiva' });
                            }
                        }
                    }
                } catch (err) {
                    log.error({ err, guildId: guild.id, executorId }, 'Error ejecutando acción NukeGuard');
                }
            }

            const group = await fgCoworkRepo.getGroup(guild.id, client.cacheManager);
            if (group) {
                const alertEmbed = createBrandedEmbed()
                    .setColor(0xFF0000)
                    .setTitle('🔥 Alerta Cowork: NukeGuard')
                    .setDescription(`Actividad destructiva en **${guild.name}** por <@${executorId}>`);

                await fgCoworkRepo.createAlert({
                    groupId: group.id,
                    sourceGuildId: guild.id,
                    userId: executorId,
                    alertType: 'nukeguard',
                    details: `${recent.length} acciones destructivas en ${nukeConfig.windowSeconds}s`,
                });

                await broadcastAlert(group.id, alertEmbed, client);
            }
        } catch (err) {
            log.error({ err, guildId: guild.id }, 'Error en NukeGuard audit log handler');
        }
    },
};
