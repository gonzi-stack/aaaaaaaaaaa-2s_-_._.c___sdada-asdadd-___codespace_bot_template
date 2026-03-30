import type { RowDataPacket } from 'mysql2/promise';
import crypto from 'node:crypto';
import { pool } from '../connection.js';
import { CacheKeys } from '../../cache/keys.js';
import { FG_CACHE_TTL } from '../../constants/furguard.js';
import type { CacheManager } from '../../cache/manager.js';

export interface FgCoworkGroupRow {
    id: string;
    name: string;
    ownerId: string;
    createdAt: Date;
}

export interface FgCoworkMemberRow {
    groupId: string;
    guildId: string;
    joinedAt: Date;
}

export interface FgBlacklistRow {
    id: string;
    groupId: string;
    userId: string;
    reason: string;
    addedBy: string;
    addedFromGuild: string;
    createdAt: Date;
}

export interface FgCoworkAlertRow {
    id: string;
    groupId: string;
    sourceGuildId: string;
    userId: string;
    alertType: string;
    details: string;
    resolved: number;
    createdAt: Date;
}

export interface FgCaseRow {
    id: string;
    groupId: string;
    guildId: string;
    targetId: string;
    ownerId: string;
    status: string;
    resolution: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface FgCaseVoteRow {
    caseId: string;
    moderatorId: string;
    guildId: string;
    vote: string;
    votedAt: Date;
}

class FgCoworkRepository {
    async getGroup(guildId: string, cache?: CacheManager): Promise<(FgCoworkGroupRow & { members: FgCoworkMemberRow[] }) | null> {
        if (cache) {
            const cached = await cache.get(CacheKeys.fg.coworkGroup(guildId));
            if (cached) return JSON.parse(cached) as FgCoworkGroupRow & { members: FgCoworkMemberRow[] };
        }

        const [memberRows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_cowork_members WHERE guildId = ?',
            [guildId],
        );
        const membership = memberRows[0] as FgCoworkMemberRow | undefined;
        if (!membership) return null;

        const [groupRows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_cowork_groups WHERE id = ?',
            [membership.groupId],
        );
        const group = groupRows[0] as FgCoworkGroupRow | undefined;
        if (!group) return null;

        const [allMembers] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_cowork_members WHERE groupId = ?',
            [group.id],
        );

        const result = { ...group, members: allMembers as FgCoworkMemberRow[] };

        if (cache) {
            await cache.set(CacheKeys.fg.coworkGroup(guildId), JSON.stringify(result), FG_CACHE_TTL.COWORK_GROUP);
        }

        return result;
    }

    async createGroup(name: string, ownerId: string, guildId: string, cache?: CacheManager): Promise<string> {
        const id = crypto.randomUUID();
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                'INSERT INTO fg_cowork_groups (id, name, ownerId) VALUES (?, ?, ?)',
                [id, name, ownerId],
            );
            await conn.query(
                'INSERT INTO fg_cowork_members (groupId, guildId) VALUES (?, ?)',
                [id, guildId],
            );
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        if (cache) {
            await cache.del(CacheKeys.fg.coworkGroup(guildId));
        }

