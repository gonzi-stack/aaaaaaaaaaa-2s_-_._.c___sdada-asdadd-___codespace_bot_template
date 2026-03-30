import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type GuildMember } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { fgGuildRepo } from '../../db/repositories/fg-guild.repo.js';
import { fgCoworkRepo } from '../../db/repositories/fg-cowork.repo.js';
import { fgProRepo } from '../../db/repositories/fg-pro.repo.js';
import { fgRiskRepo } from '../../db/repositories/fg-risk.repo.js';
import { fgModRepo } from '../../db/repositories/fg-mod.repo.js';
import { CacheKeys } from '../../cache/keys.js';
import { FG_ANTIRAID, FG_RISK, FG_MOD_ACTIONS } from '../../constants/furguard.js';
import { createBrandedEmbed } from '../../lib/embed-builder.js';
import { sendAuditLog } from '../../lib/fg-audit.js';
import { broadcastAlert } from '../../lib/fg-cowork-broadcast.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'fg-event:guildMemberAdd' });

export default {
    name: 'guildMemberAdd',
    once: false,

    async execute(member: GuildMember, client: BotClient): Promise<void> {
        const guildId = member.guild.id;

        try {
            const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
            if (!fgGuild) return;

            const isPro = await fgGuildRepo.isPro(guildId, client.cacheManager);

            if (isPro) {
                await handleTrustSystem(member, client);
                await handleAntiRaid(member, client);
                await handleBlacklistCheck(member, client);
                await handleHighRiskRejoin(member, client);
            }
        } catch (err) {
            log.error({ err, guildId, userId: member.id }, 'Error en guildMemberAdd de FurGuard');
        }
    },
};

async function handleTrustSystem(member: GuildMember, client: BotClient): Promise<void> {
    try {
        const trustConfig = await fgProRepo.getTrustConfig(member.guild.id);
        if (!trustConfig || !trustConfig.enabled) return;

        const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;

        if (accountAgeDays < trustConfig.newAccountDays && trustConfig.restrictedRoleId) {
            const role = member.guild.roles.cache.get(trustConfig.restrictedRoleId);
            if (role) {
                await member.roles.add(role, '[FurGuard] Cuenta nueva - rol restringido');
                log.info({ guildId: member.guild.id, userId: member.id, accountAgeDays }, 'Rol restringido asignado');
            }
        }

        if (accountAgeDays >= trustConfig.veteranDays && trustConfig.veteranRoleId) {
            const role = member.guild.roles.cache.get(trustConfig.veteranRoleId);
            if (role) {
                await member.roles.add(role, '[FurGuard] Cuenta veterana');
            }
        }
    } catch (err) {
        log.error({ err, guildId: member.guild.id, userId: member.id }, 'Error en TrustSystem');
    }
}

async function handleAntiRaid(member: GuildMember, client: BotClient): Promise<void> {
    try {
        const antiraidConfig = await fgProRepo.getAntiraidConfig(member.guild.id);
        if (!antiraidConfig || !antiraidConfig.enabled) return;

        const windowKey = CacheKeys.fg.raidWindow(member.guild.id);
        const raw = await client.cacheManager.get(windowKey);
        const timestamps: number[] = raw ? JSON.parse(raw) as number[] : [];
        const now = Date.now();
        const windowMs = antiraidConfig.windowSeconds * 1000;

        const recent = timestamps.filter(t => now - t < windowMs);
        recent.push(now);

        await client.cacheManager.set(windowKey, JSON.stringify(recent), antiraidConfig.windowSeconds);

        if (recent.length >= antiraidConfig.joinThreshold) {
            log.warn({
                guildId: member.guild.id,
                joinCount: recent.length,
                threshold: antiraidConfig.joinThreshold,
            }, 'Raid detectado');

            await fgProRepo.createAntiraidEvent(
                member.guild.id,
                recent.length,
                antiraidConfig.action,
            );

            const embed = createBrandedEmbed()
                .setColor(0xFF0000)
                .setTitle('🚨 Raid Detectado')
                .setDescription(
                    `Se detectaron **${recent.length} ingresos** en **${antiraidConfig.windowSeconds}s**.\nAcción ejecutada: **${antiraidConfig.action}**`,
                );

            await sendAuditLog(member.guild.id, embed, client);

            const group = await fgCoworkRepo.getGroup(member.guild.id, client.cacheManager);
            if (group) {
                const alertEmbed = createBrandedEmbed()
                    .setColor(0xFF0000)
                    .setTitle('🚨 Alerta Cowork: Raid Detectado')
                    .setDescription(`Raid detectado en **${member.guild.name}** — ${recent.length} ingresos en ${antiraidConfig.windowSeconds}s`);

                await fgCoworkRepo.createAlert({
                    groupId: group.id,
                    sourceGuildId: member.guild.id,
                    userId: member.id,
                    alertType: 'raid',
                    details: `${recent.length} ingresos en ${antiraidConfig.windowSeconds}s`,
                });

                await broadcastAlert(group.id, alertEmbed, client);
            }

            if (antiraidConfig.action === 'lockdown') {
                const { ChannelType } = await import('discord.js');
                const channels = member.guild.channels.cache.filter(
                    ch => ch.type === ChannelType.GuildText,
                );
                for (const [, channel] of channels) {
                    try {
                        if ('permissionOverwrites' in channel) {
                            await (channel as { permissionOverwrites: { edit: (role: unknown, perms: unknown) => Promise<unknown> } }).permissionOverwrites.edit(
                                member.guild.roles.everyone,
                                { SendMessages: false },
                            );
                        }
                    } catch {
                        log.debug({ channelId: channel.id }, 'No se pudo bloquear canal durante raid');
                    }
                }
            } else if (antiraidConfig.action === 'kick') {
                await member.kick('[FurGuard] Anti-raid: kick automático').catch(() => {});
            } else if (antiraidConfig.action === 'ban') {
                await member.ban({ reason: '[FurGuard] Anti-raid: ban automático' }).catch(() => {});
            }
        }
    } catch (err) {
        log.error({ err, guildId: member.guild.id }, 'Error en Anti-Raid');
    }
}

