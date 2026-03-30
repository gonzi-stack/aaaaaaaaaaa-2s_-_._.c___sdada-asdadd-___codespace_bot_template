import type { IncomingMessage, ServerResponse } from 'node:http';
import { createChildLogger } from '../lib/logger.js';

const log = createChildLogger({ module: 'api:router' });

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

/** Parámetros extraídos de la URL (:id → params.id) */
export type RouteParams = Record<string, string>;

/** Request enriquecido con params y body parseado */
export interface ApiRequest extends IncomingMessage {
    params: RouteParams;
    body: unknown;
}

/** Respuesta con helpers de conveniencia */
export interface ApiResponse extends ServerResponse {
    json: (statusCode: number, data: unknown) => void;
}

/** Handler individual de ruta */
export type RouteHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

/** Métodos HTTP soportados */
type HttpMethod = 'GET' | 'POST';

/** Entrada interna de ruta registrada */
interface RouteEntry {
    readonly method: HttpMethod;
    readonly pattern: RegExp;
    readonly paramNames: string[];
    readonly handler: RouteHandler;
}

/* ------------------------------------------------------------------ */
/*  Router                                                             */
/* ------------------------------------------------------------------ */

/**
 * Router minimalista para el servidor HTTP interno.
 *
 * Soporta rutas con parámetros dinámicos (`:paramName`),
 * parseo automático de JSON body, y response helpers.
 *
 * @example
 * ```ts
 * const router = new ApiRouter();
 * router.get('/api/guild/:guildId', guildHandler);
 * router.post('/api/action', actionHandler);
 * ```
 */
export class ApiRouter {
    private readonly routes: RouteEntry[] = [];

    /** Registra una ruta GET */
    get(path: string, handler: RouteHandler): void {
        this.register('GET', path, handler);
    }

    /** Registra una ruta POST */
    post(path: string, handler: RouteHandler): void {
        this.register('POST', path, handler);
    }

    /**
     * Maneja una petición HTTP entrante.
     * @returns `true` si la ruta fue manejada, `false` si no matcheó ninguna ruta.
     */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const method = req.method?.toUpperCase() as HttpMethod;
        const url = req.url?.split('?')[0] ?? '/';

        for (const route of this.routes) {
            if (route.method !== method) continue;

            const match = route.pattern.exec(url);
            if (!match) continue;

            // Enriquecer request con params
            const apiReq = req as ApiRequest;
            apiReq.params = {};
            for (let i = 0; i < route.paramNames.length; i++) {
                const paramName = route.paramNames[i];
                if (paramName !== undefined) {
                    apiReq.params[paramName] = match[i + 1] ?? '';
                }
            }

            // Parsear body si es POST
            if (method === 'POST') {
                apiReq.body = await parseJsonBody(req);
            }

            // Enriquecer response con helper .json()
            const apiRes = res as ApiResponse;
            apiRes.json = (statusCode: number, data: unknown) => {
                res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            };

            try {
                await route.handler(apiReq, apiRes);
            } catch (err) {
                log.error({ err, method, url }, 'Error no capturado en handler de ruta');
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Error interno del servidor' }));
                }
            }

            return true;
        }

        return false;
    }

    /* ------------------------------------------------------------------ */
    /*  Internos                                                           */
    /* ------------------------------------------------------------------ */

    private register(method: HttpMethod, path: string, handler: RouteHandler): void {
        const paramNames: string[] = [];

        // Convertir `/api/guild/:guildId` → regex con grupos de captura
        const patternStr = path.replace(/:([a-zA-Z0-9_]+)/g, (_match, paramName: string) => {
            paramNames.push(paramName);
            return '([^/]+)';
        });

        const pattern = new RegExp(`^${patternStr}$`);
        this.routes.push({ method, pattern, paramNames, handler });

        log.debug({ method, path }, 'Ruta API registrada');
    }
}

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parsea el body JSON de una petición HTTP.
 * Retorna `null` si el body está vacío o no es JSON válido.
 */
function parseJsonBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });

        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            if (!raw.trim()) {
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch {
                resolve(null);
            }
        });

        req.on('error', () => {
            resolve(null);
        });
    });
}
