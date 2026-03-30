import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../connection.js';
import { createChildLogger } from '../../lib/logger.js';
import type { UserProfile } from '../../types/index.js';

const log = createChildLogger({ module: 'user-repo' });

export class UserRepository {
    async getProfile(userId: string): Promise<UserProfile | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT user_id AS userId, username,
                    global_commands_used AS globalCommandsUsed,
                    created_at AS createdAt, updated_at AS updatedAt
             FROM user_profiles WHERE user_id = ?`,
            [userId],
        );
        return (rows[0] as UserProfile) ?? null;
    }

    async trackCommandUsage(userId: string, username: string): Promise<void> {
        await pool.query(
            `INSERT INTO user_profiles (user_id, username, global_commands_used)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                global_commands_used = global_commands_used + 1,
                updated_at = NOW()`,
            [userId, username],
        );
        log.debug({ userId }, 'Uso de comando registrado');
    }
}

export const userRepo = new UserRepository();
