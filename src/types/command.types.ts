import type {
    ChatInputCommandInteraction,
    Message,
    PermissionResolvable,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { BotClient } from '../bot.js';

/** Estructura que debe satisfacer cada archivo de slash command */
export interface SlashCommand {
    readonly data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
    readonly execute: (interaction: ChatInputCommandInteraction, client: BotClient) => Promise<void>;
    readonly cooldown?: number;
    readonly permissions?: PermissionResolvable[];
    readonly guildOnly?: boolean;
}

/** Estructura que debe satisfacer cada archivo de prefix command */
export interface PrefixCommand {
    readonly name: string;
    readonly aliases?: string[];
    readonly description: string;
    readonly usage?: string;
    readonly execute: (message: Message, args: string[], client: BotClient) => Promise<void>;
    readonly cooldown?: number;
    readonly permissions?: PermissionResolvable[];
    readonly guildOnly?: boolean;
}
