/**
 * Formatea un número con separadores de miles.
 */
export function formatNumber(n: number): string {
    return new Intl.NumberFormat('es-ES').format(n);
}

/**
 * Formatea un bigint con separadores de miles para mostrar moneda.
 */
export function formatCurrency(n: bigint): string {
    return new Intl.NumberFormat('es-ES').format(n);
}

/**
 * Formatea un bigint de forma abreviada para labels de botones de Discord (máx 80 chars).
 * Ejemplos: 1500 → "1,5K" | 2500000 → "2,5M" | 999999999999 → "1T"
 */
export function formatCurrencyShort(amount: bigint): string {
    const n = Number(amount);

    if (n >= 1_000_000_000_000) {
        return `${(n / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}T`;
    }
    if (n >= 1_000_000_000) {
        return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}B`;
    }
    if (n >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}M`;
    }
    if (n >= 1_000) {
        return `${(n / 1_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}K`;
    }
    return n.toString();
}

/**
 * Formatea una fecha relativa al estilo de Discord (<t:timestamp:R>).
 */
export function formatRelativeTime(date: Date): string {
    const seconds = Math.floor(date.getTime() / 1000);
    return `<t:${seconds}:R>`;
}

/**
 * Formatea una fecha completa al estilo de Discord.
 */
export function formatFullDate(date: Date): string {
    const seconds = Math.floor(date.getTime() / 1000);
    return `<t:${seconds}:F>`;
}

/**
 * Trunca un string a la longitud máxima especificada.
 */
export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return `${str.slice(0, maxLength - 3)}...`;
}

/**
 * Formatea milisegundos a un string legible.
 */
export function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
}

/**
 * Formatea bytes a un string legible (MB/GB).
 */
export function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Formatea milisegundos restantes a un string legible de horas y minutos.
 */
export function formatCooldownRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
}