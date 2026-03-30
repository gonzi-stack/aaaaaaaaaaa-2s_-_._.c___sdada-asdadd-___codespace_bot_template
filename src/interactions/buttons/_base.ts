import type { ButtonInteraction } from 'discord.js';
import type { BotClient } from '../../bot.js';

/**
 * Clase base abstracta para button handlers.
 */
export abstract class BaseButton {
    /** Prefijo del customId que matchea con este handler */
    abstract readonly customId: string;
    abstract handle(interaction: ButtonInteraction, client: BotClient): Promise<void>;
}
