/**
 * ZURI Driver App — useDriverLocation hook
 *
 * REFACTOR 2026-09-18: ahora usa react-native-background-geolocation
 * (Transistorsoft) en vez de expo-location. Compat con la API vieja
 * para no romper consumers.
 *
 * En native: consume BackgroundGeolocation.onLocation.
 * En web: fallback a navigator.geolocation (para preview del mapa).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
    const subscriberRef = useRef<any>(null);
    const webWatchRef = useRef<number | null>(null);

    const stopTracking = useCallback(() => {
        if (Platform.OS === 'web') {
            if (webWatchRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
                navigator.geolocation.clearWatch(webWatchRef.current);
                webWatchRef.current = null;
            }
        } else {
            if (subscriberRef.current?.remove) {
                subscriberRef.current.remove();
            }
            subscriberRef.current = null;
        }
        setIsTracking(false);
    }, []);

    const startTracking = useCallback(async () => {
        if (Platform.OS === 'web') {
            if (typeof navigator === 'undefined' || !navigator.geolocation) {
                setError('Geolocation no soportado en este navegador');
                return;
            }
            if (webWatchRef.current != null) return;
            webWatchRef.current = navigator.geolocation.watchPosition(
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
                (err) => setError(err.message),
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
            );
            setIsTracking(true);
            return;
        }

        // Native: suscribirse al onLocation de BackgroundGeolocation
        if (subscriberRef.current) return;
        const BackgroundGeolocation = (await import('react-native-background-geolocation')).default;
        subscriberRef.current = BackgroundGeolocation.onLocation((loc: any) => {
            setLocation({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                heading: loc.coords.heading ?? undefined,
                speed: loc.coords.speed ?? undefined,
                accuracy: loc.coords.accuracy ?? undefined,
                timestamp: new Date(loc.timestamp).getTime(),
            });
            setError(null);
        }, (errCode: number) => {
            setError(`GPS error code ${errCode}`);
        });
        setIsTracking(true);
    }, []);

    useEffect(() => () => stopTracking(), [stopTracking]);

    return { location, error, isTracking, startTracking, stopTracking };
}

export default useDriverLocation;
