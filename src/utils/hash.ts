import { createHash } from 'node:crypto';

/**
 * Genera un hash SHA-256 de los datos proporcionados.
 * Se utiliza para comparar definiciones de comandos y evitar
 * re-registros innecesarios en la API de Discord.
 */
export function hashData(data: unknown): string {
    const json = JSON.stringify(data, null, 0);
    return createHash('sha256').update(json).digest('hex');
}