async function handleBlacklistCheck(member: GuildMember, client: BotClient): Promise<void> {
    try {
        const group = await fgCoworkRepo.getGroup(member.guild.id, client.cacheManager);
        if (!group) return;

        const isBlacklisted = await fgCoworkRepo.isBlacklisted(group.id, member.id, client.cacheManager);
        if (!isBlacklisted) return;

        await member.ban({ reason: '[FurGuard] Usuario en blacklist del grupo cowork' });

        const embed = createBrandedEmbed()
            .setColor(0xFF0000)
            .setTitle('⛔ Blacklist Auto-Ban')
            .setDescription(`<@${member.id}> fue baneado automáticamente por estar en la blacklist del grupo cowork.`);

        await sendAuditLog(member.guild.id, embed, client);

        log.info({ guildId: member.guild.id, userId: member.id }, 'Usuario baneado por blacklist cowork');
    } catch (err) {
        log.error({ err, guildId: member.guild.id, userId: member.id }, 'Error en blacklist check');
    }
}

async function handleHighRiskRejoin(member: GuildMember, client: BotClient): Promise<void> {
    try {
        const guildId = member.guild.id;
        const userId = member.id;

        // 1. Obtener la puntuación de riesgo y ver si es sospechosa
        const row = await fgRiskRepo.getScore(guildId, userId, client.cacheManager);
        if (!row || row.score < FG_RISK.THRESHOLD_ORANGE) return; // Si no tiene riesgo muy elevado, ignorar

        // 2. Verificar el historial para ver si fue baneado anteriormente
        const history = await fgModRepo.getHistory(guildId, userId, 10);
        const priorBan = history.find(h => h.action === FG_MOD_ACTIONS.BAN);

        if (priorBan) {
            // Un usuario con historial rojo y un ban previo ha logrado entrar, alguien lo debió desbanear manual.
            const embed = createBrandedEmbed()
                .setColor(0xFEE75C) // Amarillo alerta
                .setTitle('⚠️ Alerta de Seguridad: Reingreso de Riesgo')
                .setDescription(
                    `El usuario <@${userId}> acaba de ingresar de nuevo al servidor.\n\n` +
                    `** Riesgo Actual:** ${row.score} / ${FG_RISK.SCORE_MAX}\n` +
                    `** Historial previo:** Se le había asignado un Ban el ${new Date(priorBan.createdAt).toLocaleDateString()}\n\n` +
                    `*Nota: Esto significa que alguien del equipo revocó su ban manualmente. Se recomienda vigilancia.*`
                )
                .setThumbnail(member.user.displayAvatarURL());

            // Mandar al canal de Auditoría del servidor
            await sendAuditLog(guildId, embed, client);

            // Intentar mandar MD al Dueño del Servidor tal como solicitó el usuario
            try {
                const owner = await member.guild.fetchOwner();
                if (owner) {
                    const btn = new ButtonBuilder()
                        .setLabel(`Ir a ${member.guild.name}`)
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://discord.com/channels/${guildId}`);
                    
                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

                    await owner.send({ embeds: [embed], components: [row] }).catch(() => {});
                }
            } catch (mdErr) {
                log.debug({ guildId, userId }, 'No se pudo notificar por MD al owner');
            }

            log.info({ guildId, userId, score: row.score }, 'Alerta enviada por reingreso de ex-baneado');
        }
    } catch (err) {
        log.error({ err, guildId: member.guild.id, userId: member.id }, 'Error analizando reingreso de alto riesgo');
    }
}

