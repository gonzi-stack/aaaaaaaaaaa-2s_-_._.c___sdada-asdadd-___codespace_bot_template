import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './connection.js';
import { createChildLogger } from '../lib/logger.js';

const log = createChildLogger({ module: 'migrations' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runMigrations(): Promise<void> {
    const migrationsDir = join(__dirname, 'migrations');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const [rows] = await pool.query<mysql.RowDataPacket[]>('SELECT filename FROM _migrations ORDER BY id');
    const executedMigrations = new Set((rows as { filename: string }[]).map((r) => r.filename));

    let migrationFiles: string[];
    try {
        migrationFiles = readdirSync(migrationsDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();
    } catch {
        log.warn('Directorio de migraciones no encontrado');
        return;
    }

    let executed = 0;
    for (const file of migrationFiles) {
        if (executedMigrations.has(file)) {
            continue;
        }

        const filePath = join(migrationsDir, file);
        const sql = readFileSync(filePath, 'utf-8');

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
            for (const stmt of statements) {
                await conn.query(stmt);
            }
            await conn.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
            await conn.commit();
            executed++;
            log.info({ file }, `Migración ejecutada: ${file}`);
        } catch (err) {
            await conn.rollback();
            log.error({ err, file }, `Error al ejecutar migración: ${file}`);
            throw err;
        } finally {
            conn.release();
        }
    }

    if (executed > 0) {
        log.info({ count: executed }, `${executed} migración(es) ejecutada(s)`);
    } else {
        log.info('No hay migraciones pendientes');
    }
}

import type mysql from 'mysql2/promise';
