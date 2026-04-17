import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../connection.js';

export interface FgAntiraidConfigRow {
    guildId: string;
    enabled: number;
    joinThreshold: number;
    windowSeconds: number;
    action: string;
    updatedAt: Date;
}

export interface FgNukeguardConfigRow {
    guildId: string;
    enabled: number;
    deleteThreshold: number;
    banThreshold: number;
    windowSeconds: number;
    action: string;
    updatedAt: Date;
}

export interface FgTrustConfigRow {
    guildId: string;
    enabled: number;
    veteranDays: number;
    veteranRoleId: string | null;
    newAccountDays: number;
    restrictedRoleId: string | null;
    updatedAt: Date;
}

export interface FgAuditlogConfigRow {
    guildId: string;
    enabled: number;
    channelId: string;
    webhookId: string | null;
    webhookToken: string | null;
    updatedAt: Date;
}

export interface FgDeadhandConfigRow {
    guildId: string;
    enabled: number;
    inactivityMinutes: number;
    autoLockdown: number;
    autoSlowmode: number;
    autoBanCritical: number;
    notifyChannelId: string | null;
    updatedAt: Date;
}

export interface FgAdaptiveConfigRow {
    guildId: string;
    enabled: number;
    mode: string;
    updatedAt: Date;
}

export interface FgCopilotConfigRow {
    guildId: string;
    enabled: number;
    lastAnalyzedAt: Date | null;
    configSnapshot: string | null;
    updatedAt: Date;
}

export interface FgCopilotLogRow {
    id: string;
    guildId: string;
    action: string;
    details: string;
    success: number;
    error: string | null;
    performedAt: Date;
}

