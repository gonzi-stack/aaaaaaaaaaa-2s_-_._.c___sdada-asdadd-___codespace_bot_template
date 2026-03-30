import {
    type GuildMember,
    type Message,
    type ChatInputCommandInteraction,
    type PermissionResolvable,
    PermissionsBitField,
} from 'discord.js';
import { createBrandedEmbed } from './embed-builder.js';

/**
 * Verifica si un miembro tiene los permisos requeridos.
 * Funciona tanto para slash commands como prefix commands.
 */
export function checkPermissions(
    member: GuildMember | null,
    permissions: PermissionResolvable[] | undefined,
): { allowed: boolean; missing: string[] } {
    if (!permissions || permissions.length === 0) {
        return { allowed: true, missing: [] };
    }

    if (!member) {
        return { allowed: false, missing: ['No se pudo verificar permisos (ejecutado fuera de un servidor)'] };
    }

    const missing: string[] = [];
    for (const perm of permissions) {
        if (!member.permissions.has(perm)) {
            const permName = typeof perm === 'bigint'
                ? new PermissionsBitField(perm).toArray().join(', ')
                : String(perm);
            missing.push(permName);
        }
    }

    return { allowed: missing.length === 0, missing };
}

/**
 * Responde con un embed de permisos faltantes en un slash command.
 */
export async function replyPermissionError(
    interaction: ChatInputCommandInteraction,
    missing: string[],
): Promise<void> {
    const embed = createBrandedEmbed()
        .setTitle('⛔ Permisos insuficientes')
        .setDescription(`No tienes los permisos necesarios para usar este comando.`)
        .addFields({
            name: 'Permisos faltantes',
            value: missing.map((p) => `\`${p}\``).join(', '),
        })
        .setColor(0xED4245);

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: 64 });
    } else {
        await interaction.reply({ embeds: [embed], flags: 64 });
    }
}

/**
 * Responde con un embed de permisos faltantes en un prefix command.
 */
export async function sendPermissionError(
    message: Message,
    missing: string[],
): Promise<void> {
    const embed = createBrandedEmbed()
        .setTitle('⛔ Permisos insuficientes')
        .setDescription(`No tienes los permisos necesarios para usar este comando.`)
        .addFields({
            name: 'Permisos faltantes',
            value: missing.map((p) => `\`${p}\``).join(', '),
        })
        .setColor(0xED4245);

    const reply = await message.reply({ embeds: [embed] });
    setTimeout(() => {
        reply.delete().catch(() => { });
    }, 10_000);
}
