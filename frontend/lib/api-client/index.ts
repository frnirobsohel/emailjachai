import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from '@/lib/logger';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/next-api/proxy';

export interface ApiResponse<T = unknown> {
    status: 'success' | 'error';
    message: string;
    data?: T;
    code?: string;
}

class ApiClientService {
    private instance: AxiosInstance;

    constructor() {
        this.instance = axios.create({
            baseURL: API_BASE_URL,
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Request Interceptor
        this.instance.interceptors.request.use(
            (config) => {
                // Authentication is handled exclusively via httpOnly cookies
                // through the Next.js proxy (/next-api/proxy). The proxy injects
                // the Bearer token server-side from the secure cookie, so no
                // client-side token management is needed or allowed here.
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        // Response Interceptor
        this.instance.interceptors.response.use(
            (response: AxiosResponse<ApiResponse>) => {
                if (response.data.status === 'error') {
                    logger.error(`API Error: ${response.data.message}`, { url: response.config.url });
                }
                return response;
            },
            (error) => {
                const payload = error.response?.data as ApiResponse | undefined;
                const message = payload?.message || error.message || 'An unexpected error occurred';
                logger.error(`HTTP Error: ${message}`, { 
                    status: error.response?.status,
                    url: error.config?.url,
                    code: payload?.code,
                });
                error.message = message;
                // Preserve backend error code without clobbering Axios' own `code` (e.g. ERR_NETWORK).
                if (typeof payload?.code === 'string' && payload.code) {
                    (error as { apiErrorCode?: string }).apiErrorCode = payload.code;
                }
                return Promise.reject(error);
            }
        );
    }

    public async get<T>(url: string, configOrBypassCache?: AxiosRequestConfig | boolean): Promise<ApiResponse<T>> {
        const config = typeof configOrBypassCache === 'boolean' ? undefined : configOrBypassCache;
        const response = await this.instance.get<ApiResponse<T>>(url, config);
        return response.data;
    }

    public async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const isFormData = typeof FormData !== 'undefined' && data instanceof FormData
        const response = await this.instance.post<ApiResponse<T>>(url, data, {
            ...config,
            timeout: config?.timeout ?? (isFormData ? 120_000 : 15_000),
            headers: isFormData
                ? { ...config?.headers, 'Content-Type': undefined }
                : config?.headers,
        })
        return response.data
    }

    public async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const response = await this.instance.put<ApiResponse<T>>(url, data, config);
        return response.data;
    }

    public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const response = await this.instance.delete<ApiResponse<T>>(url, config);
        return response.data;
    }

    public getBaseUrl(): string {
        return API_BASE_URL;
    }
}

export const apiClient = new ApiClientService();
// For backward compatibility while refactoring
export const ApiClient = apiClient;
