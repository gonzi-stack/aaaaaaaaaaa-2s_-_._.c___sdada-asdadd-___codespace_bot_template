import type { ChatInputCommandInteraction } from 'discord.js';
import { fgGuildRepo } from '../db/repositories/fg-guild.repo.js';
import { createWarningEmbed } from './embed-builder.js';
import { createChildLogger } from './logger.js';
import type { CacheManager } from '../cache/manager.js';

const log = createChildLogger({ module: 'fg-pro-guard' });

export async function requirePro(
    guildId: string,
    interaction: ChatInputCommandInteraction,
    cache?: CacheManager,
): Promise<boolean> {
    try {
        const isPro = await fgGuildRepo.isPro(guildId, cache);
        if (isPro) return true;

        const embed = createWarningEmbed(
            'Función PRO',
            '🔒 Esta función requiere **FurGuard Pro**.\n\nContacta al administrador del servidor para activar la suscripción Pro y desbloquear todas las funciones avanzadas de protección.',
        );

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.reply({ embeds: [embed], flags: 64 });
        }

        return false;
    } catch (err) {
        log.error({ err, guildId }, 'Error verificando estado Pro');

        const embed = createWarningEmbed(
            'Error',
            'No se pudo verificar el estado de la suscripción. Inténtalo de nuevo más tarde.',
        );

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], flags: 64 });
            }
        } catch {
            log.error({ guildId }, 'No se pudo responder al usuario en requirePro');
        }

        return false;
    }
}
