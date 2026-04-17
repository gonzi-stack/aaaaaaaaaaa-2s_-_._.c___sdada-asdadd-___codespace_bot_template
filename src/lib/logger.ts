import pino from 'pino';
import { config } from '../config.js';

const transportConfig: pino.TransportSingleOptions | undefined =
    config.nodeEnv === 'development'
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        }
        : undefined;

export const logger = pino({
    level: config.logLevel,
    name: 'discord-bot',
    serializers: {
        err: pino.stdSerializers.err,
    },
    ...(transportConfig ? { transport: transportConfig } : {}),
});

/** Crea un logger hijo con contexto adicional */
export function createChildLogger(context: Record<string, unknown>): pino.Logger {
    return logger.child(context);
}
