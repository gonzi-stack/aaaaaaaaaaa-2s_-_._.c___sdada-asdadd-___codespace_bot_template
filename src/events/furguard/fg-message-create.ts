import type { Message } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { fgGuildRepo } from '../../db/repositories/fg-guild.repo.js';
import { fgRiskRepo } from '../../db/repositories/fg-risk.repo.js';
import { fgProRepo } from '../../db/repositories/fg-pro.repo.js';
import { CacheKeys } from '../../cache/keys.js';
import { FG_RISK, FG_SPAM } from '../../constants/furguard.js';
import { evaluateAndAct } from '../../lib/fg-risk-engine.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'fg-event:messageCreate' });

export default {
    name: 'messageCreate',
    once: false,

    async execute(message: Message, client: BotClient): Promise<void> {
        if (message.author.bot) return;
        if (!message.guild) return;

        const guildId = message.guild.id;

        try {
            const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
            if (!fgGuild) return;

            await handleSpamDetection(message, client, guildId);
            await handleMentionSpam(message, client, guildId);

            if (await fgGuildRepo.isPro(guildId, client.cacheManager)) {
                await recordHeatmapPoint(message, client, guildId);
            }
        } catch (err) {
            log.error({ err, guildId }, 'Error en messageCreate de FurGuard');
        }
    },
};

async function handleSpamDetection(message: Message, client: BotClient, guildId: string): Promise<void> {
    try {
        const spamKey = CacheKeys.fg.spamWindow(guildId, message.author.id, message.channel.id);
        const raw = await client.cacheManager.get(spamKey);
        const timestamps: number[] = raw ? JSON.parse(raw) as number[] : [];
        const now = Date.now();
        const windowMs = FG_SPAM.WINDOW_SECONDS * 1000;

        const recent = timestamps.filter(t => now - t < windowMs);
        recent.push(now);

        await client.cacheManager.set(spamKey, JSON.stringify(recent), FG_SPAM.WINDOW_SECONDS);

        if (recent.length >= FG_SPAM.MESSAGE_THRESHOLD) {
            const newScore = await fgRiskRepo.addDelta(
                guildId,
                message.author.id,
                FG_RISK.DELTA_SPAM,
                'Spam detectado',
                undefined,
                client.cacheManager,
            );

            const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
            if (fgGuild && message.guild) {
                await evaluateAndAct(guildId, message.author.id, newScore, fgGuild.toleranceLevel, message.guild);
            }
        }
    } catch (err) {
        log.error({ err, guildId, userId: message.author.id }, 'Error en detección de spam');
    }
}

async function handleMentionSpam(message: Message, client: BotClient, guildId: string): Promise<void> {
    try {
        if (message.mentions.users.size <= FG_SPAM.MENTION_THRESHOLD) return;

        const newScore = await fgRiskRepo.addDelta(
            guildId,
            message.author.id,
            FG_RISK.DELTA_MENTION_SPAM,
            `Spam de menciones: ${message.mentions.users.size} usuarios`,
            undefined,
            client.cacheManager,
        );

        const fgGuild = await fgGuildRepo.getGuild(guildId, client.cacheManager);
        if (fgGuild && message.guild) {
            await evaluateAndAct(guildId, message.author.id, newScore, fgGuild.toleranceLevel, message.guild);
        }
    } catch (err) {
        log.error({ err, guildId, userId: message.author.id }, 'Error en detección de mention spam');
    }
}

async function recordHeatmapPoint(message: Message, client: BotClient, guildId: string): Promise<void> {
    try {
        const mentioned = message.mentions.users.first();
        const pointData: Parameters<typeof fgProRepo.insertHeatmapPoint>[0] = {
            guildId,
            userId: message.author.id,
            channelId: message.channel.id,
            riskDelta: 0,
        };
        if (mentioned) pointData.interactedWith = mentioned.id;
        await fgProRepo.insertHeatmapPoint(pointData);
    } catch {
        log.debug({ guildId }, 'Error registrando heatmap point');
    }
}
