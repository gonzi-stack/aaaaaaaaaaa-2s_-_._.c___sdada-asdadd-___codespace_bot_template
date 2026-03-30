import type { AnySelectMenuInteraction } from 'discord.js';
import type { BotClient } from '../../bot.js';

/**
 * Clase base abstracta para select menu handlers.
 */
export abstract class BaseSelect {
    /** Prefijo del customId que matchea con este handler */
    abstract readonly customId: string;
    abstract handle(interaction: AnySelectMenuInteraction, client: BotClient): Promise<void>;
}
