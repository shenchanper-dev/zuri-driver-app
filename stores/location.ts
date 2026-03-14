/**
 * ZURI Driver App - Location Store
 * Manages GPS tracking, background location, and WebSocket updates
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import { socket } from '@/services/socket';
import { useAuthStore } from '@/stores/auth';

// Background task name
const LOCATION_TASK_NAME = 'ZURI_BACKGROUND_LOCATION';

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

            // Request background permission
            const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

            if (backgroundStatus !== 'granted') {
                console.warn('Background location permission denied');
                // Continue with foreground only
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
                // Store watchId if needed for cleanup
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

            // Start background tracking if permission granted
            if (backgroundStatus === 'granted') {
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

            // Leer nivel de batería
            const batteryLevel = await Battery.getBatteryLevelAsync();
            set({ batteryLevel: batteryLevel * 100 }); // Convert 0-1 to 0-100

            // Suscribirse a cambios de batería
            Battery.addBatteryLevelListener(({ batteryLevel }) => {
                set({ batteryLevel: batteryLevel * 100 });
            });

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
            // Stop background task
            const hasStarted = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
            if (hasStarted) {
                await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
            }

            set({ isTracking: false });
        } catch (error) {
            console.error('Error stopping tracking:', error);
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

        // Send to WebSocket if connected
        const conductorId = useAuthStore.getState().conductor?.id;
        if (get().isConnected && conductorId) {
            socket.emit('driver:location:update', {
                conductorId,
                latitude: location.latitude,
                longitude: location.longitude,
                heading: location.heading,
                speed: location.speed,
                accuracy: location.accuracy,
                batteryLevel: get().batteryLevel
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
    setConnected: (connected) => set({ isConnected: connected })
}));

// ============================================================================
// Background Task Definition (solo para móvil nativo)
// ============================================================================

// Solo definir el task en plataformas móviles nativas
if (Platform.OS !== 'web') {
    TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
        if (error) {
            console.error('Background location error:', error);
            return;
        }

        if (data) {
            const { locations } = data;
            const location = locations[0];

            if (location) {
                // Send to server via HTTP (WebSocket may not be available in background)
                try {
                    const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://admin.zuri.pe/api'}/drivers/location`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            heading: location.coords.heading,
                            speed: location.coords.speed,
                            accuracy: location.coords.accuracy,
                            timestamp: new Date(location.timestamp).toISOString()
                        })
                    });

                    if (!response.ok) {
                        console.error('Background location update failed');
                    }
                } catch (err) {
                    console.error('Background location HTTP error:', err);
                }
            }
        }
    });
}
