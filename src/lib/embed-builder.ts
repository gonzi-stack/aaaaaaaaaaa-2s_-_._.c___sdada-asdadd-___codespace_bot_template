import { EmbedBuilder } from 'discord.js';

/** Color principal de la marca del bot */
const BRAND_COLOR = 0x5865F2; // Blurple de Discord
const ERROR_COLOR = 0xED4245;
const SUCCESS_COLOR = 0x57F287;
const WARNING_COLOR = 0xFEE75C;

/**
 * Crea un embed con el estilo de marca del bot.
 * Incluye el footer con la marca y timestamp automáticos.
 */
export function createBrandedEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTimestamp()
}

/**
 * Crea un embed de éxito (verde).
 */
export function createSuccessEmbed(title: string, description: string): EmbedBuilder {
    return createBrandedEmbed()
        .setColor(SUCCESS_COLOR)
        .setTitle(`✅ ${title}`)
        .setDescription(description);
}

/**
 * Crea un embed de error (rojo).
 */
export function createErrorEmbed(title: string, description: string): EmbedBuilder {
    return createBrandedEmbed()
        .setColor(ERROR_COLOR)
        .setTitle(`❌ ${title}`)
        .setDescription(description);
}

/**
 * Crea un embed de advertencia (amarillo).
 */
export function createWarningEmbed(title: string, description: string): EmbedBuilder {
    return createBrandedEmbed()
        .setColor(WARNING_COLOR)
        .setTitle(`⚠️ ${title}`)
        .setDescription(description);
}

/**
 * Crea un embed informativo con el color de marca.
 */
export function createInfoEmbed(title: string, description: string): EmbedBuilder {
    return createBrandedEmbed()
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description);
}
