/**
 * ZURI Driver App — Location Store (SHIM HONESTO sobre BackgroundGeolocation)
 *
 * REFACTOR 2026-09-19 tracking-nativo-auto:
 * Este archivo era el stack viejo con expo-location + watchPositionAsync.
 * Ahora es un SHIM HONESTO que refleja el estado REAL derivado de:
 *   - BackgroundGeolocation.getState().enabled (Foreground Service corriendo)
 *   - lastServerAckAt (< 120s desde el último onHttp exitoso)
 *
 * NO es un flag local que se desincronize del estado real. Un consumer que
 * lee `isTracking` obtiene la verdad: si Transistorsoft se cayó por OS-kill,
 * licencia expirada, permisos revocados, etc., isTracking pasa a false
 * automáticamente dentro de 15s (interval de recompute) o al siguiente
 * evento onHttp/onLocation.
 *
 * Las funciones legacy (iniciarTurno, finalizarTurno, etc.) son no-op con
 * warning porque el tracking ahora es AUTOMÁTICO:
 *   - Arranca: en login exitoso (stores/auth.ts)
 *   - Recovery: en cold-start con sesión válida (app/_layout.tsx)
 *   - Sobrevive: OS-kill y reboot (stopOnTerminate:false + startOnBoot:true)
 *   - Para: solo en logout (stores/auth.ts) o "Terminar turno" en Perfil
 *
 * Consumers finales de este store (mientras se migran a useServerTrackingStatus):
 *   - app/(tabs)/index.tsx: isTracking (isOnline), currentLocation (mapa)
 *   - app/(tabs)/profile.tsx: nada crítico (todo migrado a nativeTracking directo)
 */

import { create } from 'zustand';
import BackgroundGeolocation, { Location } from 'react-native-background-geolocation';

// Umbral de liveness: 2 min sin ACK del server => isTracking = false.
// Mismo threshold que hooks/useServerTrackingStatus para consistencia.
const LIVENESS_THRESHOLD_MS = 120_000;
// Cada cuánto recomputar isTracking (para detectar cuando ackAge cruza el umbral).
const RECOMPUTE_INTERVAL_MS = 15_000;

export interface LocationData {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
    timestamp: string;
}

interface LocationState {
    // ── Estado HONESTO (derivado del estado real de Transistorsoft) ────────
    isTracking: boolean;             // Foreground Service enabled + ACK server <2min
    currentLocation: LocationData | null; // última posición conocida (con timestamp)
    lastLocationAt: number | null;   // ms epoch — consumers pueden computar edad
    lastServerAckAt: number | null;  // ms epoch del último onHttp 2xx
    isConnected: boolean;             // socket WS (informativo, no bloqueante)
    batteryLevel: number;             // último battery% reportado por el módulo
    error: string | null;

    // ── Actions internas ───────────────────────────────────────────────────
    _recomputeLiveness: () => Promise<void>;
    _onServerAck: () => void;
    setConnected: (connected: boolean) => void;
    updateLocation: (loc: LocationData) => void;
    setBatteryLevel: (level: number) => void;

    // ── API DEPRECADA — no-op con warnings ─────────────────────────────────
    // El tracking arranca en login (auth.ts), recovery en _layout, para en logout.
    // Estas funciones existían en el stack viejo (expo-location manual).
    // Ahora son no-op para no romper consumers residuales que aún las llamen.
    startTracking: () => Promise<boolean>;
    stopTracking: () => Promise<void>;
    iniciarTurno: () => Promise<boolean>;
    finalizarTurno: () => Promise<void>;
    verificarTurnoPeristido: () => Promise<boolean>;
}

