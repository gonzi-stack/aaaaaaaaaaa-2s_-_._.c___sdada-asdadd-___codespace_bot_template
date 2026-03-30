import type { ModalSubmitInteraction } from 'discord.js';
import type { BotClient } from '../../bot.js';

/**
 * Clase base abstracta para modal submit handlers.
 */
export abstract class BaseModal {
    /** Prefijo del customId que matchea con este handler */
    abstract readonly customId: string;
    abstract handle(interaction: ModalSubmitInteraction, client: BotClient): Promise<void>;
}
