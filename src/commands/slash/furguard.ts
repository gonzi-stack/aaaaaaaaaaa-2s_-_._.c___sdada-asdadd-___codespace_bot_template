import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    type ChatInputCommandInteraction,
    type GuildMember,
} from 'discord.js';
import type { BotClient } from '../../bot.js';
import type { SlashCommand } from '../../types/index.js';
import { fgGuildRepo } from '../../db/repositories/fg-guild.repo.js';
import { fgRiskRepo } from '../../db/repositories/fg-risk.repo.js';
import { fgBehaviorRepo } from '../../db/repositories/fg-behavior.repo.js';
import { fgModRepo } from '../../db/repositories/fg-mod.repo.js';
import { fgCoworkRepo } from '../../db/repositories/fg-cowork.repo.js';
import { fgProRepo } from '../../db/repositories/fg-pro.repo.js';
import { FG_RISK, FG_TOLERANCE, FG_MOD_ACTIONS } from '../../constants/furguard.js';
import type { FgTolerance } from '../../constants/furguard.js';
import { requirePro } from '../../lib/fg-pro-guard.js';
import { getRiskLevel, evaluateAndAct } from '../../lib/fg-risk-engine.js';
import { setupAutomodRules } from '../../lib/fg-automod.js';
import { sendAuditLog } from '../../lib/fg-audit.js';
import { broadcastAlert } from '../../lib/fg-cowork-broadcast.js';
import { updateModActivity } from '../../lib/fg-deadhand.js';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed, createBrandedEmbed } from '../../lib/embed-builder.js';
import { createChildLogger } from '../../lib/logger.js';
import { formatRelativeTime } from '../../utils/format.js';

const log = createChildLogger({ module: 'cmd:furguard' });

const RISK_EMOJI: Record<string, string> = { green: '🟢', yellow: '🟡', orange: '🟠', red: '🔴' };

