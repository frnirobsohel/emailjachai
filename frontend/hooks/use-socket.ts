import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

export interface WsMessage {
    type: string;
    job_id?: string;
    data: unknown;
    user_id?: number;
}

function getWsUrl() {
    if (process.env.NEXT_PUBLIC_WS_URL) {
        return process.env.NEXT_PUBLIC_WS_URL;
    }

    const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        `${window.location.protocol}//${window.location.host}/api/v1`;

    return apiUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '') + '/api/v1/ws';
}

/** Encode JWT into a Sec-WebSocket-Protocol token (browsers cannot set WS Authorization headers). */
function toWsAuthProtocol(token: string): string {
    const bytes = new TextEncoder().encode(token);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
    }
    const base64url = btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    return `ejp.jwt.${base64url}`;
}

export function useSocket(enabled = true) {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectAttemptRef = useRef(0);
    const isConnectingRef = useRef(false);
    const enabledRef = useRef(enabled);
    const connectRef = useRef<() => void>(() => {});

    // Fetch a short-lived WS token from the server (cookie-based auth)
    const fetchWsToken = useCallback(async (): Promise<string | null> => {
        const res = await fetch('/next-api/auth/ws-token', { cache: 'no-store' });
        if (res.status === 401) {
            return null;
        }

        if (!res.ok) {
            throw new Error(`WS token request failed with status ${res.status}`);
        }

        const data = await res.json();
        if (data.status === 'success' && data.data?.token) {
            return data.data.token;
        }

        return null;
    }, []);

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    }, []);

    const scheduleReconnect = useCallback(() => {
        if (!enabledRef.current || reconnectTimeoutRef.current) return;

        const delay = Math.min(30000, 1000 * 2 ** reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectRef.current();
        }, delay);
    }, []);

    const connect = useCallback(async () => {
        if (!enabledRef.current || typeof window === 'undefined') return;
        if (isConnectingRef.current) return;
        if (
            socketRef.current?.readyState === WebSocket.OPEN ||
            socketRef.current?.readyState === WebSocket.CONNECTING
        ) {
            return;
        }

        isConnectingRef.current = true;

        try {
            const token = await fetchWsToken();
            if (!enabledRef.current) return;
            if (!token) {
                setIsConnected(false);
                return;
            }

            // Pass token via Sec-WebSocket-Protocol — never as ?token= (avoids access-log leaks).
            const ws = new WebSocket(getWsUrl(), [toWsAuthProtocol(token)]);

            ws.onopen = () => {
                logger.info('WebSocket Connected');
                setIsConnected(true);
                reconnectAttemptRef.current = 0;
                clearReconnectTimer();
            };

            ws.onmessage = (event) => {
                try {
                    // Guard: skip empty frames or non-string data (e.g. ping/pong artifacts)
                    if (!event.data || typeof event.data !== 'string' || !event.data.trim().startsWith('{')) {
                        return;
                    }
                    const message: WsMessage = JSON.parse(event.data);
                    // Dispatch a custom event for global listeners
                    const customEvent = new CustomEvent('ws-message', { detail: message });
                    window.dispatchEvent(customEvent);
                    
                    // Also dispatch specific events by type
                    const typeEvent = new CustomEvent(`ws:${message.type}`, { detail: message });
                    window.dispatchEvent(typeEvent);
                } catch (err) {
                    logger.error('Failed to parse WS message', err);
                }
            };

            ws.onclose = () => {
                logger.warn('WebSocket Disconnected. Retrying in 3s...');
                setIsConnected(false);
                if (socketRef.current === ws) {
                    socketRef.current = null;
                }
                scheduleReconnect();
            };

            ws.onerror = (event) => {
                // WebSocket error events are generic DOM Events — extract what we can.
                // Use warn (dev-only) since transient errors during reconnect are expected.
                const info = event instanceof ErrorEvent
                    ? { type: event.type, message: event.message }
                    : { type: event.type };
                logger.warn('WebSocket connection error', info);
                ws.close();
            };

            socketRef.current = ws;
        } catch (err) {
            logger.error('Failed to initiate WebSocket connection', err);
            scheduleReconnect();
        } finally {
            isConnectingRef.current = false;
        }
    }, [clearReconnectTimer, fetchWsToken, scheduleReconnect]);

    // Keep connectRef in sync (must be inside useEffect, not during render)
    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    useEffect(() => {
        enabledRef.current = enabled;

        if (enabled) {
            connect();
        } else {
            clearReconnectTimer();
            if (socketRef.current) {
                socketRef.current.onclose = null;
                socketRef.current.close(1000, 'Realtime disabled');
                socketRef.current = null;
            }
            setIsConnected(false);
        }
        
        return () => {
            enabledRef.current = false;
            clearReconnectTimer();
            if (socketRef.current) {
                socketRef.current.onclose = null; // Prevent reconnect on manual close
                socketRef.current.close(1000, 'Component unmounted');
                socketRef.current = null;
            }
        };
    }, [clearReconnectTimer, connect, enabled]);

    const sendMessage = useCallback((msg: Record<string, unknown>) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(msg));
        } else {
            logger.warn('Cannot send message: WebSocket is not open');
        }
    }, []);

    return { isConnected, sendMessage };
}
