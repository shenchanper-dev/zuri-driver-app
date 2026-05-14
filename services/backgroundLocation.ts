import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const BACKGROUND_TASK_NAME = 'ZURI_BACKGROUND_LOCATION';

const CONDUCTOR_ID_KEY = 'zuri_conductor_id';
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://admin.zuri.pe/api';

// Must be defined at module top-level (Expo TaskManager requirement).
if (Platform.OS !== 'web') {
    TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }: any) => {
        if (error) {
            console.error('[GPS BG]', error.message);
            return;
        }
        if (!data?.locations?.length) return;

        const loc = data.locations[0];

        try {
            const conductorIdStr = await AsyncStorage.getItem(CONDUCTOR_ID_KEY);
            const conductorId = conductorIdStr ? parseInt(conductorIdStr, 10) : null;
            if (!conductorId) {
                console.warn('[GPS BG] Sin conductorId en AsyncStorage — descartando');
                return;
            }

            const velocidadKmh =
                loc.coords.speed != null && loc.coords.speed >= 0
                    ? loc.coords.speed * 3.6
                    : null;

            const response = await fetch(`${API_BASE}/conductores/gps-tracking`, {
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
                console.error('[GPS BG] HTTP failed:', response.status);
            }
        } catch (err) {
            console.error('[GPS BG] Error enviando ubicación:', err);
        }
    });
}

/**
 * Start background GPS updates. Saves conductorId to AsyncStorage so the
 * background task handler can read it when the app is suspended.
 */
export async function startBackgroundLocation(conductorId: number): Promise<void> {
    if (Platform.OS === 'web') return;

    await AsyncStorage.setItem(CONDUCTOR_ID_KEY, String(conductorId));

    const yaActiva = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME).catch(() => false);
    if (yaActiva) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME).catch(() => {});
    }

    await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50,   // meters
        timeInterval: 30_000,   // ms
        deferredUpdatesInterval: 0,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: {
            notificationTitle: '🚗 ZURI — Turno Activo',
            notificationBody: 'GPS activo · Tu posición se está compartiendo',
            notificationColor: '#00875A',
        },
    });

    console.log('[GPS BG] Background location started (30s / 50m)');
}

export async function stopBackgroundLocation(): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
        const running = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
        if (running) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_TASK_NAME);
            console.log('[GPS BG] Background location stopped');
        }
    } catch (err) {
        console.error('[GPS BG] Error stopping:', err);
    }
}

export async function isBackgroundLocationActive(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME).catch(() => false);
}
