/**
 * ZURI Driver App - API Service
 * Handles all HTTP requests to the ZURI backend
 */

import { secureStorage, TOKEN_KEY } from './storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://admin.zuri.pe/api';

// ============================================================================
// Types
// ============================================================================

interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    [key: string]: any;
}

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: any;
    token?: string;
    timeout?: number;
}

// ============================================================================
// API Client
// ============================================================================

class ApiClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    /**
     * Make an API request
     */
    private async request<T = any>(
        endpoint: string,
        options: RequestOptions = {}
    ): Promise<ApiResponse<T>> {
        const { method = 'GET', body, token, timeout = 15000 } = options;

        const url = `${this.baseUrl}${endpoint}`;

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };

        // Add auth token if provided
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || `Error ${response.status}`,
                    ...data
                };
            }

            return data;

        } catch (error: any) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                return { success: false, error: 'Tiempo de espera agotado' };
            }

            return {
                success: false,
                error: error.message || 'Error de conexión'
            };
        }
    }

    /**
     * GET request
     */
    async get<T = any>(endpoint: string, token?: string): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'GET', token });
    }

    /**
     * POST request
     */
    async post<T = any>(endpoint: string, body: any, token?: string): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'POST', body, token });
    }

    /**
     * PATCH request
     */
    async patch<T = any>(endpoint: string, body: any, token?: string): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'PATCH', body, token });
    }

    /**
     * DELETE request
     */
    async delete<T = any>(endpoint: string, token?: string): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'DELETE', token });
    }

    /**
     * Authenticated request (auto-fetch token)
     */
    async authGet<T = any>(endpoint: string): Promise<ApiResponse<T>> {
        const token = await secureStorage.getItem(TOKEN_KEY);
        if (!token) {
            return { success: false, error: 'No autenticado' };
        }
        return this.get<T>(endpoint, token);
    }

    async authPost<T = any>(endpoint: string, body: any): Promise<ApiResponse<T>> {
        const token = await secureStorage.getItem(TOKEN_KEY);
        if (!token) {
            return { success: false, error: 'No autenticado' };
        }
        return this.post<T>(endpoint, body, token);
    }

    async authPatch<T = any>(endpoint: string, body: any): Promise<ApiResponse<T>> {
        const token = await secureStorage.getItem(TOKEN_KEY);
        if (!token) {
            return { success: false, error: 'No autenticado' };
        }
        return this.patch<T>(endpoint, body, token);
    }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const api = new ApiClient(API_BASE_URL);

// ============================================================================
// Specific API Functions for better DX
// ============================================================================

export const driverApi = {
    // Auth
    login: (dni: string, pin: string, deviceInfo?: any) =>
        api.post('/drivers/auth', { dni, pin, ...deviceInfo }),

    verifyToken: (token: string) =>
        api.get('/drivers/auth', token),

    registerPin: (dni: string, data: any) =>
        api.post('/drivers/auth/register-pin', { dni, ...data }),

    // Profile
    getProfile: () =>
        api.authGet('/drivers/profile'),

    updateProfile: (data: any) =>
        api.authPatch('/drivers/profile', data),

    // Services
    getServices: (filters?: { estado?: string; fecha?: string }) => {
        const params = new URLSearchParams(filters as any).toString();
        return api.authGet(`/drivers/services${params ? `?${params}` : ''}`);
    },

    acceptService: (servicioId: number) =>
        api.authPost('/drivers/services', { servicioId, accion: 'aceptar' }),

    rejectService: (servicioId: number, motivo?: string) =>
        api.authPost('/drivers/services', { servicioId, accion: 'rechazar', motivo }),

    updateServiceStatus: (servicioId: number, nuevoEstado: string, ubicacion?: any) =>
        api.authPatch('/drivers/services', { servicioId, nuevoEstado, ubicacion }),

    // Location
    updateLocation: (data: any) =>
        api.authPost('/drivers/location', data),
};
