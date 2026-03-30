export type { SlashCommand, PrefixCommand } from './command.types.js';
export type {
    ButtonHandler,
    ModalHandler,
    SelectHandler,
    AutocompleteHandler,
    InteractionHandler,
} from './interaction.types.js';

/** Configuración general del bot */
export interface Config {
    readonly token: string;
    readonly clientId: string;
    readonly devGuildId: string | undefined;
    readonly defaultPrefix: string;
    readonly database: {
        readonly host: string;
        readonly port: number;
        readonly user: string;
        readonly password: string;
        readonly database: string;
        readonly poolMax: number;
    };
    readonly redis: {
        readonly url: string;
    };
    readonly nodeEnv: 'development' | 'production';
    readonly apiHost: string;
    readonly apiPort: number;
    readonly apiAllowedIps: readonly string[];
    readonly logLevel: string;
}

/** Resultado genérico de operación */
export interface OperationResult<T = void> {
    readonly success: boolean;
    readonly data?: T;
    readonly error?: string;
}

/** Configuración de guild almacenada en DB */
export interface GuildSettings {
    readonly guildId: string;
    readonly prefix: string;
    readonly language: string;
    readonly features: Record<string, boolean>;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

/** Perfil de usuario almacenado en DB */
export interface UserProfile {
    readonly userId: string;
    readonly username: string;
    readonly globalCommandsUsed: number;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}
