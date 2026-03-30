import type { CacheManager } from '../cache/manager.js';
import { CacheKeys } from '../cache/keys.js';
import { cooldownRepo } from '../db/repositories/cooldown.repo.js';
import { createChildLogger } from './logger.js';

const log = createChildLogger({ module: 'cooldown' });

/**
 * Gestor de cooldowns respaldado por Redis con fallback en memoria.
 */
export class CooldownManager {
    private readonly localCooldowns = new Map<string, number>();

    constructor(private readonly cache: CacheManager) { }

    /**
     * Verifica si un usuario está en cooldown para un comando (DB First).
     * Retorna los segundos restantes, o 0 si no hay cooldown activo.
     */
    async checkCooldown(userId: string, commandName: string, cooldownSeconds: number): Promise<number> {
        if (cooldownSeconds <= 0) return 0;

        // DB Primer
        try {
            const dbCooldown = await cooldownRepo.getCooldown(userId, commandName);
            if (dbCooldown) {
                const now = Date.now();
                if (now < dbCooldown) {
                    return Math.ceil((dbCooldown - now) / 1000);
                } else {
                    // Ya expiró, limpiar en DB en background
                    cooldownRepo.deleteCooldown(userId, commandName).catch(() => {});
                }
            }
        } catch (err) {
            log.error({ err, userId, commandName }, 'Error leyendo cooldown de BD, cayendo a cache');
        }

        const key = CacheKeys.cooldown(userId, commandName);

        // Fallback L1/Redis
        const ttl = await this.cache.getTTL(key);
        if (ttl > 0) return ttl;

        // Fallback manual mem
        const localKey = `${userId}:${commandName}`;
        const expiresAt = this.localCooldowns.get(localKey);
        if (expiresAt && Date.now() < expiresAt) {
            return Math.ceil((expiresAt - Date.now()) / 1000);
        }

        // Si no hay cooldown, lo establecemos ahora
        await this.setCooldown(userId, commandName, cooldownSeconds);
        return 0;
    }

    /**
     * Establece un cooldown manualmente.
     */
    async setCooldown(userId: string, commandName: string, seconds: number): Promise<void> {
        // En BD
        try {
            const expiresAt = Date.now() + seconds * 1000;
            await cooldownRepo.setCooldown(userId, commandName, expiresAt);
        } catch (err) {
            log.error({ err, userId, commandName }, 'Error guardando cooldown en BD');
        }

        // En Caches
        const key = CacheKeys.cooldown(userId, commandName);
        await this.cache.set(key, '1', seconds);

        const localKey = `${userId}:${commandName}`;
        this.localCooldowns.set(localKey, Date.now() + seconds * 1000);

        log.debug({ userId, commandName, seconds }, 'Cooldown establecido');
    }

    /**
     * Limpia los cooldowns locales expirados.
     */
    sweepLocal(): void {
        const now = Date.now();
        for (const [key, expiresAt] of this.localCooldowns) {
            if (now >= expiresAt) {
                this.localCooldowns.delete(key);
            }
        }
    }
}
