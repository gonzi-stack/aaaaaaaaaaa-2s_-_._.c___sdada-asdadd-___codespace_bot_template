import type { RowDataPacket } from 'mysql2/promise';
import crypto from 'node:crypto';
import { pool } from '../connection.js';
import { CacheKeys } from '../../cache/keys.js';
import { FG_CACHE_TTL } from '../../constants/furguard.js';
import type { CacheManager } from '../../cache/manager.js';

export interface FgBehaviorProfileRow {
    id: string;
    guildId: string;
    userId: string;
    warningCount: number;
    muteCount: number;
    kickCount: number;
    banCount: number;
    lastActionAt: Date | null;
    firstSeenAt: Date;
    updatedAt: Date;
}

export interface FgFullProfile {
    profile: FgBehaviorProfileRow;
    riskScore: number;
}

const ACTION_COLUMN_MAP: Record<string, string> = {
    warn: 'warningCount',
    mute: 'muteCount',
    kick: 'kickCount',
    ban: 'banCount',
};

class FgBehaviorRepository {
    async getProfile(guildId: string, userId: string, cache?: CacheManager): Promise<FgBehaviorProfileRow | null> {
        if (cache) {
            const cached = await cache.get(CacheKeys.fg.behavior(guildId, userId));
            if (cached) return JSON.parse(cached) as FgBehaviorProfileRow;
        }

        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_behavior_profiles WHERE guildId = ? AND userId = ?',
            [guildId, userId],
        );
        const row = (rows[0] as FgBehaviorProfileRow | undefined) ?? null;

        if (row && cache) {
            await cache.set(CacheKeys.fg.behavior(guildId, userId), JSON.stringify(row), FG_CACHE_TTL.BEHAVIOR);
        }

        return row;
    }

    async incrementAction(guildId: string, userId: string, action: string, cache?: CacheManager): Promise<void> {
        const column = ACTION_COLUMN_MAP[action];
        if (!column) return;

        const id = crypto.randomUUID();

        await pool.query(
            `INSERT INTO fg_behavior_profiles (id, guildId, userId, ${column}, lastActionAt)
             VALUES (?, ?, ?, 1, NOW())
             ON DUPLICATE KEY UPDATE
                ${column} = ${column} + 1,
                lastActionAt = NOW(),
                updatedAt = NOW()`,
            [id, guildId, userId],
        );

        if (cache) {
            await cache.del(CacheKeys.fg.behavior(guildId, userId));
        }
    }

    async getFullProfile(guildId: string, userId: string, cache?: CacheManager): Promise<FgFullProfile | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT bp.*, COALESCE(rs.score, 0) AS riskScore
             FROM fg_behavior_profiles bp
             LEFT JOIN fg_risk_scores rs ON rs.guildId = bp.guildId AND rs.userId = bp.userId
             WHERE bp.guildId = ? AND bp.userId = ?`,
            [guildId, userId],
        );

        const row = rows[0] as (FgBehaviorProfileRow & { riskScore: number }) | undefined;
        if (!row) return null;

        const { riskScore, ...profile } = row;
        return { profile, riskScore };
    }

    async ensureProfile(guildId: string, userId: string): Promise<void> {
        const id = crypto.randomUUID();
        await pool.query(
            `INSERT IGNORE INTO fg_behavior_profiles (id, guildId, userId) VALUES (?, ?, ?)`,
            [id, guildId, userId],
        );
    }
}

export const fgBehaviorRepo = new FgBehaviorRepository();
