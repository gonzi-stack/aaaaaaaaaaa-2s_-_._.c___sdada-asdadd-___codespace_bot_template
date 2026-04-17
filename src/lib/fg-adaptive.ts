import { fgProRepo } from '../db/repositories/fg-pro.repo.js';
import { fgGuildRepo } from '../db/repositories/fg-guild.repo.js';
import { CacheKeys } from '../cache/keys.js';
import { FG_ADAPTIVE, FG_TOLERANCE } from '../constants/furguard.js';
import type { FgTolerance } from '../constants/furguard.js';
import { createBrandedEmbed } from './embed-builder.js';
import { sendAuditLog } from './fg-audit.js';
import { evaluateCopilotTriggers } from './fg-copilot-triggers.js';
import { createChildLogger } from './logger.js';
import type { BotClient } from '../bot.js';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/connection.js';

const log = createChildLogger({ module: 'fg-adaptive' });

export interface ActivityMetrics {
    messageCount: number;
    uniqueUsers: number;
    avgMessagesPerUser: number;
    intensityRatio: number; // messageCount / uniqueUsers (o 0 si uniqueUsers = 0)
}

/**
 * Analyze recent activity in a guild and adjust tolerance if needed.
 * Only works for PRO guilds with adaptive moderation enabled.
 */
export async function analyzeActivity(guildId: string, client: BotClient): Promise<void> {
    try {
        const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
        if (!fgGuild) {
            log.debug({ guildId }, 'Guild not found in FurGuard');
            return;
        }
        if (fgGuild.tier !== 'pro') {
            log.debug({ guildId, tier: fgGuild.tier }, 'Guild is not PRO tier');
            return;
        }

        const adaptiveConfig = await fgProRepo.getAdaptiveConfig(guildId);
        if (!adaptiveConfig) {
            log.debug({ guildId }, 'No adaptive config found');
            return;
        }
        if (!adaptiveConfig.enabled) {
            log.debug({ guildId }, 'Adaptive moderation disabled');
            return;
        }

        const metrics = await getRecentActivityMetrics(guildId, client);
        log.debug({ guildId, metrics }, 'Activity metrics retrieved');

        // Trigger Copilot if activity is extremely high
        if (metrics.messageCount > 300 || metrics.intensityRatio > 10) {
            await evaluateCopilotTriggers(
                guildId,
                'MESSAGE_SPIKE',
                { 
                    count: metrics.messageCount, 
                    uniqueUsers: metrics.uniqueUsers,
                    windowMinutes: FG_ADAPTIVE.ACTIVITY_WINDOW_MS / 60000,
                    intensityRatio: metrics.intensityRatio,
                },
                client,
            );
        }

        // Sustained calm: trigger Copilot re-analysis to potentially lower all thresholds
        if (metrics.messageCount === 0 && metrics.uniqueUsers === 0) {
            await evaluateCopilotTriggers(
                guildId,
                'SUSTAINED_CALM',
                { windowMinutes: FG_ADAPTIVE.ACTIVITY_WINDOW_MS / 60000 },
                client,
            );
        }

        const suggestion = evaluateActivity(metrics, fgGuild.toleranceLevel);
        if (!suggestion) {
            log.debug({ guildId, currentTolerance: fgGuild.toleranceLevel }, 'No adaptive suggestion needed');
            return;
        }

        log.info({ guildId, metrics, suggestion, mode: adaptiveConfig.mode }, 'Adaptive moderation suggestion');

        if (adaptiveConfig.mode === 'auto') {
            await applyAdaptiveAction(guildId, suggestion, client);
        } else {
            await sendAdaptiveSuggestion(guildId, suggestion, client);
        }
    } catch (err) {
        log.error({ err, guildId }, 'Error analyzing activity for adaptive moderation');
    }
}

async function getRecentActivityMetrics(guildId: string, client: BotClient): Promise<ActivityMetrics> {
    const key = CacheKeys.fg.copilotMessageCount(guildId);
    let data: { t: number; u: string }[] = [];
    
    try {
        const raw = await client.cacheManager.get(key);
        if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && 't' in parsed[0]) {
                data = parsed as { t: number; u: string }[];
            }
        }
    } catch {
        // ignore parsing errors
    }

    const windowMs = FG_ADAPTIVE.ACTIVITY_WINDOW_MS;
    const now = Date.now();
    data = data.filter(item => now - item.t < windowMs);

    const messageCount = data.length;
    const uniqueUsers = new Set(data.map(d => d.u)).size;
    const avgMessagesPerUser = uniqueUsers > 0 ? messageCount / uniqueUsers : 0;
    const intensityRatio = avgMessagesPerUser;

    return { messageCount, uniqueUsers, avgMessagesPerUser, intensityRatio };
}

