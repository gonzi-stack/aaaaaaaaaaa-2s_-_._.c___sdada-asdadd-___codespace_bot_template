import type { RowDataPacket } from 'mysql2/promise';
import crypto from 'node:crypto';
import { pool } from '../connection.js';

export interface FgModActionRow {
    id: string;
    guildId: string;
    targetId: string;
    moderatorId: string;
    action: string;
    reason: string;
    duration: number | null;
    expiresAt: Date | null;
    createdAt: Date;
}

export interface FgModActionData {
    guildId: string;
    targetId: string;
    moderatorId: string;
    action: string;
    reason: string;
    duration?: number;
    expiresAt?: Date;
}

class FgModRepository {
    async logAction(data: FgModActionData): Promise<string> {
        const id = crypto.randomUUID();
        await pool.query(
            `INSERT INTO fg_mod_actions (id, guildId, targetId, moderatorId, action, reason, duration, expiresAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                data.guildId,
                data.targetId,
                data.moderatorId,
                data.action,
                data.reason,
                data.duration ?? null,
                data.expiresAt ?? null,
            ],
        );
        return id;
    }

    async getHistory(guildId: string, userId: string, limit: number): Promise<FgModActionRow[]> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT * FROM fg_mod_actions
             WHERE guildId = ? AND targetId = ?
             ORDER BY createdAt DESC LIMIT ?`,
            [guildId, userId, limit],
        );
        return rows as FgModActionRow[];
    }

    async getCase(id: string): Promise<FgModActionRow | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_mod_actions WHERE id = ?',
            [id],
        );
        return (rows[0] as FgModActionRow | undefined) ?? null;
    }
}

export const fgModRepo = new FgModRepository();
