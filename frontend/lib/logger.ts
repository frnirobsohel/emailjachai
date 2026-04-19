"use client"

const SENSITIVE_KEYS = ['password', 'apiKey', 'token', 'secret', 'credit_card', 'cvv', 'authorization'];

/**
 * Redacts sensitive information from an object or string.
 */
export function redact(data: unknown): unknown {
    if (!data) return data;

    if (typeof data === 'string') {
        let redacted = data;
        SENSITIVE_KEYS.forEach(key => {
            const regex = new RegExp(`("${key}"\\s*:\\s*")([^"]+)(")`, 'gi');
            redacted = redacted.replace(regex, '$1[REDACTED]$3');
        });
        return redacted;
    }

    if (typeof data === 'object') {
        const copy = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
        const process = (obj: Record<string, unknown>) => {
            for (const key in obj) {
                if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    process(obj[key] as Record<string, unknown>);
                }
            }
        };
        process(copy);
        return copy;
    }

    return data;
}

export const logger = {
    info: (message: string, ...args: unknown[]) => {
        if (process.env.NODE_ENV !== 'development') return;
        const redactedArgs = redact(args) as unknown[];
        console.log(`[INFO] ${message}`, ...redactedArgs);
    },
    warn: (message: string, ...args: unknown[]) => {
        if (process.env.NODE_ENV !== 'development') return;
        const redactedArgs = redact(args) as unknown[];
        console.warn(`[WARN] ${message}`, ...redactedArgs);
    },
    error: (message: string, ...args: unknown[]) => {
        const redactedArgs = redact(args) as unknown[];
        console.error(`[ERROR] ${message}`, ...redactedArgs);
        // In a real production app, we would send this to a backend log aggregator here
    },
    debug: (message: string, ...args: unknown[]) => {
        if (process.env.NODE_ENV === 'development') {
            const redactedArgs = redact(args) as unknown[];
            console.debug(`[DEBUG] ${message}`, ...redactedArgs);
        }
    }
};