function evaluateActivity(
    metrics: ActivityMetrics,
    currentTolerance: FgTolerance,
): { action: 'increase_tolerance' | 'decrease_tolerance' | 'suggest_config'; reason: string } | null {
    // ESCALATE CONDITIONS
    if (
        (metrics.intensityRatio > FG_ADAPTIVE.INTENSITY_RATIO && metrics.uniqueUsers >= 2) ||
        (metrics.messageCount > FG_ADAPTIVE.MESSAGE_THRESHOLD && metrics.uniqueUsers > FG_ADAPTIVE.UNIQUE_USERS_THRESHOLD)
    ) {
        if (currentTolerance !== FG_TOLERANCE.RED) {
            return {
                action: 'increase_tolerance',
                reason: `Alto volumen o intensidad de actividad detectada en los últimos ${FG_ADAPTIVE.ACTIVITY_WINDOW_MS / 60000} minutos.`,
            };
        }
    }

    // DE-ESCALATE CONDITIONS
    if (
        metrics.intensityRatio < (FG_ADAPTIVE.INTENSITY_RATIO * 0.4) &&
        metrics.messageCount < (FG_ADAPTIVE.MESSAGE_THRESHOLD * 0.3)
    ) {
        if (currentTolerance !== FG_TOLERANCE.GREEN) {
            return {
                action: 'decrease_tolerance',
                reason: `Baja actividad sostenida en los últimos ${FG_ADAPTIVE.ACTIVITY_WINDOW_MS / 60000} minutos.`,
            };
        }
    }

    return null;
}

async function applyAdaptiveAction(
    guildId: string,
    suggestion: { action: 'increase_tolerance' | 'decrease_tolerance' | 'suggest_config'; reason: string },
    client: BotClient,
): Promise<void> {
    try {
        const cooldownKey = CacheKeys.fg.adaptiveCooldown(guildId);
        if (await client.cacheManager.exists(cooldownKey)) {
            log.debug({ guildId }, 'Adaptive tolerance adjustment in cooldown');
            return;
        }

        const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
        if (!fgGuild) return;

        const toleranceOrder = { green: 0, yellow: 1, orange: 2, red: 3 };
        let newTolerance: FgTolerance = fgGuild.toleranceLevel;

        if (suggestion.action === 'increase_tolerance') {
            const order = toleranceOrder[fgGuild.toleranceLevel];
            if (order < 3) {
                const next = (['green', 'yellow', 'orange', 'red'] as const)[order + 1] as FgTolerance;
                newTolerance = next;
            }
        } else if (suggestion.action === 'decrease_tolerance') {
            const order = toleranceOrder[fgGuild.toleranceLevel];
            if (order > 0) {
                const prev = (['green', 'yellow', 'orange', 'red'] as const)[order - 1] as FgTolerance;
                newTolerance = prev;
            }
        }

        if (newTolerance !== fgGuild.toleranceLevel) {
            await fgGuildRepo.setTolerance(guildId, newTolerance, client.cacheManager);
            log.info({ guildId, old: fgGuild.toleranceLevel, new: newTolerance }, 'Tolerance adjusted by adaptive moderation');

            // 15 minutes for escalation, 30 minutes for de-escalation
            const cooldownSeconds = suggestion.action === 'increase_tolerance' ? 15 * 60 : 30 * 60;
            await client.cacheManager.set(cooldownKey, '1', cooldownSeconds);

            const embed = createBrandedEmbed()
                .setColor(0x57F287)
                .setTitle('🔄 Moderación Adaptativa')
                .setDescription(`El nivel de tolerancia se ha ajustado automáticamente a **${newTolerance}**.`)
                .addFields({ name: 'Razón', value: suggestion.reason })
                .setFooter({ text: 'Sistema FurGuard Adaptive Moderation' });

            await sendAuditLog(guildId, embed, client);
        }
    } catch (err) {
        log.error({ err, guildId }, 'Error applying adaptive action');
    }
}

async function sendAdaptiveSuggestion(
    guildId: string,
    suggestion: { action: 'increase_tolerance' | 'decrease_tolerance' | 'suggest_config'; reason: string },
    client: BotClient,
): Promise<void> {
    try {
        const embed = createBrandedEmbed()
            .setColor(0xFEE75C)
            .setTitle('💡 Sugerencia de Moderación Adaptativa')
            .setDescription(`El sistema sugiere **${suggestion.action === 'increase_tolerance' ? 'aumentar' : 'reducir'}** el nivel de tolerancia del servidor.`)
            .addFields({ name: 'Razón', value: suggestion.reason })
            .setFooter({ text: 'Puedes cambiar a modo "auto" para aplicar automáticamente' });

        await sendAuditLog(guildId, embed, client);
    } catch (err) {
        log.error({ err, guildId }, 'Error sending adaptive suggestion');
    }
}

/**
 * Job entry point: run adaptive moderation analysis for all PRO guilds with adaptive enabled.
 */
export async function runAdaptiveModerationJob(client: BotClient): Promise<void> {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT g.guildId FROM fg_guilds g
             INNER JOIN fg_adaptive_config a ON g.guildId = a.guildId
             WHERE g.tier = 'pro' AND a.enabled = 1`,
        );

        const guilds = rows as Array<{ guildId: string }>;
        log.info({ count: guilds.length }, 'Adaptive moderation job starting');

        for (const row of guilds) {
            log.debug({ guildId: row.guildId }, 'Analyzing guild for adaptive moderation');
            await analyzeActivity(row.guildId, client);
            // Small delay to avoid overwhelming DB
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        log.info({ count: guilds.length }, 'Adaptive moderation job completed');
    } catch (err) {
        log.error({ err }, 'Error in adaptive moderation job');
    }
}