import type { Guild } from 'discord.js';
import { fgGuildRepo } from '../db/repositories/fg-guild.repo.js';
import { fgProRepo } from '../db/repositories/fg-pro.repo.js';



import { FG_TIER, FG_TOLERANCE, FG_ANTIRAID, FG_NUKEGUARD, FG_TRUST, FG_DEADHAND } from '../constants/furguard.js';
import type { FgTolerance } from '../constants/furguard.js';
import { createBrandedEmbed } from './embed-builder.js';
import { sendAuditLog } from './fg-audit.js';
import { createChildLogger } from './logger.js';
import type { BotClient } from '../bot.js';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/connection.js';

const log = createChildLogger({ module: 'fg-copilot' });



export interface CopilotAnalysis {
    guildId: string;
    memberCount: number;
    newMemberRatio: number; // miembros con cuenta < 7 días / total
    recentIncidents: number; // incidentes de riesgo últimos 7 días
    hasAuditLogChannel: boolean;
    hasModerationTeam: boolean;
    recommendedTolerance: FgTolerance;
    recommendations: Array<{
        system: string;
        config: Record<string, unknown>;
        reason: string;
    }>;
}

export interface CopilotConfig {
    tolerance: FgTolerance;
    antiraid: {
        enabled: number;
        joinThreshold: number;
        windowSeconds: number;
        action: string;
    };
    nukeguard: {
        enabled: number;
        deleteThreshold: number;
        banThreshold: number;
        windowSeconds: number;
        action: string;
    };
    trust: {
        enabled: number;
        veteranDays: number;
        newAccountDays: number;
    };
    auditlog: {
        enabled: number;
        channelId: string | null;
    };
    deadhand: {
        enabled: number;
        inactivityMinutes: number;
        autoLockdown: number;
        autoSlowmode: number;
        autoBanCritical: number;
    };
    adaptive: {
        enabled: number;
        mode: 'suggest' | 'auto';
    };
}

/**
 * Analyze guild and generate recommended configuration.
 * Only for PRO guilds.
 */
export async function runCopilotAnalysis(guildId: string, client: BotClient): Promise<CopilotAnalysis | null> {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return null;

        const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
        if (!fgGuild || fgGuild.tier !== FG_TIER.PRO) return null;

        log.info({ guildId }, 'Starting Copilot analysis');

        // Gather data
        const memberCount = guild.memberCount;
        const newMemberRatio = await calculateNewMemberRatio(guild);
        const recentIncidents = await countRecentIncidents(guildId);
        const hasAuditLogChannel = findSuitableAuditLogChannel(guild);
        const hasModerationTeam = checkModerationTeam(guild);

        // Determine recommended tolerance
        let recommendedTolerance: FgTolerance = FG_TOLERANCE.YELLOW;
        if (recentIncidents > 10 || newMemberRatio > 0.3) {
            recommendedTolerance = FG_TOLERANCE.ORANGE;
        } else if (recentIncidents > 20 || newMemberRatio > 0.5) {
            recommendedTolerance = FG_TOLERANCE.RED;
        } else if (recentIncidents === 0 && newMemberRatio < 0.1) {
            recommendedTolerance = FG_TOLERANCE.GREEN;
        }

        // Build recommendations per system
        const recommendations: CopilotAnalysis['recommendations'] = [];

        // Anti-raid
        recommendations.push({
            system: 'antiraid',
            config: {
                enabled: true,
                joinThreshold: memberCount > 100 ? 15 : FG_ANTIRAID.DEFAULT_JOIN_THRESHOLD,
                windowSeconds: FG_ANTIRAID.DEFAULT_WINDOW_SECONDS,
                action: 'lockdown',
            },
            reason: `Servidor ${memberCount > 100 ? 'grande' : 'pequeño'}, ajuste de umbral de raid.`,
        });

        // Nukeguard
        recommendations.push({
            system: 'nukeguard',
            config: {
                enabled: true,
                deleteThreshold: FG_NUKEGUARD.DEFAULT_DELETE_THRESHOLD,
                banThreshold: FG_NUKEGUARD.DEFAULT_BAN_THRESHOLD,
                windowSeconds: FG_NUKEGUARD.DEFAULT_WINDOW_SECONDS,
                action: 'revoke',
            },
            reason: 'Protección básica contra actividad destructiva.',
        });

        // Trust system
        recommendations.push({
            system: 'trust',
            config: {
                enabled: newMemberRatio > 0.2,
                veteranDays: FG_TRUST.DEFAULT_VETERAN_DAYS,
                newAccountDays: FG_TRUST.DEFAULT_NEW_ACCOUNT_DAYS,
            },
            reason: newMemberRatio > 0.2 ? 'Alta proporción de cuentas nuevas.' : 'Proporción normal de cuentas nuevas.',
        });

        // Audit log
        if (hasAuditLogChannel) {
            recommendations.push({
                system: 'auditlog',
                config: { enabled: true, channelId: null }, // channel will be set later
                reason: 'Canal de auditoría disponible.',
            });
        }

        // Dead Hand
        recommendations.push({
            system: 'deadhand',
            config: {
                enabled: hasModerationTeam,
                inactivityMinutes: FG_DEADHAND.DEFAULT_INACTIVITY_MINUTES,
                autoLockdown: true,
                autoSlowmode: true,
                autoBanCritical: false,
            },
            reason: hasModerationTeam ? 'Equipo de moderación detectado.' : 'Sin equipo de moderación, Dead Hand desactivado.',
        });

        // Adaptive moderation
        recommendations.push({
            system: 'adaptive',
            config: {
                enabled: true,
                mode: 'suggest',
            },
            reason: 'Recomendado para ajuste automático basado en actividad.',
        });

        const analysis: CopilotAnalysis = {
            guildId,
            memberCount,
            newMemberRatio,
            recentIncidents,
            hasAuditLogChannel,
            hasModerationTeam,
            recommendedTolerance,
            recommendations,
        };

        await fgProRepo.logCopilotAction(guildId, 'analysis', `Analysis completed: ${recommendations.length} recommendations`, true);
        log.info({ guildId, recommendations: recommendations.length }, 'Copilot analysis completed');
        return analysis;
    } catch (err) {
        log.error({ err, guildId }, 'Error in Copilot analysis');
        await fgProRepo.logCopilotAction(guildId, 'analysis', `Error: ${(err as Error).message}`, false, (err as Error).stack);
        return null;
    }
}

