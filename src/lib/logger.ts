import pino from 'pino';
import { config } from '../config.js';

const transport =
    config.nodeEnv === 'development'
        ? pino.transport({
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        })
        : undefined;

export const logger = pino(
    {
        level: config.logLevel,
        name: 'discord-bot',
        serializers: {
            err: pino.stdSerializers.err,
        },
    },
    transport,
);

/** Crea un logger hijo con contexto adicional */
export function createChildLogger(context: Record<string, unknown>): pino.Logger {
    return logger.child(context);
}
