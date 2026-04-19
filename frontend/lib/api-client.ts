import { fetchAuth } from "./fetch-auth";
import { logger } from "./logger";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/next-api/proxy';

/**
 * Standardized API responses
 */
export interface ApiResponse<T = unknown> {
    status: 'success' | 'error';
    message: string;
    data?: T;
}

/**
 * Simple in-memory cache and request deduplicator for GET requests
 */
const GET_CACHE = new Map<string, { data: any; expiry: number }>();
const PENDING_GETS = new Map<string, Promise<any>>();
const CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Core API Client
 */
export const ApiClient = {
    async get<T>(endpoint: string, bypassCache = false): Promise<ApiResponse<T>> {
        const url = endpoint.startsWith('/auth') ? `/next-api${endpoint}` : `${API_BASE_URL}${endpoint}`;
        
        // 1. Check for cache hit
        if (!bypassCache && GET_CACHE.has(url)) {
            const entry = GET_CACHE.get(url)!;
            if (entry.expiry > Date.now()) {
                logger.debug(`Cache hit for GET ${endpoint}`);
                return entry.data;
            }
            GET_CACHE.delete(url);
        }

        // 2. Check for in-flight requests (Deduplication)
        if (PENDING_GETS.has(url)) {
            logger.debug(`Deduplicating GET ${endpoint}`);
            return PENDING_GETS.get(url)!;
        }

        // 3. Create a new request promise
        const fetchPromise = (async () => {
            try {
                logger.info(`Fetching GET ${endpoint}`);
                const response = await fetchAuth(url, {
                    method: 'GET',
                });
                const result = await response.json();
                
                if (result.status === 'success' && !bypassCache) {
                    GET_CACHE.set(url, { data: result, expiry: Date.now() + CACHE_TTL });
                }
                
                if (result.status === 'error') {
                    const isClientError = response.status >= 400 && response.status < 500;
                    if (isClientError) {
                        logger.warn(`GET ${endpoint} failed: ${result.message}`);
                    } else {
                        logger.error(`GET ${endpoint} failed: ${result.message}`);
                    }
                }
                
                return result;
            } finally {
                // Cleanup pending request map
                PENDING_GETS.delete(url);
            }
        })();

        // Store the promise in the pending map
        PENDING_GETS.set(url, fetchPromise);
        return fetchPromise;
    },

    async post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
        const url = endpoint.startsWith('/auth') ? `/next-api${endpoint}` : `${API_BASE_URL}${endpoint}`;
        logger.info(`Posting to ${endpoint}`, { body });
        const response = await fetchAuth(url, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        const result = await response.json();
        if (result.status === 'error') {
            const isClientError = response.status >= 400 && response.status < 500;
            if (isClientError) {
                logger.warn(`POST ${endpoint} failed: ${result.message}`);
            } else {
                logger.error(`POST ${endpoint} failed: ${result.message}`);
            }
        }
        return result;
    },

    async put<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
        const url = endpoint.startsWith('/auth') ? `/next-api${endpoint}` : `${API_BASE_URL}${endpoint}`;
        logger.info(`Putting to ${endpoint}`, { body });
        const response = await fetchAuth(url, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
        const result = await response.json();
        if (result.status === 'error') {
            const isClientError = response.status >= 400 && response.status < 500;
            if (isClientError) {
                logger.warn(`PUT ${endpoint} failed: ${result.message}`);
            } else {
                logger.error(`PUT ${endpoint} failed: ${result.message}`);
            }
        }
        return result;
    },

    async delete<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
        const url = endpoint.startsWith('/auth') ? `/next-api${endpoint}` : `${API_BASE_URL}${endpoint}`;
        logger.info(`Deleting from ${endpoint}`, { body });
        const options: RequestInit = { method: 'DELETE' };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetchAuth(url, options);
        const result = await response.json();
        if (result.status === 'error') {
            const isClientError = response.status >= 400 && response.status < 500;
            if (isClientError) {
                logger.warn(`DELETE ${endpoint} failed: ${result.message}`);
            } else {
                logger.error(`DELETE ${endpoint} failed: ${result.message}`);
            }
        }
        return result;
    },

    getBaseUrl() {
        return API_BASE_URL;
    }
};