/**
 * Apply Copilot configuration to the guild.
 * Will update tolerance and all subsystem configs.
 * Logs actions to audit log channel or DM owner.
 */
export async function applyCopilotConfig(guildId: string, client: BotClient, config?: CopilotConfig): Promise<boolean> {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return false;

        const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
        if (!fgGuild || fgGuild.tier !== FG_TIER.PRO) return false;

        log.info({ guildId }, 'Applying Copilot configuration');

        let appliedConfig: CopilotConfig;
        if (config) {
            appliedConfig = config;
        } else {
            const analysis = await runCopilotAnalysis(guildId, client);
            if (!analysis) return false;
            appliedConfig = analysisToConfig(analysis, guild);
        }

        // Update tolerance
        await fgGuildRepo.setTolerance(guildId, appliedConfig.tolerance, client.cacheManager);
        await logCopilotAction(guildId, 'tolerance', `Tolerance set to ${appliedConfig.tolerance}`, client);

        // Apply each subsystem
        if (appliedConfig.antiraid.enabled) {
            await fgProRepo.setAntiraidConfig(guildId, {
                enabled: appliedConfig.antiraid.enabled,
                joinThreshold: appliedConfig.antiraid.joinThreshold,
                windowSeconds: appliedConfig.antiraid.windowSeconds,
                action: appliedConfig.antiraid.action,
            });
            await logCopilotAction(guildId, 'antiraid', `Anti-raid configured: ${appliedConfig.antiraid.joinThreshold} joins/${appliedConfig.antiraid.windowSeconds}s → ${appliedConfig.antiraid.action}`, client);
        }

        if (appliedConfig.nukeguard.enabled) {
            await fgProRepo.setNukeguardConfig(guildId, {
                enabled: appliedConfig.nukeguard.enabled,
                deleteThreshold: appliedConfig.nukeguard.deleteThreshold,
                banThreshold: appliedConfig.nukeguard.banThreshold,
                windowSeconds: appliedConfig.nukeguard.windowSeconds,
                action: appliedConfig.nukeguard.action,
            });
            await logCopilotAction(guildId, 'nukeguard', `NukeGuard configured: ${appliedConfig.nukeguard.deleteThreshold} deletes/${appliedConfig.nukeguard.banThreshold} bans/${appliedConfig.nukeguard.windowSeconds}s → ${appliedConfig.nukeguard.action}`, client);
        }

        if (appliedConfig.trust.enabled) {
            await fgProRepo.setTrustConfig(guildId, {
                enabled: appliedConfig.trust.enabled,
                veteranDays: appliedConfig.trust.veteranDays,
                newAccountDays: appliedConfig.trust.newAccountDays,
                veteranRoleId: null,
                restrictedRoleId: null,
            });
            await logCopilotAction(guildId, 'trust', `Trust system configured: veteran ${appliedConfig.trust.veteranDays}d, new account ${appliedConfig.trust.newAccountDays}d`, client);
        }

        if (appliedConfig.auditlog.enabled && appliedConfig.auditlog.channelId) {
            await fgProRepo.setAuditlogConfig(guildId, { channelId: appliedConfig.auditlog.channelId });
            await logCopilotAction(guildId, 'auditlog', `Audit log channel set to ${appliedConfig.auditlog.channelId}`, client);
        }

        if (appliedConfig.deadhand.enabled) {
            await fgProRepo.setDeadhandConfig(guildId, {
                enabled: appliedConfig.deadhand.enabled,
                inactivityMinutes: appliedConfig.deadhand.inactivityMinutes,
                autoLockdown: appliedConfig.deadhand.autoLockdown,
                autoSlowmode: appliedConfig.deadhand.autoSlowmode,
                autoBanCritical: appliedConfig.deadhand.autoBanCritical,
                notifyChannelId: null,
            });
            await logCopilotAction(guildId, 'deadhand', `Dead Hand configured: inactivity ${appliedConfig.deadhand.inactivityMinutes}min`, client);
        }

        if (appliedConfig.adaptive.enabled) {
            await fgProRepo.setAdaptiveConfig(guildId, { enabled: appliedConfig.adaptive.enabled, mode: appliedConfig.adaptive.mode });
            await logCopilotAction(guildId, 'adaptive', `Adaptive moderation set to ${appliedConfig.adaptive.mode} mode`, client);
        }

        // Save snapshot
        await fgProRepo.setCopilotConfig(guildId, {
            enabled: 1,
            lastAnalyzedAt: new Date(),
            configSnapshot: JSON.stringify(appliedConfig),
        });

        await sendCopilotSummary(guildId, appliedConfig, client);
        log.info({ guildId }, 'Copilot configuration applied successfully');
        return true;
    } catch (err) {
        log.error({ err, guildId }, 'Error applying Copilot configuration');
        await fgProRepo.logCopilotAction(guildId, 'apply', `Error: ${(err as Error).message}`, false, (err as Error).stack);
        return false;
    }
}

