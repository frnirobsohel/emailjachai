"use client"

const SENSITIVE_KEYS = ['password', 'apiKey', 'token', 'secret', 'credit_card', 'cvv', 'authorization'];

/**
 * Safely serializes an unknown value to a loggable plain object.
 * Handles DOM Event/ErrorEvent objects whose properties are non-enumerable
 * and are lost through JSON.parse(JSON.stringify(...)).
 */
function safeSerialize(data: unknown): unknown {
    if (data instanceof Event) {
        // DOM Event / ErrorEvent — properties are non-enumerable, extract manually
        const ev = data as ErrorEvent & CloseEvent;
        return {
            type: ev.type,
            ...(ev.message !== undefined && { message: ev.message }),
            ...(ev.filename !== undefined && { filename: ev.filename }),
            ...(ev.code !== undefined && { code: ev.code }),
            ...(ev.reason !== undefined && { reason: ev.reason }),
            ...(ev.wasClean !== undefined && { wasClean: ev.wasClean }),
        };
    }
    if (data instanceof Error) {
        return { name: data.name, message: data.message, stack: data.stack };
    }
    try {
        return JSON.parse(JSON.stringify(data));
    } catch {
        return String(data);
    }
}

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

    if (Array.isArray(data)) {
        return data.map(item => redact(item));
    }

    if (typeof data === 'object') {
        const copy = safeSerialize(data) as Record<string, unknown>;
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
