import type { GuildMember, PartialGuildMember } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'fg-event:guildMemberRemove' });

export default {
    name: 'guildMemberRemove',
    once: false,

    async execute(member: GuildMember | PartialGuildMember, client: BotClient): Promise<void> {
        log.debug({ guildId: member.guild.id, userId: member.id }, 'Miembro salió del servidor');
    },
};