// Helper functions

async function calculateNewMemberRatio(guild: Guild): Promise<number> {
    const members = await guild.members.fetch({ limit: 100 }).catch(() => null);
    if (!members || members.size === 0) return 0;

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    let newCount = 0;

    for (const [, member] of members) {
        if (now - member.user.createdTimestamp < sevenDaysMs) {
            newCount++;
        }
    }

    return newCount / members.size;
}

async function countRecentIncidents(guildId: string): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT 1 FROM fg_risk_events WHERE guildId = ? AND createdAt >= ? LIMIT 100',
        [guildId, sevenDaysAgo],
    );
    return rows.length;
}

function findSuitableAuditLogChannel(guild: Guild): boolean {
    const channels = guild.channels.cache.filter(ch => ch.isTextBased() && 'send' in ch);
    return channels.size > 0;
}

function checkModerationTeam(guild: Guild): boolean {
    const moderators = guild.members.cache.filter(m =>
        m.permissions.has('ModerateMembers') || m.permissions.has('BanMembers') || m.permissions.has('KickMembers'),
    );
    return moderators.size >= 2;
}

/** Safely extract a typed value from a Record<string, unknown> */
function cfg<T>(rec: Record<string, unknown> | undefined, key: string, fallback: T): T {
    if (!rec || !(key in rec)) return fallback;
    return rec[key] as T;
}