export const useLocationStore = create<LocationState>()((set, get) => ({
    isTracking: false,
    currentLocation: null,
    lastLocationAt: null,
    lastServerAckAt: null,
    isConnected: false,
    batteryLevel: 0,
    error: null,

    _recomputeLiveness: async () => {
        try {
            const bgState = await BackgroundGeolocation.getState();
            const now = Date.now();
            const ackAge = get().lastServerAckAt != null ? now - get().lastServerAckAt! : Infinity;
            const isLive = bgState.enabled && ackAge < LIVENESS_THRESHOLD_MS;
            if (get().isTracking !== isLive) {
                set({ isTracking: isLive });
            }
        } catch {
            if (get().isTracking !== false) set({ isTracking: false });
        }
    },

    _onServerAck: () => {
        set({ lastServerAckAt: Date.now() });
        get()._recomputeLiveness();
    },

    setConnected: (connected) => set({ isConnected: connected }),
    setBatteryLevel: (level) => set({ batteryLevel: level }),
    updateLocation: (loc) => set({
        currentLocation: loc,
        lastLocationAt: Date.now(),
    }),

    // ────────── API DEPRECADA — no-op ──────────
    startTracking: async () => {
        console.warn(
            '[LocationStore] startTracking() DEPRECADO. El tracking arranca automatico ' +
            'post-login (stores/auth.ts). Este llamado es NO-OP.'
        );
        await get()._recomputeLiveness();
        return get().isTracking;
    },
    stopTracking: async () => {
        console.warn(
            '[LocationStore] stopTracking() DEPRECADO. Usa "Terminar turno" en Perfil ' +
            '(llama stopNativeTracking + logout). Este llamado es NO-OP.'
        );
    },
    iniciarTurno: async () => {
        console.warn(
            '[LocationStore] iniciarTurno() DEPRECADO. Tracking automatico post-login. NO-OP.'
        );
        await get()._recomputeLiveness();
        return get().isTracking;
    },
    finalizarTurno: async () => {
        console.warn(
            '[LocationStore] finalizarTurno() DEPRECADO. Usa "Terminar turno" en Perfil. NO-OP.'
        );
    },
    verificarTurnoPeristido: async () => {
        console.warn(
            '[LocationStore] verificarTurnoPeristido() DEPRECADO. _layout hace recovery ' +
            'automatico. Este llamado solo dispara recompute de liveness.'
        );
        await get()._recomputeLiveness();
        return get().isTracking;
    },
}));

// ── Attach listeners (idempotente, un solo bind por proceso) ─────────────────
// Debe llamarse desde app/_layout.tsx al arrancar la app.
let _attached = false;
let _intervalId: ReturnType<typeof setInterval> | null = null;

export function attachBackgroundGeolocationListener() {
    if (_attached) return;
    _attached = true;

    // onLocation: guardar posición + timestamp
    BackgroundGeolocation.onLocation((loc: Location) => {
        useLocationStore.getState().updateLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            heading: loc.coords.heading ?? undefined,
            speed: loc.coords.speed ?? undefined,
            accuracy: loc.coords.accuracy ?? undefined,
            timestamp: typeof loc.timestamp === 'string'
                ? loc.timestamp
                : new Date(loc.timestamp).toISOString(),
        });
        if (typeof loc.battery?.level === 'number') {
            useLocationStore.getState().setBatteryLevel(Math.round(loc.battery.level * 100));
        }
    }, (errCode) => {
        console.warn('[LocationStore] BG location error code:', errCode);
    });

    // onHttp: registrar cada ACK exitoso del server. ESTO es lo que hace isTracking honesto.
    BackgroundGeolocation.onHttp((response: any) => {
        if (response.success) {
            useLocationStore.getState()._onServerAck();
        }
    });

    // Recompute periódico: detecta cuando ackAge cruza el umbral (isTracking pasa a false)
    _intervalId = setInterval(() => {
        useLocationStore.getState()._recomputeLiveness();
    }, RECOMPUTE_INTERVAL_MS);

    // Initial compute
    useLocationStore.getState()._recomputeLiveness();
}

// ── Selectores utiles para consumers (evita computar edad manualmente) ───────

/**
 * True si la última posición tiene <maxAgeSec segundos.
 * Uso: const posFresca = useLocationStore(isCurrentLocationFresh(60));
 */
export function isCurrentLocationFresh(maxAgeSec: number = 120) {
    return (state: LocationState): boolean => {
        if (!state.currentLocation || !state.lastLocationAt) return false;
        return (Date.now() - state.lastLocationAt) < maxAgeSec * 1000;
    };
}

/**
 * Edad de la última posición en segundos, o null si nunca hubo posición.
 * Uso: const edad = useLocationStore(currentLocationAgeSec);
 */
export function currentLocationAgeSec(state: LocationState): number | null {
    if (!state.lastLocationAt) return null;
    return Math.floor((Date.now() - state.lastLocationAt) / 1000);
}
