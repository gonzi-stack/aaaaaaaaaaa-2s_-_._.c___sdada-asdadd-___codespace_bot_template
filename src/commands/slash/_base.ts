import type {
    ChatInputCommandInteraction,
    PermissionResolvable,
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { BotClient } from '../../bot.js';

/**
 * Clase base abstracta para slash commands.
 * Todos los slash commands deben satisfacer esta interfaz.
 */
export abstract class BaseSlashCommand {
    abstract readonly data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    abstract execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<void>;
    readonly cooldown?: number;
    readonly permissions?: PermissionResolvable[];
    readonly guildOnly?: boolean;
}
