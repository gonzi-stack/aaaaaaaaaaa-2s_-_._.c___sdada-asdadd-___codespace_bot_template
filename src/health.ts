import { createServer, type IncomingMessage } from 'node:http';
import type { BotClient } from './bot.js';
import { config } from './config.js';
import { createChildLogger } from './lib/logger.js';
import { formatBytes, formatUptime } from './utils/format.js';
import { createApiRouter } from './api/index.js';

const log = createChildLogger({ module: 'health' });

const ALLOWED_IPS = new Set([
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    ...config.apiAllowedIps.flatMap((ip) => [ip, `::ffff:${ip}`]),
]);

function getClientIp(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0]!.trim();
    }
    return req.socket.remoteAddress ?? 'unknown';
}

function isIpAllowed(ip: string): boolean {
    return ALLOWED_IPS.has(ip);
}

export function startHealthServer(client: BotClient): void {
    const apiRouter = createApiRouter(client);

    const server = createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/health') {
            const memUsage = process.memoryUsage();
            const healthData = {
                status: 'ok',
                uptime: formatUptime(client.uptime),
                uptimeMs: client.uptime,
                guilds: client.guilds.cache.size,
                ping: client.ws.ping,
                memoryMB: Math.round(memUsage.heapUsed / (1024 * 1024)),
                memoryRSS: formatBytes(memUsage.rss),
                timestamp: new Date().toISOString(),
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(healthData));
            return;
        }

        const clientIp = getClientIp(req);

        if (!isIpAllowed(clientIp)) {
            log.warn({ ip: clientIp, url: req.url, method: req.method }, 'Acceso denegado: IP no autorizada');
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Acceso denegado' }));
            return;
        }

        void apiRouter.handle(req, res).then((handled) => {
            if (!handled) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No encontrado' }));
            }
        });
    });

    server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            log.warn(`Puerto ${config.apiPort} en uso. Solo un shard correrá el servidor HTTP principal.`);
        } else {
            log.error({ err }, 'Error en el servidor HTTP');
        }
    });

    server.listen(config.apiPort, config.apiHost, () => {
        log.info(`Servidor HTTP escuchando en ${config.apiHost}:${config.apiPort}`);
        log.info(`IPs autorizadas: ${[...ALLOWED_IPS].join(', ')}`);
    });
}
