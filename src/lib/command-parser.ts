/**
 * MessageParser: parsea mensajes de texto para extraer comando y argumentos.
 *
 * Soporta:
 * - Prefijos multi-palabra
 * - Mención como prefijo (@Bot comando)
 * - Nombres de comando case-insensitive
 * - Argumentos con cadenas entre comillas ("hello world" como un solo argumento)
 */
export class MessageParser {
    /**
     * Intenta parsear un mensaje como un comando con prefijo.
     * Retorna null si el mensaje no comienza con el prefijo ni menciona al bot.
     */
    static parse(
        content: string,
        prefix: string,
        botId: string,
    ): { commandName: string; args: string[] } | null {
        let remaining: string | null = null;

        // Verificar mención como prefijo: <@!botId> o <@botId>
        const mentionPattern = new RegExp(`^<@!?${botId}>\\s*`);
        const mentionMatch = mentionPattern.exec(content);
        if (mentionMatch) {
            remaining = content.slice(mentionMatch[0].length).trim();
        }

        // Verificar prefijo normal (case-insensitive)
        if (remaining === null) {
            if (content.toLowerCase().startsWith(prefix.toLowerCase())) {
                remaining = content.slice(prefix.length).trim();
            }
        }

        if (remaining === null || remaining.length === 0) {
            return null;
        }

        // Extraer nombre del comando y argumentos
        const args = MessageParser.parseArgs(remaining);
        const commandName = args.shift();
        if (!commandName) return null;

        return {
            commandName: commandName.toLowerCase(),
            args,
        };
    }

    /**
     * Parsea una cadena de argumentos soportando cadenas entre comillas.
     * "hola mundo" → un solo argumento: "hola mundo"
     */
    static parseArgs(input: string): string[] {
        const args: string[] = [];
        let current = '';
        let inQuote = false;
        let quoteChar = '';

        for (let i = 0; i < input.length; i++) {
            const char = input[i]!;

            if (inQuote) {
                if (char === quoteChar) {
                    inQuote = false;
                    if (current.length > 0) {
                        args.push(current);
                        current = '';
                    }
                } else {
                    current += char;
                }
            } else if (char === '"' || char === "'") {
                inQuote = true;
                quoteChar = char;
            } else if (char === ' ') {
                if (current.length > 0) {
                    args.push(current);
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current.length > 0) {
            args.push(current);
        }

        return args;
    }
}
