/**
 * ZURI Driver — wrapper Traccar Client SDK 1.0.11 (reemplaza nativeTracking.ts).
 * El SDK sube por protocolo OsmAnd a serverUrl con id=device_token (sin Bearer).
 * device_token (!= JWT) lo emite POST /api/v3/device-tokens y se guarda aparte.
 */
import * as Traccar from 'react-native-traccar-client-sdk';
import type { Config } from 'react-native-traccar-client-sdk';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { api } from '@/services/api';
import { secureStorage, TOKEN_KEY } from '@/services/storage';

const DEVICE_TOKEN_KEY = 'zuri_device_token';            // != TOKEN_KEY (JWT)
const DEVICE_UUID_KEY = 'zuri_device_uuid';
const SERVER_URL = 'https://admin.zuri.pe/api/v3/osmand';

export type IssueResult = { ok: true } | { ok: false; reason: 'auth' | 'network' };
export type EnsureResult =
    | { ok: true; token: string }
    | { ok: false; reason: 'displaced' | 'auth' | 'network' };

function buildTraccarConfig(deviceId: string): Config {
    return {
        serverUrl: SERVER_URL,
        deviceId,
        wakeLock: true,
        buffer: true,
        preferPlatformProviders: false,
        location: {
            accuracy: 'HIGH',
            distanceMeters: 100,
            intervalSeconds: 60,
            angleDegrees: 30,
            stopDetection: true,
            stopTimeoutSeconds: 60,
            stationaryRadiusMeters: 100,
            heartbeatIntervalSeconds: 60,
        },
        notification: { text: 'ZURI Conductor · En servicio' },
    };
}

export async function getDeviceToken(): Promise<string | null> {
    return secureStorage.getItem(DEVICE_TOKEN_KEY);
}

export async function getOrCreateDeviceId(): Promise<string> {
    const existing = await secureStorage.getItem(DEVICE_UUID_KEY);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await secureStorage.setItem(DEVICE_UUID_KEY, id);
    console.log('[traccar] deviceId generado:', id.slice(0, 8) + '...');
    return id;
}

async function applyConfig(cfg: Config): Promise<void> {
    try { await Traccar.setConfig(cfg); }
    catch { await Traccar.init(cfg); }
}

let _issueInFlight: Promise<IssueResult> | null = null;

export function issueTokenAndStart(): Promise<IssueResult> {
    if (_issueInFlight) return _issueInFlight;
    _issueInFlight = (async (): Promise<IssueResult> => {
        const appVersion = Constants.expoConfig?.version;
        const deviceId = await getOrCreateDeviceId();
        const res = await api.authPost('/v3/device-tokens', {
            ...(appVersion ? { appVersion } : {}),
            deviceId,
        });
        if (res.success && res.token) {
            await secureStorage.setItem(DEVICE_TOKEN_KEY, res.token);
            await applyConfig(buildTraccarConfig(res.token));
            await Traccar.start();
            return { ok: true };
        }
        const reason: 'auth' | 'network' = res.httpStatus === 401 ? 'auth' : 'network';
        console.warn('[traccar] issueTokenAndStart fallo:', res.httpStatus, res.error);
        return { ok: false, reason };
    })().finally(() => { _issueInFlight = null; });
    return _issueInFlight;
}

export async function ensureToken(): Promise<EnsureResult> {
    const deviceId = await getOrCreateDeviceId();
    const currentToken = await secureStorage.getItem(DEVICE_TOKEN_KEY);
    const appVersion = Constants.expoConfig?.version;
    const res = await api.authPost('/v3/device-tokens/ensure', {
        deviceId,
        ...(currentToken ? { currentToken } : {}),
        ...(appVersion ? { appVersion } : {}),
    });

    if (!res.success && res.httpStatus === 401) {
        return { ok: false, reason: 'auth' };
    }
    if (!res.success) {
        return { ok: false, reason: 'network' };
    }

    if (res.status === 'valid') {
        return { ok: true, token: currentToken! };
    }
    if (res.status === 'issued') {
        await secureStorage.setItem(DEVICE_TOKEN_KEY, res.token);
        return { ok: true, token: res.token };
    }
    if (res.status === 'displaced') {
        return { ok: false, reason: 'displaced' };
    }

    return { ok: false, reason: 'network' };
}

export async function ensureAndResume(): Promise<EnsureResult> {
    const result = await ensureToken();
    if (result.ok) {
        await applyConfig(buildTraccarConfig(result.token));
        await Traccar.start();
        console.log('[traccar] ensureAndResume: started con token verificado');
    }
    return result;
}

/** @deprecated Usar ensureAndResume() que verifica con el servidor */
export async function resumeTracking(): Promise<boolean> {
    const token = await secureStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) return false;
    await applyConfig(buildTraccarConfig(token));
    await Traccar.start();
    return true;
}

export async function stopAndRevoke(): Promise<void> {
    try { await Traccar.stop(); } catch (e) { console.warn('[traccar] stop:', e); }
    try { await api.authPost('/v3/device-tokens/revoke', {}); }
    catch (e) { console.warn('[traccar] revoke:', e); }
    await secureStorage.deleteItem(DEVICE_TOKEN_KEY);
}

export async function isActive(): Promise<boolean> {
    try { return await Traccar.isTracking(); } catch { return false; }
}

export async function restart(): Promise<'started' | 'needs-login' | 'failed'> {
    try {
        if (await getDeviceToken()) {
            const r = await ensureAndResume();
            if (r.ok) return 'started';
            if (r.reason === 'displaced') return 'started'; // displaced = otro dispositivo activo, no fatal
            if (r.reason === 'auth') return 'needs-login';
            return 'failed';
        }
        const jwt = await secureStorage.getItem(TOKEN_KEY);
        if (!jwt) return 'needs-login';
        const r = await issueTokenAndStart();
        if (r.ok) return 'started';
        return r.reason === 'auth' ? 'needs-login' : 'failed';
    } catch (e) {
        console.warn('[traccar] restart fallo:', e);
        return 'failed';
    }
}
