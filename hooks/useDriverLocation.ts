/**
 * ZURI Driver App - Abstract GPS Hook
 * Works on both Expo native (real GPS via expo-location) and web (navigator.geolocation).
 * FIX 3: Platform-agnostic location abstraction
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Hook
// ============================================================================

export function useDriverLocation(): UseDriverLocationReturn {
    const [location, setLocation] = useState<DriverLocationData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isTracking, setIsTracking] = useState(false);
    // watchRef holds the native subscription or web watchId
    const watchRef = useRef<any>(null);

    const startTracking = useCallback(async () => {
        if (isTracking) return;

        if (Platform.OS === 'web') {
            // ── Web: navigator.geolocation ──────────────────────────────────
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
            setIsTracking(true);
        } else {
            // ── Native: expo-location ───────────────────────────────────────
            // Dynamic import prevents tree-shaking issues on web builds
            const Location = await import('expo-location');

            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                setError('Permiso de ubicación denegado');
                return;
            }

            watchRef.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 5000,        // mínimo cada 5s
                    distanceInterval: 10,      // o cada 10m
                },
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
            setIsTracking(true);
        }
    }, [isTracking]);

    const stopTracking = useCallback(() => {
        if (!isTracking) return;

        if (Platform.OS === 'web') {
            if (watchRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchRef.current);
            }
        } else {
            // Expo native subscription has a .remove() method
            watchRef.current?.remove?.();
        }

        watchRef.current = null;
        setIsTracking(false);
    }, [isTracking]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (Platform.OS === 'web') {
                if (watchRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
                    navigator.geolocation.clearWatch(watchRef.current);
                }
            } else {
                watchRef.current?.remove?.();
            }
        };
    }, []);

    return { location, error, isTracking, startTracking, stopTracking };
}

export default useDriverLocation;
