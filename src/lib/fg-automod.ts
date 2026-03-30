import {
    AutoModerationRuleKeywordPresetType,
    AutoModerationRuleTriggerType,
    AutoModerationActionType,
    AutoModerationRuleEventType,
} from 'discord.js';
import type { Guild } from 'discord.js';
import crypto from 'node:crypto';
import { pool } from '../db/connection.js';
import type { RowDataPacket } from 'mysql2/promise';
import { createChildLogger } from './logger.js';
import { FG_AUTOMOD_MAX_RULES } from '../constants/furguard.js';

const log = createChildLogger({ module: 'fg-automod' });

const SPAM_KEYWORDS = [
    'free nitro',
    'nitro gratis',
    'discord nitro free',
    'haz click aquí',
    'click here',
    'gana dinero',
    'earn money',
    'steam gift',
    'regalo steam',
    '@everyone check',
    'http://bit.ly',
    'http://tinyurl',
];

const SLUR_KEYWORDS = [
    'puto',
    'puta',
    'maricón',
    'marica',
    'retrasado',
    'subnormal',
    'mongólico',
];

interface AutomodRuleDefinition {
    ruleType: string;
    name: string;
    triggerType: AutoModerationRuleTriggerType;
    triggerMetadata: Record<string, unknown>;
    actions: Array<{
        type: AutoModerationActionType;
        metadata?: Record<string, unknown>;
    }>;
}

function getRuleDefinitions(): AutomodRuleDefinition[] {
    return [
        {
            ruleType: 'furguard_keywords',
            name: '🛡️ FurGuard — Filtro de Palabras',
            triggerType: AutoModerationRuleTriggerType.Keyword,
            triggerMetadata: { keywordFilter: [...SPAM_KEYWORDS, ...SLUR_KEYWORDS] },
            actions: [
                { type: AutoModerationActionType.BlockMessage, metadata: { customMessage: '🛡️ Mensaje bloqueado por FurGuard: contenido inapropiado o spam.' } },
            ],
        },
        {
            ruleType: 'furguard_regex',
            name: '🛡️ FurGuard — Patrones Sospechosos',
            triggerType: AutoModerationRuleTriggerType.Keyword,
            triggerMetadata: { regexPatterns: ['(https?://\\S+.*){3,}', '[\\u0400-\\u04FF\\u0500-\\u052F]{3,}', '[A-Z\\s]{20,}'] },
            actions: [
                { type: AutoModerationActionType.BlockMessage, metadata: { customMessage: '🛡️ Mensaje bloqueado por FurGuard: patrón sospechoso detectado.' } },
            ],
        },
        {
            ruleType: 'mention_spam',
            name: '🛡️ FurGuard — Anti Mention Spam',
            triggerType: AutoModerationRuleTriggerType.MentionSpam,
            triggerMetadata: { mentionTotalLimit: 5 },
            actions: [
                { type: AutoModerationActionType.BlockMessage, metadata: { customMessage: '🛡️ Mensaje bloqueado por FurGuard: demasiadas menciones.' } },
            ],
        },
    ];
}

export async function setupAutomodRules(guild: Guild): Promise<number> {
    const definitions = getRuleDefinitions();
    let created = 0;

    for (const def of definitions) {
        if (created >= FG_AUTOMOD_MAX_RULES) break;

        try {
            const rule = await guild.autoModerationRules.create({
                name: def.name,
                eventType: AutoModerationRuleEventType.MessageSend,
                triggerType: def.triggerType,
                triggerMetadata: def.triggerMetadata,
                actions: def.actions,
                enabled: true,
            });

            const id = crypto.randomUUID();
            await pool.query(
                'INSERT INTO fg_automod_rules (id, guildId, discordRuleId, ruleType) VALUES (?, ?, ?, ?)',
                [id, guild.id, rule.id, def.ruleType],
            );

            created++;
        } catch (err: any) {
            if (err?.code === 50035 && err?.message?.includes('AUTO_MODERATION_MAX')) {
                log.warn({ guildId: guild.id, ruleType: def.ruleType }, 'Límite de AutoMod alcanzado; omitiendo regla');
            } else {
                log.error({ err, guildId: guild.id, ruleType: def.ruleType }, 'Error creando regla AutoMod');
            }
        }
    }

    log.info({ guildId: guild.id, created }, 'Reglas AutoMod creadas');
    return created;
}

export async function syncAutomodRules(guildId: string, guild: Guild): Promise<void> {
    try {
        const [dbRules] = await pool.query<RowDataPacket[]>(
            'SELECT * FROM fg_automod_rules WHERE guildId = ?',
            [guildId],
        );

        const existingRules = await guild.autoModerationRules.fetch().catch(() => null);
        if (!existingRules) return;

        const definitions = getRuleDefinitions();

        for (const dbRule of dbRules as Array<{ id: string; discordRuleId: string; ruleType: string }>) {
            const discordRule = existingRules.get(dbRule.discordRuleId);
            if (!discordRule) {
                const def = definitions.find(d => d.ruleType === dbRule.ruleType);
                if (!def) continue;

                try {
                    const newRule = await guild.autoModerationRules.create({
                        name: def.name,
                        eventType: AutoModerationRuleEventType.MessageSend,
                        triggerType: def.triggerType,
                        triggerMetadata: def.triggerMetadata,
                        actions: def.actions,
                        enabled: true,
                    });

                    await pool.query(
                        'UPDATE fg_automod_rules SET discordRuleId = ? WHERE id = ?',
                        [newRule.id, dbRule.id],
                    );

                    log.info({ guildId, ruleType: dbRule.ruleType }, 'Regla AutoMod recreada');
                } catch (err: any) {
                    if (err?.code === 50035 && err?.message?.includes('AUTO_MODERATION_MAX')) {
                        log.warn({ guildId, ruleType: dbRule.ruleType }, 'Límite de AutoMod alcanzado; omitiendo recreación');
                    } else {
                        log.error({ err, guildId, ruleType: dbRule.ruleType }, 'Error recreando regla AutoMod');
                    }
                }
            }
        }
    } catch (err) {
        log.error({ err, guildId }, 'Error sincronizando reglas AutoMod');
    }
}
