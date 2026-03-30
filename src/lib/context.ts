import { AsyncLocalStorage } from 'node:async_hooks';

import type { BotClient } from '../bot.js';

export interface CommandContext {
    guildId: string | null;
    client?: BotClient;
}

export const commandContext = new AsyncLocalStorage<CommandContext>();
