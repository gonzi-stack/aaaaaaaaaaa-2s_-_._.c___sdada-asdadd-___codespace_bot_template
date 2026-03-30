import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../connection.js';
import { CacheKeys } from '../../cache/keys.js';
import { FG_CACHE_TTL, FG_TIER } from '../../constants/furguard.js';
import type { CacheManager } from '../../cache/manager.js';
import type { FgTier, FgTolerance } from '../../constants/furguard.js';

export interface FgGuildRow {
    guildId: string;
    tier: FgTier;
    ownerId: string;
    activatedAt: Date;
    expiresAt: Date | null;
    toleranceLevel: FgTolerance;
    updatedAt: Date;
}

class FgGuildRepository {
    async getGuild(guildId: string, cache?: CacheManager): Promise<FgGuildRow | null> {
        if (cache) {
            const cached = await cache.get(CacheKeys.fg.guild(guildId));
            if (cached) return JSON.parse(cached) as FgGuildRow;
        }

        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_guilds WHERE guildId = ?',
            [guildId],
        );
        const row = (rows[0] as FgGuildRow | undefined) ?? null;

        if (row && cache) {
            await cache.set(CacheKeys.fg.guild(guildId), JSON.stringify(row), FG_CACHE_TTL.GUILD);
        }

        return row;
    }

    async upsertGuild(guildId: string, ownerId: string, cache?: CacheManager): Promise<void> {
        await pool.query(
            `INSERT INTO fg_guilds (guildId, ownerId, tier, toleranceLevel)
             VALUES (?, ?, 'free', 'yellow')
             ON DUPLICATE KEY UPDATE ownerId = VALUES(ownerId)`,
            [guildId, ownerId],
        );

        if (cache) {
            await cache.del(CacheKeys.fg.guild(guildId));
        }
    }

    async setTier(guildId: string, tier: FgTier, expiresAt?: Date, cache?: CacheManager): Promise<void> {
        await pool.query(
            'UPDATE fg_guilds SET tier = ?, expiresAt = ? WHERE guildId = ?',
            [tier, expiresAt ?? null, guildId],
        );

        if (cache) {
            await cache.del(CacheKeys.fg.guild(guildId));
        }
    }

    async isPro(guildId: string, cache?: CacheManager): Promise<boolean> {
        const guild = await this.getGuild(guildId, cache);
        if (!guild) return false;
        if (guild.tier !== FG_TIER.PRO) return false;
        if (guild.expiresAt && new Date(guild.expiresAt) < new Date()) return false;
        return true;
    }

    async setTolerance(guildId: string, level: FgTolerance, cache?: CacheManager): Promise<void> {
        await pool.query(
            'UPDATE fg_guilds SET toleranceLevel = ? WHERE guildId = ?',
            [level, guildId],
        );

        if (cache) {
            await cache.del(CacheKeys.fg.guild(guildId));
        }
    }
}

export const fgGuildRepo = new FgGuildRepository();
