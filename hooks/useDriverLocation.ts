/**
 * ZURI Driver App - Abstract GPS Hook
 * Works on both Expo native (real GPS via expo-location) and web (navigator.geolocation).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

export interface DriverLocationData {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    timestamp: number;
}

export interface UseDriverLocationReturn {
    location: DriverLocationData | null;
    error: string | null;
    isTracking: boolean;
    startTracking: () => Promise<void>;
    stopTracking: () => void;
}

export function useDriverLocation(): UseDriverLocationReturn {
    const [location, setLocation] = useState<DriverLocationData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isTracking, setIsTracking] = useState(false);
    // Use a ref for the "already tracking" guard so callbacks have stable references
    const watchRef = useRef<any>(null);

    const stopTracking = useCallback(() => {
        if (watchRef.current == null) return;

        if (Platform.OS === 'web') {
            if (typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchRef.current);
            }
        } else {
            watchRef.current?.remove?.();
        }

        watchRef.current = null;
        setIsTracking(false);
    }, []); // stable — uses ref, not state

    const startTracking = useCallback(async () => {
        if (watchRef.current != null) return; // already tracking

        if (Platform.OS === 'web') {
            if (typeof navigator === 'undefined' || !navigator.geolocation) {
                setError('Geolocation not supported in this browser');
                return;
            }
            watchRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    setLocation({
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        heading: pos.coords.heading ?? undefined,
                        speed: pos.coords.speed ?? undefined,
                        accuracy: pos.coords.accuracy ?? undefined,
                        timestamp: pos.timestamp,
                    });
                    setError(null);
                },
                (err) => {
                    setError(err.message);
                    console.error('[useDriverLocation] Web GPS error:', err);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
            );
        } else {
            // Dynamic import avoids bundling expo-location into web chunks
            const Location = await import('expo-location');
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setError('Permiso de ubicación denegado');
                return;
            }
            watchRef.current = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 5000, distanceInterval: 10 },
                (loc) => {
                    setLocation({
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                        heading: loc.coords.heading ?? undefined,
                        speed: loc.coords.speed ?? undefined,
                        accuracy: loc.coords.accuracy ?? undefined,
                        timestamp: loc.timestamp,
                    });
                    setError(null);
                }
            );
        }

        setIsTracking(true);
    }, []); // stable — uses ref, not state

    // Cleanup on unmount reuses stopTracking
    useEffect(() => () => stopTracking(), [stopTracking]);

    return { location, error, isTracking, startTracking, stopTracking };
}

export default useDriverLocation;
