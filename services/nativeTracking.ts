/**
 * ZURI Driver App — Native Tracking Service (Fase A prototipo)
 *
 * Reemplazo experimental de services/backgroundLocation.ts.
 * Usa @transistorsoft/react-native-background-geolocation (nombre público:
 * "react-native-background-geolocation" v5.6.0, licencia MIT para Android free tier).
 *
 * Diferencias vs backgroundLocation.ts:
 *  - Foreground Service PERSISTENTE con notificación permanente (no best-effort).
 *  - Reinicia automáticamente si el OS mata la app (RECEIVE_BOOT_COMPLETED + stopOnTerminate:false).
 *  - Cola offline SQLite built-in (retry con backoff).
 *  - Motion detection (accelerometer): apaga GPS cuando el vehículo está estacionario.
 *  - Heartbeat HTTP cada 60s aunque no haya movimiento GPS.
 *
 * Este archivo NO reemplaza al viejo — se activa desde app/(tabs)/index.tsx
 * cuando el conductor presione "Conectarse".
 *
 * Referencia: /home/zuri/traccar-reference/traccar-client/ (patrón similar en Kotlin).
 */

import BackgroundGeolocation, {
    Location,
    HeartbeatEvent,
    HttpEvent,
    MotionChangeEvent,
    ProviderChangeEvent,
    State,
} from 'react-native-background-geolocation';
import { Platform } from 'react-native';

// ── Config ────────────────────────────────────────────────────────────────
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://admin.zuri.pe/api';
const GPS_ENDPOINT = `${API_BASE}/conductores/gps-tracking`;
const HEARTBEAT_ENDPOINT = `${API_BASE}/v3/heartbeat`;

// ── Estado interno ────────────────────────────────────────────────────────
let _configured = false;
let _currentConductorId: number | null = null;

/**
 * Configura la librería una vez. Es idempotente — llamar múltiples veces es seguro.
 * Debe llamarse DESPUÉS de que el usuario haya dado permisos "Permitir siempre".
 */
export async function configureNativeTracking(conductorId: number, authToken: string): Promise<State> {
    _currentConductorId = conductorId;

    if (_configured) {
        // Ya configurado — solo actualizar params HTTP (por si cambió el token)
        await BackgroundGeolocation.setConfig({
            url: GPS_ENDPOINT,
            headers: { Authorization: `Bearer ${authToken}` },
            params: { conductorId },
        });
        return await BackgroundGeolocation.getState();
    }

    // ── Listeners (una sola vez) ──────────────────────────────────────────
    BackgroundGeolocation.onLocation(_onLocation, _onLocationError);
    BackgroundGeolocation.onMotionChange(_onMotionChange);
    BackgroundGeolocation.onHeartbeat(_onHeartbeat);
    BackgroundGeolocation.onHttp(_onHttp);
    BackgroundGeolocation.onProviderChange(_onProviderChange);

    // ── Config inicial ────────────────────────────────────────────────────
    const state = await BackgroundGeolocation.ready({
        // Geolocation
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10, // meters — dispara GPS al moverse >10m
        locationUpdateInterval: 10_000, // 10s cuando en movimiento
        fastestLocationUpdateInterval: 5_000,

        // Activity Recognition (motion detection)
        stopTimeout: 5, // minutos parado antes de considerar "stationary"
        activityRecognitionInterval: 10_000,

        // HTTP + persistencia
        url: GPS_ENDPOINT,
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        params: { conductorId }, // se envía junto con cada location
        autoSync: true,
        autoSyncThreshold: 0,
        batchSync: false,
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

        // Heartbeat cada 60s aunque no haya movimiento
        heartbeatInterval: 60,

        // Comportamiento background/foreground
        stopOnTerminate: false, // sobrevive a app cerrada
        startOnBoot: true, // reinicia al bootear el teléfono
        enableHeadless: true, // corre sin UI
        foregroundService: true, // Foreground Service persistente
        notification: {
            title: 'ZURI Conductor · En servicio',
            text: 'Compartiendo tu ubicación en tiempo real',
            channelName: 'ZURI Tracking',
            smallIcon: 'mipmap/ic_launcher',
            priority: BackgroundGeolocation.NOTIFICATION_PRIORITY_HIGH,
            sticky: true, // no se puede swipe-dismiss
        },

        // Debug (subir a false en Fase B una vez validado)
        debug: false,
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
        logMaxDays: 3,

        // Reset config si versión mayor cambió (evita configs stale)
        reset: true,
    });

    _configured = true;
    console.log('[NativeTracking] ready', {
        enabled: state.enabled,
        trackingMode: state.trackingMode,
        odometer: state.odometer,
    });
    return state;
}

/**
 * Arranca el tracking. Debe llamarse al presionar "Conectarse".
 * Idempotente — si ya está corriendo no hace nada.
 */
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

/**
 * Detiene el tracking (al presionar "Desconectarse" o cerrar sesión).
 */
export async function stopNativeTracking(): Promise<State> {
    const stopped = await BackgroundGeolocation.stop();
    // Purgar cola pendiente para no reenviar al reconectar con otra cuenta
    await BackgroundGeolocation.destroyLocations();
    console.log('[NativeTracking] STOPPED');
    return stopped;
}

/**
 * Estado actual (para UI de debug).
 */
export async function getNativeTrackingState(): Promise<State> {
    return BackgroundGeolocation.getState();
}

/**
 * Cantidad de ubicaciones pendientes en cola offline.
 */
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
    // Ejecuta cada `heartbeatInterval` (60s) aunque no haya movimiento
    // Envía un ping HTTP independiente al endpoint de heartbeat
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

// ── Helper de permisos (para pantalla de bienvenida) ──────────────────────

/**
 * Solicita permiso "Permitir siempre" — flujo Android 11+ requiere
 * primero conceder foreground, luego re-abrir settings para background.
 * La librería maneja este flow automáticamente.
 */
export async function requestAlwaysPermission(): Promise<number> {
    if (Platform.OS !== 'android') return 3; // iOS handled by ready()
    const status = await BackgroundGeolocation.requestPermission();
    console.log('[NativeTracking] Permission status:', status);
    return status;
}
