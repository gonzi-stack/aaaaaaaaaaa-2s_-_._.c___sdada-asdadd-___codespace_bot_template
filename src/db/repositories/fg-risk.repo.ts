import type { RowDataPacket } from 'mysql2/promise';
import crypto from 'node:crypto';
import { pool } from '../connection.js';
import { CacheKeys } from '../../cache/keys.js';
import { FG_RISK, FG_CACHE_TTL } from '../../constants/furguard.js';
import type { CacheManager } from '../../cache/manager.js';

export interface FgRiskScoreRow {
    id: string;
    guildId: string;
    userId: string;
    score: number;
    lastDecayAt: Date;
    updatedAt: Date;
}

export interface FgRiskEventRow {
    id: string;
    guildId: string;
    userId: string;
    delta: number;
    reason: string;
    triggeredBy: string | null;
    createdAt: Date;
}

class FgRiskRepository {
    async getScore(guildId: string, userId: string, cache?: CacheManager): Promise<FgRiskScoreRow | null> {
        if (cache) {
            const cached = await cache.get(CacheKeys.fg.risk(guildId, userId));
            if (cached) return JSON.parse(cached) as FgRiskScoreRow;
        }

        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_risk_scores WHERE guildId = ? AND userId = ?',
            [guildId, userId],
        );
        const row = (rows[0] as FgRiskScoreRow | undefined) ?? null;

        if (row && cache) {
            await cache.set(CacheKeys.fg.risk(guildId, userId), JSON.stringify(row), FG_CACHE_TTL.RISK_SCORE);
        }

        return row;
    }

    async addDelta(
        guildId: string,
        userId: string,
        delta: number,
        reason: string,
        triggeredBy?: string,
        cache?: CacheManager,
    ): Promise<number> {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [existing] = await conn.query<RowDataPacket[]>(
                'SELECT id, score FROM fg_risk_scores WHERE guildId = ? AND userId = ? FOR UPDATE',
                [guildId, userId],
            );

            let newScore: number;
            const existingRow = existing[0] as { id: string; score: number } | undefined;

            if (existingRow) {
                newScore = Math.max(0, Math.min(FG_RISK.SCORE_MAX, existingRow.score + delta));
                await conn.query(
                    'UPDATE fg_risk_scores SET score = ?, updatedAt = NOW() WHERE id = ?',
                    [newScore, existingRow.id],
                );
            } else {
                newScore = Math.max(0, Math.min(FG_RISK.SCORE_MAX, delta));
                const id = crypto.randomUUID();
                await conn.query(
                    'INSERT INTO fg_risk_scores (id, guildId, userId, score) VALUES (?, ?, ?, ?)',
                    [id, guildId, userId, newScore],
                );
            }

            const eventId = crypto.randomUUID();
            await conn.query(
                'INSERT INTO fg_risk_events (id, guildId, userId, delta, reason, triggeredBy) VALUES (?, ?, ?, ?, ?, ?)',
                [eventId, guildId, userId, delta, reason, triggeredBy ?? null],
            );

            await conn.commit();

            if (cache) {
                await cache.del(CacheKeys.fg.risk(guildId, userId));
            }

            return newScore;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    async applyDecay(guildId: string, userId: string, cache?: CacheManager): Promise<number> {
        const row = await this.getScore(guildId, userId);
        if (!row) return 0;

        const now = Date.now();
        const lastDecay = new Date(row.lastDecayAt).getTime();
        const elapsed = now - lastDecay;
        const intervals = Math.floor(elapsed / (FG_RISK.DECAY_INTERVAL_HOURS * 3600_000));

        if (intervals <= 0) return row.score;

        const totalDecay = intervals * FG_RISK.DECAY_AMOUNT;
        const newScore = Math.max(0, row.score - totalDecay);

        await pool.query(
            'UPDATE fg_risk_scores SET score = ?, lastDecayAt = NOW(), updatedAt = NOW() WHERE id = ?',
            [newScore, row.id],
        );

        if (cache) {
            await cache.del(CacheKeys.fg.risk(guildId, userId));
        }

        return newScore;
    }

    async getRiskEvents(guildId: string, userId: string, limit: number): Promise<FgRiskEventRow[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_risk_events WHERE guildId = ? AND userId = ? ORDER BY createdAt DESC LIMIT ?',
            [guildId, userId, limit],
        );
        return rows as FgRiskEventRow[];
    }

    async getAllStaleScores(): Promise<FgRiskScoreRow[]> {
        const threshold = new Date(Date.now() - FG_RISK.DECAY_INTERVAL_HOURS * 3600_000);
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_risk_scores WHERE score > 0 AND lastDecayAt < ?',
            [threshold],
        );
        return rows as FgRiskScoreRow[];
    }
}

export const fgRiskRepo = new FgRiskRepository();
