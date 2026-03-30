import type {
    Interaction,
    ChatInputCommandInteraction,
    ButtonInteraction,
    ModalSubmitInteraction,
    AnySelectMenuInteraction,
    AutocompleteInteraction,
    GuildMember,
} from 'discord.js';
import type { BotClient } from '../bot.js';
import { createChildLogger } from './logger.js';
import { createErrorEmbed } from './embed-builder.js';
import { checkPermissions, replyPermissionError } from './permission-guard.js';

const log = createChildLogger({ module: 'interaction-router' });

/**
 * InteractionRouter: enruta cada tipo de interacción a su handler correcto
 * usando Maps para lookups O(1). Sin cadenas de if-else.
 */
export class InteractionRouter {
    /**
     * Enruta una interacción al handler correspondiente.
     */
    async route(interaction: Interaction, client: BotClient): Promise<void> {
        const guildId = interaction.guildId ?? null;
        
        await import('./context.js').then(({ commandContext }) => {
            commandContext.run({ guildId, client }, async () => {
                try {
                    if (interaction.isChatInputCommand()) {
                        await this.handleSlashCommand(interaction, client);
                    } else if (interaction.isButton()) {
                        await this.handleButton(interaction, client);
                    } else if (interaction.isModalSubmit()) {
                        await this.handleModal(interaction, client);
                    } else if (interaction.isAnySelectMenu()) {
                        await this.handleSelect(interaction, client);
                    } else if (interaction.isAutocomplete()) {
                        await this.handleAutocomplete(interaction, client);
                    }
                } catch (err) {
                    log.error({ err, interactionId: interaction.id }, 'Error no capturado en el router de interacciones');
                }
            });
        });
    }

    private async handleSlashCommand(
        interaction: ChatInputCommandInteraction,
        client: BotClient,
    ): Promise<void> {
        const command = client.slashCommands.get(interaction.commandName);
        if (!command) {
            log.warn({ commandName: interaction.commandName }, 'Slash command no encontrado');
            return;
        }

        // Verificar guildOnly
        if (command.guildOnly && !interaction.guild) {
            await interaction.reply({
                embeds: [createErrorEmbed('Solo en servidores', 'Este comando solo se puede usar dentro de un servidor.')],
                flags: 64,
            });
            return;
        }

        // Verificar permisos
        const permCheck = checkPermissions(interaction.member as GuildMember | null, command.permissions);
        if (!permCheck.allowed) {
            await replyPermissionError(interaction, permCheck.missing);
            return;
        }

        // Verificar cooldown
        if (command.cooldown && command.cooldown > 0) {
            const remaining = await client.cooldowns.checkCooldown(
                interaction.user.id,
                interaction.commandName,
                command.cooldown,
            );
            if (remaining > 0) {
                await interaction.reply({
                    embeds: [createErrorEmbed('Cooldown activo', `Espera **${remaining}s** antes de usar este comando de nuevo.`)],
                    flags: 64,
                });
                return;
            }
        }

        try {
            // Auto-defer: da 15 min en vez de 3s para responder
            await interaction.deferReply();
            await command.execute(interaction, client);
        } catch (err) {
            log.error({ err, commandName: interaction.commandName }, 'Error ejecutando slash command');
            try {
                const errorEmbed = createErrorEmbed(
                    'Error',
                    'Ocurrió un error al ejecutar este comando. Inténtalo de nuevo más tarde.',
                );
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], flags: 64 });
                }
            } catch {
                // La interacción ya expiró o no se pudo responder — ignorar silenciosamente
            }
        }
    }

    private async handleButton(
        interaction: ButtonInteraction,
        client: BotClient,
    ): Promise<void> {
        let matched = false;
        for (const [prefix, handler] of client.buttons) {
            if (interaction.customId === prefix || interaction.customId.startsWith(`${prefix}:`)) {
                matched = true;
                try {
                    await handler.handle(interaction, client);
                } catch (err) {
                    log.error({ err, customId: interaction.customId }, 'Error en handler de botón');
                    const errorEmbed = createErrorEmbed('Error', 'Ocurrió un error al procesar esta interacción.');
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ embeds: [errorEmbed], flags: 64 }).catch(() => { });
                    }
                }
                break;
            }
        }

        if (!matched) {
            log.debug({ customId: interaction.customId }, 'Botón sin handler registrado');
        }
    }

    private async handleModal(
        interaction: ModalSubmitInteraction,
        client: BotClient,
    ): Promise<void> {
        let matched = false;
        for (const [prefix, handler] of client.modals) {
            if (interaction.customId === prefix || interaction.customId.startsWith(`${prefix}:`)) {
                matched = true;
                try {
                    await handler.handle(interaction, client);
                } catch (err) {
                    log.error({ err, customId: interaction.customId }, 'Error en handler de modal');
                    const errorEmbed = createErrorEmbed('Error', 'Ocurrió un error al procesar el formulario.');
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ embeds: [errorEmbed], flags: 64 }).catch(() => { });
                    }
                }
                break;
            }
        }

        if (!matched) {
            log.debug({ customId: interaction.customId }, 'Modal sin handler registrado');
        }
    }

    private async handleSelect(
        interaction: AnySelectMenuInteraction,
        client: BotClient,
    ): Promise<void> {
        let matched = false;
        for (const [prefix, handler] of client.selects) {
            if (interaction.customId === prefix || interaction.customId.startsWith(`${prefix}:`)) {
                matched = true;
                try {
                    await handler.handle(interaction, client);
                } catch (err) {
                    log.error({ err, customId: interaction.customId }, 'Error en handler de select menu');
                    const errorEmbed = createErrorEmbed('Error', 'Ocurrió un error al procesar la selección.');
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ embeds: [errorEmbed], flags: 64 }).catch(() => { });
                    }
                }
                break;
            }
        }

        if (!matched) {
            log.debug({ customId: interaction.customId }, 'Select menu sin handler registrado');
        }
    }

    private async handleAutocomplete(
        interaction: AutocompleteInteraction,
        client: BotClient,
    ): Promise<void> {
        const handler = client.autocomplete.get(interaction.commandName);
        if (handler) {
            try {
                await handler.handle(interaction, client);
            } catch (err) {
                log.error({ err, commandName: interaction.commandName }, 'Error en handler de autocomplete');
                await interaction.respond([]).catch(() => { });
            }
        }
    }
}
