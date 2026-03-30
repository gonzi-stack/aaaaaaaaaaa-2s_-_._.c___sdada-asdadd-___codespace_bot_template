import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type GuildMember,
} from 'discord.js';
import type { BotClient } from '../../bot.js';
import type { SlashCommand } from '../../types/index.js';
import { fgGuildRepo } from '../../db/repositories/fg-guild.repo.js';
import { FG_TIER } from '../../constants/furguard.js';
import { createSuccessEmbed, createErrorEmbed } from '../../lib/embed-builder.js';

const data = new SlashCommandBuilder()
    .setName('activar-pro')
    .setDescription('Activa temporalmente FurGuard Pro en este servidor (Comando de Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o
        .setName('dias')
        .setDescription('Días de duración (por defecto 30)')
        .setRequired(false)
    );

async function execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<void> {
    if (!interaction.guild || !interaction.guildId) {
        await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Este comando solo funciona en servidores.')] });
        return;
    }

    const member = interaction.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas permiso de Administrador para usar esto.')] });
        return;
    }

    const dias = interaction.options.getInteger('dias') ?? 30;
    
    // Calcular fecha de expiración
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + dias);

    try {
        // Asegurarse de que la guild existe primero (por si no hiciero /furguard setup aun)
        await fgGuildRepo.upsertGuild(interaction.guildId, interaction.guild.ownerId, client.cacheManager);
        
        // Activar el modo PRO
        await fgGuildRepo.setTier(interaction.guildId, FG_TIER.PRO, expiresAt, client.cacheManager);

        const embed = createSuccessEmbed(
            'FurGuard Pro Activado',
            `Se ha habilitado **FurGuard Pro** en este servidor.\n\n` +
            `**Expira en:** ${dias} días (<t:${Math.floor(expiresAt.getTime() / 1000)}:R>).`
        );
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Hubo un error al activar FurGuard Pro.')] });
    }
}

const command: SlashCommand = {
    data,
    execute,
    guildOnly: true,
};

export default command;
