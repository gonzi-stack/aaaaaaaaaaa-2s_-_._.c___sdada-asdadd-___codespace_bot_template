import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { createChildLogger } from '../lib/logger.js';

const log = createChildLogger({ module: 'database' });

export const pool = mysql.createPool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    connectionLimit: config.database.poolMax,
    waitForConnections: true,
    connectTimeout: 5_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30_000,
});

export async function testConnection(): Promise<boolean> {
    try {
        const conn = await pool.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        log.info('Conexión a MariaDB verificada correctamente');
        return true;
    } catch (err) {
        log.error({ err }, 'No se pudo conectar a MariaDB');
        return false;
    }
}

export async function closePool(): Promise<void> {
    await pool.end();
    log.info('Pool de MariaDB cerrado');
}
