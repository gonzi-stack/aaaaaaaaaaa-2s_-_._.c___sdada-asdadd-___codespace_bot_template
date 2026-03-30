import { WebhookClient, type WebhookMessageCreateOptions } from 'discord.js';
import { createChildLogger } from '../lib/logger.js';

const log = createChildLogger({ module: 'webhook-manager' });

interface WebhookConfig {
    id: string;
    token: string;
    channelId: string;
}

export class WebhookManager {
    private readonly webhooks = new Map<string, { client: WebhookClient; config: WebhookConfig }>();

    register(name: string, config: WebhookConfig): void {
        if (this.webhooks.has(name)) {
            this.webhooks.get(name)!.client.destroy();
        }

        const client = new WebhookClient({ id: config.id, token: config.token });
        this.webhooks.set(name, { client, config });
        log.info({ name, channelId: config.channelId }, 'Webhook registrado');
    }

    async send(name: string, options: WebhookMessageCreateOptions): Promise<void> {
        const entry = this.webhooks.get(name);
        if (!entry) {
            log.warn({ name }, 'Webhook no registrado');
            return;
        }

        try {
            await entry.client.send(options);
        } catch (err) {
            log.error({ err, name }, 'Error al enviar mensaje via webhook');
        }
    }

    get(name: string): WebhookClient | undefined {
        return this.webhooks.get(name)?.client;
    }

    getConfig(name: string): WebhookConfig | undefined {
        return this.webhooks.get(name)?.config;
    }

    has(name: string): boolean {
        return this.webhooks.has(name);
    }

    remove(name: string): void {
        const entry = this.webhooks.get(name);
        if (entry) {
            entry.client.destroy();
            this.webhooks.delete(name);
            log.info({ name }, 'Webhook eliminado');
        }
    }

    destroy(): void {
        for (const [name, entry] of this.webhooks) {
            entry.client.destroy();
            log.debug({ name }, 'Webhook destruido');
        }
        this.webhooks.clear();
    }
}
