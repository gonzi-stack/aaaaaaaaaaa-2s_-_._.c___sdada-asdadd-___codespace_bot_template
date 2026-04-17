import 'dotenv/config';
import type { Config } from './types/index.js';

function env(key: string, fallback?: string): string {
    const value = process.env[key] ?? fallback;
    if (value === undefined) {
        throw new Error(`Variable de entorno requerida no definida: ${key}`);
    }
    return value;
}

function envInt(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
        throw new Error(`Variable de entorno ${key} debe ser un número, recibido: ${raw}`);
    }
    return parsed;
}

export const config = Object.freeze({
    token: env('DISCORD_TOKEN'),
    clientId: env('DISCORD_CLIENT_ID'),
    devGuildId: process.env['DISCORD_DEV_GUILD_ID'] || undefined,
    defaultPrefix: env('DEFAULT_PREFIX', '!'),

    database: Object.freeze({
        host: env('DB_HOST', 'localhost'),
        port: envInt('DB_PORT', 3306),
        user: env('DB_USER', 'discordbot'),
        password: env('DB_PASSWORD', ''),
        database: env('DB_NAME', 'discordbot'),
        poolMax: envInt('DB_POOL_MAX', 20),
    }),

    redis: Object.freeze({
        url: env('REDIS_URL', 'redis://localhost:6379'),
    }),

    nodeEnv: process.env['NODE_ENV'] === 'production' ? 'production' : 'development',
    apiHost: env('API_HOST', '0.0.0.0'),
    apiPort: envInt('API_PORT', envInt('HEALTH_PORT', 25569)),
    apiAllowedIps: env('API_ALLOWED_IPS', '').split(',').map((ip) => ip.trim()).filter(Boolean),
    logLevel: env('LOG_LEVEL', 'info'),
}) satisfies Config;
