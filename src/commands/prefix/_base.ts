import type { Message, PermissionResolvable } from 'discord.js';
import type { BotClient } from '../../bot.js';

/**
 * Clase base abstracta para prefix commands.
 * Todos los prefix commands deben satisfacer esta interfaz.
 */
export abstract class BasePrefixCommand {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract execute(message: Message, args: string[], client: BotClient): Promise<void>;
    readonly aliases?: string[];
    readonly usage?: string;
    readonly cooldown?: number;
    readonly permissions?: PermissionResolvable[];
    readonly guildOnly?: boolean;
}
