/**
 * ZURI Driver App - Location Store
 * Manages GPS tracking, background location, and WebSocket updates
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socket } from '@/services/socket';
import { useAuthStore } from '@/stores/auth';
import {
    startBackgroundLocation,
    stopBackgroundLocation,
    isBackgroundLocationActive,
} from '@/services/backgroundLocation';

const TURNO_ACTIVO_KEY = 'zuri_turno_activo';

// ============================================================================
// Offline GPS queue — persisted in AsyncStorage (survives app restarts)
// ============================================================================
const GPS_QUEUE_KEY = 'zuri_gps_queue';
const MAX_QUEUE_SIZE = 500;
// Dirty flag: true when the queue has items — avoids reading AsyncStorage on every connected GPS update
let gpsQueueDirty = false;

interface QueuedLocation {
    conductorId: number;
    data: any;
    queuedAt: number;
}

async function loadGpsQueue(): Promise<QueuedLocation[]> {
    try {
        const raw = await AsyncStorage.getItem(GPS_QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveGpsQueue(queue: QueuedLocation[]): Promise<void> {
    try {
        await AsyncStorage.setItem(GPS_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.error('[GPS Queue] Save error:', e);
    }
}

async function enqueueLocation(conductorId: number, data: any): Promise<void> {
    const queue = await loadGpsQueue();
    queue.push({ conductorId, data, queuedAt: Date.now() });
    await saveGpsQueue(queue.slice(-MAX_QUEUE_SIZE));
    gpsQueueDirty = true;
}

async function flushGpsQueue(): Promise<void> {
    const queue = await loadGpsQueue();
    if (queue.length === 0) { gpsQueueDirty = false; return; }

    const sentIndices = new Set<number>();
    queue.forEach(({ conductorId, data }, idx) => {
        if (socket.isConnected) {
            socket.emit('driver:location:update', { conductorId, ...data });
            sentIndices.add(idx);
        }
    });

    if (sentIndices.size === 0) return;

    // Persist only items that weren't sent (socket may have dropped mid-flush)
    const remaining = queue.filter((_, idx) => !sentIndices.has(idx));
    if (remaining.length > 0) {
        await saveGpsQueue(remaining);
    } else {
        await AsyncStorage.removeItem(GPS_QUEUE_KEY);
        gpsQueueDirty = false;
    }
    console.log(`📤 [GPS Queue] Flushed ${sentIndices.size} location(s), ${remaining.length} remain`);
}

function sendLocationViaSocket(conductorId: number, data: any) {
    if (socket.isConnected) {
        if (gpsQueueDirty) flushGpsQueue().catch(() => {});
        socket.emit('driver:location:update', { conductorId, ...data });
    } else {
        enqueueLocation(conductorId, data).catch(e =>
            console.error('[GPS Queue] Enqueue error:', e)
        );
    }
}

// Single registration guard — prevents duplicate listeners on hot reload
let _flushListenerRegistered = false;
if (!_flushListenerRegistered) {
    socket.on('connect', () => { flushGpsQueue().catch(() => {}); });
    _flushListenerRegistered = true;
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

            if (Platform.OS !== 'web' && backgroundStatus === 'granted') {
                const conductorId = useAuthStore.getState().conductor?.id;
                if (conductorId) {
                    await startBackgroundLocation(conductorId).catch(e =>
                        console.error('[Location] startBackgroundLocation error:', e)
                    );
                }
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
            await stopBackgroundLocation();

            if (Platform.OS === 'web') {
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
                const tareaActiva = await isBackgroundLocationActive();
                if (tareaActiva) {
                    // La tarea background sigue corriendo pero NO actualiza el store —
                    // arrancar watcher foreground para refrescar currentLocation y el mapa.
                    set({ isTracking: true });
                    get().startTracking().catch(() => {});
                    console.log('[Location] Turno reanudado — tarea background activa + watcher foreground re-armado');
                    return true;
                }
                // La tarea no está activa aunque haya flag → rearrancar GPS completo
                console.log('[Location] Turno persistido pero tarea inactiva — reiniciando GPS');
                return get().iniciarTurno();
            }

            // ZURI-FIX 2026-04-10: En web también rearrancar tracking si turno estaba activo
            // Esto permite que al recargar la PWA el socket vuelva a conectarse
            console.log('[Location] Turno persistido en web — reiniciando tracking');
            return get().iniciarTurno();
        } catch (err) {
            console.error('[Location] verificarTurnoPeristido error:', err);
            return false;
        }
    },
}));

// Background task is defined in services/backgroundLocation.ts
