import type { Guild } from 'discord.js';
import { FG_RISK, FG_TOLERANCE } from '../constants/furguard.js';
import type { FgTolerance } from '../constants/furguard.js';
import { fgRiskRepo } from '../db/repositories/fg-risk.repo.js';
import { fgModRepo } from '../db/repositories/fg-mod.repo.js';
import { fgBehaviorRepo } from '../db/repositories/fg-behavior.repo.js';
import { createWarningEmbed } from './embed-builder.js';
import { createChildLogger } from './logger.js';
import type { BotClient } from '../bot.js';

const log = createChildLogger({ module: 'fg-risk-engine' });

export function getRiskLevel(score: number): 'green' | 'yellow' | 'orange' | 'red' {
    if (score >= FG_RISK.THRESHOLD_RED) return 'red';
    if (score >= FG_RISK.THRESHOLD_ORANGE) return 'orange';
    if (score >= FG_RISK.THRESHOLD_YELLOW) return 'yellow';
    return 'green';
}

const TOLERANCE_ORDER: Record<string, number> = {
    [FG_TOLERANCE.GREEN]: 0,
    [FG_TOLERANCE.YELLOW]: 1,
    [FG_TOLERANCE.ORANGE]: 2,
    [FG_TOLERANCE.RED]: 3,
};

const RISK_LEVEL_ORDER: Record<string, number> = {
    green: 0,
    yellow: 1,
    orange: 2,
    red: 3,
};

export async function evaluateAndAct(
    guildId: string,
    userId: string,
    score: number,
    toleranceLevel: FgTolerance,
    guild: Guild,
): Promise<void> {
    const riskLevel = getRiskLevel(score);
    const riskOrder = RISK_LEVEL_ORDER[riskLevel] ?? 0;
    const toleranceOrder = TOLERANCE_ORDER[toleranceLevel] ?? 1;

    if (riskOrder <= toleranceOrder) return;

    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return;

        const botMember = guild.members.me;
        if (!botMember) return;

        if (member.roles.highest.position >= botMember.roles.highest.position) return;

        if (riskLevel === 'red' && toleranceLevel !== FG_TOLERANCE.RED) {
            await member.ban({ reason: `[FurGuard] Puntuación de riesgo crítica: ${score}` });
            await fgModRepo.logAction({
                guildId,
                targetId: userId,
                moderatorId: guild.client.user.id,
                action: 'ban',
                reason: `Puntuación de riesgo crítica: ${score}`,
            });
            await fgBehaviorRepo.incrementAction(guildId, userId, 'ban');
            return;
        }

        if (riskLevel === 'orange' && toleranceOrder < RISK_LEVEL_ORDER['orange']!) {
            await member.timeout(600_000, `[FurGuard] Puntuación de riesgo alta: ${score}`);
            await fgModRepo.logAction({
                guildId,
                targetId: userId,
                moderatorId: guild.client.user.id,
                action: 'mute',
                reason: `Puntuación de riesgo alta: ${score}`,
                duration: 600,
            });
            await fgBehaviorRepo.incrementAction(guildId, userId, 'mute');
            return;
        }

        if (riskLevel === 'yellow' && toleranceOrder < RISK_LEVEL_ORDER['yellow']!) {
            try {
                const embed = createWarningEmbed(
                    'Advertencia Automática',
                    `Tu nivel de riesgo en **${guild.name}** ha alcanzado un nivel de advertencia (${score} puntos). Modera tu comportamiento para evitar sanciones.`,
                );
                await member.send({ embeds: [embed] }).catch(() => {});
            } catch {
                log.debug({ guildId, userId }, 'No se pudo enviar DM de advertencia');
            }
            await fgModRepo.logAction({
                guildId,
                targetId: userId,
                moderatorId: guild.client.user.id,
                action: 'warn',
                reason: `Puntuación de riesgo elevada: ${score}`,
            });
            await fgBehaviorRepo.incrementAction(guildId, userId, 'warn');
        }
    } catch (err) {
        log.error({ err, guildId, userId, score }, 'Error ejecutando acción automática por riesgo');
    }
}

export async function decayAllScores(client: BotClient): Promise<void> {
    try {
        const staleScores = await fgRiskRepo.getAllStaleScores();
        let decayed = 0;

        for (const row of staleScores) {
            try {
                await fgRiskRepo.applyDecay(row.guildId, row.userId, client.cacheManager);
                decayed++;
            } catch (err) {
                log.error({ err, guildId: row.guildId, userId: row.userId }, 'Error aplicando decay');
            }
        }

        if (decayed > 0) {
            log.info({ decayed }, 'Decay de puntuaciones de riesgo completado');
        }
    } catch (err) {
        log.error({ err }, 'Error en el job de decay de puntuaciones');
    }
}
