import type { BotClient } from '../bot.js';
import { fgGuildRepo } from '../db/repositories/fg-guild.repo.js';
import { fgProRepo } from '../db/repositories/fg-pro.repo.js';
import { applyCopilotConfig } from './fg-copilot.js';
import { FG_TIER } from '../constants/furguard.js';
import { createChildLogger } from './logger.js';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/connection.js';

const log = createChildLogger({ module: 'fg-copilot-triggers' });

/**
 * Main entry point for Copilot triggers.
 * Called from various event handlers when significant activity occurs.
 */
export async function evaluateCopilotTriggers(
    guildId: string,
    eventType: string,
    data: Record<string, unknown>,
    client: BotClient,
): Promise<void> {
    try {
        const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
        if (!fgGuild || fgGuild.tier !== FG_TIER.PRO) return;

        const copilotConfig = await fgProRepo.getCopilotConfig(guildId);
        if (!copilotConfig || !copilotConfig.enabled) return;

        // Record the event for trend analysis
        await recordTriggerEvent(guildId, eventType, data);

        // Check if we should trigger Copilot analysis
        const shouldTrigger = await shouldTriggerCopilot(guildId, eventType, data, client);
        if (!shouldTrigger) return;

        log.info({ guildId, eventType }, 'Copilot trigger activated');

        // Run Copilot analysis and apply configuration
        await applyCopilotConfig(guildId, client);
        
        // Log the trigger action
        await fgProRepo.logCopilotAction(
            guildId,
            'trigger_analysis',
            `Triggered by ${eventType}: ${JSON.stringify(data)}`,
            true,
        );
    } catch (err) {
        log.error({ err, guildId, eventType }, 'Error evaluating Copilot triggers');
    }
}

/**
 * Record a trigger event for trend analysis
 */
async function recordTriggerEvent(guildId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
    try {
        const id = (await import('node:crypto')).randomUUID();
        await pool.query(
            `INSERT INTO fg_copilot_triggers (id, guildId, eventType, eventData)
             VALUES (?, ?, ?, ?)`,
            [id, guildId, eventType, JSON.stringify(data)],
        );
    } catch (err) {
        log.error({ err, guildId }, 'Error recording trigger event');
    }
}

/**
 * Determine if Copilot should be triggered based on event type and recent activity
 */
async function shouldTriggerCopilot(guildId: string, eventType: string, data: Record<string, unknown>, client: BotClient): Promise<boolean> {
    // Event-specific triggers
    switch (eventType) {
        case 'MEMBER_JOIN_SPIKE':
            return await checkMemberJoinSpike(guildId, data);
        case 'MESSAGE_SPIKE':
            return await checkMessageSpike(guildId, data);
        case 'MODERATION_ACTION_SPIKE':
            return await checkModerationActionSpike(guildId, data);
        case 'CHANNEL_MANIPULATION':
            return await checkChannelManipulation(guildId, data);
        case 'ROLE_MANIPULATION':
            return await checkRoleManipulation(guildId, data);
        case 'AUDIT_LOG_SPIKE':
            return await checkAuditLogSpike(guildId, data);
        case 'RISK_SCORE_SPIKE':
            return await checkRiskScoreSpike(guildId, data);
        case 'SUSTAINED_CALM':
            return await checkSustainedCalm(guildId, data, client);
        default:
            return false;
    }
}

