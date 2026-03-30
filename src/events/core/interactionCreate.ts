import type { Interaction } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { InteractionRouter } from '../../lib/interaction-router.js';

const router = new InteractionRouter();

export default {
    name: 'interactionCreate',
    once: false,

    async execute(interaction: Interaction, client: BotClient): Promise<void> {
        await router.route(interaction, client);
    },
};
