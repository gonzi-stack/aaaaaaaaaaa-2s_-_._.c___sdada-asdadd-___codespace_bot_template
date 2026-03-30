import { ChannelType, PermissionsBitField } from 'discord.js';
import type { Guild, GuildChannel } from 'discord.js';
import { fgProRepo } from '../db/repositories/fg-pro.repo.js';
import { fgGuildRepo } from '../db/repositories/fg-guild.repo.js';
import { fgRiskRepo } from '../db/repositories/fg-risk.repo.js';
import { FG_RISK, FG_SLOWMODE_SECONDS } from '../constants/furguard.js';
import { CacheKeys } from '../cache/keys.js';
import { createErrorEmbed, createBrandedEmbed } from './embed-builder.js';
import { createChildLogger } from './logger.js';
import type { BotClient } from '../bot.js';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/connection.js';

const log = createChildLogger({ module: 'fg-deadhand' });

export async function updateModActivity(guildId: string, client: BotClient): Promise<void> {
    await client.cacheManager.set(
        CacheKeys.fg.modActivity(guildId),
        Date.now().toString(),
        7200,
    );
}

export async function checkDeadHand(client: BotClient): Promise<void> {
    try {
        const [configs] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_deadhand_config WHERE enabled = 1',
        );

        for (const config of configs as Array<{
            guildId: string;
            inactivityMinutes: number;
            autoLockdown: number;
            autoSlowmode: number;
            autoBanCritical: number;
            notifyChannelId: string | null;
        }>) {
            try {
                const guild = client.guilds.cache.get(config.guildId);
                if (!guild) continue;

                const isPro = await fgGuildRepo.isPro(config.guildId, client.cacheManager);
                if (!isPro) continue;

                const lastActivity = await client.cacheManager.get(CacheKeys.fg.modActivity(config.guildId));
                const lastActivityTime = lastActivity ? parseInt(lastActivity, 10) : 0;
                const elapsed = Date.now() - lastActivityTime;
                const thresholdMs = config.inactivityMinutes * 60_000;

                if (elapsed < thresholdMs) continue;

                const hasActiveThreat = await checkActiveThreats(config.guildId);
                if (!hasActiveThreat) continue;

                log.warn({ guildId: config.guildId, elapsed }, 'Dead Hand activado');

                if (config.autoLockdown) {
                    await lockdownGuild(guild);
                }

                if (config.autoSlowmode) {
                    await applySlowmode(guild);
                }

                if (config.autoBanCritical) {
                    await banCriticalUsers(guild, client);
                }

                if (config.notifyChannelId) {
                    await notifyModerators(guild, config.notifyChannelId, config);
                }

                await updateModActivity(config.guildId, client);
            } catch (err) {
                log.error({ err, guildId: config.guildId }, 'Error en Dead Hand para guild');
            }
        }
    } catch (err) {
        log.error({ err }, 'Error en el check de Dead Hand');
    }
}

async function checkActiveThreats(guildId: string): Promise<boolean> {
    const [raidEvents] = await pool.query<RowDataPacket[]>(
        'SELECT 1 FROM fg_antiraid_events WHERE guildId = ? AND resolved = 0 LIMIT 1',
        [guildId],
    );
    if (raidEvents.length > 0) return true;

    const [criticalUsers] = await pool.query<RowDataPacket[]>(
        'SELECT 1 FROM fg_risk_scores WHERE guildId = ? AND score >= ? LIMIT 1',
        [guildId, FG_RISK.THRESHOLD_RED],
    );
    return criticalUsers.length > 0;
}

async function lockdownGuild(guild: Guild): Promise<void> {
    try {
        const channels = guild.channels.cache.filter(
            ch => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice,
        );

        for (const [, channel] of channels) {
            try {
                const guildChannel = channel as GuildChannel;
                await guildChannel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: false,
                    Connect: false,
                });
            } catch {
                log.debug({ channelId: channel.id }, 'No se pudo bloquear canal');
            }
        }

        log.info({ guildId: guild.id }, 'Lockdown aplicado por Dead Hand');
    } catch (err) {
        log.error({ err, guildId: guild.id }, 'Error aplicando lockdown');
    }
}

