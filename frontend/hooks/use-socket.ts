import { useEffect, useRef, useState, useCallback } from 'react';
import { useUserStore } from '@/lib/store/user-state';
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
    const { token } = useUserStore();

    const connect = useCallback(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) return;

        // Append token if available
        const url = token ? `${WS_URL}?token=${token}` : WS_URL;
        
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
                reconnectTimeoutRef.current = setTimeout(connect, 3000);
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
            reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
    }, [token]);

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
