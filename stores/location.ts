/**
 * ZURI Driver App — Location Store (migracion Traccar).
 * Sin BackgroundGeolocation. El estado "En linea" ya NO vive aqui: lo da el
 * SDK Traccar via traccarTracking.isActive() (foreground service real).
 * Este store conserva solo lo util para la UI:
 *   - currentLocation (mapa): lo alimenta hooks/useDriverLocation (expo-location).
 *   - isConnected (socket WS, informativo).
 *   - batteryLevel (informativo).
 */
import { create } from 'zustand';

export interface LocationData {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    timestamp: string;
}

interface LocationState {
    currentLocation: LocationData | null;
    lastLocationAt: number | null;
    isConnected: boolean;             // socket WS (informativo, no bloqueante)
    batteryLevel: number;
    error: string | null;

    setConnected: (connected: boolean) => void;
    updateLocation: (loc: LocationData) => void;
    setBatteryLevel: (level: number) => void;
}

export const useLocationStore = create<LocationState>()((set) => ({
    currentLocation: null,
    lastLocationAt: null,
    isConnected: false,
    batteryLevel: 0,
    error: null,

    setConnected: (connected) => set({ isConnected: connected }),
    setBatteryLevel: (level) => set({ batteryLevel: level }),
    updateLocation: (loc) => set({ currentLocation: loc, lastLocationAt: Date.now() }),
}));

// ── Selectores utiles para consumers ────────────────────────────────────────

/** True si la ultima posicion tiene <maxAgeSec segundos. */
export function isCurrentLocationFresh(maxAgeSec: number = 120) {
    return (state: LocationState): boolean => {
        if (!state.currentLocation || !state.lastLocationAt) return false;
        return (Date.now() - state.lastLocationAt) < maxAgeSec * 1000;
    };
}

/** Edad de la ultima posicion en segundos, o null si nunca hubo posicion. */
export function currentLocationAgeSec(state: LocationState): number | null {
    if (!state.lastLocationAt) return null;
    return Math.floor((Date.now() - state.lastLocationAt) / 1000);
}
