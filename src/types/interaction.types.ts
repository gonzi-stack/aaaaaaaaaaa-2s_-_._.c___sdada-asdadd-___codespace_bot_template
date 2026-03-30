import type {
    AnySelectMenuInteraction,
    AutocompleteInteraction,
    ButtonInteraction,
    ModalSubmitInteraction,
} from 'discord.js';
import type { BotClient } from '../bot.js';

/** Handler de botón: customId es un prefijo que matchea con startsWith */
export interface ButtonHandler {
    readonly customId: string;
    readonly handle: (interaction: ButtonInteraction, client: BotClient) => Promise<void>;
}

/** Handler de modal submit */
export interface ModalHandler {
    readonly customId: string;
    readonly handle: (interaction: ModalSubmitInteraction, client: BotClient) => Promise<void>;
}

/** Handler de select menu */
export interface SelectHandler {
    readonly customId: string;
    readonly handle: (interaction: AnySelectMenuInteraction, client: BotClient) => Promise<void>;
}

/** Handler de autocomplete */
export interface AutocompleteHandler {
    readonly commandName: string;
    readonly handle: (interaction: AutocompleteInteraction, client: BotClient) => Promise<void>;
}

/** Unión discriminada para todos los tipos de interacción custom */
export type InteractionHandler =
    | { readonly type: 'button'; readonly handler: ButtonHandler }
    | { readonly type: 'modal'; readonly handler: ModalHandler }
    | { readonly type: 'select'; readonly handler: SelectHandler }
    | { readonly type: 'autocomplete'; readonly handler: AutocompleteHandler };
