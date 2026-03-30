import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../connection.js';

export class CooldownRepository {
    async getCooldown(userId: string, command: string): Promise<number | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT expiresAt FROM user_cooldowns WHERE userId = ? AND command = ?',
            [userId, command]
        );
        if (rows.length === 0) return null;
        return Number(rows[0]!['expiresAt']);
    }

    async setCooldown(userId: string, command: string, expiresAt: number): Promise<void> {
        await pool.query(
            `INSERT INTO user_cooldowns (userId, command, expiresAt)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE expiresAt = VALUES(expiresAt)`,
            [userId, command, expiresAt]
        );
    }

    async deleteCooldown(userId: string, command: string): Promise<void> {
        await pool.query(
            'DELETE FROM user_cooldowns WHERE userId = ? AND command = ?',
            [userId, command]
        );
    }

    async sweepExpired(): Promise<number> {
        const [result] = await pool.query<any>(
            'DELETE FROM user_cooldowns WHERE expiresAt <= ?',
            [Date.now()]
        );
        return result.affectedRows;
    }
}

export const cooldownRepo = new CooldownRepository();