const data = new SlashCommandBuilder()
    .setName('furguard')
    .setDescription('Sistema de moderación FurGuard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sc => sc.setName('setup').setDescription('Configurar FurGuard en este servidor'))
    .addSubcommand(sc => sc.setName('info').setDescription('Información del servidor en FurGuard'))
    .addSubcommand(sc => sc
        .setName('tolerance')
        .setDescription('Establecer nivel de tolerancia')
        .addStringOption(o => o.setName('nivel').setDescription('Nivel').setRequired(true)
            .addChoices({ name: 'Verde (permisivo)', value: 'green' }, { name: 'Amarillo (normal)', value: 'yellow' }, { name: 'Naranja (estricto)', value: 'orange' }, { name: 'Rojo (máximo)', value: 'red' })))
    .addSubcommand(sc => sc.setName('perfil').setDescription('Ver perfil de un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(sc => sc.setName('historial').setDescription('Ver historial de moderación')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(sc => sc.setName('warn').setDescription('Advertir a un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption(o => o.setName('razón').setDescription('Razón').setRequired(true)))
    .addSubcommand(sc => sc.setName('mute').setDescription('Silenciar a un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addIntegerOption(o => o.setName('duración').setDescription('Duración en minutos').setRequired(true))
        .addStringOption(o => o.setName('razón').setDescription('Razón').setRequired(true)))
    .addSubcommand(sc => sc.setName('kick').setDescription('Expulsar a un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption(o => o.setName('razón').setDescription('Razón').setRequired(true)))
    .addSubcommand(sc => sc.setName('ban').setDescription('Banear a un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption(o => o.setName('razón').setDescription('Razón').setRequired(true))
        .addIntegerOption(o => o.setName('días_mensajes').setDescription('Días de mensajes a eliminar').setMinValue(0).setMaxValue(7)))
    .addSubcommand(sc => sc.setName('unban').setDescription('Desbanear a un usuario')
        .addStringOption(o => o.setName('userid').setDescription('ID del usuario').setRequired(true))
        .addStringOption(o => o.setName('razón').setDescription('Razón').setRequired(true)))
    .addSubcommand(sc => sc.setName('pardon').setDescription('Perdonar riesgo a un usuario manualmente')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad de riesgo a restar').setMinValue(1).setMaxValue(1000).setRequired(true))
        .addStringOption(o => o.setName('razón').setDescription('Razón').setRequired(true)))
    .addSubcommand(sc => sc.setName('heatmap').setDescription('[PRO] Mapa de riesgo de un usuario')
        .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommandGroup(g => g.setName('antiraid').setDescription('[PRO] Anti-raid')
        .addSubcommand(sc => sc.setName('config').setDescription('Configurar anti-raid')
            .addIntegerOption(o => o.setName('umbral').setDescription('Umbral de ingresos'))
            .addIntegerOption(o => o.setName('ventana').setDescription('Ventana en segundos'))
            .addStringOption(o => o.setName('acción').setDescription('Acción').addChoices({ name: 'Alerta', value: 'alert' }, { name: 'Lockdown', value: 'lockdown' }, { name: 'Kick', value: 'kick' }, { name: 'Ban', value: 'ban' })))
        .addSubcommand(sc => sc.setName('status').setDescription('Estado del anti-raid')))
    .addSubcommandGroup(g => g.setName('nukeguard').setDescription('[PRO] NukeGuard')
        .addSubcommand(sc => sc.setName('config').setDescription('Configurar NukeGuard')
            .addIntegerOption(o => o.setName('umbral_eliminaciones').setDescription('Umbral de eliminaciones'))
            .addIntegerOption(o => o.setName('umbral_bans').setDescription('Umbral de bans'))
            .addIntegerOption(o => o.setName('ventana').setDescription('Ventana en segundos'))
            .addStringOption(o => o.setName('acción').setDescription('Acción').addChoices({ name: 'Alerta', value: 'alert' }, { name: 'Revocar', value: 'revoke' }, { name: 'Ban', value: 'ban' }))))
    .addSubcommandGroup(g => g.setName('trust').setDescription('[PRO] Sistema de confianza')
        .addSubcommand(sc => sc.setName('config').setDescription('Configurar TrustSystem')
            .addIntegerOption(o => o.setName('días_veterano').setDescription('Días para veterano'))
            .addRoleOption(o => o.setName('rol_veterano').setDescription('Rol de veterano'))
            .addIntegerOption(o => o.setName('días_cuenta_nueva').setDescription('Días para cuenta nueva'))
            .addRoleOption(o => o.setName('rol_restringido').setDescription('Rol restringido'))))
    .addSubcommandGroup(g => g.setName('auditlog').setDescription('[PRO] Registro de auditoría')
        .addSubcommand(sc => sc.setName('config').setDescription('Configurar canal de auditoría')
            .addChannelOption(o => o.setName('canal').setDescription('Canal de auditoría').setRequired(true))))
    .addSubcommandGroup(g => g.setName('cowork').setDescription('[PRO] Grupos cowork')
        .addSubcommand(sc => sc.setName('crear').setDescription('Crear grupo cowork')
            .addStringOption(o => o.setName('nombre').setDescription('Nombre del grupo').setRequired(true)))
        .addSubcommand(sc => sc.setName('unirse').setDescription('Unirse a un grupo cowork')
            .addStringOption(o => o.setName('groupid').setDescription('ID del grupo').setRequired(true)))
        .addSubcommand(sc => sc.setName('salir').setDescription('Salir del grupo cowork'))
        .addSubcommand(sc => sc.setName('blacklist-add').setDescription('Añadir a blacklist')
            .addStringOption(o => o.setName('userid').setDescription('ID del usuario').setRequired(true))
            .addStringOption(o => o.setName('razón').setDescription('Razón').setRequired(true)))
        .addSubcommand(sc => sc.setName('blacklist-remove').setDescription('Quitar de blacklist')
            .addStringOption(o => o.setName('userid').setDescription('ID del usuario').setRequired(true)))
        .addSubcommand(sc => sc.setName('alertas').setDescription('Ver alertas del grupo')))
    .addSubcommandGroup(g => g.setName('deadhand').setDescription('[PRO] Dead Hand')
        .addSubcommand(sc => sc.setName('config').setDescription('Configurar Dead Hand')
            .addIntegerOption(o => o.setName('inactividad_minutos').setDescription('Minutos de inactividad'))
            .addBooleanOption(o => o.setName('lockdown_auto').setDescription('Lockdown automático'))
            .addBooleanOption(o => o.setName('slowmode_auto').setDescription('Slowmode automático'))
            .addBooleanOption(o => o.setName('ban_criticos_auto').setDescription('Ban de críticos automático'))
            .addChannelOption(o => o.setName('canal_notificacion').setDescription('Canal de notificación'))))
    .addSubcommandGroup(g => g.setName('adaptive').setDescription('[PRO] Moderación adaptativa')
        .addSubcommand(sc => sc.setName('config').setDescription('Configurar modo adaptativo')
            .addStringOption(o => o.setName('modo').setDescription('Modo').setRequired(true)
                .addChoices({ name: 'Sugerir', value: 'suggest' }, { name: 'Automático', value: 'auto' }))))
    .addSubcommandGroup(g => g.setName('caso').setDescription('[PRO] Casos colaborativos')
        .addSubcommand(sc => sc.setName('abrir').setDescription('Abrir caso')
            .addStringOption(o => o.setName('userid').setDescription('ID del usuario').setRequired(true))
            .addStringOption(o => o.setName('razón').setDescription('Razón').setRequired(true)))
        .addSubcommand(sc => sc.setName('votar').setDescription('Votar en un caso')
            .addStringOption(o => o.setName('caseid').setDescription('ID del caso').setRequired(true))
            .addStringOption(o => o.setName('voto').setDescription('Voto').setRequired(true)
                .addChoices({ name: 'Ban', value: 'ban' }, { name: 'Kick', value: 'kick' }, { name: 'Warn', value: 'warn' }, { name: 'Descartar', value: 'dismiss' })))
        .addSubcommand(sc => sc.setName('ver').setDescription('Ver caso')
            .addStringOption(o => o.setName('caseid').setDescription('ID del caso').setRequired(true)))
        .addSubcommand(sc => sc.setName('escalar').setDescription('Escalar caso')
            .addStringOption(o => o.setName('caseid').setDescription('ID del caso').setRequired(true))));

async function execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<void> {
    if (!interaction.guild || !interaction.guildId) {
        await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Este comando solo funciona en servidores.')] });
        return;
    }

    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup();
    const guildId = interaction.guildId;
    const cache = client.cacheManager;

    try {
        if (group) {
            await handleGroup(interaction, client, group, sub, guildId);
        } else {
            await handleSubcommand(interaction, client, sub, guildId);
        }
    } catch (err) {
        log.error({ err, sub, group, guildId }, 'Error en comando furguard');
        await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Ocurrió un error inesperado.')] }).catch(() => {});
    }
}

async function handleSubcommand(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    switch (sub) {
        case 'setup': return cmdSetup(i, c, gId);
        case 'info': return cmdInfo(i, c, gId);
        case 'tolerance': return cmdTolerance(i, c, gId);
        case 'perfil': return cmdPerfil(i, c, gId);
        case 'historial': return cmdHistorial(i, c, gId);
        case 'warn': return cmdWarn(i, c, gId);
        case 'mute': return cmdMute(i, c, gId);
        case 'kick': return cmdKick(i, c, gId);
        case 'ban': return cmdBan(i, c, gId);
        case 'unban': return cmdUnban(i, c, gId);
        case 'pardon': return cmdPardon(i, c, gId);
        case 'heatmap': return cmdHeatmap(i, c, gId);
        default: await i.editReply({ embeds: [createErrorEmbed('Error', 'Subcomando no reconocido.')] });
    }
}

async function cmdPardon(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Moderate Members`.')] }); return; }
    const target = i.options.getUser('usuario', true);
    const cantidad = i.options.getInteger('cantidad', true);
    const reason = i.options.getString('razón', true);
    
    // addDelta con número negativo resta el riesgo internamente limitándose a 0 mínimo
    const newScore = await fgRiskRepo.addDelta(gId, target.id, -cantidad, `Pardon: ${reason}`, i.user.id, c.cacheManager);
    
    await fgModRepo.logAction({ guildId: gId, targetId: target.id, moderatorId: i.user.id, action: FG_MOD_ACTIONS.NOTE, reason: `[Reduce Riesgo -${cantidad}] ${reason}` });
    
    await i.editReply({ embeds: [createSuccessEmbed('Perdonado', `Se restaron **${cantidad} puntos** de riesgo a <@${target.id}>.\n**Razón:** ${reason}\n**Riesgo Actual:** ${newScore}`)] });
    await sendAuditLog(gId, createBrandedEmbed().setColor(0x57F287).setTitle('🤍 Pardon (Riesgo Reducido)').setDescription(`**Usuario:** <@${target.id}>\n**Moderador:** <@${i.user.id}>\n**Razón:** ${reason}\n**Riesgo Acumulado:** ${newScore}`), c);
}

async function handleGroup(i: ChatInputCommandInteraction, c: BotClient, group: string, sub: string, gId: string): Promise<void> {
    switch (group) {
        case 'antiraid': return grpAntiraid(i, c, sub, gId);
        case 'nukeguard': return grpNukeguard(i, c, sub, gId);
        case 'trust': return grpTrust(i, c, sub, gId);
        case 'auditlog': return grpAuditlog(i, c, sub, gId);
        case 'cowork': return grpCowork(i, c, sub, gId);
        case 'deadhand': return grpDeadhand(i, c, sub, gId);
        case 'adaptive': return grpAdaptive(i, c, sub, gId);
        case 'caso': return grpCaso(i, c, sub, gId);
        default: await i.editReply({ embeds: [createErrorEmbed('Error', 'Grupo no reconocido.')] });
    }
}

async function cmdSetup(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator` para usar este comando.')] });
        return;
    }
    await fgGuildRepo.upsertGuild(gId, i.guild!.ownerId, c.cacheManager);
    let rulesCreated = 0;
    try { rulesCreated = await setupAutomodRules(i.guild!); } catch { rulesCreated = 0; }
    await i.editReply({ embeds: [createSuccessEmbed('FurGuard Configurado', `✅ Servidor registrado con tolerancia **amarilla**.\n🛡️ ${rulesCreated} reglas de AutoMod creadas.`)] });
}

async function cmdInfo(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const guild = await fgGuildRepo.getGuild(gId, c.cacheManager);
    if (!guild) { await i.editReply({ embeds: [createErrorEmbed('Error', 'Servidor no configurado. Usa `/furguard setup` primero.')] }); return; }
    const embed = createInfoEmbed('FurGuard — Info', '')
        .setDescription(null)
        .addFields(
            { name: 'Tier', value: guild.tier.toUpperCase(), inline: true },
            { name: 'Tolerancia', value: `${RISK_EMOJI[guild.toleranceLevel] ?? '⚪'} ${guild.toleranceLevel}`, inline: true },
            { name: 'Activado', value: formatRelativeTime(new Date(guild.activatedAt)), inline: true },
        );
    if (guild.expiresAt) embed.addFields({ name: 'Expira', value: formatRelativeTime(new Date(guild.expiresAt)), inline: true });
    await i.editReply({ embeds: [embed] });
}

async function cmdTolerance(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator`.')] }); return; }
    const level = i.options.getString('nivel', true) as FgTolerance;
    await fgGuildRepo.setTolerance(gId, level, c.cacheManager);
    await i.editReply({ embeds: [createSuccessEmbed('Tolerancia Actualizada', `Nivel de tolerancia: ${RISK_EMOJI[level] ?? '⚪'} **${level}**`)] });
}

async function cmdPerfil(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Moderate Members`.')] }); return; }
    const target = i.options.getUser('usuario', true);
    const full = await fgBehaviorRepo.getFullProfile(gId, target.id, c.cacheManager);
    const riskRow = await fgRiskRepo.getScore(gId, target.id, c.cacheManager);
    const score = riskRow?.score ?? 0;
    const level = getRiskLevel(score);
    const embed = createBrandedEmbed().setTitle(`Perfil — ${target.tag}`).setThumbnail(target.displayAvatarURL())
        .addFields(
            { name: 'Riesgo', value: `${RISK_EMOJI[level] ?? '⚪'} ${score}/${FG_RISK.SCORE_MAX} (${level})`, inline: true },
            { name: 'Warns', value: `${full?.profile.warningCount ?? 0}`, inline: true },
            { name: 'Mutes', value: `${full?.profile.muteCount ?? 0}`, inline: true },
            { name: 'Kicks', value: `${full?.profile.kickCount ?? 0}`, inline: true },
            { name: 'Bans', value: `${full?.profile.banCount ?? 0}`, inline: true },
        );
    if (full?.profile.firstSeenAt) embed.addFields({ name: 'Visto por primera vez', value: formatRelativeTime(new Date(full.profile.firstSeenAt)), inline: true });
    if (full?.profile.lastActionAt) embed.addFields({ name: 'Última acción', value: formatRelativeTime(new Date(full.profile.lastActionAt)), inline: true });
    await i.editReply({ embeds: [embed] });
}

async function cmdHistorial(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Moderate Members`.')] }); return; }
    const target = i.options.getUser('usuario', true);
    const history = await fgModRepo.getHistory(gId, target.id, 10);
    if (history.length === 0) { await i.editReply({ embeds: [createInfoEmbed('Historial', `<@${target.id}> no tiene historial de moderación.`)] }); return; }
    const lines = history.map((h, idx) => `**${idx + 1}.** \`${h.action}\` — ${h.reason}\n   Por <@${h.moderatorId}> ${formatRelativeTime(new Date(h.createdAt))}`);
    await i.editReply({ embeds: [createBrandedEmbed().setTitle(`Historial — ${target.tag}`).setDescription(lines.join('\n\n'))] });
}

async function cmdWarn(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Moderate Members`.')] }); return; }
    const target = i.options.getUser('usuario', true);
    const reason = i.options.getString('razón', true);
    await fgModRepo.logAction({ guildId: gId, targetId: target.id, moderatorId: i.user.id, action: FG_MOD_ACTIONS.WARN, reason });
    await fgBehaviorRepo.incrementAction(gId, target.id, 'warn', c.cacheManager);
    const newScore = await fgRiskRepo.addDelta(gId, target.id, FG_RISK.DELTA_WARN, `Warn: ${reason}`, i.user.id, c.cacheManager);
    await updateModActivity(gId, c);
    const fgGuild = await fgGuildRepo.getGuild(gId, c.cacheManager);
    if (fgGuild && i.guild) await evaluateAndAct(gId, target.id, newScore, fgGuild.toleranceLevel, i.guild);
    const embed = createSuccessEmbed('Advertencia', `<@${target.id}> ha sido advertido.\n**Razón:** ${reason}\n**Riesgo:** ${newScore}`);
    await i.editReply({ embeds: [embed] });
    await sendAuditLog(gId, createBrandedEmbed().setColor(0xFEE75C).setTitle('⚠️ Warn').setDescription(`**Usuario:** <@${target.id}>\n**Moderador:** <@${i.user.id}>\n**Razón:** ${reason}\n**Riesgo:** ${newScore}`), c);
}

async function cmdMute(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Moderate Members`.')] }); return; }
    const target = i.options.getUser('usuario', true);
    const duration = i.options.getInteger('duración', true);
    const reason = i.options.getString('razón', true);
    const targetMember = await i.guild!.members.fetch(target.id).catch(() => null);
    if (!targetMember) { await i.editReply({ embeds: [createErrorEmbed('Error', 'Usuario no encontrado en el servidor.')] }); return; }
    await targetMember.timeout(duration * 60_000, `[FurGuard] ${reason}`);
    const expiresAt = new Date(Date.now() + duration * 60_000);
    await fgModRepo.logAction({ guildId: gId, targetId: target.id, moderatorId: i.user.id, action: FG_MOD_ACTIONS.MUTE, reason, duration: duration * 60, expiresAt });
    await fgBehaviorRepo.incrementAction(gId, target.id, 'mute', c.cacheManager);
    const newScore = await fgRiskRepo.addDelta(gId, target.id, FG_RISK.DELTA_MUTE, `Mute: ${reason}`, i.user.id, c.cacheManager);
    await updateModActivity(gId, c);
    const fgGuild = await fgGuildRepo.getGuild(gId, c.cacheManager);
    if (fgGuild && i.guild) await evaluateAndAct(gId, target.id, newScore, fgGuild.toleranceLevel, i.guild);
    await i.editReply({ embeds: [createSuccessEmbed('Silenciado', `<@${target.id}> silenciado por **${duration} min**.\n**Razón:** ${reason}\n**Riesgo:** ${newScore}`)] });
    await sendAuditLog(gId, createBrandedEmbed().setColor(0xE67E22).setTitle('🔇 Mute').setDescription(`**Usuario:** <@${target.id}>\n**Moderador:** <@${i.user.id}>\n**Duración:** ${duration}min\n**Razón:** ${reason}`), c);
}

async function cmdKick(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.KickMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Kick Members`.')] }); return; }
    const target = i.options.getUser('usuario', true);
    const reason = i.options.getString('razón', true);
    const targetMember = await i.guild!.members.fetch(target.id).catch(() => null);
    if (!targetMember) { await i.editReply({ embeds: [createErrorEmbed('Error', 'Usuario no encontrado.')] }); return; }
    await targetMember.kick(`[FurGuard] ${reason}`);
    await fgModRepo.logAction({ guildId: gId, targetId: target.id, moderatorId: i.user.id, action: FG_MOD_ACTIONS.KICK, reason });
    await fgBehaviorRepo.incrementAction(gId, target.id, 'kick', c.cacheManager);
    await fgRiskRepo.addDelta(gId, target.id, FG_RISK.DELTA_KICK, `Kick: ${reason}`, i.user.id, c.cacheManager);
    await updateModActivity(gId, c);
    await i.editReply({ embeds: [createSuccessEmbed('Expulsado', `<@${target.id}> fue expulsado.\n**Razón:** ${reason}`)] });
    await sendAuditLog(gId, createBrandedEmbed().setColor(0xED4245).setTitle('👢 Kick').setDescription(`**Usuario:** <@${target.id}>\n**Moderador:** <@${i.user.id}>\n**Razón:** ${reason}`), c);
}

async function cmdBan(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Ban Members`.')] }); return; }
    const target = i.options.getUser('usuario', true);
    const reason = i.options.getString('razón', true);
    const days = i.options.getInteger('días_mensajes') ?? 0;
    await i.guild!.members.ban(target.id, { deleteMessageSeconds: days * 86400, reason: `[FurGuard] ${reason}` });
    await fgModRepo.logAction({ guildId: gId, targetId: target.id, moderatorId: i.user.id, action: FG_MOD_ACTIONS.BAN, reason });
    await fgBehaviorRepo.incrementAction(gId, target.id, 'ban', c.cacheManager);
    await fgRiskRepo.addDelta(gId, target.id, FG_RISK.DELTA_KICK, `Ban: ${reason}`, i.user.id, c.cacheManager);
    await updateModActivity(gId, c);
    await i.editReply({ embeds: [createSuccessEmbed('Baneado', `<@${target.id}> fue baneado.\n**Razón:** ${reason}`)] });
    await sendAuditLog(gId, createBrandedEmbed().setColor(0xED4245).setTitle('🔨 Ban').setDescription(`**Usuario:** <@${target.id}>\n**Moderador:** <@${i.user.id}>\n**Razón:** ${reason}`), c);
}

async function cmdUnban(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.BanMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Ban Members`.')] }); return; }
    const userId = i.options.getString('userid', true);
    const reason = i.options.getString('razón', true);
    await i.guild!.members.unban(userId, `[FurGuard] ${reason}`);
    await fgModRepo.logAction({ guildId: gId, targetId: userId, moderatorId: i.user.id, action: FG_MOD_ACTIONS.UNBAN, reason });
    await updateModActivity(gId, c);
    await i.editReply({ embeds: [createSuccessEmbed('Desbaneado', `<@${userId}> fue desbaneado.\n**Razón:** ${reason}`)] });
    await sendAuditLog(gId, createBrandedEmbed().setColor(0x57F287).setTitle('🔓 Unban').setDescription(`**Usuario:** <@${userId}>\n**Moderador:** <@${i.user.id}>\n**Razón:** ${reason}`), c);
}

async function cmdHeatmap(i: ChatInputCommandInteraction, c: BotClient, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Moderate Members`.')] }); return; }
    const target = i.options.getUser('usuario', true);
    const points = await fgProRepo.getHeatmapPoints(gId, target.id, 30);
    if (points.length === 0) { await i.editReply({ embeds: [createInfoEmbed('Heatmap', `Sin datos para <@${target.id}>.`)] }); return; }
    const blocks = ['░', '▒', '▓', '█'];
    const maxDelta = Math.max(...points.map(p => Math.abs(p['riskDelta'] as number)), 1);
    const lines = points.reverse().map(p => {
        const delta = p['riskDelta'] as number;
        const intensity = Math.min(3, Math.floor((Math.abs(delta) / maxDelta) * 4));
        const block = blocks[intensity] ?? '░';
        const sign = delta >= 0 ? '+' : '';
        return `${block.repeat(Math.max(1, Math.abs(delta) / 5 + 1))} ${sign}${delta}`;
    });
    const embed = createBrandedEmbed().setTitle(`📊 Heatmap — ${target.tag}`).setDescription('```\n' + lines.join('\n') + '\n```');
    await i.editReply({ embeds: [embed] });
}

async function grpAntiraid(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    if (sub === 'config') {
        const member = i.member as GuildMember;
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator`.')] }); return; }
        const umbral = i.options.getInteger('umbral');
        const ventana = i.options.getInteger('ventana');
        const accion = i.options.getString('acción');
        await fgProRepo.setAntiraidConfig(gId, { joinThreshold: umbral ?? undefined, windowSeconds: ventana ?? undefined, action: accion ?? undefined } as Record<string, unknown>);
        await i.editReply({ embeds: [createSuccessEmbed('Anti-Raid Configurado', 'Configuración actualizada correctamente.')] });
    } else {
        const config = await fgProRepo.getAntiraidConfig(gId);
        const lastEvent = await fgProRepo.getLastRaidEvent(gId);
        const embed = createInfoEmbed('Anti-Raid — Estado', '')
            .setDescription(config ? `**Habilitado:** ${config.enabled ? 'Sí' : 'No'}\n**Umbral:** ${config.joinThreshold} ingresos\n**Ventana:** ${config.windowSeconds}s\n**Acción:** ${config.action}` : 'No configurado.');
        if (lastEvent) embed.addFields({ name: 'Último evento', value: `${lastEvent['joinCount']} ingresos — ${lastEvent['actionTaken']}` });
        await i.editReply({ embeds: [embed] });
    }
}

async function grpNukeguard(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator`.')] }); return; }
    await fgProRepo.setNukeguardConfig(gId, {
        deleteThreshold: i.options.getInteger('umbral_eliminaciones') ?? undefined,
        banThreshold: i.options.getInteger('umbral_bans') ?? undefined,
        windowSeconds: i.options.getInteger('ventana') ?? undefined,
        action: i.options.getString('acción') ?? undefined,
    } as Record<string, unknown>);
    await i.editReply({ embeds: [createSuccessEmbed('NukeGuard Configurado', 'Configuración actualizada.')] });
}

async function grpTrust(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator`.')] }); return; }
    await fgProRepo.setTrustConfig(gId, {
        veteranDays: i.options.getInteger('días_veterano') ?? undefined,
        veteranRoleId: i.options.getRole('rol_veterano')?.id ?? undefined,
        newAccountDays: i.options.getInteger('días_cuenta_nueva') ?? undefined,
        restrictedRoleId: i.options.getRole('rol_restringido')?.id ?? undefined,
    } as Record<string, unknown>);
    await i.editReply({ embeds: [createSuccessEmbed('TrustSystem Configurado', 'Configuración actualizada.')] });
}

async function grpAuditlog(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator`.')] }); return; }
    const channel = i.options.getChannel('canal', true);
    let webhookId: string | undefined;
    let webhookToken: string | undefined;
    try {
        const textChannel = await i.guild!.channels.fetch(channel.id);
        if (textChannel && 'createWebhook' in textChannel) {
            const wh = await (textChannel as unknown as { createWebhook: (opts: { name: string }) => Promise<{ id: string; token: string | null }> }).createWebhook({ name: 'FurGuard Audit' });
            webhookId = wh.id;
            webhookToken = wh.token ?? undefined;
        }
    } catch { log.debug({ gId }, 'No se pudo crear webhook para audit log'); }
    await fgProRepo.setAuditlogConfig(gId, { channelId: channel.id, webhookId: webhookId ?? null, webhookToken: webhookToken ?? null });
    await i.editReply({ embeds: [createSuccessEmbed('Audit Log Configurado', `Canal: <#${channel.id}>\nWebhook: ${webhookId ? 'Creado' : 'No disponible'}`)] });
}

async function grpCowork(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    const member = i.member as GuildMember;
    switch (sub) {
        case 'crear': {
            if (i.user.id !== i.guild!.ownerId) { 
                await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Solo el **Propietario del Servidor** puede crear un grupo Cowork.')] }); 
                return; 
            }
            
            // Verificar si el servidor ya está en un grupo
            const currentGroup = await fgCoworkRepo.getGroup(gId, c.cacheManager);
            if (currentGroup) {
                await i.editReply({ embeds: [createErrorEmbed('Error', 'Este servidor ya pertenece a un grupo Cowork. Debes salir del grupo actual antes de crear uno nuevo.')] });
                return;
            }

            const name = i.options.getString('nombre', true);
            const groupId = await fgCoworkRepo.createGroup(name, i.user.id, gId, c.cacheManager);
            
            // Intentar enviar el ID por MD al Owner
            try {
                const dmEmbed = createBrandedEmbed()
                    .setColor(0x57F287)
                    .setTitle('🤝 Grupo Cowork Creado')
                    .setDescription(`Has creado exitosamente el grupo **${name}**.\n\nComparte el siguiente código secreto con servidores aliados para que se unan a tu red de seguridad:\n\n||${groupId}||\n\n⚠️ *Precaución: Quien tenga este código podrá unir su servidor a tu red de alertas.*`);
                
                await i.user.send({ embeds: [dmEmbed] });
                await i.editReply({ embeds: [createSuccessEmbed('Grupo Creado', `Se ha creado la red central **${name}**.\nTe he enviado los detalles y el código de enlace secreto por **Mensaje Directo** para mayor seguridad.`)] });
            } catch {
                await i.editReply({ embeds: [createErrorEmbed('Error de MD', 'Tuve problemas enviándote el código por MD (¿Tienes los mensajes cerrados?). El grupo fue creado pero necesitas abrir tus MDs e intentar crear de nuevo o recuperarlo.')] });
            }
            break;
        }
        case 'unirse': {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) { 
                await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator` para unir este servidor a un grupo Cowork.')] }); 
                return; 
            }
            
            // Verificar si ya pertenece a un grupo
            const currentGroup = await fgCoworkRepo.getGroup(gId, c.cacheManager);
            if (currentGroup) {
                await i.editReply({ embeds: [createErrorEmbed('Error', `Este servidor ya está enlazado a la red **${currentGroup.name}**.\nDebes salir (` + '`/furguard cowork salir`' + `) antes de unirte a otra.`)] });
                return;
            }

            const groupId = i.options.getString('groupid', true);
            const group = await fgCoworkRepo.getGroupById(groupId);
            if (!group) { 
                await i.editReply({ embeds: [createErrorEmbed('Error', 'El código ingresado es inválido o el grupo no existe.')] }); 
                return; 
            }
            
            await fgCoworkRepo.addGuild(groupId, gId, c.cacheManager);
            await i.editReply({ embeds: [createSuccessEmbed('Unido al Grupo', `Este servidor acaba de ser enlazado exitosamente a la red de seguridad **${group.name}**.`)] });
            break;
        }
        case 'salir': {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator`.')] }); return; }
            const grp = await fgCoworkRepo.getGroup(gId, c.cacheManager);
            if (!grp) { await i.editReply({ embeds: [createErrorEmbed('Error', 'No estás en ningún grupo.')] }); return; }
            await fgCoworkRepo.removeGuild(grp.id, gId, c.cacheManager);
            await i.editReply({ embeds: [createSuccessEmbed('Grupo Abandonado', `Saliste de **${grp.name}**.`)] });
            break;
        }
        case 'blacklist-add': {
            if (!member.permissions.has(PermissionFlagsBits.BanMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Ban Members`.')] }); return; }
            const grp = await fgCoworkRepo.getGroup(gId, c.cacheManager);
            if (!grp) { await i.editReply({ embeds: [createErrorEmbed('Error', 'No estás en un grupo cowork.')] }); return; }
            const userId = i.options.getString('userid', true);
            
            const isBlacklisted = await fgCoworkRepo.isBlacklisted(grp.id, userId, c.cacheManager);
            if (isBlacklisted) {
                await i.editReply({ embeds: [createErrorEmbed('Error', `<@${userId}> ya se encuentra actualmente en la blacklist del grupo.`)] });
                return;
            }

            const reason = i.options.getString('razón', true);
            await fgCoworkRepo.addBlacklist(grp.id, userId, reason, i.user.id, gId, c.cacheManager);
            const alertEmbed = createBrandedEmbed().setColor(0xED4245).setTitle('⛔ Blacklist Añadido').setDescription(`<@${userId}> añadido a la blacklist.\n**Razón:** ${reason}\n**Por:** <@${i.user.id}>`);
            await broadcastAlert(grp.id, alertEmbed, c);
            await i.editReply({ embeds: [createSuccessEmbed('Blacklist', `<@${userId}> añadido a la blacklist del grupo.`)] });
            break;
        }
        case 'blacklist-remove': {
            if (!member.permissions.has(PermissionFlagsBits.BanMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Ban Members`.')] }); return; }
            const grp = await fgCoworkRepo.getGroup(gId, c.cacheManager);
            if (!grp) { await i.editReply({ embeds: [createErrorEmbed('Error', 'No estás en un grupo cowork.')] }); return; }
            const userId = i.options.getString('userid', true);
            
            const isBlacklisted = await fgCoworkRepo.isBlacklisted(grp.id, userId, c.cacheManager);
            if (!isBlacklisted) {
                await i.editReply({ embeds: [createErrorEmbed('Error', `<@${userId}> no está en la blacklist del grupo.`)] });
                return;
            }

            await fgCoworkRepo.removeBlacklist(grp.id, userId, c.cacheManager);
            await i.editReply({ embeds: [createSuccessEmbed('Blacklist', `<@${userId}> removido de la blacklist.`)] });
            break;
        }
        case 'alertas': {
            const grp = await fgCoworkRepo.getGroup(gId, c.cacheManager);
            if (!grp) { await i.editReply({ embeds: [createErrorEmbed('Error', 'No estás en un grupo cowork.')] }); return; }
            const alerts = await fgCoworkRepo.getAlerts(grp.id, false);
            if (alerts.length === 0) { await i.editReply({ embeds: [createInfoEmbed('Alertas', 'No hay alertas sin resolver.')] }); return; }
            const lines = alerts.map((a, idx) => `**${idx + 1}.** \`${a.alertType}\` — ${a.details}\n   ${formatRelativeTime(new Date(a.createdAt))}`);
            await i.editReply({ embeds: [createBrandedEmbed().setTitle('🔔 Alertas Cowork').setDescription(lines.join('\n\n'))] });
            break;
        }
    }
}

async function grpDeadhand(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator`.')] }); return; }
    await fgProRepo.setDeadhandConfig(gId, {
        inactivityMinutes: i.options.getInteger('inactividad_minutos') ?? undefined,
        autoLockdown: i.options.getBoolean('lockdown_auto') !== null ? (i.options.getBoolean('lockdown_auto') ? 1 : 0) : undefined,
        autoSlowmode: i.options.getBoolean('slowmode_auto') !== null ? (i.options.getBoolean('slowmode_auto') ? 1 : 0) : undefined,
        autoBanCritical: i.options.getBoolean('ban_criticos_auto') !== null ? (i.options.getBoolean('ban_criticos_auto') ? 1 : 0) : undefined,
        notifyChannelId: i.options.getChannel('canal_notificacion')?.id ?? undefined,
    } as Record<string, unknown>);
    await i.editReply({ embeds: [createSuccessEmbed('Dead Hand Configurado', 'Configuración actualizada.')] });
}

async function grpAdaptive(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Administrator`.')] }); return; }
    const mode = i.options.getString('modo', true);
    await fgProRepo.setAdaptiveConfig(gId, { mode });
    await i.editReply({ embeds: [createSuccessEmbed('Moderación Adaptativa', `Modo: **${mode}**`)] });
}

async function grpCaso(i: ChatInputCommandInteraction, c: BotClient, sub: string, gId: string): Promise<void> {
    if (!await requirePro(gId, i, c.cacheManager)) return;
    const member = i.member as GuildMember;
    if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) { await i.editReply({ embeds: [createErrorEmbed('Permisos', 'Necesitas `Moderate Members`.')] }); return; }
    const grp = await fgCoworkRepo.getGroup(gId, c.cacheManager);
    if (!grp) { await i.editReply({ embeds: [createErrorEmbed('Error', 'Necesitas un grupo cowork para usar casos colaborativos.')] }); return; }
    switch (sub) {
        case 'abrir': {
            const targetId = i.options.getString('userid', true);
            const reason = i.options.getString('razón', true);
            const caseId = await fgCoworkRepo.createCase({ groupId: grp.id, guildId: gId, targetId, ownerId: i.user.id });
            await fgCoworkRepo.createAlert({ groupId: grp.id, sourceGuildId: gId, userId: targetId, alertType: 'case_opened', details: reason });
            await i.editReply({ embeds: [createSuccessEmbed('Caso Abierto', `ID: \`${caseId}\`\nUsuario: <@${targetId}>\nRazón: ${reason}`)] });
            break;
        }
        case 'votar': {
            const caseId = i.options.getString('caseid', true);
            const vote = i.options.getString('voto', true);
            const caso = await fgCoworkRepo.getCase(caseId);
            if (!caso) { await i.editReply({ embeds: [createErrorEmbed('Error', 'Caso no encontrado.')] }); return; }
            if (caso.status === 'closed') { await i.editReply({ embeds: [createErrorEmbed('Error', 'Este caso ya está cerrado.')] }); return; }
            await fgCoworkRepo.addVote(caseId, i.user.id, gId, vote);
            if (caso.status === 'open') await fgCoworkRepo.updateCaseStatus(caseId, 'voting');
            await i.editReply({ embeds: [createSuccessEmbed('Voto Registrado', `Tu voto: **${vote}** en caso \`${caseId}\``)] });
            break;
        }
        case 'ver': {
            const caseId = i.options.getString('caseid', true);
            const caso = await fgCoworkRepo.getCase(caseId);
            if (!caso) { await i.editReply({ embeds: [createErrorEmbed('Error', 'Caso no encontrado.')] }); return; }
            const votes = await fgCoworkRepo.getVotes(caseId);
            const voteSummary = votes.length > 0 ? votes.map(v => `<@${v.moderatorId}>: **${v.vote}**`).join('\n') : 'Sin votos aún.';
            const embed = createBrandedEmbed().setTitle(`📋 Caso ${caseId.slice(0, 8)}`).addFields(
                { name: 'Usuario', value: `<@${caso.targetId}>`, inline: true },
                { name: 'Estado', value: caso.status, inline: true },
                { name: 'Abierto por', value: `<@${caso.ownerId}>`, inline: true },
                { name: 'Votos', value: voteSummary },
            );
            if (caso.resolution) embed.addFields({ name: 'Resolución', value: caso.resolution });
            await i.editReply({ embeds: [embed] });
            break;
        }
        case 'escalar': {
            const caseId = i.options.getString('caseid', true);
            const caso = await fgCoworkRepo.getCase(caseId);
            if (!caso) { await i.editReply({ embeds: [createErrorEmbed('Error', 'Caso no encontrado.')] }); return; }
            await fgCoworkRepo.updateCaseStatus(caseId, 'escalated');
            const alertEmbed = createBrandedEmbed().setColor(0xFF0000).setTitle('🚨 Caso Escalado').setDescription(`Caso \`${caseId.slice(0, 8)}\` escalado por <@${i.user.id}>\nUsuario: <@${caso.targetId}>`);
            await broadcastAlert(grp.id, alertEmbed, c);
            await fgCoworkRepo.createAlert({ groupId: grp.id, sourceGuildId: gId, userId: caso.targetId, alertType: 'case_escalated', details: `Caso ${caseId} escalado` });
            await i.editReply({ embeds: [createSuccessEmbed('Caso Escalado', `Caso \`${caseId.slice(0, 8)}\` escalado a todos los moderadores del grupo.`)] });
            break;
        }
    }
}

const command: SlashCommand = {
    data,
    execute,
    guildOnly: true,
};

export default command;
