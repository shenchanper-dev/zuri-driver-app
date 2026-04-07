/**
 * ZURI Driver App - Location Store
 * Manages GPS tracking, background location, and WebSocket updates
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socket } from '@/services/socket';
import { useAuthStore } from '@/stores/auth';

// Background task name
const LOCATION_TASK_NAME = 'ZURI_BACKGROUND_LOCATION';

// Clave AsyncStorage para persistir estado del turno y conductorId
const TURNO_ACTIVO_KEY = 'zuri_turno_activo';
const CONDUCTOR_ID_KEY  = 'zuri_conductor_id';

// ============================================================================
// Offline location queue (in-memory fallback — no extra packages needed)
// ============================================================================
const MAX_PENDING_LOCATIONS = 50;
const pendingLocations: Array<{ conductorId: number; data: any; queuedAt: number }> = [];

function flushPendingLocations() {
    if (pendingLocations.length === 0) return;
    const toSend = pendingLocations.splice(0); // drain the queue
    toSend.forEach(({ conductorId, data }) => {
        socket.emit('driver:location:update', { conductorId, ...data });
    });
    console.log(`📤 [Location] Flushed ${toSend.length} queued location(s) after reconnect`);
}

function sendLocationViaSocket(conductorId: number, data: any) {
    if (socket.isConnected) {
        flushPendingLocations(); // send any buffered locations first
        socket.emit('driver:location:update', { conductorId, ...data });
    } else {
        if (pendingLocations.length < MAX_PENDING_LOCATIONS) {
            pendingLocations.push({ conductorId, data, queuedAt: Date.now() });
        }
        // Fall through — HTTP backup in updateLocation will persist the data
    }
}

// ============================================================================
// Types
// ============================================================================

interface LocationData {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    timestamp: string;
}

interface LocationState {
    // State
    currentLocation: LocationData | null;
    isTracking: boolean;
    isConnected: boolean;
    lastUpdate: string | null;
    batteryLevel: number | null;
    error: string | null;

    // Actions
    startTracking: () => Promise<boolean>;
    stopTracking: () => Promise<void>;
    updateLocation: (location: LocationData) => void;
    setBatteryLevel: (level: number) => void;
    setConnected: (connected: boolean) => void;

    // Turno (aliases con persistencia)
    iniciarTurno: () => Promise<boolean>;
    finalizarTurno: () => Promise<void>;
    verificarTurnoPeristido: () => Promise<boolean>;
}

// ============================================================================
// Store
// ============================================================================

export const useLocationStore = create<LocationState>()((set, get) => ({
    // Initial state
    currentLocation: null,
    isTracking: false,
    isConnected: false,
    lastUpdate: null,
    batteryLevel: null,
    error: null,

    // ========================================
    // Start GPS Tracking
    // ========================================
    startTracking: async () => {
        try {
            // Request permissions
            const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

            if (foregroundStatus !== 'granted') {
                set({ error: 'Permiso de ubicación denegado' });
                return false;
            }

            // ZURI-FIX 2026-03-31: requestBackgroundPermissionsAsync no existe en web — solo nativo
            let backgroundStatus = 'denied';
            if (Platform.OS !== 'web') {
                const { status } = await Location.requestBackgroundPermissionsAsync(); // ZURI-FIX 2026-03-31
                backgroundStatus = status;
                if (backgroundStatus !== 'granted') {
                    console.warn('Background location permission denied');
                }
            }

            // Start foreground tracking
            if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
                console.log('🌐 [Location] Using Web Geolocation API');
                const watchId = navigator.geolocation.watchPosition(
                    (position) => {
                        const locData: LocationData = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            heading: position.coords.heading ?? undefined,
                            speed: position.coords.speed ?? undefined,
                            accuracy: position.coords.accuracy ?? undefined,
                            timestamp: new Date().toISOString()
                        };
                        get().updateLocation(locData);
                    },
                    (error) => {
                        console.error('Web Geolocation error:', error);
                        set({ error: `GPS Web Error: ${error.message}` });
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 5000,
                    }
                );
                // ZURI-FIX 2026-04-03: guardar watchId para cleanup en stopTracking
                (set as any)({ _webWatchId: watchId });
            } else {
                await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.High,
                        distanceInterval: 10,      // Update every 10 meters
                        timeInterval: 5000         // Or every 5 seconds
                    },
                    (location) => {
                        const locData: LocationData = {
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            heading: location.coords.heading ?? undefined,
                            speed: location.coords.speed ?? undefined,
                            accuracy: location.coords.accuracy ?? undefined,
                            timestamp: new Date().toISOString()
                        };

                        get().updateLocation(locData);
                    }
                );
            }

            // ZURI-FIX 2026-03-31: startLocationUpdatesAsync no existe en web (ExpoLocation.web.js no lo implementa)
            if (Platform.OS !== 'web' && backgroundStatus === 'granted') {
                await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                    accuracy: Location.Accuracy.Balanced,
                    distanceInterval: 50,      // Update every 50 meters in background
                    timeInterval: 30000,       // Or every 30 seconds
                    showsBackgroundLocationIndicator: true,
                    foregroundService: {
                        notificationTitle: 'ZURI Tracking Activo',
                        notificationBody: 'Tu ubicación se está compartiendo',
                        notificationColor: '#0066CC'
                    }
                });
            }

            // ZURI-FIX 2026-04-03: Battery API puede lanzar excepción en navegadores
            // que no soportan Battery Status API (Safari iOS, Firefox mobile).
            // No debe impedir que isTracking se active.
            try {
                const batteryLevel = await Battery.getBatteryLevelAsync();
                set({ batteryLevel: batteryLevel * 100 }); // Convert 0-1 to 0-100

                // Suscribirse a cambios de batería
                Battery.addBatteryLevelListener(({ batteryLevel }) => {
                    set({ batteryLevel: batteryLevel * 100 });
                });
            } catch (batteryError) {
                console.warn('[Location] Battery API not available (normal on some browsers):', batteryError);
            }

            set({ isTracking: true, error: null });
            return true;

        } catch (error: any) {
            set({ error: error.message, isTracking: false });
            return false;
        }
    },

    // ========================================
    // Stop GPS Tracking
    // ========================================
    stopTracking: async () => {
        try {
            // ZURI-FIX 2026-04-03: TaskManager.isTaskRegisteredAsync lanza
            // UnavailabilityError en web (web shim no lo implementa)
            if (Platform.OS !== 'web') {
                const hasStarted = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
                if (hasStarted) {
                    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
                }
            } else {
                // ZURI-FIX 2026-04-03: limpiar watchPosition en web
                const watchId = (get() as any)._webWatchId;
                if (watchId != null && typeof navigator !== 'undefined' && navigator.geolocation) {
                    navigator.geolocation.clearWatch(watchId);
                    console.log('[Location] Web watchPosition cleared');
                }
            }

            set({ isTracking: false });
        } catch (error) {
            console.error('Error stopping tracking:', error);
            set({ isTracking: false }); // ZURI-FIX 2026-04-03: asegurar reset del estado incluso si hay error
        }
    },

    // ========================================
    // Update Location & Send to Server
    // ========================================
    updateLocation: (location) => {
        set({
            currentLocation: location,
            lastUpdate: location.timestamp
        });

        // Send to WebSocket (with offline queue fallback)
        const conductorId = useAuthStore.getState().conductor?.id;
        if (conductorId) {
            sendLocationViaSocket(conductorId, {
                latitude: location.latitude,
                longitude: location.longitude,
                heading: location.heading,
                speed: location.speed,
                accuracy: location.accuracy,
                batteryLevel: get().batteryLevel,
            });
        }

        // Also send via HTTP API as backup
        if (conductorId) {
            fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://admin.zuri.pe/api'}/conductores/gps-tracking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conductorId,
                    latitud: location.latitude,
                    longitud: location.longitude,
                    precision: location.accuracy,
                    velocidad: location.speed ? location.speed * 3.6 : null, // Convert m/s to km/h
                    rumbo: location.heading,
                    nivelBateria: get().batteryLevel
                })
            }).catch(err => console.error('HTTP GPS update error:', err));
        }
    },

    // ========================================
    // Battery Level
    // ========================================
    setBatteryLevel: (level) => set({ batteryLevel: level }),

    // ========================================
    // Connection Status
    // ========================================
    setConnected: (connected) => set({ isConnected: connected }),

    // ========================================================================
    // iniciarTurno — pide permisos, arranca GPS foreground + background,
    // persiste el estado en AsyncStorage para poder reanudarlo al reiniciar app.
    // ========================================================================
    iniciarTurno: async () => {
        try {
            // Persistir conductorId en AsyncStorage para que el background task lo lea
            const conductorId = useAuthStore.getState().conductor?.id;
            if (conductorId) {
                await AsyncStorage.setItem(CONDUCTOR_ID_KEY, String(conductorId));
            }

            const ok = await get().startTracking();
            if (ok) {
                await AsyncStorage.setItem(TURNO_ACTIVO_KEY, 'true');
            }
            return ok;
        } catch (err) {
            console.error('[Location] iniciarTurno error:', err);
            return false;
        }
    },

    // ========================================================================
    // finalizarTurno — detiene GPS y limpia el estado persistido.
    // ========================================================================
    finalizarTurno: async () => {
        try {
            await get().stopTracking();
            await AsyncStorage.removeItem(TURNO_ACTIVO_KEY);
        } catch (err) {
            console.error('[Location] finalizarTurno error:', err);
        }
    },

    // ========================================================================
    // verificarTurnoPeristido — al iniciar la app comprueba si había turno
    // activo y, si la tarea background sigue corriendo, reactiva el estado.
    // ========================================================================
    verificarTurnoPeristido: async () => {
        try {
            const valor = await AsyncStorage.getItem(TURNO_ACTIVO_KEY);
            if (valor !== 'true') return false;

            // En nativo verificar si la tarea background está registrada
            if (Platform.OS !== 'web') {
                const tareaActiva = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
                if (tareaActiva) {
                    // La tarea ya corre en background: solo sincronizar estado en memoria
                    set({ isTracking: true });
                    console.log('[Location] Turno reanudado — tarea background activa');
                    return true;
                }
                // La tarea no está activa aunque haya flag → rearrancar GPS completo
                console.log('[Location] Turno persistido pero tarea inactiva — reiniciando GPS');
                return get().iniciarTurno();
            }
            return false;
        } catch (err) {
            console.error('[Location] verificarTurnoPeristido error:', err);
            return false;
        }
    },
}));

// ============================================================================
// Background Task Definition (solo para móvil nativo)
// ============================================================================

// Solo definir el task en plataformas móviles nativas.
// IMPORTANTE: defineTask DEBE estar en el top-level del módulo (fuera de funciones/componentes).
if (Platform.OS !== 'web') {
    TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
        if (error) {
            console.error('[GPS BG]', error.message);
            return;
        }
        if (!data?.locations?.length) return;

        const loc = data.locations[0];

        try {
            // Obtener conductorId persistido en AsyncStorage (único storage accesible en background)
            const conductorIdStr = await AsyncStorage.getItem(CONDUCTOR_ID_KEY);
            const conductorId = conductorIdStr ? parseInt(conductorIdStr, 10) : null;
            if (!conductorId) {
                console.warn('[GPS BG] Sin conductorId en AsyncStorage — descartando ubicación');
                return;
            }

            const velocidadKmh = loc.coords.speed != null && loc.coords.speed >= 0
                ? loc.coords.speed * 3.6
                : null;

            // Intentar WebSocket si está disponible
            if (socket.isConnected) {
                socket.emit('driver:location:update', {
                    conductorId,
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    heading: loc.coords.heading,
                    speed: velocidadKmh,
                    accuracy: loc.coords.accuracy,
                });
            }

            // Siempre hacer fallback HTTP para garantizar persistencia en BD
            const apiBase = process.env.EXPO_PUBLIC_API_URL || 'https://admin.zuri.pe/api';
            const response = await fetch(`${apiBase}/conductores/gps-tracking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conductorId,
                    latitud: loc.coords.latitude,
                    longitud: loc.coords.longitude,
                    precision: loc.coords.accuracy,
                    velocidad: velocidadKmh,
                    rumbo: loc.coords.heading,
                }),
            });

            if (!response.ok) {
                console.error('[GPS BG] HTTP update failed:', response.status);
            }
        } catch (err) {
            console.error('[GPS BG] Error enviando ubicación:', err);
        }
    });
}