        return id;
    }

    async addGuild(groupId: string, guildId: string, cache?: CacheManager): Promise<void> {
        await pool.query(
            'INSERT IGNORE INTO fg_cowork_members (groupId, guildId) VALUES (?, ?)',
            [groupId, guildId],
        );
        if (cache) {
            await cache.del(CacheKeys.fg.coworkGroup(guildId));
        }
    }

    async removeGuild(groupId: string, guildId: string, cache?: CacheManager): Promise<void> {
        await pool.query(
            'DELETE FROM fg_cowork_members WHERE groupId = ? AND guildId = ?',
            [groupId, guildId],
        );
        if (cache) {
            await cache.del(CacheKeys.fg.coworkGroup(guildId));
        }
    }

    async isBlacklisted(groupId: string, userId: string, cache?: CacheManager): Promise<boolean> {
        if (cache) {
            const cached = await cache.get(CacheKeys.fg.blacklist(groupId, userId));
            if (cached) return cached === '1';
        }

        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT 1 FROM fg_blacklist WHERE groupId = ? AND userId = ? LIMIT 1',
            [groupId, userId],
        );
        const found = rows.length > 0;

        if (cache) {
            await cache.set(CacheKeys.fg.blacklist(groupId, userId), found ? '1' : '0', FG_CACHE_TTL.BLACKLIST);
        }

        return found;
    }

    async addBlacklist(
        groupId: string,
        userId: string,
        reason: string,
        addedBy: string,
        fromGuild: string,
        cache?: CacheManager,
    ): Promise<string> {
        const id = crypto.randomUUID();
        await pool.query(
            `INSERT INTO fg_blacklist (id, groupId, userId, reason, addedBy, addedFromGuild)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, groupId, userId, reason, addedBy, fromGuild],
        );
        if (cache) {
            await cache.del(CacheKeys.fg.blacklist(groupId, userId));
        }
        return id;
    }

    async removeBlacklist(groupId: string, userId: string, cache?: CacheManager): Promise<void> {
        await pool.query(
            'DELETE FROM fg_blacklist WHERE groupId = ? AND userId = ?',
            [groupId, userId],
        );
        if (cache) {
            await cache.del(CacheKeys.fg.blacklist(groupId, userId));
        }
    }

    async createAlert(data: {
        groupId: string;
        sourceGuildId: string;
        userId: string;
        alertType: string;
        details: string;
    }): Promise<string> {
        const id = crypto.randomUUID();
        await pool.query(
            `INSERT INTO fg_cowork_alerts (id, groupId, sourceGuildId, userId, alertType, details)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, data.groupId, data.sourceGuildId, data.userId, data.alertType, data.details],
        );
        return id;
    }

    async getAlerts(groupId: string, resolved?: boolean): Promise<FgCoworkAlertRow[]> {
        let query = 'SELECT * FROM fg_cowork_alerts WHERE groupId = ?';
        const params: unknown[] = [groupId];

        if (resolved !== undefined) {
            query += ' AND resolved = ?';
            params.push(resolved ? 1 : 0);
        }

        query += ' ORDER BY createdAt DESC LIMIT 10';

        const [rows] = await pool.query<RowDataPacket[]>(query, params);
        return rows as FgCoworkAlertRow[];
    }

    async getGroupById(groupId: string): Promise<FgCoworkGroupRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_cowork_groups WHERE id = ?',
            [groupId],
        );
        return (rows[0] as FgCoworkGroupRow | undefined) ?? null;
    }

    async getGroupMembers(groupId: string): Promise<FgCoworkMemberRow[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_cowork_members WHERE groupId = ?',
            [groupId],
        );
        return rows as FgCoworkMemberRow[];
    }

    async createCase(data: {
        groupId: string;
        guildId: string;
        targetId: string;
        ownerId: string;
    }): Promise<string> {
        const id = crypto.randomUUID();
        await pool.query(
            `INSERT INTO fg_cases (id, groupId, guildId, targetId, ownerId)
             VALUES (?, ?, ?, ?, ?)`,
            [id, data.groupId, data.guildId, data.targetId, data.ownerId],
        );
        return id;
    }

    async getCase(id: string): Promise<FgCaseRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_cases WHERE id = ?',
            [id],
        );
        return (rows[0] as FgCaseRow | undefined) ?? null;
    }

    async updateCaseStatus(id: string, status: string, resolution?: string): Promise<void> {
        await pool.query(
            'UPDATE fg_cases SET status = ?, resolution = ?, updatedAt = NOW() WHERE id = ?',
            [status, resolution ?? null, id],
        );
    }

    async addVote(caseId: string, moderatorId: string, guildId: string, vote: string): Promise<void> {
        await pool.query(
            `INSERT INTO fg_case_votes (caseId, moderatorId, guildId, vote)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE vote = VALUES(vote), votedAt = NOW()`,
            [caseId, moderatorId, guildId, vote],
        );
    }

    async getVotes(caseId: string): Promise<FgCaseVoteRow[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_case_votes WHERE caseId = ?',
            [caseId],
        );
        return rows as FgCaseVoteRow[];
    }
}

export const fgCoworkRepo = new FgCoworkRepository();