async function getLastCopilotTrigger(guildId: string): Promise<Date | null> {
    try {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT performedAt FROM fg_copilot_logs 
             WHERE guildId = ? AND action = 'trigger_analysis' 
             ORDER BY performedAt DESC LIMIT 1`,
            [guildId],
        );
        return rows[0] ? new Date(rows[0].performedAt as string) : null;
    } catch {
        return null;
    }
}

// ===== Event-specific trigger checks =====

async function checkSustainedCalm(guildId: string, data: Record<string, unknown>, client: BotClient): Promise<boolean> {
    const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
    const FG_TOLERANCE_ORANGE = 'orange'; // Fallback in case of import issues
    const FG_TOLERANCE_RED = 'red';
    
    // Solo permitir desescalado si estamos en alerta naranja o roja
    if (!fgGuild || (fgGuild.toleranceLevel !== FG_TOLERANCE_ORANGE && fgGuild.toleranceLevel !== FG_TOLERANCE_RED)) {
        return false;
    }

    // Comprobar cooldown de 2 horas desde el último trigger de Copilot
    const lastTrigger = await getLastCopilotTrigger(guildId);
    if (lastTrigger && Date.now() - lastTrigger.getTime() < 7200000) {
        return false;
    }
    
    return true;
}

async function checkMemberJoinSpike(guildId: string, data: Record<string, unknown>): Promise<boolean> {
    // Copilot general 1-hour cooldown
    const lastTrigger = await getLastCopilotTrigger(guildId);
    if (lastTrigger && Date.now() - lastTrigger.getTime() < 3600000) return false;
    // Check for rapid member joins (potential raid)
    const joinCount = data.count as number ?? 0;
    const windowMinutes = data.windowMinutes as number ?? 5;
    
    if (joinCount >= 15 && windowMinutes <= 5) {
        return true; // 15+ joins in 5 minutes
    }
    
    // Check recent join trend
    const oneHourAgo = new Date(Date.now() - 3600000);
    const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM fg_antiraid_events 
         WHERE guildId = ? AND triggeredAt >= ?`,
        [guildId, oneHourAgo],
    );
    
    const recentEvents = rows[0]?.count as number ?? 0;
    return recentEvents >= 3; // 3+ anti-raid events in last hour
}

async function checkMessageSpike(guildId: string, data: Record<string, unknown>): Promise<boolean> {
    const lastTrigger = await getLastCopilotTrigger(guildId);
    if (lastTrigger && Date.now() - lastTrigger.getTime() < 3600000) return false;
    // Check for message spikes (potential spam/flood)
    const messageCount = data.count as number ?? 0;
    const windowMinutes = data.windowMinutes as number ?? 5;
    
    // High volume threshold
    if (messageCount >= 200 && windowMinutes <= 5) {
        return true; // 200+ messages in 5 minutes
    }
    
    // Check unique users involved
    const uniqueUsers = data.uniqueUsers as number ?? 0;
    if (messageCount >= 100 && uniqueUsers >= 20 && windowMinutes <= 5) {
        return true; // Many users, many messages
    }
    
    return false;
}

async function checkModerationActionSpike(guildId: string, data: Record<string, unknown>): Promise<boolean> {
    const lastTrigger = await getLastCopilotTrigger(guildId);
    if (lastTrigger && Date.now() - lastTrigger.getTime() < 3600000) return false;
    // Spike in moderation actions (warns, mutes, kicks, bans)
    const actionCount = data.count as number ?? 0;
    const windowMinutes = data.windowMinutes as number ?? 10;
    
    if (actionCount >= 10 && windowMinutes <= 10) {
        return true; // 10+ moderation actions in 10 minutes
    }
    
    return false;
}

async function checkChannelManipulation(guildId: string, data: Record<string, unknown>): Promise<boolean> {
    const lastTrigger = await getLastCopilotTrigger(guildId);
    if (lastTrigger && Date.now() - lastTrigger.getTime() < 3600000) return false;
    // Excessive channel creation/deletion
    const changeCount = data.count as number ?? 0;
    const windowMinutes = data.windowMinutes as number ?? 5;
    
    if (changeCount >= 5 && windowMinutes <= 5) {
        return true; // 5+ channel changes in 5 minutes
    }
    
    return false;
}

async function checkRoleManipulation(guildId: string, data: Record<string, unknown>): Promise<boolean> {
    const lastTrigger = await getLastCopilotTrigger(guildId);
    if (lastTrigger && Date.now() - lastTrigger.getTime() < 3600000) return false;
    // Excessive role creation/deletion/editing
    const changeCount = data.count as number ?? 0;
    const windowMinutes = data.windowMinutes as number ?? 5;
    
    if (changeCount >= 5 && windowMinutes <= 5) {
        return true; // 5+ role changes in 5 minutes
    }
    
    return false;
}

