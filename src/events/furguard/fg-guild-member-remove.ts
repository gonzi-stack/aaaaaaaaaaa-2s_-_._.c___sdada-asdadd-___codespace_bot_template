import type { GuildMember, PartialGuildMember } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { createChildLogger } from '../../lib/logger.js';

const log = createChildLogger({ module: 'fg-event:guildMemberRemove' });

export default {
    name: 'guildMemberRemove',
    once: false,

    execute(member: GuildMember | PartialGuildMember, _client: BotClient): void {
        log.debug({ guildId: member.guild.id, userId: member.id }, 'Miembro salió del servidor');
    },
};
