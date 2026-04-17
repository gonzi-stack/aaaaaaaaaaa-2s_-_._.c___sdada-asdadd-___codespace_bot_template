/* eslint-disable @typescript-eslint/require-await */
// import Redis from 'ioredis';
import { createChildLogger } from '../lib/logger.js';

const log = createChildLogger({ module: 'cache' });

/**
 * CacheManager con dos capas:
 * - L1: Map en memoria (acceso instantáneo, por proceso)
 * - L2: Redis (compartido entre procesos/shards)
 *
 * Si Redis no está disponible, funciona al 100% con solo L1.
 */
export class CacheManager {
    public redis: unknown = null; // Redis deshabilitado por el momento
    private redisAvailable = false;
    private readonly l1 = new Map<string, { value: string; expiresAt: number }>();
    private readonly l1MaxSize = 10_000;
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    async connect(): Promise<void> {
        /*
        try {
            this.redis = new Redis(config.redis.url, {
                maxRetriesPerRequest: 1,
                retryStrategy: (times) => {
                    if (times > 3) return null;
                    return Math.min(times * 500, 3_000);
                },
                lazyConnect: true,
                enableOfflineQueue: false,
            });

            let errorLogged = false;
            this.redis.on('error', (err) => {
                if (!errorLogged) {
                    log.warn({ err: err.message }, 'Error de conexión con Redis');
                    errorLogged = true;
                }
            });

            this.redis.on('connect', () => {
                this.redisAvailable = true;
                errorLogged = false;
                log.info('Conectado a Redis');
            });

            this.redis.on('close', () => {
                this.redisAvailable = false;
            });

            await this.redis.connect();
            this.redisAvailable = true;
            log.info('CacheManager inicializado con Redis');
        } catch {
            log.warn('Redis no disponible — usando solo caché L1 en memoria');
            this.redisAvailable = false;
            if (this.redis) {
                this.redis.disconnect(false);
                this.redis = null;
            }
        }
        */
        this.redisAvailable = false;
        log.warn('Redis deshabilitado manual — usando solo caché L1 en memoria');

        this.sweepTimer = setInterval(() => this.sweepL1(), 60_000);
    }

    async get(key: string): Promise<string | null> {
        const l1Entry = this.l1.get(key);
        if (l1Entry) {
            if (Date.now() < l1Entry.expiresAt) {
                return l1Entry.value;
            }
            this.l1.delete(key);
        }

        /*
        if (this.redisAvailable && this.redis) {
            try {
                const value = await this.redis.get(key);
                if (value !== null) {
                    this.setL1(key, value, 60);
                }
                return value;
            } catch {
                return null;
            }
        }
        */

        return null;
    }

    async getTTL(key: string): Promise<number> {
        const l1Entry = this.l1.get(key);
        if (l1Entry) {
            if (Date.now() < l1Entry.expiresAt) {
                return Math.ceil((l1Entry.expiresAt - Date.now()) / 1000);
            }
            this.l1.delete(key);
        }

        /*
        if (this.redisAvailable && this.redis) {
            try {
                return await this.redis.ttl(key);
            } catch {
                // Silencioso
            }
        }
        */

        return -1;
    }

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
        this.setL1(key, value, ttlSeconds);
        /*
        if (this.redisAvailable && this.redis) {
            try {
                await this.redis.setex(key, ttlSeconds, value);
            } catch {
                // Silencioso — L1 tiene la data
            }
        }
        */
    }

    async del(key: string): Promise<void> {
        this.l1.delete(key);
        /*
        if (this.redisAvailable && this.redis) {
            try {
                await this.redis.del(key);
            } catch {
                // Silencioso
            }
        }
        */
    }

    async exists(key: string): Promise<boolean> {
        /*
        if (this.redisAvailable && this.redis) {
            try {
                const result = await this.redis.exists(key);
                return result === 1;
            } catch {
                return this.l1.has(key);
            }
        }
        */
        return this.l1.has(key);
    }

    async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        /*
        if (this.redisAvailable && this.redis) {
            try {
                const result = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
                return result === 'OK';
            } catch {
                // Fallback a L1
            }
        }
        */

        const existing = this.l1.get(key);
        if (existing && Date.now() < existing.expiresAt) {
            return false;
        }
        this.setL1(key, value, ttlSeconds);
        return true;
    }

    private setL1(key: string, value: string, ttlSeconds: number): void {
        if (this.l1.size >= this.l1MaxSize) {
            const firstKey = this.l1.keys().next().value;
            if (firstKey !== undefined) {
                this.l1.delete(firstKey);
            }
        }
        this.l1.set(key, {
            value,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }

    private sweepL1(): void {
        const now = Date.now();
        let swept = 0;
        for (const [key, entry] of this.l1) {
            if (now >= entry.expiresAt) {
                this.l1.delete(key);
                swept++;
            }
        }
        if (swept > 0) {
            log.debug({ swept }, 'Limpieza de caché L1 completada');
        }
    }

    async disconnect(): Promise<void> {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
        }
        this.l1.clear();
        /*
        if (this.redis) {
            try {
                await this.redis.quit();
            } catch {
                // Ignorar
            }
        }
        */
        log.info('CacheManager desconectado');
    }
}
