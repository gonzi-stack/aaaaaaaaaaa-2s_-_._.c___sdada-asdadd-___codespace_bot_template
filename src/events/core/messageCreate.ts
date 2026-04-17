import type { Message } from 'discord.js';
import type { BotClient } from '../../bot.js';
import { MessageParser } from '../../lib/command-parser.js';
import { CacheKeys } from '../../cache/keys.js';
import { config } from '../../config.js';
import { createChildLogger } from '../../lib/logger.js';
import { createErrorEmbed } from '../../lib/embed-builder.js';
import { checkPermissions, sendPermissionError } from '../../lib/permission-guard.js';
import { commandContext } from '../../lib/context.js';

const log = createChildLogger({ module: 'event:messageCreate' });

export default {
    name: 'messageCreate',
    once: false,

    async execute(message: Message, client: BotClient): Promise<void> {
        // Ignorar bots y mensajes del sistema
        if (message.author.bot) return;

        // Obtener prefijo del servidor (caché L1 → Redis → DB → default)
        let prefix = config.defaultPrefix;
        if (message.guild) {
            const cachedPrefix = await client.cacheManager.get(
                CacheKeys.guildPrefix(message.guild.id),
            );
            if (cachedPrefix) {
                prefix = cachedPrefix;
            } else {
                try {
                    const { guildRepo } = await import('../../db/repositories/guild.repo.js');
                    const dbPrefix = await guildRepo.getPrefix(message.guild.id, config.defaultPrefix);
                    prefix = dbPrefix;
                    // Cachear por 5 minutos
                    await client.cacheManager.set(
                        CacheKeys.guildPrefix(message.guild.id),
                        prefix,
                        300,
                    );
                } catch (err) {
                    log.debug({ err }, 'Error al obtener prefijo de la base de datos');
                }
            }
        }

        // Parsear el mensaje
        const parsed = MessageParser.parse(message.content, prefix, client.user.id);
        if (!parsed) return;

        const { commandName, args } = parsed;

        // Buscar comando
        const command = client.prefixCommands.get(commandName);
        if (!command) return;

        // Verificar guildOnly
        if (command.guildOnly && !message.guild) {
            await message.reply({
                embeds: [createErrorEmbed('Solo en servidores', 'Este comando solo se puede usar dentro de un servidor.')],
            });
            return;
        }

        // Verificar permisos
        const permCheck = checkPermissions(message.member, command.permissions);
        if (!permCheck.allowed) {
            await sendPermissionError(message, permCheck.missing);
            return;
        }

        // Verificar cooldown
        if (command.cooldown && command.cooldown > 0) {
            const remaining = await client.cooldowns.checkCooldown(
                message.author.id,
                command.name,
                command.cooldown,
            );
            if (remaining > 0) {
                const reply = await message.reply({
                    embeds: [createErrorEmbed('Cooldown activo', `Espera **${remaining}s** antes de usar este comando de nuevo.`)],
                });
                setTimeout(() => {
                    reply.delete().catch(() => { });
                }, 5_000);
                return;
            }
        }

        // Ejecutar comando
        try {
            await commandContext.run({ guildId: message.guildId, client }, async () => {
                await command.execute(message, args, client);
            });
        } catch (err) {
            log.error({ err, commandName: command.name }, 'Error ejecutando prefix command');
            const reply = await message.reply({
                embeds: [createErrorEmbed('Error', 'Ocurrió un error al ejecutar este comando. Inténtalo de nuevo más tarde.')],
            });
            setTimeout(() => {
                reply.delete().catch(() => { });
            }, 10_000);
        }
    },
};
