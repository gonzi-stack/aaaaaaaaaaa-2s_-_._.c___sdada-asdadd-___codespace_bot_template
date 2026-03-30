import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type TextChannel,
} from 'discord.js';
import type { BotClient } from '../../bot.js';
import type { SlashCommand } from '../../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../../lib/embed-builder.js';

const data = new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Elimina una cantidad de mensajes en este canal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o
        .setName('cantidad')
        .setDescription('Cantidad de mensajes a eliminar (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    );

async function execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<void> {
    if (!interaction.guild || !interaction.channel) {
        await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Debe usarse en un canal de servidor.')] });
        return;
    }

    const cantidad = interaction.options.getInteger('cantidad', true);

    // SISTEMA ANTI-ABUSO PARA COMANDOS DESTRUTIVOS (Simulador NukeGuard)
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const cacheKey = `fg:clear_spam:${guildId}:${userId}`;
    const rawCache = await client.cacheManager.get(cacheKey);
    const uses: number[] = rawCache ? JSON.parse(rawCache) : [];
    const now = Date.now();
    
    // Contar cuántas veces usó el bot en los últimos 30 segundos
    const recentUses = uses.filter(t => now - t < 30_000);
    recentUses.push(now);
    await client.cacheManager.set(cacheKey, JSON.stringify(recentUses), 60);

    // Si abusa ejecutando /clear 3 o más veces en menos de 30 segundos...
    if (recentUses.length >= 3) {
        // Enviar al motor de riesgo para que le meta un castigo (Mute o Ban dependiendo de los Thresholds)
        const { fgRiskRepo } = await import('../../db/repositories/fg-risk.repo.js');
        const { fgGuildRepo } = await import('../../db/repositories/fg-guild.repo.js');
        const { evaluateAndAct } = await import('../../lib/fg-risk-engine.js');
        
        await interaction.editReply({ 
            embeds: [createErrorEmbed('🚨 NukeGuard Activo', 'Has usado `/clear` masivamente de forma sospechosa. Tu puntuación de riesgo ha sido elevada drásticamente.')] 
        });

        const evalScore = await fgRiskRepo.addDelta(guildId, userId, 600, 'Sospecha de sabotaje: Spam masivo del comando /clear', client.user.id, client.cacheManager);
        
        const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
        if (fgGuild && interaction.guild) {
            await evaluateAndAct(guildId, userId, evalScore, fgGuild.toleranceLevel, interaction.guild);
        }

        // Emitir Señal de Alarma hacia todos los servidores aliados (Cowork)
        const { fgCoworkRepo } = await import('../../db/repositories/fg-cowork.repo.js');
        const { broadcastAlert } = await import('../../lib/fg-cowork-broadcast.js');
        const { createBrandedEmbed } = await import('../../lib/embed-builder.js');
        
        const group = await fgCoworkRepo.getGroup(guildId, client.cacheManager);
        if (group && interaction.guild) {
            const alertEmbed = createBrandedEmbed()
                .setColor(0xFF0000)
                .setTitle('🚨 Alerta Cowork: NukeGuard Local')
                .setDescription(`Un moderador en **${interaction.guild.name}** (<@${userId}>) fue neutralizado por abusar reiteradamente de su comando de borrado masivo.\n\n*Nota: Esto fue detectado por el analizador semántico de comandos FurGuard.*`);
            
            await fgCoworkRepo.createAlert({
                groupId: group.id,
                sourceGuildId: guildId,
                userId: userId,
                alertType: 'nukeguard',
                details: 'Sabotaje mitigado: Borrado de mensajes compulsivo (comando /clear)'
            });

            await broadcastAlert(group.id, alertEmbed, client);
        }
        
        return;
    }
    
    try {
        const channel = interaction.channel as TextChannel;
        // Obtener solo mensajes anteriores al comando ejecutado, para no aplastar el mensaje temporal (deferred)
        const fetched = await channel.messages.fetch({ limit: cantidad, before: interaction.id });
        const deleted = await channel.bulkDelete(fetched, true);
        
        try {
            await interaction.editReply({ 
                embeds: [createSuccessEmbed('Limpieza', `Se han eliminado **${deleted.size}** mensajes.`)] 
            });

            // Opcional: Borrar el mensaje de éxito después de unos segundos
            setTimeout(() => {
                interaction.deleteReply().catch(() => {});
            }, 5000);
        } catch (ignored) {
            // Ignorar el error de Unknown Message si casualmente algo eliminó la respuesta
        }
    } catch (err) {
        await interaction.editReply({ 
            embeds: [createErrorEmbed('Error', 'No pude eliminar todos los mensajes. Quizás tienen más de 14 días (límite de Discord).')] 
        }).catch(() => {});
    }
}

const command: SlashCommand = {
    data,
    execute,
    guildOnly: true,
};

export default command;
