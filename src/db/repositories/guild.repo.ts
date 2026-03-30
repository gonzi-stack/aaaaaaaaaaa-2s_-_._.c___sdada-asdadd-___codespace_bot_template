import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../connection.js';
import { createChildLogger } from '../../lib/logger.js';
import type { GuildSettings } from '../../types/index.js';

const log = createChildLogger({ module: 'guild-repo' });

export class GuildRepository {
    async getSettings(guildId: string): Promise<GuildSettings | null> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT guild_id AS guildId, prefix, language, features,
                    created_at AS createdAt, updated_at AS updatedAt
             FROM guild_settings WHERE guild_id = ?`,
            [guildId],
        );
        if (rows.length === 0) return null;
        const row = rows[0]!;
        return {
            ...row,
            features: typeof row['features'] === 'string' ? JSON.parse(row['features']) : row['features'],
        } as GuildSettings;
    }

    async getPrefix(guildId: string, defaultPrefix: string): Promise<string> {
        const [rows] = await pool.query<RowDataPacket[]>(
            'SELECT prefix FROM guild_settings WHERE guild_id = ?',
            [guildId],
        );
        return (rows[0]?.['prefix'] as string) ?? defaultPrefix;
    }

    async upsertSettings(guildId: string, prefix: string, language = 'es'): Promise<void> {
        await pool.query(
            `INSERT INTO guild_settings (guild_id, prefix, language)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
                prefix = VALUES(prefix),
                language = VALUES(language),
                updated_at = NOW()`,
            [guildId, prefix, language],
        );
        log.debug({ guildId, prefix }, 'Configuración de servidor actualizada');
    }

    async deleteSettings(guildId: string): Promise<void> {
        await pool.query('DELETE FROM guild_settings WHERE guild_id = ?', [guildId]);
        log.debug({ guildId }, 'Configuración de servidor eliminada');
    }

    async updateFeatures(guildId: string, features: Record<string, boolean>): Promise<void> {
        await pool.query(
            `UPDATE guild_settings SET features = ?, updated_at = NOW() WHERE guild_id = ?`,
            [JSON.stringify(features), guildId],
        );
    }
}

export const guildRepo = new GuildRepository();
