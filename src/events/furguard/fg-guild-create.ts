import type { Guild } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { fgGuildRepo } from '../../db/repositories/fg-guild.repo.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'fg-event:guildCreate' });

export default {
    name: 'guildCreate',
    once: false,

    async execute(guild: Guild, client: BotClient): Promise<void> {
        try {
            await fgGuildRepo.upsertGuild(guild.id, guild.ownerId, client.cacheManager);
            log.info({ guildId: guild.id, guildName: guild.name }, 'Guild registrada en FurGuard');
        } catch (err) {
            log.error({ err, guildId: guild.id }, 'Error registrando guild en FurGuard');
        }
    },
};
