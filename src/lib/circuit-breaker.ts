import { createChildLogger } from './logger.js';

const log = createChildLogger({ module: 'circuit-breaker' });

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
    /** Nombre del circuito (para logging) */
    readonly name: string;
    /** Número de fallos consecutivos para abrir el circuito */
    readonly failureThreshold: number;
    /** Tiempo en ms que el circuito permanece abierto antes de pasar a half-open */
    readonly resetTimeout: number;
}

/**
 * Circuit breaker para llamadas a APIs externas.
 * Previene cascadas de fallos cortando llamadas cuando se detectan errores repetidos.
 */
export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly options: CircuitBreakerOptions;

    constructor(options: CircuitBreakerOptions) {
        this.options = options;
    }

    /**
     * Ejecuta una función protegida por el circuit breaker.
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
                this.state = 'HALF_OPEN';
                log.info({ circuit: this.options.name }, 'Circuito en half-open, intentando reconexión');
            } else {
                throw new Error(`Circuito "${this.options.name}" abierto — servicio temporalmente no disponible`);
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (err) {
            this.onFailure();
            throw err;
        }
    }

    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            log.info({ circuit: this.options.name }, 'Circuito cerrado — servicio recuperado');
        }
        this.failureCount = 0;
        this.state = 'CLOSED';
    }

    private onFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.failureCount >= this.options.failureThreshold) {
            this.state = 'OPEN';
            log.warn(
                { circuit: this.options.name, failures: this.failureCount },
                'Circuito abierto — demasiados fallos consecutivos',
            );
        }
    }

    /** Estado actual del circuito */
    getState(): CircuitState {
        return this.state;
    }
}