class FgProRepository {
    async getAntiraidConfig(guildId: string): Promise<FgAntiraidConfigRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_antiraid_config WHERE guildId = ?',
            [guildId],
        );
        return (rows[0] as FgAntiraidConfigRow | undefined) ?? null;
    }

    async setAntiraidConfig(guildId: string, data: Partial<Omit<FgAntiraidConfigRow, 'guildId' | 'updatedAt'>>): Promise<void> {
        await pool.query(
            `INSERT INTO fg_antiraid_config (guildId, enabled, joinThreshold, windowSeconds, action)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                enabled = COALESCE(VALUES(enabled), enabled),
                joinThreshold = COALESCE(VALUES(joinThreshold), joinThreshold),
                windowSeconds = COALESCE(VALUES(windowSeconds), windowSeconds),
                action = COALESCE(VALUES(action), action),
                updatedAt = NOW()`,
            [
                guildId,
                data.enabled ?? 1,
                data.joinThreshold ?? 10,
                data.windowSeconds ?? 10,
                data.action ?? 'lockdown',
            ],
        );
    }

    async getNukeguardConfig(guildId: string): Promise<FgNukeguardConfigRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_nukeguard_config WHERE guildId = ?',
            [guildId],
        );
        return (rows[0] as FgNukeguardConfigRow | undefined) ?? null;
    }

    async setNukeguardConfig(guildId: string, data: Partial<Omit<FgNukeguardConfigRow, 'guildId' | 'updatedAt'>>): Promise<void> {
        await pool.query(
            `INSERT INTO fg_nukeguard_config (guildId, enabled, deleteThreshold, banThreshold, windowSeconds, action)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                enabled = COALESCE(VALUES(enabled), enabled),
                deleteThreshold = COALESCE(VALUES(deleteThreshold), deleteThreshold),
                banThreshold = COALESCE(VALUES(banThreshold), banThreshold),
                windowSeconds = COALESCE(VALUES(windowSeconds), windowSeconds),
                action = COALESCE(VALUES(action), action),
                updatedAt = NOW()`,
            [
                guildId,
                data.enabled ?? 1,
                data.deleteThreshold ?? 5,
                data.banThreshold ?? 3,
                data.windowSeconds ?? 10,
                data.action ?? 'revoke',
            ],
        );
    }

    async getTrustConfig(guildId: string): Promise<FgTrustConfigRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_trust_config WHERE guildId = ?',
            [guildId],
        );
        return (rows[0] as FgTrustConfigRow | undefined) ?? null;
    }

    async setTrustConfig(guildId: string, data: Partial<Omit<FgTrustConfigRow, 'guildId' | 'updatedAt'>>): Promise<void> {
        await pool.query(
            `INSERT INTO fg_trust_config (guildId, enabled, veteranDays, veteranRoleId, newAccountDays, restrictedRoleId)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                enabled = COALESCE(VALUES(enabled), enabled),
                veteranDays = COALESCE(VALUES(veteranDays), veteranDays),
                veteranRoleId = VALUES(veteranRoleId),
                newAccountDays = COALESCE(VALUES(newAccountDays), newAccountDays),
                restrictedRoleId = VALUES(restrictedRoleId),
                updatedAt = NOW()`,
            [
                guildId,
                data.enabled ?? 1,
                data.veteranDays ?? 30,
                data.veteranRoleId ?? null,
                data.newAccountDays ?? 7,
                data.restrictedRoleId ?? null,
            ],
        );
    }

    async getAuditlogConfig(guildId: string): Promise<FgAuditlogConfigRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_auditlog_config WHERE guildId = ?',
            [guildId],
        );
        return (rows[0] as FgAuditlogConfigRow | undefined) ?? null;
    }

    async setAuditlogConfig(guildId: string, data: Partial<Omit<FgAuditlogConfigRow, 'guildId' | 'updatedAt'>>): Promise<void> {
        await pool.query(
            `INSERT INTO fg_auditlog_config (guildId, enabled, channelId, webhookId, webhookToken)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                enabled = COALESCE(VALUES(enabled), enabled),
                channelId = COALESCE(VALUES(channelId), channelId),
                webhookId = VALUES(webhookId),
                webhookToken = VALUES(webhookToken),
                updatedAt = NOW()`,
            [
                guildId,
                data.enabled ?? 1,
                data.channelId ?? '',
                data.webhookId ?? null,
                data.webhookToken ?? null,
            ],
        );
    }

    async getDeadhandConfig(guildId: string): Promise<FgDeadhandConfigRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_deadhand_config WHERE guildId = ?',
            [guildId],
        );
        return (rows[0] as FgDeadhandConfigRow | undefined) ?? null;
    }

    async setDeadhandConfig(guildId: string, data: Partial<Omit<FgDeadhandConfigRow, 'guildId' | 'updatedAt'>>): Promise<void> {
        await pool.query(
            `INSERT INTO fg_deadhand_config (guildId, enabled, inactivityMinutes, autoLockdown, autoSlowmode, autoBanCritical, notifyChannelId)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                enabled = COALESCE(VALUES(enabled), enabled),
                inactivityMinutes = COALESCE(VALUES(inactivityMinutes), inactivityMinutes),
                autoLockdown = COALESCE(VALUES(autoLockdown), autoLockdown),
                autoSlowmode = COALESCE(VALUES(autoSlowmode), autoSlowmode),
                autoBanCritical = COALESCE(VALUES(autoBanCritical), autoBanCritical),
                notifyChannelId = VALUES(notifyChannelId),
                updatedAt = NOW()`,
            [
                guildId,
                data.enabled ?? 1,
                data.inactivityMinutes ?? 30,
                data.autoLockdown ?? 1,
                data.autoSlowmode ?? 1,
                data.autoBanCritical ?? 0,
                data.notifyChannelId ?? null,
            ],
        );
    }

    async getAdaptiveConfig(guildId: string): Promise<FgAdaptiveConfigRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_adaptive_config WHERE guildId = ?',
            [guildId],
        );
        return (rows[0] as FgAdaptiveConfigRow | undefined) ?? null;
    }

    async setAdaptiveConfig(guildId: string, data: Partial<Omit<FgAdaptiveConfigRow, 'guildId' | 'updatedAt'>>): Promise<void> {
        await pool.query(
            `INSERT INTO fg_adaptive_config (guildId, enabled, mode)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                enabled = COALESCE(VALUES(enabled), enabled),
                mode = COALESCE(VALUES(mode), mode),
                updatedAt = NOW()`,
            [
                guildId,
                data.enabled ?? 1,
                data.mode ?? 'suggest',
            ],
        );
    }

    async createAntiraidEvent(guildId: string, joinCount: number, actionTaken: string): Promise<string> {
        const id = (await import('node:crypto')).randomUUID();
        await pool.query(
            'INSERT INTO fg_antiraid_events (id, guildId, joinCount, actionTaken) VALUES (?, ?, ?, ?)',
            [id, guildId, joinCount, actionTaken],
        );
        return id;
    }

    async getLastRaidEvent(guildId: string): Promise<RowDataPacket | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_antiraid_events WHERE guildId = ? ORDER BY triggeredAt DESC LIMIT 1',
            [guildId],
        );
        return rows[0] ?? null;
    }

    async getHeatmapPoints(guildId: string, userId: string, limit: number): Promise<RowDataPacket[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM fg_heatmap_points
             WHERE guildId = ? AND userId = ?
             ORDER BY recordedAt DESC LIMIT ?`,
            [guildId, userId, limit],
        );
        return rows;
    }

    async insertHeatmapPoint(data: {
        guildId: string;
        userId: string;
        channelId: string;
        interactedWith?: string;
        riskDelta: number;
    }): Promise<void> {
        const id = (await import('node:crypto')).randomUUID();
        await pool.query(
            `INSERT INTO fg_heatmap_points (id, guildId, userId, channelId, interactedWith, riskDelta)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, data.guildId, data.userId, data.channelId, data.interactedWith ?? null, data.riskDelta],
        );
    }

    async getCopilotConfig(guildId: string): Promise<FgCopilotConfigRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_copilot_config WHERE guildId = ?',
            [guildId],
        );
        return (rows[0] as FgCopilotConfigRow | undefined) ?? null;
    }

    async setCopilotConfig(guildId: string, data: Partial<Omit<FgCopilotConfigRow, 'guildId' | 'updatedAt'>>): Promise<void> {
        await pool.query(
            `INSERT INTO fg_copilot_config (guildId, enabled, lastAnalyzedAt, configSnapshot)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                enabled = COALESCE(VALUES(enabled), enabled),
                lastAnalyzedAt = VALUES(lastAnalyzedAt),
                configSnapshot = VALUES(configSnapshot),
                updatedAt = NOW()`,
            [
                guildId,
                data.enabled ?? 1,
                data.lastAnalyzedAt ?? null,
                data.configSnapshot ?? null,
            ],
        );
    }

    async logCopilotAction(guildId: string, action: string, details: string, success: boolean, error?: string): Promise<void> {
        const id = (await import('node:crypto')).randomUUID();
        await pool.query(
            `INSERT INTO fg_copilot_logs (id, guildId, action, details, success, error)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, guildId, action, details, success ? 1 : 0, error ?? null],
        );
    }
}

export const fgProRepo = new FgProRepository();
