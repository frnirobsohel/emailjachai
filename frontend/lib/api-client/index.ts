import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { logger } from '../logger';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/next-api/proxy';

export interface ApiResponse<T = unknown> {
    status: 'success' | 'error';
    message: string;
    data?: T;
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
                // If we are in the browser, try to get the token from localStorage or cookie
                // For now, we assume the server handles auth via cookies or the proxy handles it.
                // But we can add a token here if needed.
                const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
                if (token && config.headers) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
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
                const message = error.response?.data?.message || error.message || 'An unexpected error occurred';
                logger.error(`HTTP Error: ${message}`, { 
                    status: error.response?.status,
                    url: error.config?.url 
                });
                error.message = message;
                return Promise.reject(error);
            }
        );
    }

    public async get<T>(url: string, configOrBypassCache?: AxiosRequestConfig | boolean): Promise<ApiResponse<T>> {
        const config = typeof configOrBypassCache === 'boolean' ? undefined : configOrBypassCache;
        const response = await this.instance.get<ApiResponse<T>>(url, config);
        return response.data;
    }

    public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
        const response = await this.instance.post<ApiResponse<T>>(url, data, config);
        return response.data;
    }

    public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
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
