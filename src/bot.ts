import {
    Client,
    GatewayIntentBits,
    Partials,
    Options,
} from 'discord.js';
import type { Logger } from 'pino';
import type { SlashCommand, PrefixCommand, ButtonHandler, ModalHandler, SelectHandler, AutocompleteHandler } from './types/index.js';
import { CacheManager } from './cache/manager.js';
import { CooldownManager } from './lib/cooldown.js';
import { createChildLogger } from './lib/logger.js';
import { pool, testConnection, closePool } from './db/connection.js';
import type { Pool } from 'mysql2/promise';
import { WebhookManager } from './utils/webhook.js';

/**
 * BotClient extiende Client<true> con registries, caché, cooldowns, y logger.
 */
export class BotClient extends Client<true> {
    /** Registro de slash commands indexado por nombre */
    public readonly slashCommands = new Map<string, SlashCommand>();
    /** Registro de prefix commands indexado por nombre y aliases */
    public readonly prefixCommands = new Map<string, PrefixCommand>();
    /** Registro de button handlers indexado por customId prefix */
    public readonly buttons = new Map<string, ButtonHandler>();
    /** Registro de modal handlers indexado por customId prefix */
    public readonly modals = new Map<string, ModalHandler>();
    /** Registro de select menu handlers indexado por customId prefix */
    public readonly selects = new Map<string, SelectHandler>();
    /** Registro de autocomplete handlers indexado por commandName */
    public readonly autocomplete = new Map<string, AutocompleteHandler>();
    /** Gestor de caché L1+L2 */
    public readonly cacheManager: CacheManager;
    /** Gestor de cooldowns */
    public readonly cooldowns: CooldownManager;
    /** Pool de conexiones a base de datos */
    public readonly db: Pool;
    /** Gestor de webhooks */
    public readonly webhooks: WebhookManager;
    /** Logger principal */
    public readonly logger: Logger;

    constructor() {
        super({
            intents: [
                // Guilds: necesario para recibir eventos de servidores y canales
                GatewayIntentBits.Guilds,
                // GuildMembers: necesario para eventos guildMemberAdd/Remove
                GatewayIntentBits.GuildMembers,
                // GuildMessages: necesario para recibir mensajes en servidores
                GatewayIntentBits.GuildMessages,
                // MessageContent: REQUERIDO para leer el contenido de mensajes (prefix commands)
                GatewayIntentBits.MessageContent,
                // GuildMessageReactions: para tracking de reacciones si se necesita
                GatewayIntentBits.GuildMessageReactions,
                // DirectMessages: para soporte de comandos en DMs
                GatewayIntentBits.DirectMessages,
                // GuildModeration: necesario para guildAuditLogEntryCreate (NukeGuard)
                GatewayIntentBits.GuildModeration,
                // AutoModerationExecution: para tracking de acciones de AutoMod
                GatewayIntentBits.AutoModerationExecution,
            ],
            partials: [
                // Message: necesario para DMs y mensajes no cacheados
                Partials.Message,
                // Channel: necesario para canales DM
                Partials.Channel,
                // Reaction: necesario para reacciones en mensajes no cacheados
                Partials.Reaction,
            ],
            makeCache: Options.cacheWithLimits({
                // Nunca cacheamos presencias — innecesario para este bot
                PresenceManager: 0,
                // Nunca cacheamos invitaciones de servidor
                GuildInviteManager: 0,
                // Nunca cacheamos eventos programados
                GuildScheduledEventManager: 0,
            }),
            sweepers: {
                messages: {
                    // Barrer mensajes cada 10 minutos, eliminar los de más de 30 minutos
                    interval: 600,
                    lifetime: 1800,
                },
                guildMembers: {
                    // Barrer miembros del caché cada 10 minutos
                    interval: 600,
                    filter: () => (member) => {
                        // Mantener al bot y a miembros con roles especiales
                        return !member.user.bot && member.id !== member.client.user.id;
                    },
                },
            },
        });

        this.cacheManager = new CacheManager();
        this.cooldowns = new CooldownManager(this.cacheManager);
        this.db = pool;
        this.webhooks = new WebhookManager();
        this.logger = createChildLogger({ module: 'bot-client' });

    }

    /**
     * Inicializa los sistemas internos (caché, DB) antes de conectar.
     */
    async initialize(): Promise<void> {
        // Conectar al caché Redis
        await this.cacheManager.connect();

        // Verificar conexión a MariaDB
        const dbOk = await testConnection();
        if (!dbOk) {
            this.logger.warn('La base de datos no está disponible - algunas funciones estarán limitadas');
        }

        this.logger.info('Sistemas internos inicializados');
    }

    /**
     * Apaga el bot de forma limpia.
     */
    async shutdown(): Promise<void> {
        this.logger.info('Cerrando conexiones...');
        this.webhooks.destroy();
        await this.cacheManager.disconnect();
        await closePool();
        void this.destroy();
        this.logger.info('Bot apagado correctamente');
    }
}
