import type { AutocompleteInteraction } from 'discord.js';
import type { BotClient } from '../../bot.js';
import type { AutocompleteHandler } from '../../types/index.js';

/**
 * Ejemplo de autocomplete handler para el comando /bot.
 * Proporciona sugerencias dinámicas para los subcomandos.
 */
const handler: AutocompleteHandler = {
    commandName: 'bot',

    async handle(interaction: AutocompleteInteraction, _client: BotClient): Promise<void> {
        const focusedOption = interaction.options.getFocused(true);
        const choices = [
            { name: 'Información general', value: 'info' },
            { name: 'Latencia del bot', value: 'ping' },
            { name: 'Estadísticas', value: 'stats' },
        ];

        const filtered = choices.filter((choice) =>
            choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()),
        );

        await interaction.respond(filtered.slice(0, 25));
    },
};

export default handler;
