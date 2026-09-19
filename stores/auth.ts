/**
 * ZURI Driver App - Authentication Store
 * Manages login state, tokens, and biometric authentication
 * Using Zustand for clean, simple state management
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Refactor tracking-nativo-auto: arrancar Foreground Service post-login
import { configureNativeTracking, startNativeTracking, stopNativeTracking } from '@/services/nativeTracking';
import * as LocalAuthentication from 'expo-local-authentication';
import { api } from '@/services/api';
import { secureStorage, TOKEN_KEY } from '@/services/storage';
import { registerForPushNotifications } from '@/services/notifications';

// ============================================================================
// Types
// ============================================================================

interface Conductor {
    id: number;
    dni: string;
    nombres: string;
    apellidos: string;
    nombreCompleto: string;
    foto?: string;
    sexo?: string;
    estado: string;
    estadoServicio: string;
    calificacion?: number;
    placa?: string;                // Fallback directo
    marcaVehiculo?: string;        // Fallback directo
    modeloVehiculo?: string;       // Fallback directo
    biometriaEnabled: boolean;
    contacto: {
        celular1?: string;
        celular2?: string;
        email?: string;
    };
    ubicacion: {
        distritoId?: number;
        distritoNombre?: string;
        direccion?: string;
    };
    licencia: {
        numero?: string;
        categoria?: string;
        vencimiento?: string;
        certificacionMedica?: boolean;
        antecedentesPenales?: boolean;
    };
    vehiculo: {
        placa?: string;
        marca?: string;
        modelo?: string;
        color?: string;
        año?: number;
        foto?: string;
    };
    app: {
        version?: string;
        biometriaEnabled?: boolean;
    };
    zuriAiHabilitado?: boolean;
    metricas?: {
        calificacion?: number;
        totalServicios?: number;
    };
}

interface AuthState {
    // State
    isAuthenticated: boolean;
    isLoading: boolean;
    conductor: Conductor | null;
    error: string | null;
    biometricsAvailable: boolean;

    // Actions
    login: (dni: string, pin: string, deviceInfo?: DeviceInfo) => Promise<boolean>;
    loginWithBiometrics: () => Promise<boolean>;
    registerPin: (dni: string, pin: string, enableBiometrics: boolean) => Promise<{ success: boolean; message?: string; requiresVerification?: boolean }>;
    verifyPin: (dni: string, code: string, pin: string, enableBiometrics: boolean) => Promise<boolean>;
    resetPin: (data: { dni: string; celular?: string; nuevoPin?: string; confirmarPin?: string; step?: 'verify' | 'reset' }) => Promise<{ success: boolean; message?: string; verified?: boolean; conductorNombre?: string }>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<boolean>;
    checkBiometrics: () => Promise<boolean>;
    clearError: () => void;
}

interface DeviceInfo {
    deviceId?: string;
    devicePlatform?: string;
    appVersion?: string;
}

// Token keys
const DRIVER_KEY = 'zuri_driver_data';

// ============================================================================
// Store
// ============================================================================

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            // Initial state
            isAuthenticated: false,
            isLoading: false,
            conductor: null,
            error: null,
            biometricsAvailable: false,

            // ========================================
            // Login with PIN
            // ========================================
            login: async (dni, pin, deviceInfo) => {
                set({ isLoading: true, error: null });

                try {
                    const response = await api.post('/drivers/auth', {
                        dni,
                        pin,
                        ...deviceInfo
                    });

                    if (response.success) {
                        // Store token securely
                        await secureStorage.setItem(TOKEN_KEY, response.token);

                        // Register for push notifications (non-blocking)
                        registerForPushNotifications().catch(err =>
                            console.warn('[auth:push] Failed to register push token:', err)
                        );

                        // Update state
                        set({
                            isAuthenticated: true,
                            conductor: response.conductor,
                            isLoading: false,
                            error: null
                        });

                        // Refactor tracking-nativo-auto: arrancar Foreground Service post-login PIN
                        try {
                            await configureNativeTracking(response.conductor.id, response.token);
                            await startNativeTracking();
                            console.log('[AuthStore] nativeTracking arrancado post-login-PIN');
                        } catch (trackErr) {
                            console.warn('[AuthStore] nativeTracking start post-PIN fallo:', trackErr);
                        }

                        return true;
                    } else {
                        set({
                            error: response.error || 'Error de autenticación',
                            isLoading: false
                        });
                        return false;
                    }
                } catch (error: any) {
                    set({
                        error: error.message || 'Error de conexión',
                        isLoading: false
                    });
                    return false;
                }
            },

            // ========================================
            // Login with Biometrics
            // ========================================
            loginWithBiometrics: async () => {
                set({ isLoading: true, error: null });

                try {
                    // Check if biometrics are available
                    const hasHardware = await LocalAuthentication.hasHardwareAsync();
                    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

                    if (!hasHardware || !isEnrolled) {
                        set({
                            error: 'Autenticación biométrica no disponible',
                            isLoading: false
                        });
                        return false;
                    }

                    // Authenticate with biometrics
                    const result = await LocalAuthentication.authenticateAsync({
                        promptMessage: 'Inicia sesión con biometría',
                        cancelLabel: 'Usar PIN',
                        disableDeviceFallback: false
                    });

                    if (!result.success) {
                        set({
                            error: 'Autenticación cancelada',
                            isLoading: false
                        });
                        return false;
                    }

                    // Get stored token
                    const token = await secureStorage.getItem(TOKEN_KEY);

                    if (!token) {
                        set({
                            error: 'No hay sesión guardada. Use PIN.',
                            isLoading: false
                        });
                        return false;
                    }

                    // Verify token with server
                    const response = await api.get('/drivers/auth', token);

                    if (response.success) {
                        // Register for push notifications (non-blocking)
                        registerForPushNotifications().catch(err =>
                            console.warn('[auth:push] Failed to register push token:', err)
                        );

                        set({
                            isAuthenticated: true,
                            conductor: response.conductor,
                            isLoading: false,
                            error: null
                        });

                        // Refactor tracking-nativo-auto: arrancar Foreground Service post-biometrics
                        try {
                            const bioToken = await secureStorage.getItem(TOKEN_KEY);
                            if (bioToken && response.conductor?.id) {
                                await configureNativeTracking(response.conductor.id, bioToken);
                                await startNativeTracking();
                                console.log('[AuthStore] nativeTracking arrancado post-biometrics');
                            }
                        } catch (trackErr) {
                            console.warn('[AuthStore] nativeTracking start post-bio fallo:', trackErr);
                        }

                        return true;
                    } else {
                        // Token expired, clear it
                        await secureStorage.deleteItem(TOKEN_KEY);
                        set({
                            error: 'Sesión expirada. Use PIN.',
                            isLoading: false
                        });
                        return false;
                    }
                } catch (error: any) {
                    set({
                        error: error.message || 'Error de autenticación',
                        isLoading: false
                    });
                    return false;
                }
            },

            // ========================================
            // Register PIN (First Time Setup)
            // ========================================
            registerPin: async (dni, pin, enableBiometrics) => {
                set({ isLoading: true, error: null });

                try {
                    // First call - request verification code
                    const response = await api.post('/drivers/auth/register-pin', {
                        dni,
                        nuevoPin: pin,
                        enableBiometrics
                    });

                    set({ isLoading: false });

                    // API returns 'error' on failure, 'message' on success
                    return {
                        success: response.success,
                        message: response.message || response.error,
                        requiresVerification: response.requiresVerification
                    };
                } catch (error: any) {
                    set({
                        error: error.message,
                        isLoading: false
                    });
                    return { success: false, message: error.message };
                }
            },

            // ========================================
            // Verify PIN with Code
            // ========================================
            verifyPin: async (dni, code, pin, enableBiometrics) => {
                set({ isLoading: true, error: null });

                try {
                    const response = await api.post('/drivers/auth/register-pin', {
                        dni,
                        codigoVerificacion: code,
                        nuevoPin: pin,
                        enableBiometrics
                    });

                    if (response.success) {
                        set({ isLoading: false });
                        return true;
                    } else {
                        set({
                            error: response.error || 'Código incorrecto',
                            isLoading: false
                        });
                        return false;
                    }
                } catch (error: any) {
                    set({
                        error: error.message,
                        isLoading: false
                    });
                    return false;
                }
            },

            // ========================================
            // Reset PIN (Forgot PIN Flow)
            // ========================================
            resetPin: async (data) => {
                set({ isLoading: true, error: null });

                try {
                    const response = await api.post('/drivers/auth/reset-pin', data);

                    set({ isLoading: false });

                    if (!response.success) {
                        set({ error: response.error });
                    }

                    return {
                        success: response.success,
                        message: response.message || response.error,
                        verified: response.verified
                    };
                } catch (error: any) {
                    const msg = error.message || 'Error de conexión';
                    set({ error: msg, isLoading: false });
                    return { success: false, message: msg };
                }
            },

            // ========================================
            // Logout
            // ========================================
            logout: async () => {
                // Refactor tracking-nativo-auto: parar Foreground Service antes de limpiar sesion
                try { await stopNativeTracking(); } catch (e) { console.warn('[AuthStore] stopNativeTracking en logout:', e); }
                await secureStorage.deleteItem(TOKEN_KEY);
                // ZURI-FIX 2026-09-15: limpiar AsyncStorage residual (turno activo, GPS queue)
                // para que la siguiente sesion de otro conductor no herede estado.
                try {
                    await AsyncStorage.multiRemove([
                        'zuri_turno_activo',
                        'zuri_gps_queue',
                    ]);
                } catch (e) {
                    console.warn('[AuthStore] logout AsyncStorage cleanup failed:', e);
                }
                set({
                    isAuthenticated: false,
                    conductor: null,
                    error: null
                });
            },

            // ========================================
            // Check Authentication on App Start
            // ========================================
            checkAuth: async () => {
                try {
                    const token = await secureStorage.getItem(TOKEN_KEY);

                    if (!token) {

                        set({ isAuthenticated: false });
                        return false;
                    }


                    const response = await api.get('/drivers/auth', token);

                    if (response.success) {

                        set({
                            isAuthenticated: true,
                            conductor: response.conductor
                        });
                        return true;
                    } else {

                        await secureStorage.deleteItem(TOKEN_KEY);
                        set({ isAuthenticated: false });
                        return false;
                    }
                } catch (e: any) {
                    console.error('❌ [AuthStore] Error checking auth:', e.message);
                    set({ isAuthenticated: false });
                    return false;
                }
            },

            // ========================================
            // Check Biometrics Availability
            // ========================================
            checkBiometrics: async () => {
                try {
                    const hasHardware = await LocalAuthentication.hasHardwareAsync();
                    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
                    const available = hasHardware && isEnrolled;

                    set({ biometricsAvailable: available });
                    return available;
                } catch {
                    set({ biometricsAvailable: false });
                    return false;
                }
            },

            // ========================================
            // Clear Error
            // ========================================
            clearError: () => set({ error: null })
        }),
        {
            name: 'zuri-auth-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                // Only persist non-sensitive data
                conductor: state.conductor,
                biometricsAvailable: state.biometricsAvailable
            })
        }
    )
);

// Export helper to get token for API calls
export async function getAuthToken(): Promise<string | null> {
    return secureStorage.getItem(TOKEN_KEY);
}
