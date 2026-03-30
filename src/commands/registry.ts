import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BotClient } from '../bot.js';
import type { SlashCommand, PrefixCommand, ButtonHandler, ModalHandler, SelectHandler, AutocompleteHandler } from '../types/index.js';
import { createChildLogger } from '../lib/logger.js';

const log = createChildLogger({ module: 'registry' });

const __filename = fileURLToPath(import.meta.url);
const isTsNode = __filename.endsWith('.ts');
const basePath = isTsNode
    ? dirname(__filename)
    : join(process.cwd(), 'dist', 'commands');

/**
 * Carga dinámica de módulos desde un directorio.
 */
async function loadModules<T>(dirPath: string): Promise<T[]> {
    const modules: T[] = [];
    let files: string[];

    try {
        files = readdirSync(dirPath).filter(
            (f) => (f.endsWith('.js') || f.endsWith('.ts')) && !f.startsWith('_'),
        );
    } catch {
        log.debug({ dirPath }, 'Directorio no encontrado, saltando carga');
        return modules;
    }

    for (const file of files) {
        try {
            const filePath = join(dirPath, file);
            const fileUrl = pathToFileURL(filePath).href;
            const imported = (await import(fileUrl)) as { default?: T };
            if (imported.default) {
                modules.push(imported.default);
                log.debug({ file }, 'Módulo cargado');
            } else {
                log.warn({ file }, 'Módulo sin export default, saltando');
            }
        } catch (err) {
            log.error({ err, file }, 'Error al cargar módulo');
        }
    }

    return modules;
}

/**
 * Registra todos los slash commands, prefix commands, y interaction handlers.
 */
export async function registerAll(client: BotClient): Promise<void> {
    // === Slash Commands ===
    const slashDir = join(basePath, 'slash');
    const slashModules = await loadModules<SlashCommand>(slashDir);
    for (const cmd of slashModules) {
        const name = cmd.data.name;
        client.slashCommands.set(name, cmd);
        log.info({ command: name }, 'Slash command registrado');
    }

    // === Prefix Commands ===
    const prefixDir = join(basePath, 'prefix');
    const prefixModules = await loadModules<PrefixCommand>(prefixDir);
    for (const cmd of prefixModules) {
        client.prefixCommands.set(cmd.name, cmd);
        if (cmd.aliases) {
            for (const alias of cmd.aliases) {
                client.prefixCommands.set(alias, cmd);
            }
        }
        log.info({ command: cmd.name, aliases: cmd.aliases }, 'Prefix command registrado');
    }

    // === Buttons ===
    const buttonsDir = join(basePath, '..', 'interactions', 'buttons');
    const buttonModules = await loadModules<ButtonHandler>(buttonsDir);
    for (const btn of buttonModules) {
        client.buttons.set(btn.customId, btn);
        log.info({ customId: btn.customId }, 'Button handler registrado');
    }

    // === Modals ===
    const modalsDir = join(basePath, '..', 'interactions', 'modals');
    const modalModules = await loadModules<ModalHandler>(modalsDir);
    for (const modal of modalModules) {
        client.modals.set(modal.customId, modal);
        log.info({ customId: modal.customId }, 'Modal handler registrado');
    }

    // === Selects ===
    const selectsDir = join(basePath, '..', 'interactions', 'selects');
    const selectModules = await loadModules<SelectHandler>(selectsDir);
    for (const sel of selectModules) {
        client.selects.set(sel.customId, sel);
        log.info({ customId: sel.customId }, 'Select handler registrado');
    }

    // === Autocomplete ===
    const autocompleteDir = join(basePath, '..', 'interactions', 'autocomplete');
    const autocompleteModules = await loadModules<AutocompleteHandler>(autocompleteDir);
    for (const ac of autocompleteModules) {
        client.autocomplete.set(ac.commandName, ac);
        log.info({ commandName: ac.commandName }, 'Autocomplete handler registrado');
    }

    log.info(
        {
            slash: client.slashCommands.size,
            prefix: client.prefixCommands.size,
            buttons: client.buttons.size,
            modals: client.modals.size,
            selects: client.selects.size,
            autocomplete: client.autocomplete.size,
        },
        'Registro de comandos e interacciones completado',
    );
}

/**
 * Retorna las definiciones JSON de todos los slash commands para registro vía REST.
 */
export function getSlashCommandsJSON(client: BotClient): unknown[] {
    const seen = new Set<string>();
    const commands: unknown[] = [];
    for (const [name, cmd] of client.slashCommands) {
        if (!seen.has(name)) {
            seen.add(name);
            commands.push(cmd.data.toJSON());
        }
    }
    return commands;
}
