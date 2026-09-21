/**
 * ZURI Driver App — Native Tracking Service (v5 API)
 *
 * REFACTOR 2026-09-18 tracking-nativo-auto:
 * Reescrito con el Config estructurado v5 de Transistorsoft.
 * Los sub-configs (geolocation, http, app, persistence, activity, logger)
 * reemplazan el flat config de v4.
 *
 * Responsabilidades:
 *  - Foreground Service persistente con notificación permanente
 *  - GPS via Fused Location Provider (batería-optimizado)
 *  - Heartbeat HTTP cada 60s independiente del GPS
 *  - Cola offline SQLite built-in con retry autosync
 *  - Motion detection (accelerometer): apaga GPS cuando parado
 *  - stopOnTerminate:false + startOnBoot:true (sobrevive OS-kill y reboot)
 */

import BackgroundGeolocation, {
    Location,
    HeartbeatEvent,
    HttpEvent,
    MotionChangeEvent,
    ProviderChangeEvent,
    State,
    DesiredAccuracy,
    LogLevel,
    NotificationPriority,
} from 'react-native-background-geolocation';
import { Platform } from 'react-native';

// ── Config ────────────────────────────────────────────────────────────────
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://admin.zuri.pe/api';
const GPS_ENDPOINT = `${API_BASE}/conductores/gps-tracking`;
const HEARTBEAT_ENDPOINT = `${API_BASE}/v3/heartbeat`;

// ── Estado interno ────────────────────────────────────────────────────────
let _configured = false;
let _currentConductorId: number | null = null;

export async function configureNativeTracking(conductorId: number, authToken: string): Promise<State> {
    _currentConductorId = conductorId;

    if (_configured) {
        // Solo actualizar http config (por si cambió el token)
        await BackgroundGeolocation.setConfig({
            http: {
                url: GPS_ENDPOINT,
                headers: { Authorization: `Bearer ${authToken}` },
                params: { conductorId },
            },
        });
        return await BackgroundGeolocation.getState();
    }

    // ── Listeners (una sola vez) ──────────────────────────────────────────
    BackgroundGeolocation.onLocation(_onLocation, _onLocationError);
    BackgroundGeolocation.onMotionChange(_onMotionChange);
    BackgroundGeolocation.onHeartbeat(_onHeartbeat);
    BackgroundGeolocation.onHttp(_onHttp);
    BackgroundGeolocation.onProviderChange(_onProviderChange);

    // ── Config v5 estructurado ────────────────────────────────────────────
    const state = await BackgroundGeolocation.ready({
        reset: true,

        geolocation: {
            desiredAccuracy: DesiredAccuracy.High,
            distanceFilter: 10,
            locationUpdateInterval: 10_000,
            fastestLocationUpdateInterval: 5_000,
            stopTimeout: 5,
            locationAuthorizationRequest: 'Always',
        },

        http: {
            url: GPS_ENDPOINT,
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
            params: { conductorId },
            autoSync: true,
            autoSyncThreshold: 0,
            batchSync: false,
        },

        persistence: {
            maxDaysToPersist: 3,
            maxRecordsToPersist: 10_000,
            locationTemplate: JSON.stringify({
                conductorId,
                latitud: '<%= latitude %>',
                longitud: '<%= longitude %>',
                precision: '<%= accuracy %>',
                velocidad: '<%= speed %>',
                rumbo: '<%= heading %>',
                timestamp: '<%= timestamp %>',
                bateria: '<%= battery.level %>',
                movimiento: '<%= is_moving %>',
            }),
        },

        activity: {
            activityRecognitionInterval: 10_000,
        },

        app: {
            stopOnTerminate: false,
            startOnBoot: true,
            enableHeadless: true,
            heartbeatInterval: 60,
            preventSuspend: true,
            notification: {
                title: 'ZURI Conductor · En servicio',
                text: 'Compartiendo tu ubicación en tiempo real',
                channelName: 'ZURI Tracking',
                smallIcon: 'mipmap/ic_launcher',
                priority: NotificationPriority.High,
                sticky: true,
            },
        },

        logger: {
            debug: false,
            logLevel: LogLevel.Verbose,
            logMaxDays: 3,
        },
    });

    _configured = true;
    console.log('[NativeTracking] ready', {
        enabled: state.enabled,
        trackingMode: state.trackingMode,
        odometer: state.odometer,
    });
    return state;
}

export async function startNativeTracking(): Promise<State> {
    const state = await BackgroundGeolocation.getState();
    if (state.enabled) {
        console.log('[NativeTracking] Ya estaba enabled — no-op');
        return state;
    }
    const started = await BackgroundGeolocation.start();
    console.log('[NativeTracking] STARTED. trackingMode=', started.trackingMode);
    return started;
}

export async function stopNativeTracking(): Promise<State> {
    const stopped = await BackgroundGeolocation.stop();
    await BackgroundGeolocation.destroyLocations();
    console.log('[NativeTracking] STOPPED');
    return stopped;
}

export async function getNativeTrackingState(): Promise<State> {
    return BackgroundGeolocation.getState();
}

export async function getPendingCount(): Promise<number> {
    return BackgroundGeolocation.getCount();
}

// ── Handlers ──────────────────────────────────────────────────────────────

function _onLocation(loc: Location) {
    console.log('[NativeTracking][GPS]', {
        lat: loc.coords.latitude.toFixed(6),
        lng: loc.coords.longitude.toFixed(6),
        speed: loc.coords.speed,
        moving: loc.is_moving,
    });
}

function _onLocationError(errorCode: number) {
    console.warn('[NativeTracking][GPS-ERROR] code:', errorCode);
}

function _onMotionChange(event: MotionChangeEvent) {
    console.log('[NativeTracking][MOTION]', event.isMoving ? 'MOVING' : 'STATIONARY');
}

async function _onHeartbeat(event: HeartbeatEvent) {
    if (!_currentConductorId) return;
    try {
        const currentLoc = event.location;
        const response = await fetch(HEARTBEAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conductorId: _currentConductorId,
                latitud: currentLoc?.coords?.latitude ?? null,
                longitud: currentLoc?.coords?.longitude ?? null,
                bateria: currentLoc?.battery?.level ?? null,
                is_moving: currentLoc?.is_moving ?? false,
                timestamp: new Date().toISOString(),
                source: 'native-tracking-v2',
            }),
        });
        console.log('[NativeTracking][HEARTBEAT]', response.status);
    } catch (err) {
        console.warn('[NativeTracking][HEARTBEAT-ERROR]', err);
    }
}

function _onHttp(response: HttpEvent) {
    if (!response.success) {
        console.warn('[NativeTracking][HTTP-FAIL]', response.status, response.responseText?.slice(0, 200));
    }
}

function _onProviderChange(event: ProviderChangeEvent) {
    console.log('[NativeTracking][PROVIDER]', {
        enabled: event.enabled,
        gps: event.gps,
        network: event.network,
        status: event.status,
    });
}

export async function requestAlwaysPermission(): Promise<number> {
    if (Platform.OS !== 'android') return 3;
    const status = await BackgroundGeolocation.requestPermission();
    console.log('[NativeTracking] Permission status:', status);
    return status;
}