async function applySlowmode(guild: Guild): Promise<void> {
    try {
        const textChannels = guild.channels.cache.filter(
            ch => ch.type === ChannelType.GuildText,
        );

        for (const [, channel] of textChannels) {
            try {
                if ('setRateLimitPerUser' in channel) {
                    await (channel as { setRateLimitPerUser: (s: number) => Promise<unknown> }).setRateLimitPerUser(FG_SLOWMODE_SECONDS);
                }
            } catch {
                log.debug({ channelId: channel.id }, 'No se pudo aplicar slowmode');
            }
        }

        log.info({ guildId: guild.id }, 'Slowmode aplicado por Dead Hand');
    } catch (err) {
        log.error({ err, guildId: guild.id }, 'Error aplicando slowmode');
    }
}

async function banCriticalUsers(guild: Guild, client: BotClient): Promise<void> {
    try {
        const staleScores = await fgRiskRepo.getAllStaleScores();
        const criticalInGuild = staleScores.filter(
            s => s.guildId === guild.id && s.score >= FG_RISK.THRESHOLD_RED,
        );

        const [allCritical] = await pool.query<RowDataPacket[]>(
            'SELECT userId, score FROM fg_risk_scores WHERE guildId = ? AND score >= ?',
            [guild.id, FG_RISK.THRESHOLD_RED],
        );

        for (const user of allCritical as Array<{ userId: string; score: number }>) {
            try {
                await guild.members.ban(user.userId, {
                    reason: `[FurGuard Dead Hand] Puntuación de riesgo crítica: ${user.score}`,
                });
            } catch {
                log.debug({ userId: user.userId, guildId: guild.id }, 'No se pudo banear usuario crítico');
            }
        }

        log.info({ guildId: guild.id, count: (allCritical as unknown[]).length }, 'Usuarios críticos baneados por Dead Hand');
    } catch (err) {
        log.error({ err, guildId: guild.id }, 'Error baneando usuarios críticos');
    }
}

async function notifyModerators(
    guild: Guild,
    channelId: string,
    config: { autoLockdown: number; autoSlowmode: number; autoBanCritical: number },
): Promise<void> {
    try {
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased() || !('send' in channel)) return;

        const actions: string[] = [];
        if (config.autoLockdown) actions.push('🔒 Lockdown de canales');
        if (config.autoSlowmode) actions.push(`🐌 Slowmode (${FG_SLOWMODE_SECONDS}s)`);
        if (config.autoBanCritical) actions.push('⛔ Ban de usuarios críticos');

        const embed = createBrandedEmbed()
            .setColor(0xFF0000)
            .setTitle('🚨 Dead Hand Activado')
            .setDescription(
                '**El sistema Dead Hand de FurGuard se ha activado** debido a inactividad de moderadores durante una amenaza activa.',
            )
            .addFields(
                { name: 'Acciones ejecutadas', value: actions.join('\n') || 'Ninguna' },
                { name: 'Recomendación', value: 'Revisa la situación y toma control manual lo antes posible.' },
            );

        const mods = guild.members.cache.filter(
            m => m.permissions.has(PermissionsBitField.Flags.ModerateMembers) ||
                 m.permissions.has(PermissionsBitField.Flags.BanMembers),
        );
        const mentions = mods.map(m => `<@${m.id}>`).join(' ');

        await (channel as unknown as { send: (opts: unknown) => Promise<unknown> }).send({
            content: mentions || undefined,
            embeds: [embed],
        });
    } catch (err) {
        log.error({ err, guildId: guild.id }, 'Error notificando moderadores para Dead Hand');
    }
}
