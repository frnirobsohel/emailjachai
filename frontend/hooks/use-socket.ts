import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/api/v1/ws';

export interface WsMessage {
    type: string;
    job_id?: string;
    data: any;
    user_id?: number;
}

export function useSocket() {
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const connectRef = useRef<() => void>(() => {});
    const wsTokenRef = useRef<string | null>(null);

    // Fetch a short-lived WS token from the server (cookie-based auth)
    const fetchWsToken = useCallback(async (): Promise<string | null> => {
        try {
            const res = await fetch('/next-api/auth/ws-token');
            const data = await res.json();
            if (data.status === 'success' && data.data?.token) {
                wsTokenRef.current = data.data.token;
                return data.data.token;
            }
        } catch (err) {
            logger.warn('Failed to fetch WS token', err);
        }
        return null;
    }, []);

    const connect = useCallback(async () => {
        if (socketRef.current?.readyState === WebSocket.OPEN) return;

        // Get a fresh WS token
        const token = await fetchWsToken();
        if (!token) {
            // Stop trying if token cannot be fetched, connection will re-trigger on next auth state change
            return;
        }

        const url = `${WS_URL}?token=${token}`;
        
        try {
            const ws = new WebSocket(url);

            ws.onopen = () => {
                logger.info('WebSocket Connected');
                setIsConnected(true);
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }
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
                socketRef.current = null;
                reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), 3000);
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
            reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), 5000);
        }
    }, [fetchWsToken]);

    // Keep connectRef in sync (must be inside useEffect, not during render)
    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    useEffect(() => {
        connect();
        return () => {
            if (socketRef.current) {
                socketRef.current.onclose = null; // Prevent reconnect on manual close
                socketRef.current.close();
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [connect]);

    const sendMessage = useCallback((msg: any) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(msg));
        } else {
            logger.warn('Cannot send message: WebSocket is not open');
        }
    }, []);

    return { isConnected, sendMessage };
}