function analysisToConfig(analysis: CopilotAnalysis, guild: Guild): CopilotConfig {
    const antiraidRec = analysis.recommendations.find(r => r.system === 'antiraid');
    const nukeguardRec = analysis.recommendations.find(r => r.system === 'nukeguard');
    const trustRec = analysis.recommendations.find(r => r.system === 'trust');
    const auditlogRec = analysis.recommendations.find(r => r.system === 'auditlog');
    const deadhandRec = analysis.recommendations.find(r => r.system === 'deadhand');
    const adaptiveRec = analysis.recommendations.find(r => r.system === 'adaptive');

    // Choose a text channel for audit log
    let auditLogChannelId: string | null = null;
    const textChannels = guild.channels.cache.filter(ch => ch.isTextBased() && 'send' in ch);
    if (textChannels.size > 0) {
        auditLogChannelId = textChannels.first()!.id;
    }

    // Helper to convert boolean to number
    const b = (v: boolean): number => v ? 1 : 0;

    // Build config with proper number types
    const config: CopilotConfig = {
        tolerance: analysis.recommendedTolerance,
        antiraid: {
            enabled: 1,
            joinThreshold: cfg<number>(antiraidRec?.config, 'joinThreshold', FG_ANTIRAID.DEFAULT_JOIN_THRESHOLD),
            windowSeconds: cfg<number>(antiraidRec?.config, 'windowSeconds', FG_ANTIRAID.DEFAULT_WINDOW_SECONDS),
            action: cfg<string>(antiraidRec?.config, 'action', 'lockdown'),
        },
        nukeguard: {
            enabled: 1,
            deleteThreshold: cfg<number>(nukeguardRec?.config, 'deleteThreshold', FG_NUKEGUARD.DEFAULT_DELETE_THRESHOLD),
            banThreshold: cfg<number>(nukeguardRec?.config, 'banThreshold', FG_NUKEGUARD.DEFAULT_BAN_THRESHOLD),
            windowSeconds: cfg<number>(nukeguardRec?.config, 'windowSeconds', FG_NUKEGUARD.DEFAULT_WINDOW_SECONDS),
            action: cfg<string>(nukeguardRec?.config, 'action', 'revoke'),
        },
        trust: {
            enabled: b(trustRec ? cfg<boolean>(trustRec.config, 'enabled', true) : analysis.newMemberRatio > 0.2),
            veteranDays: cfg<number>(trustRec?.config, 'veteranDays', FG_TRUST.DEFAULT_VETERAN_DAYS),
            newAccountDays: cfg<number>(trustRec?.config, 'newAccountDays', FG_TRUST.DEFAULT_NEW_ACCOUNT_DAYS),
        },
        auditlog: {
            enabled: b(auditlogRec !== undefined),
            channelId: auditlogRec ? auditLogChannelId : null,
        },
        deadhand: {
            enabled: b(deadhandRec ? cfg<boolean>(deadhandRec.config, 'enabled', true) : analysis.hasModerationTeam),
            inactivityMinutes: cfg<number>(deadhandRec?.config, 'inactivityMinutes', FG_DEADHAND.DEFAULT_INACTIVITY_MINUTES),
            autoLockdown: b(cfg<boolean>(deadhandRec?.config, 'autoLockdown', true)),
            autoSlowmode: b(cfg<boolean>(deadhandRec?.config, 'autoSlowmode', true)),
            autoBanCritical: b(cfg<boolean>(deadhandRec?.config, 'autoBanCritical', false)),
        },
        adaptive: {
            enabled: b(adaptiveRec !== undefined),
            mode: cfg<'suggest' | 'auto'>(adaptiveRec?.config, 'mode', 'suggest'),
        },
    };

    return config;
}

async function logCopilotAction(guildId: string, action: string, details: string, client: BotClient): Promise<void> {
    await fgProRepo.logCopilotAction(guildId, action, details, true);
    // Try to send to audit log channel, fallback to DM owner
    const embed = createBrandedEmbed()
        .setColor(0x57F287)
        .setTitle('🤖 Copilot Action')
        .setDescription(`**${action}**: ${details}`)
        .setTimestamp();

    const sent = await sendAuditLog(guildId, embed, client).catch(() => false);
    if (!sent) {
        // Try DM owner
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            const owner = await guild.fetchOwner().catch(() => null);
            if (owner) {
                await owner.send({ embeds: [embed] }).catch(() => {});
            }
        }
    }
}

async function sendCopilotSummary(guildId: string, config: CopilotConfig, client: BotClient): Promise<void> {
    const embed = createBrandedEmbed()
        .setColor(0x9B59B6)
        .setTitle('🤖 Copilot Configuration Complete')
        .setDescription('FurGuard Copilot ha configurado automáticamente todos los sistemas de protección.')
        .addFields(
            { name: 'Tolerancia', value: config.tolerance, inline: true },
            { name: 'Anti-Raid', value: config.antiraid.enabled ? '✅' : '❌', inline: true },
            { name: 'NukeGuard', value: config.nukeguard.enabled ? '✅' : '❌', inline: true },
            { name: 'Trust System', value: config.trust.enabled ? '✅' : '❌', inline: true },
            { name: 'Audit Log', value: config.auditlog.enabled ? '✅' : '❌', inline: true },
            { name: 'Dead Hand', value: config.deadhand.enabled ? '✅' : '❌', inline: true },
            { name: 'Adaptive', value: config.adaptive.enabled ? `✅ (${config.adaptive.mode})` : '❌', inline: true },
        )
        .setFooter({ text: 'Puedes ajustar cualquier configuración desde el dashboard.' });

    const sent = await sendAuditLog(guildId, embed, client).catch(() => false);
    if (!sent) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            const owner = await guild.fetchOwner().catch(() => null);
            if (owner) {
                await owner.send({ embeds: [embed] }).catch(() => {});
            }
        }
    }
}