async function checkAuditLogSpike(guildId: string, data: Record<string, unknown>): Promise<boolean> {
    const lastTrigger = await getLastCopilotTrigger(guildId);
    if (lastTrigger && Date.now() - lastTrigger.getTime() < 3600000) return false;
    // Spike in audit log entries (general activity spike)
    const entryCount = data.count as number ?? 0;
    const windowMinutes = data.windowMinutes as number ?? 5;
    
    if (entryCount >= 50 && windowMinutes <= 5) {
        return true; // 50+ audit log entries in 5 minutes
    }
    
    return false;
}

async function checkRiskScoreSpike(guildId: string, data: Record<string, unknown>): Promise<boolean> {
    const lastTrigger = await getLastCopilotTrigger(guildId);
    if (lastTrigger && Date.now() - lastTrigger.getTime() < 3600000) return false;
    // Spike in risk scores across multiple users
    const affectedUsers = data.affectedUsers as number ?? 0;
    const avgRiskIncrease = data.avgRiskIncrease as number ?? 0;
    
    if (affectedUsers >= 5 && avgRiskIncrease >= 100) {
        return true; // 5+ users with 100+ risk increase
    }
    
    return false;
}

// ===== Public trigger functions for event handlers =====

/**
 * Trigger for member join spikes
 */
export async function triggerMemberJoinSpike(
    guildId: string,
    joinCount: number,
    windowMinutes: number,
    client: BotClient,
): Promise<void> {
    await evaluateCopilotTriggers(
        guildId,
        'MEMBER_JOIN_SPIKE',
        { count: joinCount, windowMinutes },
        client,
    );
}

/**
 * Trigger for message spikes
 */
export async function triggerMessageSpike(
    guildId: string,
    messageCount: number,
    uniqueUsers: number,
    windowMinutes: number,
    client: BotClient,
): Promise<void> {
    await evaluateCopilotTriggers(
        guildId,
        'MESSAGE_SPIKE',
        { count: messageCount, uniqueUsers, windowMinutes },
        client,
    );
}

/**
 * Trigger for moderation action spikes
 */
export async function triggerModerationActionSpike(
    guildId: string,
    actionCount: number,
    windowMinutes: number,
    client: BotClient,
): Promise<void> {
    await evaluateCopilotTriggers(
        guildId,
        'MODERATION_ACTION_SPIKE',
        { count: actionCount, windowMinutes },
        client,
    );
}

/**
 * Trigger for channel manipulation
 */
export async function triggerChannelManipulation(
    guildId: string,
    changeCount: number,
    windowMinutes: number,
    client: BotClient,
): Promise<void> {
    await evaluateCopilotTriggers(
        guildId,
        'CHANNEL_MANIPULATION',
        { count: changeCount, windowMinutes },
        client,
    );
}

/**
 * Trigger for role manipulation
 */
export async function triggerRoleManipulation(
    guildId: string,
    changeCount: number,
    windowMinutes: number,
    client: BotClient,
): Promise<void> {
    await evaluateCopilotTriggers(
        guildId,
        'ROLE_MANIPULATION',
        { count: changeCount, windowMinutes },
        client,
    );
}

/**
 * Trigger for audit log spikes
 */
export async function triggerAuditLogSpike(
    guildId: string,
    entryCount: number,
    windowMinutes: number,
    client: BotClient,
): Promise<void> {
    await evaluateCopilotTriggers(
        guildId,
        'AUDIT_LOG_SPIKE',
        { count: entryCount, windowMinutes },
        client,
    );
}

/**
 * Trigger for risk score spikes
 */
export async function triggerRiskScoreSpike(
    guildId: string,
    affectedUsers: number,
    avgRiskIncrease: number,
    client: BotClient,
): Promise<void> {
    await evaluateCopilotTriggers(
        guildId,
        'RISK_SCORE_SPIKE',
        { affectedUsers, avgRiskIncrease },
        client,
    );
}